/**
 * LLM Guard HTTP client.
 *
 * Calls the standalone Python FastAPI service (docker/llm-guard).
 * Implements retry with exponential backoff and graceful degradation.
 */
import 'dotenv/config';
import type { LlmGuardScanResponse, ScanResult } from '@guardmail/shared';

const LLM_GUARD_URL = process.env.LLM_GUARD_URL ?? 'http://localhost:8000';
const MAX_RETRIES = 3;
const BACKOFF_MS = 1000;
const REQUEST_TIMEOUT_MS = Number(process.env.LLM_GUARD_TIMEOUT_MS ?? 60_000);

export interface LlmGuardOutcome {
  passed: boolean;
  riskScore: number; // 0..1
  details: string;
  sanitizedText: string;
  results: Record<string, boolean>;
  riskScores: Record<string, number>;
  scannersUsed: string[];
}

async function postJson(path: string, body: unknown): Promise<LlmGuardScanResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${LLM_GUARD_URL}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`LLM Guard ${path} returned ${res.status}`);
    }
    return (await res.json()) as LlmGuardScanResponse;
  } finally {
    clearTimeout(timer);
  }
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T | null> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_RETRIES - 1) {
        await new Promise((r) => setTimeout(r, BACKOFF_MS * 2 ** attempt));
      }
    }
  }
  console.warn('[llm-guard] All retries exhausted:', lastErr);
  return null;
}

function toOutcome(res: LlmGuardScanResponse): LlmGuardOutcome {
  const riskScore = Object.values(res.risk_scores ?? {}).reduce(
    (max, v) => Math.max(max, Number(v) ?? 0),
    0,
  );
  const passed = !!res.is_valid;
  return {
    passed,
    riskScore,
    details: passed ? 'No LLM vulnerabilities detected' : 'LLM threat detected',
    sanitizedText: res.sanitized_text,
    results: res.results,
    riskScores: res.risk_scores,
    scannersUsed: res.scanners_used,
  };
}

const GRACEFUL: LlmGuardOutcome = {
  passed: true,
  riskScore: 0,
  details: 'LLM Guard unavailable — scan pending',
  sanitizedText: '',
  results: {},
  riskScores: {},
  scannersUsed: [],
};

export const llmGuardClient = {
  async isHealthy(): Promise<boolean> {
    try {
      const res = await fetch(`${LLM_GUARD_URL}/health`, { method: 'GET' });
      return res.ok;
    } catch {
      return false;
    }
  },

  async scanEmailBody(body: string): Promise<LlmGuardOutcome> {
    const res = await withRetry(() => postJson('/scan/prompt', { text: body }));
    if (!res) return { ...GRACEFUL, sanitizedText: body };
    return toOutcome(res);
  },

  /**
   * Scan the entire email by serializing all fields to JSON.
   * This ensures prompt injection in ANY field (from, to, cc, bcc,
   * subject, body, bodyHtml, attachments metadata) is detected.
   */
  async scanEmail(email: {
    from: string;
    to: string[];
    subject: string;
    body: string;
    bodyHtml?: string;
    attachments?: { filename: string; mimeType: string; size: number }[];
  }): Promise<LlmGuardOutcome> {
    // Serialize the entire email to JSON — scans every field at once
    const emailJson = JSON.stringify({
      from: email.from,
      to: email.to,
      subject: email.subject,
      body: email.body,
      bodyHtml: email.bodyHtml,
      attachments: (email.attachments ?? []).map((a) => ({
        filename: a.filename,
        mimeType: a.mimeType,
        size: a.size,
      })),
    });

    const res = await withRetry(() => postJson('/scan/prompt', { text: emailJson }));
    if (!res) return { ...GRACEFUL, sanitizedText: emailJson };
    const outcome = toOutcome(res);
    return {
      ...outcome,
      details: outcome.passed
        ? 'No LLM vulnerabilities detected (full email scanned)'
        : `LLM threat detected: ${outcome.details}`,
      sanitizedText: emailJson,
    };
  },

  async scanAttachmentText(text: string): Promise<LlmGuardOutcome> {
    const res = await withRetry(() => postJson('/scan/attachment', { text }));
    if (!res) return { ...GRACEFUL, details: 'LLM Guard unavailable — attachment scan pending', sanitizedText: text };
    return toOutcome(res);
  },
};

/** Convert an outcome into a ScanResult row-ready object. */
export function toScanResult(
  emailId: string,
  outcome: LlmGuardOutcome,
): Omit<ScanResult, 'id'> {
  return {
    emailId,
    scanner: 'llm-guard',
    passed: outcome.passed,
    riskScore: outcome.riskScore,
    details: outcome.details,
    scannedAt: new Date(),
  };
}
