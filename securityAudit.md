# Guardmail Security Audit — Repo + Railway (production)

Date: 2026-06-25
Environment: production (567b1c58-ddd9-4291-8a33-52c52bd6c08e)
Project: guardmail (6cde0373-294a-42dd-9f9e-c8a446866408)

---

## A. Railway network exposure (most urgent)

| Service | Exposure | Verdict |
|---|---|---|
| api | `api-production-af48.up.railway.app` (HTTP) | ✅ Expected |
| web | `web-production-90e3d.up.railway.app` (HTTP) | ✅ Expected |
| mcp-server | `mcp-server-production-4a61…` **AND** `…-b2fe…` (2 public domains) | ⚠️ Stray duplicate domain |
| smtp-server | TCP proxy port 25 (internet) | ⚠️ Expected for mail, but open relay risk (see B4) |
| **Postgres** | **TCP proxy port 5432 (internet-facing)** | 🔴 **Remove the public TCP proxy** |
| **Redis** | **TCP proxy port 6379 (internet-facing)** | 🔴 **Remove the public TCP proxy** |
| llm-guard | private only | ✅ Correct |
| clamav | private only | ✅ Correct |

**🔴 CRITICAL — Postgres and Redis have public TCP proxies.** Anyone on the internet can reach `*:5432` and `*:6379`. Redis and Postgres are referenced by the api service via private Railway variables (`${{…REDIS_URL}}`, `${{…DATABASE_URL}}`), so the public proxies are completely unnecessary. Remove them from each service's **Settings → Networking → Public TCP proxies**. Until you do, your DB/cache are one password-guess away from the open internet (and Redis historically has had unauth-exposed attack surface). Even with passwords set, this is unacceptable exposure.

**⚠️ MCP server has two public domains.** One is likely a leftover from a previous deploy/replica. Remove the stray `…-b2fe…` domain to reduce surface area.

---

## B. Auth solution — vulnerabilities

### B1. 🔴 JWT signing falls back to a hardcoded secret

`packages/api/src/middleware/auth.ts:10`

```ts
const SECRET = process.env.JWT_SECRET ?? 'dev-jwt-secret-change-in-production';
```

Railway currently sets `JWT_SECRET` (confirmed present), so production is safe *today*. But if the variable is ever unset, the app silently signs tokens with a value committed to a public GitHub repo → **anyone can forge admin JWTs**. The fallback must fail hard in production:

```ts
const SECRET = process.env.JWT_SECRET;
if (!SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET must be set in production');
}
```

### B2. 🔴 Resend webhook accepts `?secret=` query-param bypass

`packages/api/src/webhooks/resend.ts` — when Svix headers are *absent*, the guard falls back to:

```ts
const querySecret = c.req.query('secret');
if (querySecret !== secret) { throw 401 }
```

This ships a **webhook-forgery backdoor** in production: an attacker who knows (or leaks) `RESEND_WEBHOOK_SECRET` can POST arbitrary inbound emails with the secret in the URL — and the secret then lands in Railway proxy/access logs, browser history, and Referer headers. This branch should be gated behind `NODE_ENV !== 'production'` (or removed entirely and tested with a real Svix signature locally).

### B3. 🔴 Rate-limit IP is spoofable via `X-Forwarded-For`

`packages/api/src/middleware/common.ts` — the limiter keys on:

```ts
c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
```

The client controls the leading value of `X-Forwarded-For`, so an attacker rotates a fake IP per request → **unlimited requests, bypassing the 10/s cap** on login/verify-key/register (brute-force / abuse protection defeated). Railway's proxy appends the real client IP; you should trust Railway's rightmost value, or (better) rely on Railway's `x-real-ip` / the trusted proxy suffix. At minimum, take the *last* hop or strip client-supplied XFF. This also undermines the auth brute-force protection.

### B4. ⚠️ Unauthenticated API-key validation oracle

`packages/api/src/auth/routes.ts` — `GET /api/auth/verify-key` is mounted on the *unauthenticated* `authRoutes` (not behind `requireAuthOrApiKey`). It returns `{valid:true/false}` for any `x-api-key`. API keys are UUIDv4 (128 bits) so online brute-force is infeasible, but this is still:

- a public oracle to **confirm/validate a leaked key**, and
- an unauthenticated endpoint enumerated by scanners.

The MCP server is the only legitimate consumer. Consider moving it to a private/internal path or rate-limiting it far more aggressively, and ensure it returns 401 (not 200/`valid:false`) on miss to avoid acting as a key oracle.

### B5. ⚠️ OAuth authorize form submits the API key via GET

`packages/mcp-server/src/auth-provider.ts` — the auth form uses `<form method="GET"><input name="api_key">`. The user's long-lived **API key ends up in the URL**: browser history, server access logs, the `Referer` header sent to the MCP client's `redirectUri`, and Railway proxy logs. Change the form to `method="POST"` (the authorize handler already reads `res.req?.query?.api_key` — switch to reading the POST body). Long-lived bearer credentials must never travel in query strings.

