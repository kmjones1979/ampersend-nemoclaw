# Testing the Ampersend + OpenShell / NemoClaw setup

This guide walks through testing all three integration pieces **without** requiring a full OpenShell/NemoClaw install. You can then optionally apply the policy and run the agent inside a sandbox.

---

## Run tests (local)

From repo root:

```bash
npm test
```

This runs: policy validation, blueprint dry-run, and plugin status (if Ampersend CLI is installed).

To run the **full setup in Docker** (create sandbox, install Ampersend plugin and optional skills) on your Mac:

```bash
openshell gateway start --plaintext   # on Mac, one-time
npm run setup:docker
```

Then connect with `openshell sandbox connect my-assistant` or `docker exec -it <container> bash` and run `openclaw ampersend status` inside.

---

## Prerequisites

- **Node 18+** (for the OpenClaw plugin tests)
- **Python 3.8+** and pip (for the NemoClaw blueprint)
- **Ampersend CLI** — `npm install -g @ampersend_ai/ampersend-sdk@0.0.16`

Optional for full flow:

- **OpenShell** CLI (`openshell` in PATH) — to apply policy and create sandboxes
- **NemoClaw** — to launch sandboxed OpenClaw with the blueprint

---

## 1. Install dependencies

```bash
# From repo root
cd /path/to/1claw-nemoclaw

# Node (for plugin tests)
npm install

# Python (for blueprint tests)
pip install -r requirements.txt

# Ampersend CLI (for agent payments)
npm install -g @ampersend_ai/ampersend-sdk@0.0.16
```

---

## 2. Set up Ampersend (for full integration tests)

```bash
# Two-step setup
ampersend setup start --name "test-agent"
# Approve in browser...
ampersend setup finish

# Verify
ampersend config status
```

Or set config manually:

```bash
ampersend config set "0xYourAgentKey:::0xYourSmartAccount"
```

---

## 3. Run tests

### All at once

```bash
npm test
```

This runs:

1. **Policy** — validates `config/ampersend-openshell-policy.yaml` (no CLI needed).
2. **Blueprint** — resolve + plan only (`--skip-apply`); checks API reachability.
3. **Plugin** — `openclaw ampersend status` via the test runner; skips if Ampersend CLI not installed.

### Individually

```bash
# Policy only (no dependencies)
npm run test:policy

# Blueprint dry-run
npm run test:blueprint

# Plugin status (needs Ampersend CLI)
node scripts/test-plugin-runner.mjs status

# Plugin help
node scripts/test-plugin-runner.mjs help

# Ampersend API test (needs Ampersend CLI)
npm run test:ampersend
```

---

## 4. Plugin commands (standalone)

From repo root, with Ampersend CLI installed:

```bash
# Help
node scripts/test-plugin-runner.mjs help

# Status (CLI config + API reachability)
node scripts/test-plugin-runner.mjs status

# Fetch with x402 payment
node scripts/test-plugin-runner.mjs fetch https://example.com/paid-endpoint

# Inspect payment requirements
node scripts/test-plugin-runner.mjs inspect https://example.com/paid-endpoint
```

The same commands are available inside OpenClaw as `openclaw ampersend <command>` once the plugin is registered.

---

## 5. Run NemoClaw in Docker and test Ampersend inside the sandbox

### One-shot setup (recommended)

On your Mac, from the repo root:

```bash
openshell gateway start --plaintext   # one-time, on Mac
npm run setup:docker
```

This creates the sandbox, applies the Ampersend policy, installs the CLI and plugin, and optionally installs skills from `config/skills-to-install.txt`.

### After setup

Connect and test:

```bash
docker exec -it <sandbox-container-id> bash
# Inside the sandbox:
ampersend config status
ampersend setup start --name "my-assistant"   # if not yet set up
ampersend fetch <x402-enabled-url>
openclaw ampersend status
openclaw tui
```

---

## 6. Apply policy to a real OpenShell sandbox (without NemoClaw)

If you have the OpenShell CLI installed:

```bash
openshell policy set --sandbox <sandbox-name> --file config/ampersend-openshell-policy.yaml
openshell policy get --sandbox <sandbox-name>   # verify
```

---

## 7. Full blueprint (create/update sandbox)

Without `--skip-apply`, the blueprint creates or updates the sandbox and applies the Ampersend policy:

```bash
python3 config/nemoclaw-ampersend-blueprint.py \
  --sandbox my-assistant
```

Then connect and test inside the sandbox:

```bash
nemoclaw my-assistant connect
# inside sandbox:
ampersend config status
openclaw ampersend status
```

---

## Troubleshooting

| Issue | What to check |
|-------|----------------|
| `ampersend: command not found` | Install: `npm install -g @ampersend_ai/ampersend-sdk@0.0.16` |
| `Ampersend not configured` | Run: `ampersend setup start --name <agent-name>`, approve, then `ampersend setup finish` |
| `openshell: command not found` | Policy file test still passes; install OpenShell to apply policy or run sandbox. |
| `tsx` not found when running plugin test | Run `npm install` (tsx is a devDependency) or `npx tsx scripts/test-plugin-runner.ts status`. |
| Python `ModuleNotFoundError` | Run `pip install -r requirements.txt`. |

---

## File reference

| File | Purpose |
|------|--------|
| `config/ampersend-openshell-policy.yaml` | OpenShell network + FS policy (Ampersend + NVIDIA + npm/GitHub). |
| `config/nemoclaw-ampersend-blueprint.py` | NemoClaw blueprint: resolve -> plan -> apply -> validate. |
| `config/openclaw-ampersend-plugin.ts` | OpenClaw plugin: `openclaw ampersend status/setup/fetch/inspect/...` |
| `config/ampersend-plugin/` | Plugin bundle uploaded into sandboxes. |
| `scripts/test-all.sh` | Runs policy + blueprint (dry-run) + plugin status. |
| `scripts/test-openshell-policy.sh` | Validates policy YAML. |
| `scripts/test-blueprint.sh` | Blueprint with `--skip-apply`. |
| `scripts/test-plugin-runner.mjs` | Invokes the TS plugin via tsx for local testing. |
| `scripts/setup-nemoclaw-in-docker.sh` | One-shot Docker setup: sandbox, policy, Ampersend plugin, optional skills. |
