# Guardmail - Implementation Tasks

## Prerequisites

- Node.js 20+ and npm/yarn/pnpm installed
- Docker Desktop installed (for LLM Guard, ClamAV, PostgreSQL, Redis)
- Railway CLI installed (for deployment)

## Task List

### 1. Initialize Mono Repo Structure

- [x] 1.1 Create root workspace with npm workspaces configuration
  - Create root `package.json` with workspaces pointing to `packages/*`
  - Create `tsconfig.base.json` with shared TypeScript configuration
  - Create `.env.example` with all required environment variables
  - Create `.gitignore` for Node.js + Docker
  - **Requirements:** 8.1, 8.4

- [x] 1.2 Create shared types package (`packages/shared`)
  - Initialize `packages/shared/package.json`
  - Create `packages/shared/src/index.ts` with all shared TypeScript interfaces:
    - `User`, `Email`, `ScanResult`, `Attachment`, `SpamFilterConfig`, `KeywordRule`
    - `EmailStatus` type
  - Create `packages/shared/tsconfig.json` extending base
  - **Requirements:** 8.1, 8.4

### 2. Set Up Docker Infrastructure

- [x] 2.1 Create LLM Guard Docker service (`docker/llm-guard/`)
  - Create `docker/llm-guard/Dockerfile` based on Python with llm-guard installed
  - Create `docker/llm-guard/app.py` with FastAPI server exposing:
    - `POST /scan/prompt` - Scan email body for prompt injection
    - `POST /scan/attachment` - Scan attachment text content
    - `GET /health` - Health check
  - Configure scanners: PromptInjection, JailbreakDetection, Toxicity, Anonymize
  - Create `docker/llm-guard/requirements.txt`
  - **Requirements:** 2.1, 2.2, 2.3, 2.5, 2.6

- [x] 2.2 Create Docker Compose for local development (`docker/docker-compose.yml`)
  - Define services: api, mcp-server, web, llm-guard, clamav, postgres, redis
  - Configure ports, volumes, environment variables, and dependencies
  - **Requirements:** 7.2, 7.4

### 3. Implement Database Layer

- [x] 3.1 Create database schema and migration system (`packages/api/src/db/`)
  - Set up Drizzle ORM with PostgreSQL driver
  - Create schema definitions for: users, emails, attachments, scan_results, spam_filter_configs
  - Create migration files for initial schema
  - Create seed script with test data
  - **Requirements:** 5.4, 1.1, 1.5

- [x] 3.2 Create database service layer (`packages/api/src/services/db.ts`)
  - Implement user repository (create, find by id, find by username, find by email)
  - Implement email repository (create, find by user, update status, delete)
  - Implement scan result repository (create, find by email)
  - Implement attachment repository (create, find by email)
  - Implement spam filter config repository (create, find by user, update)
  - **Requirements:** 1.1, 1.3, 1.5, 5.4

### 4. Implement API Server (Hono + TypeScript)

- [x] 4.1 Initialize API package (`packages/api/`)
  - Create `packages/api/package.json` with dependencies: hono, drizzle-orm, postgres, bcryptjs, jsonwebtoken, zod
  - Create `packages/api/tsconfig.json`
  - Create `packages/api/src/index.ts` with Hono app bootstrap
  - Create `packages/api/Dockerfile` for Railway deployment
  - **Requirements:** 8.1, 8.2

- [x] 4.2 Implement authentication middleware and routes (`packages/api/src/auth/`)
  - Create JWT middleware for route protection
  - Create auth routes:
    - `POST /api/auth/register` - Register with username, email, password; provision custom email
    - `POST /api/auth/login` - Login, return JWT token
  - Implement password hashing with bcrypt
  - Implement username uniqueness validation
  - Implement email format validation
  - **Requirements:** 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 6.1, 6.2, 7.1, 7.2

- [x] 4.3 Implement email routes (`packages/api/src/emails/`)
  - Create email routes:
    - `GET /api/emails/inbox` - List inbox emails with scan results
    - `GET /api/emails/spam` - List spam-filtered emails
    - `GET /api/emails/quarantine` - List quarantined emails
    - `POST /api/emails/send` - Send email (triggers LLM Guard scan)
    - `GET /api/emails/:id` - Get email details with full scan report
    - `DELETE /api/emails/:id` - Delete email
  - Implement email validation with Zod
  - **Requirements:** 5.1, 5.2, 5.3, 5.6, 6.3, 6.4, 6.5, 6.6, 6.7

