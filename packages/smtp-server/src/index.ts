/**
 * Guardmail inbound SMTP server.
 *
 * Listens for incoming mail (default port 25, or SMTP_PORT env), parses
 * each message with `mailparser`, then POSTs it to the API's internal
 * `/api/inbound` endpoint for storage + security processing.
 *
 * Recipient validation is deferred to the API (which resolves the
 * recipient against registered custom email addresses). Unknown
 * recipients are rejected after the message is received.
 */
import 'dotenv/config';
import { SMTPServer, type SMTPServerDataStream, type SMTPServerSession } from 'smtp-server';
import { simpleParser, type ParsedMail, type AddressObject } from 'mailparser';

const API_URL = process.env.API_URL ?? 'http://localhost:3000';
const INTERNAL_KEY = process.env.INTERNAL_API_KEY ?? '';
const SMTP_PORT = Number(process.env.SMTP_PORT ?? 25);
const MAX_MESSAGE_MB = Number(process.env.SMTP_MAX_MESSAGE_MB ?? 35);

async function deliverToApi(mail: {
  from: string;
  to: string[];
  subject: string;
  body: string;
  bodyHtml?: string;
  messageId?: string;
  attachments: Array<{
    filename: string;
    mimeType: string;
    size: number;
    content: string; // Base64
  }>;
}): Promise<{ created: unknown[]; rejected: string[] }> {
  const res = await fetch(`${API_URL}/api/inbound`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-internal-key': INTERNAL_KEY,
    },
    body: JSON.stringify(mail),
  });
  const json = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    data?: { created: unknown[]; rejected: string[] };
    error?: { message?: string };
  };
  if (!res.ok || !json.success) {
    throw new Error(json.error?.message ?? `inbound API ${res.status}`);
  }
  return json.data!;
}

async function handleData(stream: SMTPServerDataStream, _session: SMTPServerSession, callback: (err?: Error | null | undefined, message?: string | undefined) => void) {
  let mail: ParsedMail;
  try {
    mail = await simpleParser(stream);
  } catch (err) {
    console.error('[smtp] parse failed:', err);
    return callback(err instanceof Error ? err : new Error('parse failed'));
  }

  const from = mail.from?.value?.[0]?.address ?? '';
  const to = (mail.to ? (Array.isArray(mail.to) ? mail.to : [mail.to]) : [])
    .flatMap((g: AddressObject) => g.value ?? [])
    .map((v: { address?: string }) => v.address ?? '')
    .filter(Boolean);

  if (!from || to.length === 0) {
    console.warn('[smtp] rejecting message with missing from/to');
    return callback(new Error('553 5.1.3 Missing sender or recipient'));
  }

  // Forward parsed attachments as Base64 so the API can hand them to
  // ClamAV for scanning. mailparser exposes attachment content as a
  // Buffer on `mail.attachments[].content`.
  const attachments = (mail.attachments ?? []).map((a) => ({
    filename: a.filename ?? 'unnamed',
    mimeType: a.contentType ?? 'application/octet-stream',
    size: a.size ?? (a.content ? a.content.length : 0),
    content: (a.content ?? Buffer.alloc(0)).toString('base64'),
  }));

  try {
    const result = await deliverToApi({
      from,
      to,
      subject: mail.subject ?? '',
      body: mail.text ?? '',
      bodyHtml: mail.html ? (typeof mail.html === 'string' ? mail.html : undefined) : undefined,
      messageId: mail.messageId,
      attachments,
    });
    console.log(`[smtp] delivered ${result.created.length} email(s), rejected ${result.rejected.length}`);
    // If every recipient was rejected, signal a permanent failure.
    if (result.created.length === 0) {
      return callback(new Error('550 5.1.1 No such user here'));
    }
    callback();
  } catch (err) {
    console.error('[smtp] deliver failed:', err);
    // 451 = temporary failure; remote MTA should retry.
    callback(new Error('451 4.3.0 Local delivery temporarily failed'));
  }
}

const server = new SMTPServer({
  secure: false,
  authOptional: true,
  // Accept any sender/recipient at the protocol level; resolution happens
  // after message parsing via the API (which knows the custom-email map).
  onMailFrom: (_addr, _session, cb) => cb(),
  onRcptTo: (_addr, _session, cb) => cb(),
  onData: handleData,
  disabledCommands: ['STARTTLS'],
  size: MAX_MESSAGE_MB * 1024 * 1024,
});
if (require.main === module) {
  if (!INTERNAL_KEY) {
    console.error('[smtp] FATAL: INTERNAL_API_KEY not set — refusing to start');
    process.exit(1);
  }
  server.listen(SMTP_PORT, () => {
    console.log(`[smtp] Guardmail SMTP server listening on :${SMTP_PORT}`);
  });
}

// Graceful shutdown.
let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  console.log('[smtp] Shutting down...');
  server.close(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

export { server, deliverToApi };