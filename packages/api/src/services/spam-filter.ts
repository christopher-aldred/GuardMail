/**
 * Spam filter engine.
 *
 * Configurable per-user rules: keyword scoring, sender allow/block lists,
 * content-type filtering, and sensitivity levels. Non-critical: failures
 * are logged and email is delivered to the inbox with a warning.
 */
import type { SpamFilterConfig, ScanResult, KeywordRule } from '@guardmail/shared';

// Sensitivity → minimum spam score for an email to be flagged as spam.
const SENSITIVITY_THRESHOLDS: Record<SpamFilterConfig['sensitivity'], number> = {
  low: 0.7,
  medium: 0.5,
  high: 0.3,
  custom: 0.5,
};

export interface SpamInput {
  from: string;
  subject: string;
  body: string;
  contentType?: string;
}

export interface SpamOutcome {
  passed: boolean;
  riskScore: number; // 0..1
  details: string;
  blocked: boolean; // hard block vs flag
}

export interface SpamFilterResult {
  outcome: SpamOutcome;
  scanResult: Omit<ScanResult, 'id'>;
}

function normalize(text: string): string {
  return text.toLowerCase();
}

function scoreKeywords(text: string, rules: KeywordRule[]): {
  score: number;
  blocked: boolean;
  matched: string[];
} {
  const lower = normalize(text);
  let score = 0;
  let blocked = false;
  const matched: string[] = [];
  for (const rule of rules) {
    if (lower.includes(normalize(rule.keyword))) {
      matched.push(rule.keyword);
      if (rule.action === 'block') {
        blocked = true;
        score = Math.max(score, 1);
      } else {
        score = Math.max(score, rule.score);
      }
    }
  }
  return { score, blocked, matched };
}

export function evaluateSpam(
  config: SpamFilterConfig,
  input: SpamInput,
): SpamFilterResult {
  const threshold = SENSITIVITY_THRESHOLDS[config.sensitivity];
  const emailId = ''; // filled by caller
  const base = {
    emailId,
    scanner: 'spam-filter' as const,
    scannedAt: new Date(),
  };

  if (!config.enabled) {
    return {
      outcome: { passed: true, riskScore: 0, details: 'Spam filter disabled', blocked: false },
      scanResult: { ...base, passed: true, riskScore: 0, details: 'Spam filter disabled' },
    };
  }

  const fromLower = input.from.toLowerCase();

  // Allowlist short-circuits everything else.
  if (config.allowlist.some((a) => a.toLowerCase() === fromLower)) {
    return {
      outcome: { passed: true, riskScore: 0, details: 'Sender on allowlist', blocked: false },
      scanResult: { ...base, passed: true, riskScore: 0, details: 'Sender on allowlist' },
    };
  }

  // Blocklist hard-blocks.
  if (config.blocklist.some((b) => b.toLowerCase() === fromLower)) {
    return {
      outcome: {
        passed: false,
        riskScore: 1,
        details: `Sender ${input.from} on blocklist`,
        blocked: true,
      },
      scanResult: { ...base, passed: false, riskScore: 1, details: 'Sender on blocklist' },
    };
  }

  // Content type filtering.
  if (input.contentType && config.blockContentTypes.includes(input.contentType)) {
    return {
      outcome: {
        passed: false,
        riskScore: 1,
        details: `Blocked content type: ${input.contentType}`,
        blocked: true,
      },
      scanResult: {
        ...base,
        passed: false,
        riskScore: 1,
        details: `Blocked content type: ${input.contentType}`,
      },
    };
  }

  // Keyword scoring across subject + body.
  const { score, blocked, matched } = scoreKeywords(
    `${input.subject} ${input.body}`,
    config.keywordRules,
  );

  if (blocked) {
    return {
      outcome: {
        passed: false,
        riskScore: 1,
        details: `Blocked keyword(s): ${matched.join(', ')}`,
        blocked: true,
      },
      scanResult: {
        ...base,
        passed: false,
        riskScore: 1,
        details: `Blocked keyword(s): ${matched.join(', ')}`,
      },
    };
  }

  if (score >= threshold) {
    return {
      outcome: {
        passed: false,
        riskScore: score,
        details: `Spam score ${score.toFixed(2)} >= threshold ${threshold} (keywords: ${matched.join(', ') || 'none'})`,
        blocked: false,
      },
      scanResult: {
        ...base,
        passed: false,
        riskScore: score,
        details: `Spam score above threshold`,
      },
    };
  }

  return {
    outcome: {
      passed: true,
      riskScore: score,
      details: `Spam score ${score.toFixed(2)} below threshold ${threshold}`,
      blocked: false,
    },
    scanResult: {
      ...base,
      passed: true,
      riskScore: score,
      details: `Spam score below threshold`,
    },
  };
}

/** Attach the email id once the caller knows it. */
export function withEmailId(
  result: SpamFilterResult,
  emailId: string,
): SpamFilterResult {
  return {
    outcome: result.outcome,
    scanResult: { ...result.scanResult, emailId },
  };
}