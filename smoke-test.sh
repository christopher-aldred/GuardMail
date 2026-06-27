#!/usr/bin/env bash
#
# Guardmail Railway Deployment Smoke Tests
# Verifies that all deployed services are healthy and functional.
#
set -euo pipefail

API_URL="https://api-production-af48.up.railway.app"
WEB_URL="https://aiguard.email"
# MCP custom domain (mcp.aiguard.email) — requires DNS CNAME + TXT records
# in Namecheap. Falls back to Railway URL if custom domain is not yet verified.
# To check status: railway domain status f1cb69e8-b5eb-49f5-9617-5b5b9882c79c -s mcp-server
MCP_URL="https://mcp.aiguard.email"
MCP_URL_FALLBACK="https://mcp-server-production-4a61.up.railway.app"

# Database public URL for password reset token injection.
# If psql is not available or DB is unreachable, password reset
# smoke tests are skipped with a warning.
DB_PUBLIC_URL="postgresql://postgres:dlsohhqGsImPTiEjTSLPfMbDeOsEOTqO@reseau.proxy.rlwy.net:29523/railway"

PASS=0
FAIL=0
TOTAL=0

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

assert() {
  local name="$1"
  local condition="$2"
  TOTAL=$((TOTAL + 1))
  if eval "$condition"; then
    echo -e "  ${GREEN}✓${NC} $name"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}✗${NC} $name"
    FAIL=$((FAIL + 1))
  fi
}

assert_eq() {
  local name="$1"
  local actual="$2"
  local expected="$3"
  TOTAL=$((TOTAL + 1))
  if [ "$actual" = "$expected" ]; then
    echo -e "  ${GREEN}✓${NC} $name"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}✗${NC} $name (expected: '$expected', got: '$actual')"
    FAIL=$((FAIL + 1))
  fi
}

assert_contains() {
  local name="$1"
  local haystack="$2"
  local needle="$3"
  TOTAL=$((TOTAL + 1))
  if echo "$haystack" | grep -q "$needle"; then
    echo -e "  ${GREEN}✓${NC} $name"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}✗${NC} $name (missing: '$needle')"
    FAIL=$((FAIL + 1))
  fi
}

# Helper: extract a JSON field using python3
json_get() {
  local json="$1"
  local field="$2"
  echo "$json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('$field','') if d.get('success') else d.get('error',{}).get('message',''))" 2>/dev/null || echo ""
}

json_get_nested() {
  local json="$1"
  local path="$2"
  echo "$json" | python3 -c "
import sys,json
d=json.load(sys.stdin)
obj=d.get('data',{})
for p in '$path'.split('.'):
    obj=obj.get(p,'') if isinstance(obj,dict) else ''
print(obj)
" 2>/dev/null || echo ""
}

json_success() {
  echo "$1" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('success',False))" 2>/dev/null || echo "False"
}

echo ""
echo -e "${YELLOW}═══════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}  Guardmail Railway Deployment Smoke Tests${NC}"
echo -e "${YELLOW}═══════════════════════════════════════════════════════${NC}"
echo ""

# ─── 1. API Health Check ───────────────────────────────────
echo -e "${YELLOW}1. API Health Check${NC}"
HEALTH_RESPONSE=$(curl -s "$API_URL/api/health")
HEALTH_STATUS=$(echo "$HEALTH_RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('status',''))" 2>/dev/null || echo "")
assert_eq "GET /api/health returns status=ok" "$HEALTH_STATUS" "ok"
assert_contains "Health response includes llmGuard status" "$HEALTH_RESPONSE" "llmGuard"
echo ""

# ─── 2. Web UI ─────────────────────────────────────────────
echo -e "${YELLOW}2. Web UI${NC}"
WEB_HTML=$(curl -s "$WEB_URL/")
WEB_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$WEB_URL/")
assert_eq "Web returns HTTP 200" "$WEB_STATUS" "200"
assert_contains "HTML has CSS link tag" "$WEB_HTML" 'stylesheet'
assert_contains "HTML has correct API URL" "$WEB_HTML" 'api-production-af48.up.railway.app'
assert_contains "HTML has root div" "$WEB_HTML" 'id="root"'
echo ""

