# Guardmail

[![smithery badge](https://smithery.ai/badge/afluffysquirrel/mail-guard)](https://smithery.ai/servers/afluffysquirrel/mail-guard)

![Logo](https://github.com/christopher-aldred/GuardMail/blob/main/cropped_text_logo.png?raw=true)

Secure email service with LLM Guard protection, ClamAV attachment scanning,
configurable spam filtering, an MCP server for LLM agents, and a React web UI.

## Architecture

See [`design.md`](./design.md) and [`requirements.md`](./requirements.md).

| Package               | Description                                                              |
| --------------------- | ------------------------------------------------------------------------ |
| `packages/shared`     | Shared TypeScript types and helpers                                      |
| `packages/api`        | Hono REST API server (auth, emails, settings, email processing pipeline) |
| `packages/mcp-server` | MCP server (stdio + HTTP/SSE) for LLM agents                             |
| `packages/web`        | React + Vite + Tailwind SPA                                              |
| `docker/llm-guard`    | Python FastAPI service wrapping `llm-guard`                              |

External services (via Docker Compose): PostgreSQL, Redis, ClamAV, LLM Guard.

## Quick start (local)

```bash
pnpm install
cp .env.example .env                 # edit if needed
pnpm -r run build                    # typecheck + build all packages
pnpm -r test                         # run unit tests (no Docker required)

# Spin up dependencies + services:
cd docker && docker compose up -d
pnpm --filter @guardmail/api db:migrate # create schema
pnpm --filter @guardmail/api db:seed    # create demo user (demo / demo-password-123)

# Run services in dev:
pnpm --filter @guardmail/api dev        # API on :3000
pnpm --filter @guardmail/mcp-server dev # MCP on stdio (or MCP_TRANSPORT=http :3001)
pnpm --filter @guardmail/web dev        # Web UI on :5173
```

## API

See [`design.md`](./design.md) for the full endpoint table. All endpoints
except `/api/auth/*` and `/api/health` require a `Bearer` JWT.

## MCP Server

Exposes 8 tools (`send_email`, `list_inbox`, `list_spam`, `list_quarantine`,
`get_email`, `register_user`, `update_spam_settings`, `update_security_settings`) and 5 resources
(`guardmail://inbox`, `guardmail://spam`, `guardmail://quarantine`,
`guardmail://settings/spam`, `guardmail://settings/security`). Auth via `X-API-Key` header or `MCP_API_KEY` env.

## Test status

| Package     | Suites | Tests |
| ----------- | ------ | ----- |
| shared      | 3      | 29    |
| api         | 9      | 56    |
| mcp-server  | 3      | 36    |
| web         | 1      | 1     |
| smtp-server | 1      | 2     |

**Total: 17 suites, 124 tests** (all passing, no Docker required).

Integration tests (`packages/api/tests/integration/`) require live Docker
services and are intentionally not run in CI by default.