- [x] 4.4 Implement spam filter settings routes (`packages/api/src/settings/`)
  - Create settings routes:
    - `GET /api/settings/spam` - Get user's spam filter config
    - `PUT /api/settings/spam` - Update spam filter config
  - Implement validation for spam filter settings
  - **Requirements:** 4.1, 4.2, 4.3, 4.6, 6.8

- [x] 4.5 Implement health check and error handling (`packages/api/src/middleware/`)
  - Create `GET /api/health` endpoint
  - Create global error handler middleware
  - Create rate limiting middleware (using Redis)
  - Create CORS middleware
  - **Requirements:** 6.3, 6.6, 7.5, 8.2, 8.5

### 5. Implement Security Services

- [x] 5.1 Implement LLM Guard client (`packages/api/src/services/llm-guard.ts`)
  - Create HTTP client to call LLM Guard Docker service
  - Implement `scanEmailBody(body: string)` method
  - Implement `scanAttachmentText(text: string)` method
  - Implement retry logic with exponential backoff (3 retries: 1s, 2s, 4s)
  - Implement graceful degradation (return "scan pending" if unavailable)
  - **Requirements:** 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 8.3, 8.4

- [x] 5.2 Implement ClamAV client (`packages/api/src/services/clamav.ts`)
  - Create client using `clamd.js` npm package
  - Implement `scanAttachment(filePath: string)` method
  - Implement file size limit checks
  - Implement timeout handling for large files
  - Implement retry logic (2 retries with 5s delay)
  - Implement graceful degradation (return "scan pending" if unavailable)
  - **Requirements:** 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 8.3, 8.4

- [x] 5.3 Implement spam filter engine (`packages/api/src/services/spam-filter.ts`)
  - Create spam filter with configurable rules:
    - Keyword-based filtering
    - Sender allowlist/blocklist
    - Content type filtering
  - Implement sensitivity levels (low, medium, high, custom)
  - Implement per-user configuration loading from database
  - Implement spam scoring algorithm
  - **Requirements:** 4.1, 4.2, 4.3, 4.4, 4.5, 4.6

### 6. Implement Email Processing Pipeline

- [x] 6.1 Implement email processor (`packages/api/src/services/email-processor.ts`)
  - Create email processing pipeline that:
    1. Receives email from queue
    2. Scans body with LLM Guard
    3. Scans attachments with ClamAV (if present)
    4. Applies spam filter rules
    5. Routes email to inbox, spam, or quarantine based on results
  - Create `ScanResult` records for each scanner
  - Implement email status routing logic
  - **Requirements:** 2.4, 3.3, 4.4, 5.1, 5.2

- [x] 6.2 Implement email queue with Redis (`packages/api/src/services/email-queue.ts`)
  - Create Redis-based email queue for async processing
  - Implement enqueue/dequeue operations
  - Implement queue worker that processes emails sequentially
  - **Requirements:** 5.1, 5.2

### 7. Implement MCP Server

- [x] 7.1 Initialize MCP server package (`packages/mcp-server/`)
  - Create `packages/mcp-server/package.json` with `@modelcontextprotocol/sdk` dependency
  - Create `packages/mcp-server/tsconfig.json`
  - Create `packages/mcp-server/src/index.ts` with MCP server bootstrap
  - Create `packages/mcp-server/Dockerfile`
  - **Requirements:** 4.1, 8.1, 8.2

- [x] 7.2 Implement MCP tools (`packages/mcp-server/src/tools/`)
  - Implement `send_email` tool - sends email via API with security scanning
  - Implement `list_inbox` tool - lists inbox emails with scan results
  - Implement `list_spam` tool - lists spam-filtered emails
  - Implement `list_quarantine` tool - lists quarantined emails
  - Implement `get_email` tool - gets email details with full scan report
  - Implement `register_user` tool - registers a new user
  - Implement `update_spam_settings` tool - updates spam filter config
  - **Requirements:** 4.2, 4.3, 5.1

- [x] 7.3 Implement MCP resources (`packages/mcp-server/src/resources/`)
  - Implement `guardmail://inbox` resource
  - Implement `guardmail://spam` resource
  - Implement `guardmail://quarantine` resource
  - Implement `guardmail://settings/spam` resource
  - **Requirements:** 4.5

- [x] 7.4 Implement MCP authentication (`packages/mcp-server/src/auth/`)
  - Implement API key authentication for MCP server
  - Create auth middleware that validates API keys
  - **Requirements:** 4.4, 6.5

