/**
 * Simple OAuth server provider for AI Guard Mail MCP.
 *
 * The user's Guardmail API key doubles as the OAuth access token.
 * The authorization flow presents a form where the user pastes their
 * API key; a successful key produces an authorization code that is
 * exchanged for the same key as the access token.
 */
import { randomUUID, randomBytes } from 'node:crypto';
import type { Response } from 'express';
import type {
  OAuthServerProvider,
  AuthorizationParams,
} from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type {
  OAuthClientInformationFull,
  OAuthTokens,
  OAuthTokenRevocationRequest,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import type {
  OAuthRegisteredClientsStore,
} from '@modelcontextprotocol/sdk/server/auth/clients.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';

// ---------------------------------------------------------------------------
// In-memory stores (sufficient for a single-instance MCP server)
// ---------------------------------------------------------------------------

interface StoredCode {
  clientId: string;
  codeChallenge: string;
  redirectUri: string;
  apiKey: string;
  scopes: string[];
  expiresAt: number;
}

const clients = new Map<string, OAuthClientInformationFull>();
const codes = new Map<string, StoredCode>();

const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// ---------------------------------------------------------------------------
// API key verification — calls the API server to validate the key
// ---------------------------------------------------------------------------

const API_URL = process.env.API_URL ?? 'http://localhost:3000';

async function verifyApiKey(apiKey: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/auth/verify-key`, {
      headers: { 'x-api-key': apiKey },
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Clients store — open dynamic registration
// ---------------------------------------------------------------------------

const clientsStore: OAuthRegisteredClientsStore = {
  getClient(clientId: string) {
    return clients.get(clientId);
  },
  registerClient(client: Omit<OAuthClientInformationFull, 'client_id' | 'client_id_issued_at'>) {
    const full: OAuthClientInformationFull = {
      ...client,
      client_id: randomUUID(),
      client_id_issued_at: Date.now(),
    };
    clients.set(full.client_id, full);
    return full;
  },
};

// ---------------------------------------------------------------------------
// OAuth provider implementation
// ---------------------------------------------------------------------------

export const oauthProvider: OAuthServerProvider = {
  get clientsStore() {
    return clientsStore;
  },

  /**
   * Renders a simple HTML form asking the user to paste their API key.
   * On submit, the key is validated and an authorization code is issued.
   */
  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response,
  ): Promise<void> {
    // If the form was submitted (POST body) validate + redirect.
    // Falls back to query param for backwards compatibility / manual testing.
    const submittedKey =
      (res.req?.body?.api_key as string | undefined) ??
      (res.req?.query?.api_key as string | undefined);
    if (submittedKey) {
      const valid = await verifyApiKey(submittedKey);
      if (!valid) {
        res.status(400).send(renderAuthForm(params, client, 'Invalid API key. Please check your key in the AI Guard Mail dashboard under the API section.'));
        return;
      }
      const code = randomBytes(32).toString('hex');
      codes.set(code, {
        clientId: client.client_id,
        codeChallenge: params.codeChallenge,
        redirectUri: params.redirectUri,
        apiKey: submittedKey,
        scopes: params.scopes ?? [],
        expiresAt: Date.now() + CODE_TTL_MS,
      });
      const redirectUrl = new URL(params.redirectUri);
      redirectUrl.searchParams.set('code', code);
      if (params.state) redirectUrl.searchParams.set('state', params.state);
      res.redirect(302, redirectUrl.toString());
      return;
    }
    // First render: show the form
    res.send(renderAuthForm(params, client));
  },

  async challengeForAuthorizationCode(
    _client: OAuthClientInformationFull,
    authorizationCode: string,
  ): Promise<string> {
    const stored = codes.get(authorizationCode);
    if (!stored) throw new Error('Invalid or expired authorization code');
    return stored.codeChallenge;
  },

  async exchangeAuthorizationCode(
    _client: OAuthClientInformationFull,
    authorizationCode: string,
    _codeVerifier?: string,
    _redirectUri?: string,
  ): Promise<OAuthTokens> {
    const stored = codes.get(authorizationCode);
    if (!stored) throw new Error('Invalid or expired authorization code');
    if (stored.expiresAt < Date.now()) {
      codes.delete(authorizationCode);
      throw new Error('Authorization code expired');
    }
    codes.delete(authorizationCode);

    return {
      access_token: stored.apiKey,
      token_type: 'bearer',
      scope: stored.scopes.join(' '),
    };
  },

  async exchangeRefreshToken(
    _client: OAuthClientInformationFull,
    refreshToken: string,
    _scopes?: string[],
  ): Promise<OAuthTokens> {
    // Refresh tokens are the API key itself — validate before re-issuing.
    const valid = await verifyApiKey(refreshToken);
    if (!valid) {
      throw new Error('Invalid refresh token');
    }
    return {
      access_token: refreshToken,
      token_type: 'bearer',
    };
  },

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const valid = await verifyApiKey(token);
    if (!valid) {
      // Return a far-future expiry — API keys don't expire.
      const err = new Error('Invalid access token');
      (err as any).statusCode = 401;
      throw err;
    }
    return {
      token,
      clientId: 'guardmail-user',
      scopes: ['mail'],
      // API keys don't expire; set a far-future timestamp (seconds since epoch).
      expiresAt: Math.floor(Date.now() / 1000) + 100 * 365 * 24 * 60 * 60, // ~100 years
    };
  },

  async revokeToken(_client: OAuthClientInformationFull, _request: OAuthTokenRevocationRequest): Promise<void> {
    // No-op — API keys are managed via the dashboard, not revoked via OAuth.
  },

  skipLocalPkceValidation: false,
};

// ---------------------------------------------------------------------------
// HTML form for the authorization step
// ---------------------------------------------------------------------------

function renderAuthForm(
  params: AuthorizationParams,
  client: OAuthClientInformationFull,
  errorMsg?: string,
): string {
  const clientName = client.client_name ?? 'an AI agent';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AI Guard Mail — Authorize Agent</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #0f172a; color: #e2e8f0; margin: 0; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 16px; padding: 32px; max-width: 420px; width: 100%; }
    h1 { font-size: 20px; margin: 0 0 8px; }
    p { color: #94a3b8; font-size: 14px; line-height: 1.5; margin: 0 0 24px; }
    label { display: block; font-size: 14px; font-weight: 500; margin-bottom: 6px; }
    input { width: 100%; box-sizing: border-box; background: #0f172a; border: 1px solid #334155; border-radius: 8px; padding: 12px; color: #e2e8f0; font-size: 14px; font-family: monospace; }
    input:focus { outline: none; border-color: #3b82f6; }
    button { width: 100%; margin-top: 16px; background: #2563eb; color: #fff; border: none; border-radius: 8px; padding: 12px; font-size: 15px; font-weight: 500; cursor: pointer; }
    button:hover { background: #1d4ed8; }
    .error { color: #f87171; font-size: 14px; margin-top: 12px; }
    .hint { color: #64748b; font-size: 12px; margin-top: 16px; }
    a { color: #3b82f6; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Authorize ${clientName}</h1>
    <p>Enter your AI Guard Mail API key to authorize this agent to access your mailbox.</p>
    ${errorMsg ? `<div class="error">${errorMsg}</div>` : ''}
    <form method="POST" action="">
      <input type="hidden" name="response_type" value="code">
      <input type="hidden" name="client_id" value="${client.client_id ?? ''}">
      <input type="hidden" name="redirect_uri" value="${params.redirectUri ?? ''}">
      <input type="hidden" name="code_challenge" value="${params.codeChallenge ?? ''}">
      <input type="hidden" name="code_challenge_method" value="S256">
      <input type="hidden" name="state" value="${params.state ?? ''}">
      <input type="hidden" name="scope" value="${params.scopes?.join(' ') ?? ''}">
      ${params.resource ? `<input type="hidden" name="resource" value="${params.resource.toString()}">` : ''}
      <label for="api_key">API Key</label>
      <input type="text" id="api_key" name="api_key" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" required autofocus>
      <button type="submit">Authorize</button>
    </form>
    <p class="hint">Get your API key from <a href="https://aiguard.email/app/api" target="_blank">AI Guard Mail → API</a></p>
  </div>
</body>
</html>`;
}