### B6. ⚠️ CORS defaults to `*` with credentials

`packages/api/src/middleware/common.ts` — when `CORS_ORIGINS` is empty, `origin` returns `'*'` and `credentials: true`. Browsers block credentialed wildcard origins (so it's *broken* rather than directly exploitable), but any misconfiguration of `CORS_ORIGINS` silently becomes a permissive CORS policy. Default should be **deny** (return `null`/empty) when unset, and fail closed in production.

### B7. ⚠️ User enumeration on register

`/api/auth/register` returns distinct 409s: `"Username already taken"` vs `"Email already registered"`. This lets an attacker enumerate which usernames/emails exist. Login and forgot-password are correctly generic — register should be too (e.g., a single `"Account already exists"` or always-success-then-email).

### B8. ⚠️ OAuth refresh-token flow is unvalidated

`exchangeRefreshToken` returns `{ access_token: refreshToken }` with **no validation** of the refresh token at all. Not directly exploitable (the resulting access token is still checked by `verifyAccessToken`), but it's a spec violation that masks abuse and should at least validate the token before re-issuing.

### B9. ⚠️ Open dynamic client registration

`clientsStore.registerClient` accepts any client with no authentication. In the API-key-as-token model this is low-impact, but open DCR is a recognized OAuth footgun; consider requiring a pre-shared registration token.

---

## C. Lower-severity / hygiene

- **C1. In-memory OAuth `codes` map** (`auth-provider.ts`) stores the raw API key and never proactively garbage-collects unused expired codes (TTL is only checked on *successful* exchange). Minor memory leak + key-in-memory longer than necessary. Add a periodic sweep.
- **C2. `MCP_API_KEY` env var is set on the mcp-server but never referenced in code** (the MCP server uses OAuth bearer + `x-api-key`→`Authorization` normalisation). Dead secret sitting in config — remove it to avoid confusion/rotation gaps.
- **C3. DB client hardcoded fallback** (`db/client.ts:13`) embeds `postgresql://postgres:guardmail_dev@localhost…`. Dev-only and harmless in prod (Railway sets `DATABASE_URL`), but the dev password is now public in the repo. Acceptable; just be aware the prod Postgres password must differ.
- **C4. Demo seed credentials** (`db/seed.ts`: `demo / demo-password-123`). The seed is a manual `npm run db:seed` script, **not** run on Railway startup (only `ensureSchema` runs). Low risk, but `RAILWAY_DEPLOY.md` checklist item "Demo user deleted or password changed" must be honoured — verify the demo user does **not** exist in the prod Postgres.
- **C5. Bcrypt cost = 10.** Acceptable; 12 is the modern baseline. Minor hardening.
- **C6. `requireAuthOrApiKey` swallows non-HTTPException errors** from `requireAuth`/`requireApiKey` and returns a generic 401, masking real failures (e.g., DB outage during key lookup returns 401 instead of 500). Re-throw non-HTTP exceptions.
- **C7. `/api/settings/api-key` returns the full long-lived API key in plaintext.** Required for the dashboard "view key" feature, but treat as a sensitive secret endpoint — it currently has no extra confirmation and the key is a non-expiring bearer token. Acceptable with awareness.
- **C8. No JWT key rotation / no API-key expiry.** Leaked JWTs are invalidated on password change (good, via `passwordChangedAt`), but API keys never expire and there's no revocation list — only full regeneration. Fine for the model, just note the blast radius.

---

## D. What's done well ✅

- Password reset & email-verification tokens are stored **SHA-256 hashed**, random 32 bytes, single-use, with 1h expiry — correct.
- Forgot-password & resend-verification return **generic success** (no enumeration).
- Login returns **generic "Invalid credentials"** and applies constant-time-style bcrypt comparison.
- JWTs issued before `passwordChangedAt` are **invalidated** — good session control.
- Email routes are **correctly scoped** by `auth.user.id` with explicit 403s — no IDOR.
- MCP (API-key) consumers are **never exposed to unscanned or quarantined prompt-injection content** — strong separation invariant.
- `llm-guard` and `clamav` are correctly kept on the **private Railway network only**.
- Svix signature verification itself is implemented correctly (HMAC-SHA256, base64 key, multi-sig parse).

---

## Priority fix list

1. 🔴 **Remove public TCP proxies on Postgres (5432) and Redis (6379).**
2. 🔴 **Remove the `?secret=` webhook fallback in production** (webhook forgery backdoor).
3. 🔴 **Harden rate-limit IP source** against `X-Forwarded-For` spoofing.
4. 🔴 **Fail hard on missing `JWT_SECRET` in production.**
5. ⚠️ Change the OAuth authorize form to **POST** (keep API key out of URLs/logs).
6. ⚠️ Default CORS to **deny** when `CORS_ORIGINS` is unset.
7. ⚠️ Collapse register's distinct 409s to prevent **user enumeration**.
8. ⚠️ Remove the **stray second MCP public domain**; drop the unused `MCP_API_KEY` var.