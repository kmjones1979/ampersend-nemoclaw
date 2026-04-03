/// <reference types="node" />
/**
 * openclaw-ampersend-plugin.ts
 * ──────────────────────────────────────────────────────────────
 * OpenClaw plugin: Ampersend agent payments
 *
 * Adds `openclaw ampersend <command>` to the OpenClaw CLI so agents
 * running inside an OpenShell / NemoClaw sandbox can make x402
 * payments, check config status, and manage their smart account
 * wallet without manual intervention.
 *
 * Commands
 * --------
 *   openclaw ampersend setup [--name <name>]  — two-step agent setup flow
 *   openclaw ampersend status                 — config & connectivity check
 *   openclaw ampersend fetch <url> [opts]     — HTTP request with x402 payment
 *   openclaw ampersend inspect <url>          — check payment requirements without paying
 *   openclaw ampersend config <key:::account> — manual config set
 *   openclaw ampersend help                   — show help
 *
 * Configuration
 * -------------
 *   The Ampersend CLI stores config locally (~/.ampersend/).
 *   Use `ampersend setup start` + `ampersend setup finish` for automated setup,
 *   or `ampersend config set` for manual configuration.
 *
 *   AMPERSEND_API_URL — override API base (default: https://api.ampersend.ai)
 *   AMPERSEND_NETWORK — network override (base, base-sepolia)
 *
 * Installation
 * ------------
 *   npm install -g @ampersend_ai/ampersend-sdk@0.0.16
 *
 *   Place this file in your OpenClaw plugins directory and register it:
 *
 *   // openclaw.config.ts
 *   import ampersend from "./openclaw-ampersend-plugin";
 *   export default { plugins: [ampersend] };
 * ──────────────────────────────────────────────────────────────
 */

import { execSync, spawn } from "child_process";

// ── Types ─────────────────────────────────────────────────────────────────

interface AmpersendConfig {
  apiUrl: string;
  network: string;
}

interface CLIResult {
  ok: boolean;
  data?: Record<string, unknown>;
  error?: { code: string; message: string };
}

// ── Plugin definition ─────────────────────────────────────────────────────

export interface OpenClawPlugin {
  name: string;
  version: string;
  description: string;
  commands: Record<string, OpenClawCommand>;
}

export interface OpenClawCommand {
  description: string;
  usage: string;
  handler: (args: string[], ctx: PluginContext) => Promise<void>;
}

export interface PluginContext {
  log: (msg: string) => void;
  error: (msg: string) => void;
  exit: (code: number) => void;
}

// ── Config loader ─────────────────────────────────────────────────────────

function loadConfig(): AmpersendConfig {
  return {
    apiUrl:  process.env.AMPERSEND_API_URL ?? "https://api.ampersend.ai",
    network: process.env.AMPERSEND_NETWORK ?? "base",
  };
}

// ── CLI wrapper ───────────────────────────────────────────────────────────

