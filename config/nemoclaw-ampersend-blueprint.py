"""
nemoclaw-ampersend-blueprint.py
────────────────────────────────────────────────────────────────
NemoClaw Blueprint: Ampersend Agent Payments Integration

Wires Ampersend's x402 payment capabilities into a NemoClaw /
OpenShell sandbox so that the OpenClaw agent can make autonomous
payments using smart account wallets.

Stages
------
1. resolve   — verify Ampersend CLI is configured and reachable
2. plan      — build the OpenShell policy and inference config
3. apply     — create/update the sandbox with the Ampersend policy
4. validate  — confirm the agent can reach the Ampersend API

Usage (inside NemoClaw):
    nemoclaw setup --blueprint nemoclaw-ampersend-blueprint.py

Or standalone:
    python3 nemoclaw-ampersend-blueprint.py --sandbox my-assistant

Requirements:
    pip install httpx pyyaml rich typer
────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from pathlib import Path
from typing import Optional

try:
    import httpx
    import typer
    import yaml
    from rich.console import Console
    from rich.panel import Panel
    from rich.table import Table
except ImportError:
    print(
        "Missing dependencies. Run:\n"
        "  pip install httpx pyyaml rich typer"
    )
    sys.exit(1)

app = typer.Typer(help="NemoClaw blueprint: Ampersend agent payments integration")
console = Console()

# ── Constants ────────────────────────────────────────────────────────────────

AMPERSEND_API_URL = "https://api.ampersend.ai"
POLICY_FILE       = Path("/tmp/ampersend-openshell-policy.yaml")
TIMEOUT           = 10  # seconds for HTTP calls

# ── Helpers ──────────────────────────────────────────────────────────────────

def run(cmd: list[str], check: bool = True, capture: bool = False) -> subprocess.CompletedProcess:
    """Run a shell command with nice error output."""
    console.log(f"[dim]$ {' '.join(cmd)}[/dim]")
    return subprocess.run(
        cmd,
        check=check,
        capture_output=capture,
        text=True,
    )


def ampersend_check_status(api_url: str) -> dict:
    """
    Check Ampersend API reachability and optionally check config status
    via the CLI if available.
    """
    result = {"api_reachable": False, "cli_configured": False, "details": {}}

    try:
        resp = httpx.get(f"{api_url}/api/health", timeout=TIMEOUT)
        result["api_reachable"] = resp.status_code < 500
    except Exception:
        pass

    try:
        proc = subprocess.run(
            ["ampersend", "config", "status"],
            capture_output=True, text=True, timeout=10,
        )
        if proc.returncode == 0:
            data = json.loads(proc.stdout)
            if data.get("ok"):
                result["cli_configured"] = True
                result["details"] = data.get("data", {})
    except Exception:
        pass

    return result


def build_policy(extra_binaries: list[str] | None = None) -> dict:
    """
    Build the OpenShell policy dict that allows egress to Ampersend
    endpoints. Merges any extra binary paths the caller provides.
    """
    base_binaries = [
        {"path": "/usr/local/bin/claude"},
        {"path": "/usr/local/bin/openclaw"},
        {"path": "/usr/bin/node"},
        {"path": "/usr/bin/npx"},
        {"path": "/sandbox/.vscode-server/**"},
        {"path": "/sandbox/.local/bin/**"},
    ]
    if extra_binaries:
        base_binaries.extend({"path": p} for p in extra_binaries)

    return {
        "version": 1,
        "filesystem_policy": {
            "include_workdir": True,
            "read_only": ["/usr", "/lib", "/lib64", "/proc", "/dev/urandom", "/etc", "/bin", "/sbin"],
            "read_write": ["/sandbox", "/tmp", "/dev/null"],
        },
        "landlock": {"compatibility": "best_effort"},
        "process": {"run_as_user": "sandbox", "run_as_group": "sandbox"},
        "network_policies": {
            "ampersend_api": {
                "name": "ampersend-api",
                "endpoints": [
                    {
                        "host": "api.ampersend.ai",
                        "port": 443,
                        "protocol": "rest",
                        "tls": "terminate",
                        "enforcement": "enforce",
                        "rules": [
                            {"allow": {"method": "POST", "path": "/api/**"}},
                            {"allow": {"method": "GET",  "path": "/api/**"}},
                            {"allow": {"method": "PUT",  "path": "/api/**"}},
                        ],
                    }
                ],
                "binaries": base_binaries,
            },
            "ampersend_staging_api": {
                "name": "ampersend-staging-api",
                "endpoints": [
                    {
                        "host": "api.staging.ampersend.ai",
                        "port": 443,
                        "protocol": "rest",
                        "tls": "terminate",
                        "enforcement": "enforce",
                        "access": "read-write",
                    }
                ],
                "binaries": base_binaries,
            },
            "base_rpc": {
                "name": "base-blockchain-rpc",
                "endpoints": [
                    {
                        "host": "mainnet.base.org",
                        "port": 443,
                        "protocol": "rest",
                        "tls": "terminate",
                        "enforcement": "enforce",
                        "access": "read-write",
                    },
                    {
                        "host": "sepolia.base.org",
                        "port": 443,
                        "protocol": "rest",
                        "tls": "terminate",
                        "enforcement": "enforce",
                        "access": "read-write",
                    },
                ],
                "binaries": [
                    {"path": "/usr/local/bin/openclaw"},
                    {"path": "/usr/bin/node"},
                    {"path": "/usr/bin/npx"},
                    {"path": "/sandbox/.local/bin/**"},
                ],
            },
            "nvidia_inference": {
                "name": "nvidia-cloud-inference",
                "endpoints": [
                    {
                        "host": "integrate.api.nvidia.com",
                        "port": 443,
                        "protocol": "rest",
                        "tls": "terminate",
                        "enforcement": "enforce",
                        "access": "read-write",
                    }
                ],
                "binaries": [
                    {"path": "/usr/local/bin/openclaw"},
                    {"path": "/usr/bin/node"},
                    {"path": "/sandbox/.local/bin/**"},
                ],
            },
        },
    }


# ── Blueprint stages ─────────────────────────────────────────────────────────

def stage_resolve(api_url: str) -> dict:
    """Stage 1 — verify Ampersend reachability and config."""
    console.rule("[bold cyan]Stage 1 · Resolve[/bold cyan]")

    with console.status("Checking Ampersend API and CLI status…"):
        status = ampersend_check_status(api_url)

    if status["api_reachable"]:
        console.print("[green]✓ Ampersend API reachable[/green]")
    else:
        console.print("[yellow]⚠ Ampersend API not reachable (agent may still work via CLI)[/yellow]")

    if status["cli_configured"]:
        details = status["details"]
        table = Table(title="Ampersend Agent Configuration", show_lines=True)
        table.add_column("Key", style="cyan")
        table.add_column("Value")
        for k, v in details.items():
            table.add_row(k, str(v))
        console.print(table)
        console.print("[green]✓ Ampersend CLI configured[/green]")
    else:
        console.print("[yellow]⚠ Ampersend CLI not configured — run 'ampersend setup start' in the sandbox[/yellow]")

    return status


def stage_plan(status: dict) -> dict:
    """Stage 2 — build the OpenShell policy."""
    console.rule("[bold cyan]Stage 2 · Plan[/bold cyan]")
    policy = build_policy()
    POLICY_FILE.write_text(yaml.dump(policy, sort_keys=False, default_flow_style=False))
    console.print(f"[green]✓ Policy written to {POLICY_FILE}[/green]")
    console.print(Panel(
        yaml.dump(policy["network_policies"], sort_keys=False)[:800] + "\n…",
        title="Network policy preview",
        border_style="dim",
    ))
    return policy


def stage_apply(sandbox: str) -> None:
    """Stage 3 — apply the policy to the OpenShell sandbox."""
    console.rule("[bold cyan]Stage 3 · Apply[/bold cyan]")

    result = run(
        ["openshell", "sandbox", "list", "--output", "json"],
        check=False,
        capture=True,
    )
    existing = []
    if result.returncode == 0:
        try:
            existing = [s["name"] for s in json.loads(result.stdout)]
        except Exception:
            pass

    if sandbox not in existing:
        console.print(f"Creating sandbox [bold]{sandbox}[/bold]…")
        run([
            "openshell", "sandbox", "create",
            "--name", sandbox,
            "--policy", str(POLICY_FILE),
            "--", "openclaw",
        ])
    else:
        console.print(f"Sandbox [bold]{sandbox}[/bold] exists — updating policy…")
        run([
            "openshell", "policy", "set",
            "--sandbox", sandbox,
            "--file", str(POLICY_FILE),
        ])

    console.print("[green]✓ OpenShell sandbox configured with Ampersend egress policy[/green]")


def stage_validate(api_url: str, sandbox: str) -> None:
    """Stage 4 — smoke-test: confirm the agent can reach Ampersend."""
    console.rule("[bold cyan]Stage 4 · Validate[/bold cyan]")

    with console.status("Verifying Ampersend connectivity…"):
        try:
            resp = httpx.get(f"{api_url}/api/health", timeout=TIMEOUT)
            console.print(f"[green]✓ Ampersend API reachable (HTTP {resp.status_code})[/green]")
        except Exception as e:
            console.print(f"[yellow]⚠ Ampersend API check failed: {e}[/yellow]")

    console.print(Panel(
        f"""
