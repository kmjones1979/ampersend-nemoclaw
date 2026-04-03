/**
 * Test runner for the Ampersend OpenClaw plugin.
 * Run without OpenClaw: npx tsx scripts/test-plugin-runner.ts <command> [args...]
 */

import ampersendPlugin from "../config/openclaw-ampersend-plugin";

const ctx = {
  log: (msg: string) => console.log(msg),
  error: (msg: string) => console.error(msg),
  exit: (code: number) => process.exit(code),
};

const subcmd = process.argv[2] ?? "help";
const rest = process.argv.slice(3);

const command = ampersendPlugin.commands[subcmd as keyof typeof ampersendPlugin.commands];
if (!command) {
  console.error(`Unknown command: ${subcmd}`);
  console.error(`Available: ${Object.keys(ampersendPlugin.commands).join(", ")}`);
  process.exit(1);
}

command
  .handler(rest, ctx)
  .catch((err: Error) => {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  });
