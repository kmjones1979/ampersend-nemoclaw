#!/usr/bin/env bash
# Upload the Ampersend OpenClaw plugin bundle to a running sandbox so you can install it
# with: openclaw plugins install /sandbox/ampersend-plugin
#
# Usage: ./scripts/upload-ampersend-plugin-to-sandbox.sh [sandbox-name]
# Default sandbox name: my-assistant

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SANDBOX_NAME="${1:-my-assistant}"
BUNDLE="$REPO_ROOT/config/ampersend-plugin"

if [[ ! -d "$BUNDLE" ]]; then
  echo "Plugin bundle not found: $BUNDLE"
  exit 1
fi

if ! command -v openshell &>/dev/null; then
  echo "openshell CLI not found. Install it (e.g. uv tool install openshell) and ensure the gateway is running."
  exit 1
fi

echo "Uploading Ampersend plugin bundle to sandbox '$SANDBOX_NAME' at /sandbox/ampersend-plugin ..."
openshell sandbox upload "$SANDBOX_NAME" "$BUNDLE" /sandbox/ampersend-plugin

echo ""
echo "Done. Connect to the sandbox and install the plugin:"
echo "  openshell sandbox connect $SANDBOX_NAME"
echo "  openclaw plugins install /sandbox/ampersend-plugin"
echo ""
echo "Then run: openclaw ampersend status"
