# Guardmail — Railway Deployment Guide

Step-by-step instructions for deploying Guardmail to Railway.

## Prerequisites

- A [Railway](https://railway.app) account
- The [Railway CLI](https://docs.railway.app/develop/cli) installed (`npm i -g @railway/cli`)
- `pnpm` installed locally
- A registered domain name (for custom email addresses, e.g. `mydomain.com`)
- Git repository pushed to GitHub/GitLab (Railway deploys from a connected repo)

---

## 1. Clone & install locally

```bash
git clone <your-repo-url> guardmail
cd guardmail
pnpm install
cp .env.example .env   # review/edit as needed
```

Verify everything builds and tests pass:

```bash
pnpm -r run build
pnpm -r test
```

---

## 2. Create the Railway project

### 2.1 Via the Railway CLI (recommended)

```bash
railway login
railway init            # create a new project, e.g. "guardmail"
```

### 2.2 Via the Railway dashboard

1. Go to <https://railway.app/new>
2. Click **Deploy from GitHub repo** and select your Guardmail repository
3. Name the project `guardmail`

---

## 3. Provision backing services

Add the following **Add-ons** (dashboard → your project → **New → Database**):

| Add-on | Purpose | Suggested plan |
|--------|---------|----------------|
| **PostgreSQL** | Primary data store | Free/Developer (512MB is enough to start) |
| **Redis** | Email queue + rate limiting | Free/Developer |

Railway will expose the connection strings as **reference variables**, e.g.:

- `${{Postgres.DATABASE_URL}}`
- `${{Redis.REDIS_URL}}`

---

## 4. Add the five application services

For each service below, in the dashboard:

**New → Deploy from GitHub repo → select your Guardmail repo → Configure → set Root Directory to the path shown → Generate**

Repeat for each row:

| Service | Root directory | Dockerfile | Start command |
|---------|----------------|------------|--------------|
| `api` | `packages/api` | `packages/api/Dockerfile` | `node dist/index.js` |
| `mcp-server` | `packages/mcp-server` | `packages/mcp-server/Dockerfile` | `node dist/index.js` |
| `web` | `packages/web` | `packages/web/Dockerfile` | (nginx serves built static files) |
| `llm-guard` | `docker/llm-guard` | `docker/llm-guard/Dockerfile` | (uvicorn in image) |
| `clamav` | (no repo) | — | Image: `clamav/clamav:unstable` |
| `smtp-server` | `packages/smtp-server` | `packages/smtp-server/Dockerfile` | `node dist/index.js` (listens on port 25) |

> **ClamAV** is added via **New → Docker Image → Raw** and entering `clamav/clamav:unstable`.

> **Tip:** `railway.json` (already in the repo) pre-defines these services and their variable mappings. If you deploy via `railway up`, Railway reads `railway.json` automatically — you can skip the manual service creation and go straight to step 5.

---

## 5. Configure environment variables

For each service, set the variables below (use Railway **reference variables** to link add-on values). Values shown as `${{...}}` are Railway references that resolve automatically.

### 5.1 `api`

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `REDIS_URL` | `${{Redis.REDIS_URL}}` |
| `JWT_SECRET` | (generate a strong random string) |
| `JWT_EXPIRES_IN` | `7d` |
| `LLM_GUARD_URL` | `http://llm-guard.railway.internal:8000` |
| `CLAMAV_HOST` | `clamav.railway.internal` |
| `CLAMAV_PORT` | `3310` |
| `EMAIL_DOMAIN` | `mydomain.com` *(your domain)* |
| `API_PORT` | `3000` |
| `EMAIL_WORKER_ENABLED` | `1` |
| `NODE_ENV` | `production` |
| `CORS_ORIGINS` | `https://<web-public-domain>,https://<your-frontend-domain>` |
| `MAX_ATTACHMENT_SIZE_MB` | `25` |
| `RATE_LIMIT_WINDOW_MS` | `900000` |
| `RATE_LIMIT_MAX_REQUESTS` | `100` |

> Use the **internal** hostname (`<service>.railway.internal`) for service-to-service calls. The public domain is only for the browser-facing `web` service.

### 5.2 `mcp-server`

| Variable | Value |
|----------|-------|
| `API_URL` | `http://api.railway.internal:3000` |
| `MCP_API_KEY` | (generate a strong random string) |
| `MCP_PORT` | `3001` |
| `MCP_TRANSPORT` | `http` |
| `NODE_ENV` | `production` |

### 5.3 `web`

| Variable | Value |
|----------|-------|
| `VITE_API_URL` | `https://<api-public-domain>` |
| `WEB_PORT` | `5173` |

### 5.4 `llm-guard`

| Variable | Value |
|----------|-------|
| `LLM_GUARD_INJECTION_THRESHOLD` | `0.8` |
| `LLM_GUARD_JAILBREAK_THRESHOLD` | `0.8` |
| `LLM_GUARD_TOXICITY_THRESHOLD` | `0.8` |
| `LLM_GUARD_TIMEOUT_MS` | `15000` |

### 5.5 `clamav`

No environment variables required. Ensure port `3310` is exposed internally (Railway does this automatically for image-based services).

### 5.6 `smtp-server`

| Variable | Value |
|----------|-------|
| `API_URL` | `http://api.railway.internal:3000` |
| `INTERNAL_API_KEY` | (same strong random string as set on `api`) |
| `SMTP_PORT` | `25` |
| `SMTP_MAX_MESSAGE_MB` | `35` |

> **Port 25 on Railway:** Railway's public TCP ports default to 80/4480. To receive raw SMTP on port 25 you must (a) generate a **public TCP domain** (not an HTTP domain) for the `smtp-server` service, and (b) point your domain's MX record at that TCP hostname. If Railway blocks port 25, run the SMTP listener on `587`/`2525` instead and set `SMTP_PORT` accordingly — only the MX record target matters for inbound.

---

## 6. Generate public domains

For each service that needs an externally reachable URL, go to the service → **Settings → Networking → Generate Domain**:

| Service | Needs public domain? | Why |
|---------|---------------------|-----|
| `api` | ✅ | Web UI and external clients call it |
| `mcp-server` | ✅ | LLM agents connect over HTTP/SSE |
| `web` | ✅ | Browser access |
| `smtp-server` | ✅ (TCP) | Receives inbound mail — use a **public TCP domain**, not HTTP |
| `llm-guard` | ❌ | Only called by `api` internally |
| `clamav` | ❌ | Only called by `api` internally |

After generating, update the dependent variables:

- `web` → `VITE_API_URL` = the `api` public domain (e.g. `https://guardmail-api-production.up.railway.app`)
- `api` → `CORS_ORIGINS` = the `web` public domain
- `mcp-server` → `API_URL` stays internal (`http://api.railway.internal:3000`)

---

## 7. Deploy

```bash
railway up
```

Or trigger a redeploy from the dashboard. Watch the build logs for each service to confirm successful startup.

---

## 8. Run database migrations + seed

Once the `api` service is up and PostgreSQL is reachable:

```bash
# Option A — run from your local machine (needs DATABASE_URL exposed locally)
railway link   # select the project + the `api` service
railway variables   # copy DATABASE_URL into your local .env
pnpm --filter @guardmail/api db:migrate
pnpm --filter @guardmail/api db:seed
```

```bash
# Option B — run inside the deployed container via Railway shell
railway shell    # attaches to the `api` service
node dist/db/migrate.js && node dist/db/seed.js
```

The seed script creates a demo user:

- **Username:** `demo`
- **Password:** `demo-password-123`
- **Custom email:** `demo@mydomain.com`

> ⚠️ Change or delete the demo user in production.

---

## 9. Configure DNS for your email domain

Guardmail now ships its own **inbound SMTP server** (`packages/smtp-server`), listening on port 25 (configurable via `SMTP_PORT`). To receive mail at `<username>@mydomain.com`:

1. Generate a **public TCP domain** for the `smtp-server` service in Railway (Settings → Networking → Generate Domain; ensure it's the TCP/raw port, not an HTTP domain).
2. Point your domain's MX record at that TCP hostname.

Minimal DNS records for `mydomain.com`:

| Type | Name | Value |
|------|------|-------|
| MX | `@` | `<smtp-server-public-tcp-host>` (priority 10) |
| TXT (SPF) | `@` | `v=spf1 mx ~all` |
| TXT (DKIM) | `default._domainkey` | (generate via OpenDKIM/opendkim — optional but recommended for deliverability) |

> **Flow:** external MTA → MX → `smtp-server` (port 25) → parses with `mailparser` → POST `api` `/api/inbound` (validated by `INTERNAL_API_KEY`) → resolves recipient via `findByCustomEmail` → creates `Email` row → enqueued in Redis → `email-processor` worker runs LLM Guard + ClamAV + spam filter → routes to inbox/spam/quarantine.
>
> **Outbound delivery is still local-only:** `POST /api/emails/send` stores the message and scans it, but does not transmit to external recipients over SMTP. To physically deliver outbound mail, wire a relay (Resend/SES/Postmark) via `nodemailer` — that is not part of this build.

---

## 10. Smoke test the deployment

```bash
# Health check (should return {"success":true,"data":{"status":"ok",...}})
curl https://<api-public-domain>/api/health

# Register a user
curl -X POST https://<api-public-domain>/api/auth/register \
  -H 'content-type: application/json' \
  -d '{"username":"alice","email":"alice@personal.com","password":"supersecret"}'

# Login
curl -X POST https://<api-public-domain>/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"username":"alice","password":"supersecret"}'
# → { "success": true, "data": { "token": "..." } }

# List inbox (use the returned token)
curl https://<api-public-domain>/api/emails/inbox \
  -H 'authorization: Bearer <token>'
```

Open the **web** public domain in a browser and log in with the seeded/demo account.

Test the MCP server (HTTP transport):

```bash
curl -X POST https://<mcp-public-domain>/mcp \
  -H 'content-type: application/json' \
  -H 'x-api-key: <MCP_API_KEY>' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Test inbound SMTP end-to-end (against your deployed `smtp-server` TCP host):

```bash
# Send a raw email via SMTP to a registered custom address
(
  printf 'EHLO test\r\n'; \
  printf 'MAIL FROM:<sender@example.com>\r\n'; \
  printf 'RCPT TO:<demo@mydomain.com>\r\n'; \
  printf 'DATA\r\n'; \
  printf 'Subject: Hello from SMTP\r\n'; \
  printf '\r\n'; \
  printf 'This is a test message.\r\n'; \
  printf '.\r\n'; \
  printf 'QUIT\r\n'
) | nc <smtp-server-public-tcp-host> 25

# Then check the inbox via the API (or web UI)
curl https://<api-public-domain>/api/emails/inbox \
  -H 'authorization: Bearer <token>'
```

> If your local network blocks outbound port 25, set `SMTP_PORT=2525` on the `smtp-server` service and connect to that port instead.

---

## 11. Set up health checks & alerts

- `api` health check path: `/api/health` (already in `railway.json`)
- Enable **Railway alerts** (project → Settings → Alerts) for deployment failures and high resource usage
- Optionally wire a log drain to an external service (Logtail, Datadog) for the structured logs emitted by `api` and `mcp-server`

---

## 12. Production hardening checklist

- [ ] `JWT_SECRET` and `MCP_API_KEY` set to strong random values (≥ 32 chars)
- [ ] `CORS_ORIGINS` restricted to your actual frontend domain(s)
- [ ] Demo user deleted or password changed
- [ ] `EMAIL_DOMAIN` set to your real domain
- [ ] SMTP ingress configured (so `*@mydomain.com` actually delivers)
- [ ] ClamAV has enough memory (≥ 1 GB recommended for fresh signature DB load)
- [ ] LLM Guard GPU not required (CPU-only scanners used) — confirm it starts within the health-check grace period (~40s)
- [ ] Backups enabled on the PostgreSQL add-on
- [ ] Rate-limit env vars tuned to your traffic (`RATE_LIMIT_MAX_REQUESTS`)

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `api` crash loops | `DATABASE_URL` not set / Postgres still starting | Wait for Postgres healthy, verify reference variable |
| `502` from web UI | `VITE_API_URL` wrong or `api` not public | Confirm `api` has a generated domain and `VITE_API_URL` matches |
| LLM Guard unhealthy | Slow model load on first boot | Increase `start-period` / Railway health check grace; first request may take 30–60s |
| ClamAV `connection refused` | Signature DB still downloading | First boot downloads fresh signatures (~1–2 min); give it time |
| MCP `401 Unauthorized` | Wrong `MCP_API_KEY` header | Confirm the key matches the `mcp-server` variable |
| `relation does not exist` | Migrations not run | Run step 8 (`db:migrate`) |

---

## Quick reference: one-shot deploy via `railway.json`

Because `railway.json` is already committed, the fastest path is:

```bash
railway init --name guardmail
railway add --service postgres      # provision add-on
railway add --service redis        # provision add-on
railway up                          # reads railway.json, creates all 5 services
# then provision public domains (step 6) and run migrations (step 8)
```

Reference variables (`${{Postgres.DATABASE_URL}}` etc.) are resolved automatically from the add-on service names.