# ─── 3. Account Sign-Up ─────────────────────────────────────
echo -e "${YELLOW}3. Account Sign-Up${NC}"
RAND_USER="smoketest_$(date +%s)"
REG_RESPONSE=$(curl -s -X POST "$API_URL/api/auth/register" \
  -H 'content-type: application/json' \
  -d "{\"username\":\"$RAND_USER\",\"email\":\"$RAND_USER@test.com\",\"password\":\"testpass123\"}")
REG_SUCCESS=$(json_success "$REG_RESPONSE")
assert_eq "Register returns success=true" "$REG_SUCCESS" "True"
REG_TOKEN=$(json_get "$REG_RESPONSE" "token")
assert "Register returns a JWT token" "[ -n '$REG_TOKEN' ]"
REG_CUSTOM_EMAIL=$(json_get "$REG_RESPONSE" "customEmail")
assert_contains "Custom email uses aiguard.email" "$REG_CUSTOM_EMAIL" "aiguard.email"
REG_USER_ID=$(json_get_nested "$REG_RESPONSE" "user.id")
assert "Register returns user id" "[ -n '$REG_USER_ID' ]"

# Registration with invalid email should fail
BAD_EMAIL_REG=$(curl -s -X POST "$API_URL/api/auth/register" \
  -H 'content-type: application/json' \
  -d '{"username":"bad_email_user","email":"not-an-email","password":"testpass123"}')
BAD_EMAIL_SUCCESS=$(json_success "$BAD_EMAIL_REG")
assert_eq "Register with invalid email is rejected" "$BAD_EMAIL_SUCCESS" "False"

# Registration with short password should fail
SHORT_PW_REG=$(curl -s -X POST "$API_URL/api/auth/register" \
  -H 'content-type: application/json' \
  -d "{\"username\":\"${RAND_USER}_short\",\"email\":\"short@test.com\",\"password\":\"short\"}")
SHORT_PW_SUCCESS=$(json_success "$SHORT_PW_REG")
assert_eq "Register with short password is rejected" "$SHORT_PW_SUCCESS" "False"
echo ""

# ─── 4. User Login ─────────────────────────────────────────
echo -e "${YELLOW}4. User Login${NC}"
LOGIN_RESPONSE=$(curl -s -X POST "$API_URL/api/auth/login" \
  -H 'content-type: application/json' \
  -d "{\"username\":\"$RAND_USER\",\"password\":\"testpass123\"}")
LOGIN_SUCCESS=$(json_success "$LOGIN_RESPONSE")
assert_eq "Login returns success=true" "$LOGIN_SUCCESS" "True"
LOGIN_TOKEN=$(json_get "$LOGIN_RESPONSE" "token")
assert "Login returns a JWT token" "[ -n '$LOGIN_TOKEN' ]"

# Login with custom email instead of username
EMAIL_LOGIN_RESPONSE=$(curl -s -X POST "$API_URL/api/auth/login" \
  -H 'content-type: application/json' \
  -d "{\"username\":\"$REG_CUSTOM_EMAIL\",\"password\":\"testpass123\"}")
EMAIL_LOGIN_SUCCESS=$(json_success "$EMAIL_LOGIN_RESPONSE")
assert_eq "Login with custom email works" "$EMAIL_LOGIN_SUCCESS" "True"

# Login with the registration email (not the custom email) — regression
# test: login must match the registration email field, otherwise a user
# who resets their password via their registration email can never log
# back in with that same email.
REG_EMAIL_LOGIN_RESPONSE=$(curl -s -X POST "$API_URL/api/auth/login" \
  -H 'content-type: application/json' \
  -d "{\"username\":\"$RAND_USER@test.com\",\"password\":\"testpass123\"}")
REG_EMAIL_LOGIN_SUCCESS=$(json_success "$REG_EMAIL_LOGIN_RESPONSE")
assert_eq "Login with registration email works" "$REG_EMAIL_LOGIN_SUCCESS" "True"
echo ""

