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

## 4. Add the application services

Guardmail uses **Resend** for both inbound (webhooks) and outbound (API) mail, so **no SMTP server service is deployed to Railway**. The `packages/smtp-server` package remains in the repo for local Docker Compose testing only; in production, Resend receives mail on your MX and POSTs to the `/api/webhooks/resend` endpoint.

For each service below, in the dashboard:

**New → Deploy from GitHub repo → select your Guardmail repo → Configure → set Root Directory to the path shown → Generate**

Repeat for each row:

| Service | Root directory | Dockerfile | Start command |
|---------|----------------|------------|--------------|
| `api` | `packages/api` | `packages/api/Dockerfile` | `node dist/index.js` |
| `mcp-server` | `packages/mcp-server` | `packages/mcp-server/Dockerfile` | `node dist/index.js` |
| `web` | `packages/web` | `packages/web/Dockerfile` | (nginx serves built static files) |
| `llm-guard` | `docker/llm-guard` | `docker/llm-guard/Dockerfile` | (uvicorn in image) |
| `clamav` | (no repo) | — | Image: `clamav/clamav:stable` |

> **ClamAV** is added via **New → Docker Image → Raw** and entering `clamav/clamav:stable`.

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
| `SMTP_PASS` | Resend API key (`re_...`) — used for outbound delivery + fetching inbound bodies |
| `SMTP_FROM` | `Guardmail <noreply@mydomain.com>` — verified Resend sender address |
| `RESEND_API_KEY` | Same Resend API key (optional; falls back to `SMTP_PASS`) |
| `RESEND_WEBHOOK_SECRET` | Svix signing secret from Resend dashboard → Webhooks (verifies inbound payloads) |
| `PUBLIC_API_URL` | `https://<api-public-domain>` — base URL for MCP signed attachment download URLs |
| `ATTACHMENT_URL_SECRET` | (generate a strong random string) — signs short-lived download URLs (falls back to `JWT_SECRET`) |
| `ATTACHMENT_URL_TTL_SECONDS` | `300` — lifetime of signed attachment download URLs |

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

---

## 6. Generate public domains

For each service that needs an externally reachable URL, go to the service → **Settings → Networking → Generate Domain**:

| Service | Needs public domain? | Why |
|---------|---------------------|-----|
| `api` | ✅ | Web UI, external clients, Resend webhook, and signed attachment download URLs |
| `mcp-server` | ✅ | LLM agents connect over HTTP/SSE |
| `web` | ✅ | Browser access |
| `llm-guard` | ❌ | Only called by `api` internally |
| `clamav` | ❌ | Only called by `api` internally |

> No `smtp-server` service is deployed — inbound mail arrives via the Resend webhook hitting the `api` public domain's `/api/webhooks/resend` endpoint.

After generating, update the dependent variables:

- `web` → `VITE_API_URL` = the `api` public domain (e.g. `https://guardmail-api-production.up.railway.app`)
- `api` → `CORS_ORIGINS` = the `web` public domain
- `api` → `PUBLIC_API_URL` = the `api` public domain (used to build signed attachment download URLs)
- `mcp-server` → `API_URL` stays internal (`http://api.railway.internal:3000`)

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

## 9. Configure Resend for inbound + outbound email

Guardmail uses **Resend** for both directions — no SMTP server runs in Railway.

### 9.1 Verify your domain with Resend

In the Resend dashboard → **Domains → Add Domain** (`mydomain.com`) and publish the DNS records Resend gives you (SPF, DKIM, DMARC). Wait for Resend to report the domain as `verified`.

### 9.2 Set up the inbound webhook

1. In Resend → **Webhooks → Create Webhook**.
2. Endpoint URL: `https://<api-public-domain>/api/webhooks/resend`.
3. Subscribe to the `email.received` event.
4. Copy the **Signing Secret** (starts `whsec_…`) into the `api` service's `RESEND_WEBHOOK_SECRET` variable.

### 9.3 Point your MX record at Resend

Resend gives you the MX target to publish once your domain is verified.

Minimal DNS records for `mydomain.com`:

| Type | Name | Value |
|------|------|-------|
| MX | `@` | Resend's inbound MX target (priority 10) |
| TXT (SPF) | `@` | (as provided by Resend) |
| TXT (DKIM) | `default._domainkey` | (as provided by Resend) |

> **Inbound flow:** external MTA → MX → Resend → POST `/api/webhooks/resend` (Svix signature verified with `RESEND_WEBHOOK_SECRET`) → `api` fetches the full body + attachments from the Resend API → resolves recipient via `findByCustomEmail` → creates `Email` row (status `scanning`) → enqueued in Redis → `email-processor` worker runs LLM Guard + ClamAV + spam filter → routes to inbox/spam/quarantine.
>
> **Outbound flow:** `POST /api/emails/send` stores + scans the message; the `email-processor` worker delivers clean emails via the Resend API (`SMTP_PASS` = Resend API key, `SMTP_FROM` = verified sender).

### 9.4 (Optional) Local SMTP testing

The `packages/smtp-server` package is kept for local Docker Compose ingress testing only. It POSTs parsed messages to `api`'s `/api/inbound` endpoint (validated by `INTERNAL_API_KEY`). It is **not** deployed to Railway in the Resend-only topology.

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

Test inbound email end-to-end (via Resend — send a real email to a registered custom address from any external mailbox):

```bash
# From your personal mailbox, send a message to demo@mydomain.com.
# Resend receives it, fires the webhook, and the email-processor routes it.

# Then check the inbox via the API (or web UI)
curl https://<api-public-domain>/api/emails/inbox \
  -H 'authorization: Bearer <token>'
```

MCP attachment download (signed URL):

```bash
# 1. List tools and call get_attachment_url with an attachment id from an email.
curl -X POST https://<mcp-public-domain>/mcp \
  -H 'content-type: application/json' \
  -H 'x-api-key: <MCP_API_KEY>' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_attachment_url","arguments":{"attachmentId":"<uuid>"}}}'
# → { ... "data": { "url": "https://<api-public-domain>/api/attachments/<uuid>/download?exp=...&sig=...", "expiresAt": "..." } }

# 2. Fetch the bytes with a plain GET (no auth header needed):
curl -OJL "<url from step 1>"
```

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
- [ ] Resend domain verified + MX record pointed at Resend (so `*@mydomain.com` delivers)
- [ ] `RESEND_WEBHOOK_SECRET` set; Resend webhook → `/api/webhooks/resend` firing
- [ ] `PUBLIC_API_URL` set to the `api` public domain (for signed attachment URLs)
- [ ] `ATTACHMENT_URL_SECRET` set (or relying on the `JWT_SECRET` fallback)
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