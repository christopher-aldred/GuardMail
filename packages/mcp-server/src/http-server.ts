/**
 * Guardmail MCP server — Streamable HTTP transport with OAuth.
 *
 * This is the deployment entry point for the hosted MCP service
 * (e.g. `https://mcp.aiguard.email/mcp`). It implements the official
 * MCP Streamable HTTP transport spec so that any standard MCP client
 * (pi, Claude Desktop, OpenClaw, Hermes) can connect. Authentication
 * uses OAuth 2.1 where the user's Guardmail API key serves as the
 * access token.
 *
 * In stateless mode a fresh MCP Server instance is created per request
 * so that the verified API key from the Express bearer-auth middleware
 * can be captured in a closure and used by tool/resource handlers.
 *
 * (Smithery deploys via `src/index.ts`, which uses the stdio transport
 * and takes the API key from Smithery config — no HTTP headers.)
 */
import 'dotenv/config';
import express from 'express';
import {
  mcpAuthRouter,
} from '@modelcontextprotocol/sdk/server/auth/router.js';
import {
  requireBearerAuth,
} from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { ApiClient } from './api-client';
import { buildMcpServer } from './server-factory';
import { oauthProvider } from './auth-provider';
import { apiKeyHeaderMiddleware } from './api-key-middleware';

const PORT = Number(process.env.MCP_PORT ?? 3001);
const HOST = process.env.HOST ?? '0.0.0.0';

// The public base URL of this MCP server (used for OAuth metadata).
const PUBLIC_URL = process.env.MCP_PUBLIC_URL ?? `http://localhost:${PORT}`;
const BASE_URL = new URL(PUBLIC_URL);

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------

const app = express();
app.use(express.json());

// OAuth metadata + authorization server endpoints (register, authorize, token, revoke)
app.use(
  mcpAuthRouter({
    provider: oauthProvider,
    issuerUrl: BASE_URL,
    baseUrl: BASE_URL,
    serviceDocumentationUrl: new URL('https://aiguard.email/docs'),
    scopesSupported: ['mail'],
    resourceName: 'AI Guard Mail MCP',
  }),
);

// Protected resource metadata (tells clients where the authorization server is)
const resourceMetadataUrl = `${PUBLIC_URL}/.well-known/oauth-protected-resource`;

// Bearer auth middleware — verifies the access token (= API key)
const bearerAuth = requireBearerAuth({
  verifier: oauthProvider,
  requiredScopes: [],
  resourceMetadataUrl,
});

// Normalise x-api-key header to Authorization: Bearer so that clients
// configured with a static API key header (e.g. .mcp.json) work without
// a full OAuth flow. Standard MCP clients using OAuth Bearer are unaffected.
// (Imported from ./api-key-middleware for testability.)

// MCP endpoint — Streamable HTTP transport (stateless mode)
app.post('/mcp', apiKeyHeaderMiddleware, bearerAuth, async (req, res) => {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless
  });
  try {
    // Create a fresh server per request so the auth token is captured
    // in the closure and available to all tool/resource handlers.
    const client = new ApiClient(req.auth!.token, true);
    const mcpServer = buildMcpServer({ client });
    await mcpServer.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error('[mcp] Streamable HTTP error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'MCP server error' });
    }
  }
  // Clean up the transport after each request (stateless)
  transport.close();
});

// Also handle GET for SSE streaming (optional, for clients that prefer SSE)
app.get('/mcp', apiKeyHeaderMiddleware, bearerAuth, async (_req, res) => {
  res.status(405).json({ error: 'GET not supported, use POST' });
});

// Delete for session cleanup
app.delete('/mcp', apiKeyHeaderMiddleware, bearerAuth, async (_req, res) => {
  res.status(204).end();
});

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'guardmail-mcp' });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

app.listen(PORT, HOST, () => {
  console.log(`[mcp] Streamable HTTP server on http://${HOST}:${PORT}/mcp`);
  console.log(`[mcp] OAuth issuer: ${PUBLIC_URL}`);
});