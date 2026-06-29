# AI Guard Mail — MCP Install Guide for LLM Agents

AI Guard Mail (Guardmail) is a secure email service with LLM Guard prompt-injection
scanning, ClamAV virus scanning, and spam filtering. It exposes an **MCP server** so
LLM agents can send/receive email, manage spam settings, and inspect scan reports.

This guide explains how to connect an MCP-compatible LLM client to the **hosted**
Guardmail MCP service over HTTP. No local clone, Docker, or database is required —
everything runs on `https://aiguard.email`.

---

## 1. What you get

| Capability | Tool |
|---|---|
| Register a new mailbox user | `register_user` |
| Send email (auto-scanned by LLM Guard + ClamAV) | `send_email` |
| List inbox emails with scan results | `list_inbox` |
| List spam-folder emails | `list_spam` |
| List quarantined emails (prompt-injection / virus) | `list_quarantine` |
| Get full email details + scan report | `get_email` |
| Update spam filter configuration | `update_spam_settings` |
| Update security settings (outbound LLM Guard toggle) | `update_security_settings` |

Resources exposed: `guardmail://inbox`, `guardmail://spam`,
`guardmail://quarantine`, `guardmail://settings/spam`,
`guardmail://settings/security`.

---

## 2. Prerequisites

- An account on **[aiguard.email](https://aiguard.email)**.
  - If you don't have one, you can self-register via the `register_user` tool
    (see §5) or through the web UI.
- Your **API key** — generate one at
  **[aiguard.email/app/api](https://aiguard.email/app/api)** (the **API** section of the dashboard).
  The key is a UUID string (e.g. `9f3e6223-…-fa10ccab4783`).

The API key is the only credential you need. It is sent via the `x-api-key`
header and doubles as the OAuth access token for the MCP server.

---

## 3. Connection details

| Setting | Value |
|---|---|
| **Transport** | Streamable HTTP (MCP spec) |
| **Endpoint URL** | `https://mcp.aiguard.email/mcp` |
| **Auth header** | `x-api-key: <your-api-key>` |
| **Method** | `POST` |
| **Content-Type** | `application/json` |
| **Required request headers** | `Accept: application/json, text/event-stream` |

The server is **stateless** — each `POST /mcp` carries a complete JSON-RPC 2.0
request. SSE streaming is not required; simple request/response works.

---

## 4. Client configuration snippets

### Claude Desktop / `claude_desktop_config.json`

```jsonc
{
  "mcpServers": {
    "ai-guard-mail": {
      "url": "https://mcp.aiguard.email/mcp",
      "headers": { "x-api-key": "YOUR_API_KEY" }
    }
  }
}
```

### pi `.mcp.json`

```jsonc
{
  "mcpServers": {
    "ai-guard-mail": {
      "url": "https://mcp.aiguard.email/mcp",
      "headers": { "x-api-key": "YOUR_API_KEY" }
    }
  }
}
```

### Cline (VS Code) / `.mcp.json`

```jsonc
{
  "mcpServers": {
    "ai-guard-mail": {
      "type": "http",
      "url": "https://mcp.aiguard.email/mcp",
      "headers": { "x-api-key": "YOUR_API_KEY" }
    }
  }
}

### Cursor / other MCP clients

Use the **Streamable HTTP** transport type with:

- URL: `https://mcp.aiguard.email/mcp`
- Header: `x-api-key: YOUR_API_KEY`

### OAuth flow (clients that prefer interactive auth)

The server also implements MCP OAuth 2.1:

1. Point your client at `https://mcp.aiguard.email` as the issuer.
2. The authorization page renders a form; paste your API key and click
   **Authorize**.
3. The key is exchanged for an access token (the key itself) and used as a
   `Bearer` token on subsequent requests.

Static `x-api-key` and full OAuth produce the same result — pick whichever
your client supports.

### Smithery (no API key header required)

The MCP server also ships a **Smithery** entry point (`packages/mcp-server/src/index.ts`)
that runs over **stdio** and takes the API key from Smithery's config UI — no
`x-api-key` header or OAuth flow is needed. Smithery renders a config form from
the exported `configSchema`; paste your API key into the `apiKey` field and
Smithery injects it into the server factory directly.

- **Runtime:** `smithery.yaml` → `runtime: typescript`
- **Config fields:** `apiKey` (your Guardmail API key), `apiUrl` (optional;
  defaults to `https://aiguard.email`)
- **Transport:** stdio (Smithery's runtime drives it)

When no key is configured, tool calls return a friendly "please set your API
key" message instead of failing with a raw 401.

The hosted HTTP/OAuth transport (`src/http-server.ts`) continues to serve
direct MCP clients at `https://mcp.aiguard.email/mcp`.

---

## 5. Quick start (raw JSON-RPC)

Prefer to test from a shell before wiring up a client? Each request is a plain
JSON-RPC 2.0 `POST` to `https://mcp.aiguard.email/mcp`.

### 5.1 List available tools

```bash
curl -sS https://mcp.aiguard.email/mcp \
  -H 'content-type: application/json' \
  -H 'x-api-key: YOUR_API_KEY' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

### 5.2 Register a new user (no auth needed for this tool)

```bash
curl -sS https://mcp.aiguard.email/mcp \
  -H 'content-type: application/json' \
  -H 'x-api-key: YOUR_API_KEY' \
  -d '{
    "jsonrpc":"2.0","id":2,"method":"tools/call",
    "params":{"name":"register_user",
      "arguments":{"username":"alice","email":"alice@personal.com","password":"supersecret123"}}
  }'
```

### 5.3 List your inbox

```bash
curl -sS https://mcp.aiguard.email/mcp \
  -H 'content-type: application/json' \
  -H 'x-api-key: YOUR_API_KEY' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call",
      "params":{"name":"list_inbox","arguments":{"limit":20}}}'
```

### 5.4 Send an email (scanned automatically)

```bash
curl -sS https://mcp.aiguard.email/mcp \
  -H 'content-type: application/json' \
  -H 'x-api-key: YOUR_API_KEY' \
  -d '{
    "jsonrpc":"2.0","id":4,"method":"tools/call",
    "params":{"name":"send_email",
      "arguments":{"to":["bob@example.com"],"subject":"Hello","body":"Sent from an LLM agent."}}
  }'