# ─── 5. Authenticated API Calls ────────────────────────────
echo -e "${YELLOW}5. Authenticated API Calls${NC}"
INBOX_RESPONSE=$(curl -s "$API_URL/api/emails/inbox" \
  -H "authorization: Bearer $LOGIN_TOKEN")
INBOX_SUCCESS=$(json_success "$INBOX_RESPONSE")
assert_eq "GET /api/emails/inbox returns success" "$INBOX_SUCCESS" "True"

SETTINGS_RESPONSE=$(curl -s "$API_URL/api/settings/spam" \
  -H "authorization: Bearer $LOGIN_TOKEN")
SETTINGS_SUCCESS=$(json_success "$SETTINGS_RESPONSE")
assert_eq "GET /api/settings returns success" "$SETTINGS_SUCCESS" "True"

# Get API key for MCP test
API_KEY_RESPONSE=$(curl -s "$API_URL/api/settings/api-key" \
  -H "authorization: Bearer $LOGIN_TOKEN")
USER_API_KEY=$(json_get "$API_KEY_RESPONSE" "apiKey")
assert "Settings returns API key" "[ -n '$USER_API_KEY' ]"
echo ""

# ─── 6. Send Email ─────────────────────────────────────────
echo -e "${YELLOW}6. Send Email${NC}"
SEND_RESPONSE=$(curl -s -X POST "$API_URL/api/emails/send" \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $LOGIN_TOKEN" \
  -d '{"to":["onboarding@aiguard.email"],"subject":"Smoke test email","body":"This is a test from Guardmail smoke tests."}')
SEND_SUCCESS=$(json_success "$SEND_RESPONSE")
assert_eq "POST /api/emails/send returns success" "$SEND_SUCCESS" "True"
SEND_STATUS=$(json_get "$SEND_RESPONSE" "status")
assert_eq "Sent email has status=pending" "$SEND_STATUS" "pending"
echo ""

# ─── 7. Auth Failure ───────────────────────────────────────
echo -e "${YELLOW}7. Auth Failure${NC}"
NOAUTH_RESPONSE=$(curl -s "$API_URL/api/emails/inbox")
NOAUTH_STATUS=$(json_success "$NOAUTH_RESPONSE")
assert_eq "Inbox without token is rejected" "$NOAUTH_STATUS" "False"

WRONG_LOGIN=$(curl -s -X POST "$API_URL/api/auth/login" \
  -H 'content-type: application/json' \
  -d "{\"username\":\"$RAND_USER\",\"password\":\"wrongpassword\"}")
WRONG_SUCCESS=$(json_success "$WRONG_LOGIN")
assert_eq "Login with wrong password fails" "$WRONG_SUCCESS" "False"
echo ""

# ─── 8. MCP Server (Standard MCP Access) ───────────────────
echo -e "${YELLOW}8. MCP Server (Standard MCP Access)${NC}"
# Use custom domain if it resolves, otherwise fall back to Railway URL
if curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 "$MCP_URL/health" | grep -qE '^(200|401|406)$'; then
  echo -e "  Using custom domain: $MCP_URL"
else
  echo -e "  ${YELLOW}⚠${NC} Custom domain $MCP_URL not responding, falling back to $MCP_URL_FALLBACK"
  MCP_URL="$MCP_URL_FALLBACK"
fi

MCP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$MCP_URL/mcp" -X POST \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}')
assert "MCP server responds to POST /mcp (not 502/503)" "[ '$MCP_STATUS' != '502' ] && [ '$MCP_STATUS' != '503' ]"

MCP_UNAUTH=$(curl -s -o /dev/null -w "%{http_code}" "$MCP_URL/mcp" -X POST \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}')
assert "MCP server requires auth (returns 401)" "[ '$MCP_UNAUTH' = '401' ]"

# Test with x-api-key header (non-standard but supported via middleware)
MCP_APIKEY_HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$MCP_URL/mcp" -X POST \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -H "x-api-key: $USER_API_KEY" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}')
assert_eq "MCP tools/list with x-api-key header returns 200" "$MCP_APIKEY_HTTP" "200"

# Test with standard Authorization: Bearer header
MCP_BEARER_HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$MCP_URL/mcp" -X POST \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -H "authorization: Bearer $USER_API_KEY" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}')
assert_eq "MCP tools/list with Bearer token returns 200" "$MCP_BEARER_HTTP" "200"

# Verify tools/list returns expected tools
MCP_TOOLS_RESPONSE=$(curl -s "$MCP_URL/mcp" -X POST \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -H "x-api-key: $USER_API_KEY" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}')
assert_contains "MCP tools/list includes send_email" "$MCP_TOOLS_RESPONSE" "send_email"
assert_contains "MCP tools/list includes list_inbox" "$MCP_TOOLS_RESPONSE" "list_inbox"

# Test an actual tool call (list_inbox)
MCP_CALL_RESPONSE=$(curl -s "$MCP_URL/mcp" -X POST \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -H "x-api-key: $USER_API_KEY" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"list_inbox","arguments":{}}}')
assert_contains "MCP tools/call list_inbox returns success" "$MCP_CALL_RESPONSE" 'success'
assert_contains "MCP tools/call list_inbox returns result" "$MCP_CALL_RESPONSE" "result"