### 8. Implement Web UI

- [x] 8.1 Initialize React web app (`packages/web/`)
  - Create Vite + React + TypeScript project
  - Install and configure Tailwind CSS
  - Set up React Router for navigation
  - Create `packages/web/Dockerfile` for deployment
  - **Requirements:** 6.1, 6.2, 8.1, 8.2

- [x] 8.2 Implement auth pages (`packages/web/src/pages/`)
  - Create Login page with email/password form
  - Create Register page with username, email, password form
  - Implement JWT token storage and auth context
  - **Requirements:** 6.1, 6.2

- [x] 8.3 Implement email views (`packages/web/src/pages/`)
  - Create Inbox page with email list and security badges
  - Create Spam folder page
  - Create Quarantine page
  - Create Email detail page with full scan report
  - Create Compose email page
  - **Requirements:** 6.3, 6.4, 6.5, 6.6, 6.7

- [x] 8.4 Implement settings page (`packages/web/src/pages/`)
  - Create Settings page with spam filter configuration
  - Implement enable/disable toggle
  - Implement sensitivity level selector
  - Implement allowlist/blocklist management
  - **Requirements:** 6.8, 4.1, 4.2, 4.3, 4.6

- [x] 8.5 Implement shared UI components (`packages/web/src/components/`)
  - Create `EmailList` component with security status indicators
  - Create `EmailDetail` component with full scan report
  - Create `SecurityBadge` component (safe/warning/blocked)
  - Create `SpamSettings` configuration form
  - Create `ComposeForm` with attachment support
  - **Requirements:** 6.3, 6.4, 6.5, 6.6, 6.7, 6.8

### 9. Implement Railway Deployment Configuration

- [x] 9.1 Create Railway configuration (`railway.json`)
  - Define services: api, mcp-server, web, llm-guard, clamav
  - Configure PostgreSQL and Redis add-ons
  - Set environment variable mappings
  - **Requirements:** 7.3, 7.4

- [x] 9.2 Create Dockerfiles for each service
  - `packages/api/Dockerfile` - Multi-stage build for Hono API
  - `packages/mcp-server/Dockerfile` - Multi-stage build for MCP server
  - `packages/web/Dockerfile` - Multi-stage build for React SPA (served with nginx)
  - **Requirements:** 7.2, 7.4

### 10. Implement Tests

- [x] 10.1 Write unit tests for shared types (`packages/shared/tests/`)
  - Test type definitions and validation
  - **Requirements:** 10.1, 10.5

- [x] 10.2 Write unit tests for API services (`packages/api/tests/`)
  - Test LLM Guard client with mocked HTTP responses
  - Test ClamAV client with mocked clamd.js
  - Test spam filter engine with various rule configurations
  - Test email processor pipeline
  - **Requirements:** 10.1, 10.5

- [x] 10.3 Write API endpoint tests (`packages/api/tests/`)
  - Test auth routes (register, login, validation)
  - Test email routes (CRUD operations)
  - Test settings routes
  - Test health check endpoint
  - Use Hono's built-in testing utilities
  - **Requirements:** 10.3, 10.5

- [x] 10.4 Write MCP server tests (`packages/mcp-server/tests/`)
  - Test tool definitions match expected schema
  - Test tool execution with mock API responses
  - Test protocol compliance (JSON-RPC 2.0)
  - **Requirements:** 10.4, 10.5

- [ ] 10.5 Write integration tests (`packages/api/tests/integration/`) — directory scaffolded; tests require live Docker services (LLM Guard, ClamAV, Postgres, Redis)
  - Test LLM Guard HTTP API integration (requires Docker)
  - Test ClamAV TCP connection and scanning (requires Docker)
  - Test email processing pipeline end-to-end
  - **Requirements:** 10.2, 10.5

- [x] 10.6 Configure test runner and coverage
  - Set up Jest with ts-jest for all packages
  - Configure coverage thresholds (80%+)
  - Create root `test` script that runs all package tests
  - **Requirements:** 10.5, 10.6

### 11. Tier-Gated Features (Custom Domain + Branding Footer)

- [x] 11.1 Add tier capability flags to shared tier config
  - Add `customDomain` and `hasBrandingFooter` boolean flags to `TierConfig`
  - Set flags per tier (Free: footer on / no domain; Hobby/Pro/Custom: domain / no footer)
  - Add `tierAllowsCustomDomain` / `tierHasBrandingFooter` helpers
  - Add `CustomDomainStatus`, `ResendDomainRecord`, `CustomDomainInfo` shared types
  - **Requirements:** 9.4

