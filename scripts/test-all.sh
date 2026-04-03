#!/usr/bin/env bash
# Run all ampersend + OpenShell/NemoClaw integration tests.
# - Policy YAML validation (no credentials)
# - Blueprint dry-run (no credentials needed)
# - Plugin status (needs ampersend CLI configured)

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "=============================================="
echo "  ampersend × OpenShell / NemoClaw — test suite"
echo "=============================================="
echo ""

# 1) Policy (always run)
echo "1/3 OpenShell policy"
bash "$SCRIPT_DIR/test-openshell-policy.sh"
echo ""

# 2) Blueprint (always runs — no credentials needed for ampersend blueprint)
echo "2/3 NemoClaw blueprint (resolve + plan, --skip-apply)"
bash "$SCRIPT_DIR/test-blueprint.sh" || exit 1
echo ""

# 3) Plugin (needs ampersend CLI)
echo "3/3 OpenClaw plugin (status)"
if command -v ampersend &>/dev/null; then
  node "$SCRIPT_DIR/test-plugin-runner.mjs" status || exit 1
else
  echo "  SKIP — ampersend CLI not installed (npm install -g @ampersend_ai/ampersend-sdk@0.0.16)"
fi

echo ""
echo "=============================================="
echo "  Tests complete. See scripts/README-TESTING.md for full flow."
echo "=============================================="