```

### 5.5 Read a resource

```bash
curl -sS https://mcp.aiguard.email/mcp \
  -H 'content-type: application/json' \
  -H 'x-api-key: YOUR_API_KEY' \
  -d '{"jsonrpc":"2.0","id":5,"method":"resources/read",
      "params":{"uri":"guardmail://inbox"}}'
```

All tool responses are JSON strings wrapped in MCP `content`:

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "content": [{ "type": "text", "text": "{\"success\":true,\"data\":[...]}" }]
  }
}
```

---

## 6. Tool reference

### `register_user`

Register a new Guardmail user and provision a custom email address
(`<username>@aiguard.email`).

| Argument | Type | Required | Constraints |
|---|---|---|---|
| `username` | string | ✅ | 3–64 chars |
| `email` | string (email) | ✅ | User's real recovery email |
| `password` | string | ✅ | 8–128 chars |

### `send_email`

Send an email from the authenticated user's custom Guardmail address.
Every send is scanned by **LLM Guard** (prompt-injection / PII) and **ClamAV**
(attachments) before delivery.

| Argument | Type | Required | Constraints |
|---|---|---|---|
| `to` | string[] (email) | ✅ | 1–50 recipients |
| `subject` | string | ✅ | 1–500 chars |
| `body` | string | ✅ | 1–100 000 chars |
| `bodyHtml` | string | ❌ | ≤ 500 000 chars |

### `list_inbox` / `list_spam` / `list_quarantine`

List emails in the respective folder with security scan status.

| Argument | Type | Required | Constraints |
|---|---|---|---|
| `limit` | integer | ❌ | 1–200 (default 50) |
| `offset` | integer | ❌ | ≥ 0 |

> **Security note:** emails that have not finished scanning are **omitted**
> from list responses — their content (which may contain unanalyzed
> prompt-injection payloads) is never sent to an LLM agent. Quarantined
> emails are returned with subject/body **redacted** to metadata only.

### `get_email`

Get full email details including the complete security scan report.

| Argument | Type | Required | Constraints |
|---|---|---|---|
| `emailId` | string (UUID) | ✅ | — |

Returns an error if the email is still being scanned. Quarantined emails
are returned with their payload redacted.

