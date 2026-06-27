/**
 * ClamAV client wrapper.
 *
 * Uses `clamdjs` to talk to the ClamAV daemon over TCP (port 3310).
 * Implements file-size limits, timeouts, retries, and graceful degradation.
 */
import 'dotenv/config';
import { existsSync } from 'node:fs';
import clamd from 'clamdjs';
import type { ScanResult } from '@guardmail/shared';

const CLAMAV_HOST = process.env.CLAMAV_HOST ?? 'localhost';
const CLAMAV_PORT = Number(process.env.CLAMAV_PORT ?? 3310);
const MAX_SIZE_MB = Number(process.env.MAX_ATTACHMENT_SIZE_MB ?? 25);
const TIMEOUT_MS = Number(process.env.CLAMAV_TIMEOUT_MS ?? 30_000);
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 5_000;

export interface ClamavOutcome {
  passed: boolean;
  riskScore: number;
  details: string;
  virusName?: string;
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export const clamavClient = {
  scanner: clamd.createScanner(CLAMAV_HOST, CLAMAV_PORT),

  async isHealthy(): Promise<boolean> {
    try {
      const version = await clamd.ping(this.scanner);
      return !!version;
    } catch {
      return false;
    }
  },

  async scanFile(filePath: string, size: number): Promise<ClamavOutcome> {
    if (size > MAX_SIZE_MB * 1024 * 1024) {
      return {
        passed: false,
        riskScore: 1,
        details: `Attachment exceeds max size of ${MAX_SIZE_MB} MB`,
      };
    }
    // Gracefully skip if no local file (e.g. attachment stored as URL from Resend)
    if (!filePath || !existsSync(filePath)) {
      return {
        passed: true,
        riskScore: 0,
        details: 'Attachment not stored locally — ClamAV scan skipped',
      };
    }

    let lastErr: unknown;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const result = (await Promise.race([
          this.scanner.scanFile(filePath),
          delay(TIMEOUT_MS).then(() => {
            throw new Error('ClamAV scan timed out');
          }),
        ])) as string;

        if (/^stream:\s*OK$/i.test(result)) {
          return { passed: true, riskScore: 0, details: 'No viruses detected' };
        }
        const match = /^stream:\s*FOUND$/i.exec(result);
        const virus = result.split(':')[2]?.trim();
        return {
          passed: false,
          riskScore: 1,
          details: `Virus detected: ${virus ?? 'unknown'}`,
          virusName: match ? virus : undefined,
        };
      } catch (err) {
        lastErr = err;
        if (attempt < MAX_RETRIES - 1) await delay(RETRY_DELAY_MS);
      }
    }

    console.warn('[clamav] Scan failed:', lastErr);
    // Graceful degradation: allow but mark scan pending.
    return {
      passed: true,
      riskScore: 0,
      details: 'ClamAV unavailable — attachment scan pending',
    };
  },

  /** Scan a buffer in-memory (used by email processor for streaming attachments). */
  async scanBuffer(buf: Buffer, filename = 'attachment'): Promise<ClamavOutcome> {
    if (buf.length > MAX_SIZE_MB * 1024 * 1024) {
      return {
        passed: false,
        riskScore: 1,
        details: `Attachment exceeds max size of ${MAX_SIZE_MB} MB`,
      };
    }
    let lastErr: unknown;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const result = (await Promise.race([
          clamd.scanBuffer(this.scanner, buf, filename, 30),
          delay(TIMEOUT_MS).then(() => {
            throw new Error('ClamAV scan timed out');
          }),
        ])) as string;
        if (/^stream:\s*OK$/i.test(result)) {
          return { passed: true, riskScore: 0, details: 'No viruses detected' };
        }
        const virus = result.split(':').slice(2).join(':').trim();
        return {
          passed: false,
          riskScore: 1,
          details: `Virus detected: ${virus || 'unknown'}`,
          virusName: virus || undefined,
        };
      } catch (err) {
        lastErr = err;
        if (attempt < MAX_RETRIES - 1) await delay(RETRY_DELAY_MS);
      }
    }
    console.warn('[clamav] Buffer scan failed:', lastErr);
    return {
      passed: true,
      riskScore: 0,
      details: 'ClamAV unavailable — attachment scan pending',
    };
  },
};

export function toScanResult(
  emailId: string,
  outcome: ClamavOutcome,
): Omit<ScanResult, 'id'> {
  return {
    emailId,
    scanner: 'clamav',
    passed: outcome.passed,
    riskScore: outcome.riskScore,
    details: outcome.details,
    scannedAt: new Date(),
  };
}