function runAmpersendCLI(args: string[]): CLIResult {
  try {
    const output = execSync(`ampersend ${args.join(" ")}`, {
      encoding: "utf-8",
      timeout: 60_000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    try {
      return JSON.parse(output.trim()) as CLIResult;
    } catch {
      return { ok: true, data: { raw: output.trim() } };
    }
  } catch (e: unknown) {
    const err = e as { stderr?: string; stdout?: string; message?: string };
    const errText = err.stderr || err.stdout || err.message || "Unknown error";
    try {
      return JSON.parse(errText.trim()) as CLIResult;
    } catch {
      return { ok: false, error: { code: "CLI_ERROR", message: errText.trim() } };
    }
  }
}

function checkCLIInstalled(): boolean {
  try {
    execSync("ampersend --version", { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
    return true;
  } catch {
    return false;
  }
}

// ── Command handlers ──────────────────────────────────────────────────────

/**
 * `openclaw ampersend setup [--name <name>] [--force]`
 * Two-step agent setup: generates a key, requests approval, then polls.
 */
async function cmdSetup(ctx: PluginContext, args: string[]): Promise<void> {
  if (!checkCLIInstalled()) {
    ctx.error(
      "Ampersend CLI not found. Install it:\n" +
      "  npm install -g @ampersend_ai/ampersend-sdk@0.0.16"
    );
    ctx.exit(1);
    return;
  }

  let agentName = "my-assistant";
  let force = false;
  const extraArgs: string[] = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--name" && args[i + 1]) {
      agentName = args[++i];
    } else if (args[i] === "--force") {
      force = true;
    } else if (args[i] === "--daily-limit" && args[i + 1]) {
      extraArgs.push("--daily-limit", args[++i]);
    } else if (args[i] === "--auto-topup") {
      extraArgs.push("--auto-topup");
    }
  }

  ctx.log("Step 1: Requesting agent creation…\n");

  const startArgs = ["setup", "start", "--name", agentName];
  if (force) startArgs.push("--force");
  startArgs.push(...extraArgs);

  const startResult = runAmpersendCLI(startArgs);

  if (!startResult.ok) {
    ctx.error(`Setup start failed: ${startResult.error?.message ?? "unknown error"}`);
    ctx.exit(1);
    return;
  }

  const approveUrl = startResult.data?.user_approve_url as string | undefined;
  const agentKeyAddress = startResult.data?.agentKeyAddress as string | undefined;

  ctx.log(`✓ Agent key generated: ${agentKeyAddress ?? "(see output)"}`);
  if (approveUrl) {
    ctx.log(`\nApproval URL (share with the human):\n  ${approveUrl}\n`);
    ctx.log("Waiting for the human to approve in their browser…");
  }

  ctx.log("\nStep 2: Polling for approval…\n");

  const finishResult = runAmpersendCLI(["setup", "finish"]);

  if (!finishResult.ok) {
    ctx.error(`Setup finish failed: ${finishResult.error?.message ?? "unknown error"}`);
    ctx.log("\nThe human may not have approved yet. Re-run: openclaw ampersend setup --force");
    ctx.exit(1);
    return;
  }

  const account = finishResult.data?.agentAccount as string | undefined;
  const status = finishResult.data?.status as string | undefined;

  ctx.log(`✓ Agent activated. Status: ${status ?? "ready"}`);
  if (account) ctx.log(`  Smart account: ${account}`);
  ctx.log("\nRun: openclaw ampersend status");
}

/**
 * `openclaw ampersend status`
 * Shows current config and connectivity.
 */
async function cmdStatus(cfg: AmpersendConfig, ctx: PluginContext): Promise<void> {
  ctx.log("Checking Ampersend configuration…\n");

  if (!checkCLIInstalled()) {
    ctx.error(
      "✗ Ampersend CLI not installed.\n" +
      "  Install: npm install -g @ampersend_ai/ampersend-sdk@0.0.16"
    );
    ctx.exit(1);
    return;
  }

  ctx.log("✓ Ampersend CLI installed");

  const result = runAmpersendCLI(["config", "status"]);

  if (result.ok && result.data) {
    const d = result.data;
    ctx.log(`✓ Agent configured`);
    ctx.log(`  Status:           ${d.status ?? "unknown"}`);
    if (d.agentKeyAddress) ctx.log(`  Agent key:        ${d.agentKeyAddress}`);
    if (d.agentAccount) ctx.log(`  Smart account:    ${d.agentAccount}`);
  } else {
    ctx.log("✗ Agent not configured");
    ctx.log("  Run: openclaw ampersend setup --name <agent-name>");
  }

  // API reachability
  try {
    const res = await fetch(`${cfg.apiUrl}/api/health`);
    ctx.log(`✓ Ampersend API     reachable (${res.status})`);
  } catch (e) {
    ctx.error(`✗ Ampersend API     FAILED: ${(e as Error).message}`);
  }

  ctx.log(`\nAPI URL:   ${cfg.apiUrl}`);
  ctx.log(`Network:   ${cfg.network}`);
}

/**
 * `openclaw ampersend fetch <url> [-X method] [-H header] [-d body]`
 * HTTP request with automatic x402 payment handling.
 */
async function cmdFetch(ctx: PluginContext, args: string[]): Promise<void> {
  if (!checkCLIInstalled()) {
    ctx.error("Ampersend CLI not found. Install: npm install -g @ampersend_ai/ampersend-sdk@0.0.16");
    ctx.exit(1);
    return;
  }

  if (args.length === 0) {
    ctx.error("Usage: openclaw ampersend fetch <url> [-X POST] [-H 'Key: Value'] [-d '{...}']");
    ctx.exit(1);
    return;
  }

  const result = runAmpersendCLI(["fetch", ...args]);

  if (result.ok) {
    const d = result.data ?? {};
    if (d.status) ctx.log(`Status:  ${d.status}`);
    if (d.payment) {
      const p = d.payment as Record<string, unknown>;
      ctx.log(`Payment: ${p.amount ?? "n/a"} (${p.scheme ?? "x402"})`);
    }
    if (d.body) {
      ctx.log(`\n${typeof d.body === "string" ? d.body : JSON.stringify(d.body, null, 2)}`);
    } else if (d.raw) {
      ctx.log(`\n${d.raw}`);
    }
  } else {
    ctx.error(`Fetch failed: ${result.error?.message ?? JSON.stringify(result)}`);
    ctx.exit(1);
  }
}

/**
 * `openclaw ampersend inspect <url>`
 * Check payment requirements for a URL without making a payment.
 */
async function cmdInspect(ctx: PluginContext, url: string): Promise<void> {
  if (!checkCLIInstalled()) {
    ctx.error("Ampersend CLI not found. Install: npm install -g @ampersend_ai/ampersend-sdk@0.0.16");
    ctx.exit(1);
    return;
  }

  if (!url) {
    ctx.error("Usage: openclaw ampersend inspect <url>");
    ctx.exit(1);
    return;
  }

  const result = runAmpersendCLI(["fetch", "--inspect", url]);

  if (result.ok && result.data) {
    ctx.log("Payment requirements:\n");
    ctx.log(JSON.stringify(result.data, null, 2));
  } else if (result.ok) {
    ctx.log("No payment required for this URL.");
  } else {
    ctx.error(`Inspect failed: ${result.error?.message ?? JSON.stringify(result)}`);
    ctx.exit(1);
  }
}

/**
 * `openclaw ampersend config <key:::account>`
 * Manually set agent config.
 */
async function cmdConfig(ctx: PluginContext, args: string[]): Promise<void> {
  if (!checkCLIInstalled()) {
    ctx.error("Ampersend CLI not found. Install: npm install -g @ampersend_ai/ampersend-sdk@0.0.16");
    ctx.exit(1);
    return;
  }

  if (args.length === 0) {
    ctx.error(
      'Usage: openclaw ampersend config <key:::account>\n' +
      '  or:  openclaw ampersend config --network base-sepolia\n' +
      '  or:  openclaw ampersend config --api-url https://api.staging.ampersend.ai'
    );
    ctx.exit(1);
    return;
  }

  const result = runAmpersendCLI(["config", "set", ...args]);

  if (result.ok) {
    ctx.log("✓ Configuration updated");
    if (result.data) {
      const d = result.data;
      if (d.agentKeyAddress) ctx.log(`  Agent key:     ${d.agentKeyAddress}`);
      if (d.agentAccount) ctx.log(`  Smart account: ${d.agentAccount}`);
      if (d.status) ctx.log(`  Status:        ${d.status}`);
    }
  } else {
    ctx.error(`Config set failed: ${result.error?.message ?? JSON.stringify(result)}`);
    ctx.exit(1);
  }
}

// ── Plugin manifest ───────────────────────────────────────────────────────

const ampersendPlugin: OpenClawPlugin = {
  name: "ampersend",
  version: "0.1.0",
  description:
    "Autonomous agent payments via Ampersend and the x402 protocol. " +
    "Make payments, check status, and manage smart account wallets from OpenClaw.",

  commands: {

    setup: {
      description: "Set up an Ampersend agent account (two-step approval flow).",
      usage: "openclaw ampersend setup --name <agent-name> [--force] [--daily-limit <amount>]",
      async handler(args, ctx) {
        await cmdSetup(ctx, args);
      },
    },

    status: {
      description: "Check Ampersend CLI config and API connectivity.",
      usage: "openclaw ampersend status",
      async handler(_args, ctx) {
        const cfg = loadConfig();
        await cmdStatus(cfg, ctx);
      },
    },

    fetch: {
      description: "Make an HTTP request with automatic x402 payment handling.",
      usage: "openclaw ampersend fetch <url> [-X POST] [-H 'Key: Value'] [-d '{...}']",
      async handler(args, ctx) {
        await cmdFetch(ctx, args);
      },
    },

    inspect: {
      description: "Check payment requirements for a URL without making a payment.",
      usage: "openclaw ampersend inspect <url>",
      async handler(args, ctx) {
        await cmdInspect(ctx, args[0]);
      },
    },

    config: {
      description: "Manually set Ampersend agent configuration.",
      usage: 'openclaw ampersend config <key:::account>',
      async handler(args, ctx) {
        await cmdConfig(ctx, args);
      },
    },

    help: {
      description: "Show this help message.",
      usage: "openclaw ampersend help",
      async handler(_args, ctx) {
        ctx.log("openclaw ampersend — agent payment commands\n");
        for (const [name, cmd] of Object.entries(ampersendPlugin.commands)) {
          if (name === "help") continue;
          ctx.log(`  ${cmd.usage.padEnd(70)} ${cmd.description}`);
        }
        ctx.log("\nEnvironment variables:");
        ctx.log("  AMPERSEND_API_URL     API base URL override (default: https://api.ampersend.ai)");
        ctx.log("  AMPERSEND_NETWORK     Network override (base, base-sepolia)");
        ctx.log("");
        ctx.log("Setup:");
        ctx.log("  npm install -g @ampersend_ai/ampersend-sdk@0.0.16");
        ctx.log("  openclaw ampersend setup --name <agent-name>");
        ctx.log("");
        ctx.log("Learn more: https://github.com/edgeandnode/ampersend-sdk");
      },
    },
  },
};

export default ampersendPlugin;

// ── Standalone CLI (for testing outside OpenClaw) ─────────────────────────

if (require.main === module) {
  const ctx: PluginContext = {
    log:  (msg) => console.log(msg),
    error: (msg) => console.error(msg),
    exit: (code) => process.exit(code),
  };

  const [,, subcmd, ...rest] = process.argv;
  const command = ampersendPlugin.commands[subcmd ?? "help"];

  if (!command) {
    console.error(`Unknown command: ${subcmd}`);
    console.error(`Available: ${Object.keys(ampersendPlugin.commands).join(", ")}`);
    process.exit(1);
  }

  command.handler(rest, ctx).catch((err) => {
    console.error(`Error: ${(err as Error).message}`);
    process.exit(1);
  });
}
