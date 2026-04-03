#!/usr/bin/env node
/**
 * Test runner for the Ampersend OpenClaw plugin (Node ESM).
 * Uses tsx to run the TypeScript plugin; falls back to instructions if tsx missing.
 *
 * Usage: node scripts/test-plugin-runner.mjs [command] [args...]
 * Example: node scripts/test-plugin-runner.mjs status
 */

import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const runnerTs = path.join(repoRoot, "scripts", "test-plugin-runner.ts");

const [subcmd, ...rest] = process.argv.slice(2);
const args = [runnerTs, subcmd ?? "help", ...rest];

const r = spawnSync("npx", ["tsx", ...args], {
  cwd: repoRoot,
  stdio: "inherit",
  shell: true,
});

if (r.signal) process.exit(128 + (r.signal === "SIGINT" ? 2 : 0));
process.exit(r.status ?? 0);