- [x] 11.2 Inject branding footer into outbound emails (Free tier only)
  - Add `BRANDING_FOOTER_TEXT` / `BRANDING_FOOTER_HTML` + `applyBrandingFooter` to shared
  - Append footer in the email processor outbound delivery path, AFTER LLM Guard scan
  - Footer only applied for Free tier; paid tiers send unbranded
  - **Requirements:** 7.1, 9.4

- [x] 11.3 Persist custom-domain association in the database
  - Add `custom_domain`, `custom_domain_status`, `custom_domain_resend_id`,
    `custom_domain_records` (jsonb), `custom_domain_verified_at` columns to `users`
  - Add idempotent `ALTER TABLE … ADD COLUMN IF NOT EXISTS` to `ensureSchema`
  - Add repository methods: `setCustomDomain`, `verifyCustomDomain`,
    `updateCustomDomainStatus`, `clearCustomDomain`, `findByCustomDomain`
  - **Requirements:** 1.2, 9.4

- [x] 11.4 Implement Resend `/domains` API client
  - `packages/api/src/services/resend-domains.ts` — create / get / remove domain
  - Reuses `SMTP_PASS` (falls back to `RESEND_API_KEY`); typed `ResendNotConfiguredError`
  - **Requirements:** 7.2, 9.4

- [x] 11.5 Implement custom-domain settings endpoints (hobby + pro + custom only)
  - `GET /api/settings/domain` — current association status
  - `POST /api/settings/domain` — register domain with Resend, return DNS records
  - `POST /api/settings/domain/verify` — poll Resend, switch customEmail once verified
  - `DELETE /api/settings/domain` — remove domain, revert to default address
  - Tier gate (403) for ineligible plans; uniqueness checks for domain + customEmail
  - Add `customDomainSchema` (Zod) domain validation
  - **Requirements:** 4.1, 9.4

- [x] 11.6 Build the web UI for custom domain settings
  - `packages/web/src/components/DomainSettings.tsx` — associate / verify / remove + DNS records table
  - Wire into `SettingsPage`; gate UI by tier (shows upgrade CTA on Free)
  - Add domain API methods to `packages/web/src/api.ts`
  - Mirror new tier feature copy (“Custom domain”, “No branding footer”) in pricing cards
  - **Requirements:** 6.8

- [x] 11.7 Test tier flags, branding footer, and domain validation
  - `packages/shared/tests/branding.test.ts` — tier flags + `applyBrandingFooter`
  - `packages/api/tests/custom-domain.test.ts` — schema validation + auth gates
  - **Requirements:** 10.1, 10.3

### 12. MCP Error Messaging + Quota / Tier Access

- [x] 12.1 Surface structured API errors through the MCP layer (MCP + API error messaging)
  - Add `ApiError` class + `isApiError` helper in `packages/mcp-server/src/api-client.ts`
    carrying `code`, `message`, HTTP `status`, and optional `details`
  - `ApiClient.request` now throws `ApiError` (preserving the API’s `{ code, message, details }`
    envelope + HTTP status) and maps network failures to a `NETWORK` code (status 0)
  - MCP tool `wrap()` returns a structured `ToolError` (`{ code, message, status?, details? }`)
    instead of a flat string: `VALIDATION` for Zod failures, the API code/status for API
    failures, `INTERNAL` for anything else — so an agent can branch on the failure mode
    (401 → fix API key, 429 → quota / back off, 503 → upstream down)
  - Update `envelope()` outputSchema so `error` describes the object shape
  - Update `server-factory.ts` to render `error.message` from the structured object
  - **Requirements:** 10.2, 10.4, 8.5

- [x] 12.2 Expose subscription / quota + tier info via MCP (MCP + API quota access + tier info)
  - Add `ApiClient.getSubscription()` calling `GET /api/settings/subscription`
  - Add `get_quota` MCP tool (read-only, idempotent, no args) returning tier name, monthly/daily
    limits, `sentThisMonth` / `sentToday` usage, verification + unverified-cap status
  - Add `guardmail://subscription` MCP resource mirroring the same data
  - Add `subscriptionOutputSchema` describing the `SubscriptionInfo` payload
  - **Requirements:** 5.5, 9.4