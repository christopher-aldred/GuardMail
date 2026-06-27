/**
 * Email processing pipeline.
 *
 * For each queued email:
 *   - Inbound emails (from SMTP/webhook): LLM Guard scan (full JSON), ClamAV, spam filter, route.
 *   - Outbound emails (from API send): LLM Guard scan (full JSON), deliver via Resend API.
 *
 * Scan results are persisted for auditing.
 */
import type { EmailStatus, ScanResult, ScanVerdict, Tier } from '@guardmail/shared';
import { applyBrandingFooter } from '@guardmail/shared';
import { emailRepository, scanResultRepository, attachmentRepository, spamFilterConfigRepository, userRepository } from '../db';
import { llmGuardClient, toScanResult as llmToScanResult } from './llm-guard';
import { clamavClient, toScanResult as clamToScanResult, type ClamavOutcome } from './clamav';
import { evaluateSpam, withEmailId } from './spam-filter';
import { emailQueue } from './email-queue';
import { deliverEmail } from './smtp-relay';
import { shouldForwardToAdmin, forwardToAdmin } from './admin-forward';

/**
 * Resolve an attachment to a Buffer ClamAV can scan.
 *
 * Attachment bytes reach us in one of three forms:
 *   1. `content` — Base64-encoded bytes (SMTP inbound, outbound, and
 *      Resend inbound where the webhook downloads the bytes up front via
 *      the Attachments API `download_url`).
 *   2. `storagePath` starting with `http(s)` — a Resend signed download
 *      URL. Fetched on demand (valid ~1h after retrieval).
 *   3. `storagePath` as a local file path — scanned on disk by `scanFile`.
 *
 * Returns `null` for cases 1/2 when the bytes can't be decoded/fetched so
 * the caller can fall back to `scanFile` (which itself gracefully skips
 * missing local files).
 */
async function resolveAttachmentBuffer(att: {
  content?: string | null;
  storagePath?: string | null;
}): Promise<Buffer | null> {
  if (att.content) {
    try {
      return Buffer.from(att.content, 'base64');
    } catch (err) {
      console.warn('[clamav] failed to decode base64 attachment content:', err);
      return null;
    }
  }
  const path = att.storagePath ?? '';
  if (/^https?:\/\//i.test(path)) {
    try {
      const res = await fetch(path);
      if (!res.ok) {
        console.warn(`[clamav] attachment download failed (${res.status}) for ${path.slice(0, 96)}`);
        return null;
      }
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      console.warn('[clamav] attachment download failed:', err);
      return null;
    }
  }
  return null;
}

/**
 * Scan a single attachment with ClamAV, resolving its bytes from
 * whichever source is available. Records a graceful "scan skipped"
 * result (not a failure) when no bytes can be obtained, so a missing
 * attachment never blocks delivery but is still audited.
 */
async function scanAttachment(att: {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  storagePath?: string | null;
  content?: string | null;
}): Promise<ClamavOutcome> {
  const buf = await resolveAttachmentBuffer(att);
  if (buf) return clamavClient.scanBuffer(buf, att.filename);
  // Fall back to on-disk scanning (handles missing-file skip internally).
  return clamavClient.scanFile(att.storagePath ?? '', att.size);
}

export interface ProcessingOptions {
  pollIntervalMs?: number;
  shouldStop?: () => boolean;
}

function pickStatus(verdict: ScanVerdict): EmailStatus {
  switch (verdict) {
    case 'clean':
      return 'inbox';
    case 'spam':
      return 'spam';
    case 'llm-threat':
    case 'virus':
      return 'quarantine';
    case 'scan-pending':
      return 'inbox';
  }
}