# MCP verify-key endpoint check
VERIFY_KEY_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/api/auth/verify-key" \
  -H "x-api-key: $USER_API_KEY")
assert_eq "API /api/auth/verify-key with valid key returns 200" "$VERIFY_KEY_RESPONSE" "200"

VERIFY_KEY_BAD=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/api/auth/verify-key" \
  -H "x-api-key: invalid-key-12345")
assert_eq "API /api/auth/verify-key with invalid key returns 401" "$VERIFY_KEY_BAD" "401"
echo ""

# ─── 9. Duplicate Registration Prevention ──────────────────
echo -e "${YELLOW}9. Duplicate Registration Prevention${NC}"
DUP_RESPONSE=$(curl -s -X POST "$API_URL/api/auth/register" \
  -H 'content-type: application/json' \
  -d "{\"username\":\"$RAND_USER\",\"email\":\"$RAND_USER@test.com\",\"password\":\"testpass123\"}")
DUP_SUCCESS=$(json_success "$DUP_RESPONSE")
assert_eq "Duplicate registration is rejected" "$DUP_SUCCESS" "False"
echo ""

# ─── 10. Password Reset Flow ───────────────────────────────
echo -e "${YELLOW}10. Password Reset Flow${NC}"

# Check if psql is available for token injection
PSQL_BIN=""
if command -v psql &>/dev/null; then
  PSQL_BIN="psql"
elif [ -x "/usr/local/opt/libpq/bin/psql" ]; then
  PSQL_BIN="/usr/local/opt/libpq/bin/psql"
fi

if [ -z "$PSQL_BIN" ] || [ -z "$REG_USER_ID" ]; then
  echo -e "  ${YELLOW}⚠${NC} Password reset flow test skipped (psql not available or no user ID)"
  echo -e "  ${YELLOW}⚠${NC} Install libpq: brew install libpq"