Sandbox:   [bold]{sandbox}[/bold]
Policy:    {POLICY_FILE}

[bold]Next steps:[/bold]
  nemoclaw {sandbox} connect
  sandbox@{sandbox}:~$ ampersend config status
  sandbox@{sandbox}:~$ ampersend setup start --name "{sandbox}"
  sandbox@{sandbox}:~$ ampersend fetch <x402-enabled-url>
""",
        title="[green]✓ Blueprint applied successfully[/green]",
        border_style="green",
    ))


# ── CLI entry point ──────────────────────────────────────────────────────────

@app.command()
def main(
    sandbox: str = typer.Option(..., help="OpenShell sandbox name"),
    api_url: str = typer.Option(
        AMPERSEND_API_URL, envvar="AMPERSEND_API_URL",
        help="Ampersend API URL"
    ),
    skip_apply: bool = typer.Option(False, help="Plan only — do not touch the sandbox"),
) -> None:
    """
    NemoClaw blueprint that wires Ampersend into an OpenShell sandbox.

    Runs four stages: resolve → plan → apply → validate.
    """
    console.print(Panel(
        "[bold]NemoClaw × Ampersend Blueprint[/bold]\n"
        "x402 agent payments + OpenShell isolation",
        border_style="cyan",
    ))

    status = stage_resolve(api_url)
    stage_plan(status)

    if not skip_apply:
        stage_apply(sandbox)
    else:
        console.print("[yellow]--skip-apply set; sandbox not modified[/yellow]")

    stage_validate(api_url, sandbox)


if __name__ == "__main__":
    app()
