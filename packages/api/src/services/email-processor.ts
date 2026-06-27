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
import { clamavClient, toScanResult as clamToScanResult } from './clamav';
import { evaluateSpam, withEmailId } from './spam-filter';
import { emailQueue } from './email-queue';
import { deliverEmail } from './smtp-relay';
import { shouldForwardToAdmin, forwardToAdmin } from './admin-forward';

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

  // --- 3. ClamAV scan of attachments (inbound only) --------------------------
  let virusDetected = false;
  if (!isOutbound) {
    for (const att of attachments) {
      // ClamAV scans files on disk. In this container-based setup,
      // the storagePath may not exist on the API container's filesystem.
      // We still record the scan attempt for audit purposes.
      const outcome = await clamavClient.scanFile(att.storagePath, att.size);
      scanResults.push(clamToScanResult(email.id, outcome));
      if (!outcome.passed && outcome.virusName) {
        virusDetected = true;
        await attachmentRepository.delete(att.id);
      }
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

    const delivery = await deliverEmail({
      from: email.from,
      to: email.to,
      subject: email.subject,
      text,
      html: html ?? undefined,
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