### `update_spam_settings`

Update the user's spam filter configuration.

| Argument | Type | Required | Constraints |
|---|---|---|---|
| `enabled` | boolean | ✅ | — |
| `sensitivity` | enum | ✅ | `low` \| `medium` \| `high` \| `custom` |
| `allowlist` | string[] (email) | ❌ | ≤ 500 entries |
| `blocklist` | string[] (email) | ❌ | ≤ 500 entries |
| `keywordRules` | object[] | ❌ | ≤ 200 rules |
| `keywordRules[].keyword` | string | — | 1–64 chars |
| `keywordRules[].action` | enum | — | `flag` \| `block` |
| `keywordRules[].score` | number | — | 0–1 |
| `blockContentTypes` | string[] | ❌ | ≤ 50 entries |

### `update_security_settings`

Update the user's security settings. Currently controls whether outbound
(sent) emails are scanned by LLM Guard for prompt injection and toxicity
before delivery. Inbound scanning is always on regardless of this setting.

| Argument | Type | Required | Constraints |
|---|---|---|---|
| `llmGuardOutboundEnabled` | boolean | ✅ | `true` = scan outbound, `false` = skip |

---

## 7. Resources

| URI | MIME | Description |
|---|---|---|
| `guardmail://inbox` | `application/json` | Inbox with scan status |
| `guardmail://spam` | `application/json` | Spam folder |
| `guardmail://quarantine` | `application/json` | Quarantined (LLM Guard / ClamAV) — redacted |
| `guardmail://settings/spam` | `application/json` | Current spam filter config |
| `guardmail://settings/security` | `application/json` | Outbound LLM Guard toggle |

---

## 8. Security model (what an agent can rely on)

- **LLM Guard** scans every inbound and outbound email body for prompt
  injection, jailbreak attempts, toxicity, and PII leakage before it
  reaches the inbox — or the MCP `list`/`get` responses. Outbound scanning
  can be turned off per user via the `update_security_settings` tool
  (`llmGuardOutboundEnabled`); inbound scanning is always on.
- **ClamAV** scans all attachments for known virus signatures.
- **Spam filter** applies per-user keyword, allowlist, and blocklist rules.
- The MCP layer applies **defense-in-depth**: unscanned emails are dropped
  from lists, and quarantined email bodies are redacted so a flagged
  prompt-injection payload can never enter an LLM agent's context window.
- Outbound mail is scanned before it is sent, so an agent cannot be used
  to relay an injection payload to a third party. (This outbound scan can
  be disabled per user via `update_security_settings`; when disabled,
  outbound mail is delivered without an LLM Guard check.)

---

## 9. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `401 Unauthorized` | Missing/wrong `x-api-key` | Confirm the key matches the **API** section on aiguard.email |
| `405 GET not supported` | Used `GET /mcp` | Use `POST /mcp` for all JSON-RPC calls |
| `Email is still being scanned` | Called `get_email` before scans finished | Retry after a few seconds |
| Empty inbox list | All emails unscanned or no mail yet | Wait for inbound mail to finish processing, or send a test email |
| `500 MCP server error` | Transient upstream issue | Retry; if persistent, check status at aiguard.email |

---

## 10. Links

| Resource | URL |
|---|---|
| Web app & dashboard | <https://aiguard.email> |
| API key management | <https://aiguard.email/app/api> |
| MCP endpoint | <https://mcp.aiguard.email/mcp> |
| OAuth issuer metadata | <https://mcp.aiguard.email/.well-known/oauth-authorization-server> |
| Source repository | <https://github.com/> *(replace with your repo URL)* |

---

## 11. Summary for agents

1. Get an API key at **aiguard.email/app/api**.
2. Add the server with URL `https://mcp.aiguard.email/mcp` and header
   `x-api-key: <key>`.
3. Call `tools/list` to discover tools, then `tools/call` or
   `resources/read` to interact.
4. All email content returned to you has already passed LLM Guard + ClamAV
   scanning; quarantined content is redacted.

That's it — no build, no Docker, no database. Just an API key.

## 12. Example curl

```bash
# List inbox (curl example)
curl -s -X POST https://mcp.aiguard.email/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H 'x-api-key: YOUR_API_KEY' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_inbox","arguments":{}}}'
```