export async function processEmail(emailId: string): Promise<ScanVerdict> {
  const email = await emailRepository.findById(emailId);
  if (!email) {
    console.warn(`[processor] Email ${emailId} not found, skipping`);
    return 'clean';
  }

  // Check for existing scan results to avoid duplicates.
  const existingScans = await scanResultRepository.listByEmail(email.id);
  if (existingScans.length > 0) {
    console.log(`[processor] Email ${emailId} already has ${existingScans.length} scan results, skipping`);
    return 'clean';
  }

  const isOutbound = email.status === 'pending';
  const scanResults: Omit<ScanResult, 'id'>[] = [];

  // --- 1. Load attachments ---------------------------------------------------
  const attachments = await attachmentRepository.listByEmail(email.id);

  // --- 2. LLM Guard scan — serialize the ENTIRE email to JSON ----------------
  // For outbound mail this is governed by the per-user
  // `llmGuardOutboundEnabled` setting: when the owner has disabled it,
  // we skip the LLM Guard HTTP call and record a passed scan result
  // noting the skip (kept for the audit trail + so the email still has
  // ≥1 scan result, which the MCP “never expose unscanned content”
  // invariant relies on). Inbound scanning is always on.
  let llm: Awaited<ReturnType<typeof llmGuardClient.scanEmail>>;
  let scanLlm = !isOutbound;
  if (isOutbound) {
    const owner = await userRepository.findById(email.userId);
    scanLlm = owner?.llmGuardOutboundEnabled !== false;
  }
  if (scanLlm) {
    llm = await llmGuardClient.scanEmail({
      from: email.from,
      to: email.to,
      subject: email.subject,
      body: email.body,
      bodyHtml: email.bodyHtml ?? undefined,
      attachments: attachments.map((a) => ({
        filename: a.filename,
        mimeType: a.mimeType,
        size: a.size,
      })),
    });
  } else {
    llm = {
      passed: true,
      riskScore: 0,
      details: 'Outbound LLM Guard scanning disabled by user setting',
      sanitizedText: '',
      results: {},
      riskScores: {},
      scannersUsed: [],
    };
  }
  scanResults.push(llmToScanResult(email.id, llm));
  const llmPassed = llm.passed;

  // --- 3. ClamAV scan of attachments (inbound AND outbound) ----------------
  // Every attachment is malware-scanned before delivery, regardless of
  // direction. Bytes are resolved from Base64 `content` (SMTP inbound /
  // outbound / Resend inbound) or fetched from a Resend `download_url`.
  let virusDetected = false;
  const deletedAttachmentIds = new Set<string>();
  for (const att of attachments) {
    const outcome = await scanAttachment(att);
    scanResults.push(clamToScanResult(email.id, outcome));
    if (!outcome.passed && outcome.virusName) {
      virusDetected = true;
      // Remove the offending attachment so it can't be redelivered to the
      // inbox or forwarded back out via Resend.
      await attachmentRepository.delete(att.id);
      deletedAttachmentIds.add(att.id);
    }
  }

  // --- 4. Spam filter (inbound only) -----------------------------------------
  let spamVerdict: 'clean' | 'spam' = 'clean';
  if (!isOutbound) {
    const config = await spamFilterConfigRepository.findByUser(email.userId);
    if (config) {
      const cfg: import('@guardmail/shared').SpamFilterConfig = {
        userId: config.userId,
        enabled: config.enabled,
        sensitivity: config.sensitivity,
        allowlist: config.allowlist,
        blocklist: config.blocklist,
        keywordRules: config.keywordRules,
        blockContentTypes: config.blockContentTypes,
        updatedAt: config.updatedAt,
      };
      const result = withEmailId(
        evaluateSpam(cfg, { from: email.from, subject: email.subject, body: email.body }),
        email.id,
      );
      scanResults.push(result.scanResult);
      if (!result.outcome.passed) spamVerdict = 'spam';
    }
  }

  // --- 5. Persist scan results -----------------------------------------------
  for (const sr of scanResults) {
    await scanResultRepository.create(sr);
  }

  // --- 6. Route / Deliver -----------------------------------------------------
  if (isOutbound) {
    if (!llmPassed) {
      await emailRepository.updateStatus(email.id, 'quarantine');
      console.log(`[processor] Outbound email ${email.id} → quarantine (llm-threat)`);
      return 'llm-threat';
    }
    if (virusDetected) {
      // Never deliver an outbound message carrying malware — quarantine
      // the whole email so the sender can review it.
      await emailRepository.updateStatus(email.id, 'quarantine');
      console.log(`[processor] Outbound email ${email.id} → quarantine (virus)`);
      return 'virus';
    }

    // Free-tier outbound emails carry the Guardmail branding footer.
    // Paid tiers remove it. The footer is appended AFTER scanning so it
    // never forms part of the user content evaluated by LLM Guard.
    const owner = await userRepository.findById(email.userId);
    const tier = (owner?.tier ?? 'free') as Tier;
    const { text, html } = applyBrandingFooter(
      email.body,
      email.bodyHtml ?? undefined,
      tier,
    );

    // Forward the clean attachments to Resend. Resend accepts `content`
    // as a Base64 string + `filename` (see Resend send-email docs: 40MB
    // total per email after Base64 encoding). Attachments we deleted as
    // malware are excluded.
    const cleanAttachments = attachments.filter(
      (a) => !deletedAttachmentIds.has(a.id) && !!a.content,
    );
    const resendAttachments = cleanAttachments.map((a) => ({
      filename: a.filename,
      content: a.content!,
      content_type: a.mimeType,
    }));

    const delivery = await deliverEmail({
      from: email.from,
      to: email.to,
      subject: email.subject,
      text,
      html: html ?? undefined,
      attachments: resendAttachments.length > 0 ? resendAttachments : undefined,
    });

    if (delivery.delivered) {
      await emailRepository.updateStatus(email.id, 'sent');
      console.log(`[processor] Outbound email ${email.id} → sent`);
    } else {
      await emailRepository.updateStatus(email.id, 'quarantine');
      console.log(`[processor] Outbound email ${email.id} → quarantine (delivery failed: ${delivery.error})`);
    }
    return 'clean';
  }

  // Inbound: route based on scan verdict.
  let verdict: ScanVerdict = 'clean';
  if (!llmPassed) verdict = 'llm-threat';
  else if (virusDetected) verdict = 'virus';
  else if (spamVerdict === 'spam') verdict = 'spam';

  const finalStatus = pickStatus(verdict);
  await emailRepository.updateStatus(email.id, finalStatus);
  console.log(`[processor] Inbound email ${email.id} → ${finalStatus} (${verdict})`);

  // --- 7. Admin forwarding -------------------------------------------------
  // Forward a copy to the admin email when the email was received at one
  // of the configured support mailbox addresses (e.g. help@aiguard.email).
  // Triggered by the *recipient*, not the sender. Done after routing so the
  // original is persisted first; forwarding is best-effort and never blocks.
  if (shouldForwardToAdmin(email.to)) {
    try {
      await forwardToAdmin({
        from: email.from,
        to: email.to,
        subject: email.subject,
        body: email.body,
        bodyHtml: email.bodyHtml ?? undefined,
      });
    } catch (err) {
      console.error(`[processor] Admin forward failed for ${email.id}:`, err);
    }
  }

  return verdict;
}

export async function startWorker(opts: ProcessingOptions = {}): Promise<void> {
  const pollInterval = opts.pollIntervalMs ?? 1_000;
  console.log('[worker] Email processing worker started');
  while (!opts.shouldStop?.()) {
    const msg = await emailQueue.dequeue(pollInterval * 2);
    if (!msg) continue;
    try {
      await processEmail(msg.emailId);
    } catch (err) {
      console.error(`[worker] Failed to process ${msg.emailId}:`, err);
    }
  }
  console.log('[worker] Stopped');
}
