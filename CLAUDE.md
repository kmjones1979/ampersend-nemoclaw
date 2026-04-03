# CLAUDE.md

Project-level instructions for Claude Code and other AI assistants.

## Project overview

This repo integrates [ampersend](https://github.com/edgeandnode/ampersend-sdk) agent payments (x402 protocol) into [NemoClaw](https://github.com/NVIDIA/NemoClaw) / OpenShell sandboxes. It provides:

- An OpenShell network policy (`config/ampersend-openshell-policy.yaml`)
- An OpenClaw plugin (`config/openclaw-ampersend-plugin.ts`)
- A NemoClaw blueprint (`config/nemoclaw-ampersend-blueprint.py`)
- Docker setup scripts (`scripts/`)

## Naming conventions

- Always spell **ampersend** with a lowercase "a" — never "Ampersend"
- The CLI tool is `ampersend` (lowercase)
- Environment variables use `AMPERSEND_` prefix (uppercase, standard env var convention)
- TypeScript identifiers follow PascalCase/camelCase conventions (`AmpersendConfig`, `runAmpersendCLI`)

## Key commands

```bash
npm test              # Run all tests (policy, blueprint, plugin)
npm run setup:docker  # One-shot Docker setup
npm run plugin:upload # Upload plugin to sandbox
npm run test:policy   # Validate OpenShell policy YAML
npm run test:ampersend # Test ampersend CLI and API
```

## Architecture

- `config/` — Policy YAML, OpenClaw plugin (TypeScript), NemoClaw blueprint (Python)
- `config/ampersend-plugin/` — Plugin bundle uploaded to sandboxes
- `scripts/` — Shell scripts for Docker setup, testing, plugin upload
- The plugin wraps the `ampersend` CLI (`@ampersend_ai/ampersend-sdk@0.0.16`)

## ampersend CLI reference

See https://www.ampersend.ai/skill.md for the canonical CLI documentation.

Key commands:
- `ampersend setup start --name <name>` — generate agent key, get approval URL
- `ampersend setup finish` — poll for approval, activate config
- `ampersend config status` — show current config
- `ampersend config set <key:::account>` — manual config
- `ampersend fetch <url>` — HTTP request with x402 payment
- `ampersend fetch --inspect <url>` — check payment requirements without paying

## Do not

- Do not commit `.env` files (they may contain API keys)
- Do not uppercase "ampersend" in prose text
- Do not modify `package-lock.json` manually
