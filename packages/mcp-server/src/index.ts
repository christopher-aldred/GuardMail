/**
 * Guardmail MCP server — Smithery entry point (stdio transport).
 *
 * Smithery expects a default-exported `createServer({ config })` factory
 * and an exported `configSchema` (Zod). Smithery renders a config form
 * from the schema, the user pastes their API key into it, and Smithery
 * passes the parsed config to this factory. The factory returns a
 * low-level MCP `Server` instance; Smithery's own runtime connects the
 * stdio transport and drives the server.
 *
 * This means Smithery does NOT require an `x-api-key` HTTP header (or any
 * OAuth flow): the API key is injected via `config.apiKey` and used to
 * build an `ApiClient` directly. When no key is configured, tool calls
 * return a friendly "please set your API key" message instead of hitting
 * the API with empty credentials.
 *
 * The hosted HTTP/OAuth transport lives in `./http-server.ts` for direct
 * MCP clients (pi, Claude Desktop, OpenClaw, Hermes).
 */
import 'dotenv/config';
import { z } from 'zod';
import { ApiClient } from './api-client';
import { buildMcpServer } from './server-factory';

export const configSchema = z.object({
  apiKey: z
    .string()
    .optional()
    .describe(
      'Your AI Guard Mail API key (a UUID). Generate one at https://aiguard.email/app/settings → API Key.',
    ),
  apiUrl: z
    .string()
    .url()
    .optional()
    .describe(
      'API base URL. Defaults to https://aiguard.email. Override only for self-hosted deployments.',
    ),
});

export type GuardmailConfig = z.infer<typeof configSchema>;

const MISSING_KEY_MESSAGE =
  'Please set your AI Guard Mail API key in the Smithery configuration. ' +
  'Get it at https://aiguard.email/app/settings → API Key.';

export default function createServer({ config }: { config: GuardmailConfig }) {
  const apiUrl = config.apiUrl || process.env.API_URL || 'https://aiguard.email';
  const client = new ApiClient(config.apiKey ?? '', true, apiUrl);
  const missingKeyMessage = config.apiKey ? undefined : MISSING_KEY_MESSAGE;
  return buildMcpServer({ client, missingKeyMessage });
}