else
  # Generate a known reset token and its SHA-256 hash
  RESET_TOKEN="smoketest_reset_$(date +%s)"
  RESET_HASH=$(echo -n "$RESET_TOKEN" | sha256sum | awk '{print $1}')

  # Insert the token hash into the database for our test user
  PSQL_RESULT=$($PSQL_BIN "$DB_PUBLIC_URL" -t -A -c \
    "INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, used_at) SELECT gen_random_uuid(), '$REG_USER_ID', '$RESET_HASH', NOW() + interval '1 hour', NULL RETURNING id;" 2>&1)

  if echo "$PSQL_RESULT" | grep -q "uuid\|[0-9a-f]"; then
    assert "Reset token inserted into database" "[ -n '$PSQL_RESULT' ]"

    # Call reset-password with the known token
    RESET_RESPONSE=$(curl -s -X POST "$API_URL/api/auth/reset-password" \
      -H 'content-type: application/json' \
      -d "{\"token\":\"$RESET_TOKEN\",\"password\":\"newpass456\"}")
    RESET_SUCCESS=$(json_success "$RESET_RESPONSE")
    assert_eq "Reset password returns success" "$RESET_SUCCESS" "True"

    # Verify old password no longer works
    OLD_LOGIN=$(curl -s -X POST "$API_URL/api/auth/login" \
      -H 'content-type: application/json' \
      -d "{\"username\":\"$RAND_USER\",\"password\":\"testpass123\"}")
    OLD_LOGIN_SUCCESS=$(json_success "$OLD_LOGIN")
    assert_eq "Old password is rejected after reset" "$OLD_LOGIN_SUCCESS" "False"

    # Verify new password works
    NEW_LOGIN=$(curl -s -X POST "$API_URL/api/auth/login" \
      -H 'content-type: application/json' \
      -d "{\"username\":\"$RAND_USER\",\"password\":\"newpass456\"}")
    NEW_LOGIN_SUCCESS=$(json_success "$NEW_LOGIN")
    assert_eq "New password works after reset" "$NEW_LOGIN_SUCCESS" "True"

    # Verify old JWT is invalidated (the registration token should no longer work)
    OLD_JWT_RESPONSE=$(curl -s "$API_URL/api/emails/inbox" \
      -H "authorization: Bearer $REG_TOKEN")
    OLD_JWT_SUCCESS=$(json_success "$OLD_JWT_RESPONSE")
    assert_eq "Old JWT is invalidated after password reset" "$OLD_JWT_SUCCESS" "False"

    # Verify the reset token can't be reused
    REUSE_RESPONSE=$(curl -s -X POST "$API_URL/api/auth/reset-password" \
      -H 'content-type: application/json' \
      -d "{\"token\":\"$RESET_TOKEN\",\"password\":\"another789\"}")
    REUSE_SUCCESS=$(json_success "$REUSE_RESPONSE")
    assert_eq "Used reset token cannot be reused" "$REUSE_SUCCESS" "False"
  else
    echo -e "  ${YELLOW}⚠${NC} Could not insert reset token into DB: $PSQL_RESULT"
    echo -e "  ${YELLOW}⚠${NC} Password reset flow test skipped"
  fi
fi
echo ""

# ─── 11. Forgot Password Endpoint ──────────────────────────
echo -e "${YELLOW}11. Forgot Password Endpoint${NC}"
FORGOT_RESPONSE=$(curl -s -X POST "$API_URL/api/auth/forgot-password" \
  -H 'content-type: application/json' \
  -d "{\"email\":\"$RAND_USER@test.com\"}")
FORGOT_SUCCESS=$(json_success "$FORGOT_RESPONSE")
assert_eq "Forgot password returns success" "$FORGOT_SUCCESS" "True"
FORGOT_MSG=$(json_get "$FORGOT_RESPONSE" "message")
assert_contains "Forgot password returns generic message" "$FORGOT_MSG" "reset link"

# Forgot password for non-existent email should still return success (no enumeration)
FAKE_FORGOT=$(curl -s -X POST "$API_URL/api/auth/forgot-password" \
  -H 'content-type: application/json' \
  -d '{"email":"nonexistent@test.com"}')
FAKE_FORGOT_SUCCESS=$(json_success "$FAKE_FORGOT")
assert_eq "Forgot password for unknown email returns success" "$FAKE_FORGOT_SUCCESS" "True"
echo ""

# ─── Summary ───────────────────────────────────────────────
echo -e "${YELLOW}═══════════════════════════════════════════════════════${NC}"
echo -e "  Results: ${GREEN}$PASS passed${NC}, ${RED}$FAIL failed${NC}, $TOTAL total"
echo -e "${YELLOW}═══════════════════════════════════════════════════════${NC}"
echo ""

if [ "$FAIL" -gt 0 ]; then
  exit 1
else
  exit 0
fi