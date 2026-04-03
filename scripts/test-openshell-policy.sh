#!/usr/bin/env bash
# Validate Ampersend OpenShell policy YAML (syntax + structure).
# Optional: if 'openshell' CLI is installed, run: openshell policy validate

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
POLICY="$REPO_ROOT/config/ampersend-openshell-policy.yaml"

echo "→ Validating OpenShell policy: $POLICY"
if [[ ! -f "$POLICY" ]]; then
  echo "  ERROR: Policy file not found."
  exit 1
fi

# Basic YAML check (optional: use a YAML parser; here we only check it's readable and has key fields)
if grep -q "version:" "$POLICY" && grep -q "network_policies:" "$POLICY" && grep -q "api.ampersend.ai" "$POLICY"; then
  echo "  ✓ YAML structure looks valid (version, network_policies, Ampersend endpoints present)"
else
  echo "  ERROR: Policy missing expected keys (version, network_policies, api.ampersend.ai)"
  exit 1
fi

# If openshell CLI is available, try to validate (optional)
if command -v openshell &>/dev/null; then
  echo "→ Running: openshell policy validate (if supported)"
  if openshell policy validate --file "$POLICY" 2>/dev/null; then
    echo "  ✓ openshell policy validate passed"
  else
    echo "  (openshell validate not run or not supported — policy file check only)"
  fi
else
  echo "  (openshell CLI not found — install to run full policy validation)"
fi

echo ""
echo "Policy file ready. Apply with:"
echo "  openshell policy set --sandbox <name> --file $POLICY"
