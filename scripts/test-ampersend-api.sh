#!/usr/bin/env bash
# Test Ampersend service: CLI config status and API reachability.
# Requires: ampersend CLI installed (npm install -g @ampersend_ai/ampersend-sdk@0.0.16)

set -e
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_URL="${AMPERSEND_API_URL:-https://api.ampersend.ai}"

if ! command -v ampersend &>/dev/null; then
  echo "  SKIP - ampersend CLI not installed"
  echo "  Install: npm install -g @ampersend_ai/ampersend-sdk@0.0.16"
  exit 0
fi

echo "  Testing Ampersend at $API_URL"
echo ""

# 1) Config status
CONFIG_OUTPUT=$(ampersend config status 2>/dev/null) || true
if echo "$CONFIG_OUTPUT" | grep -q '"ok".*true'; then
  echo "  ✓ Ampersend config OK"
  STATUS=$(echo "$CONFIG_OUTPUT" | sed -n 's/.*"status"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)
  echo "    Status: ${STATUS:-unknown}"
else
  echo "  ⚠ Ampersend not configured (run: ampersend setup start --name <agent-name>)"
fi

# 2) API reachability
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/api/health" 2>/dev/null) || HTTP_CODE="000"
if [[ "$HTTP_CODE" -ge 200 && "$HTTP_CODE" -lt 500 ]]; then
  echo "  ✓ Ampersend API reachable (HTTP $HTTP_CODE)"
else
  echo "  ✗ Ampersend API unreachable (HTTP $HTTP_CODE)"
fi

echo ""
echo "  Ampersend API test complete."
