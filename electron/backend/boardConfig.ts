import fs from "node:fs";
import path from "node:path";

/**
 * Generate the opencode.json the board agent runs under.
 *
 * Permission model (mirrors Claude Code's gated hands): reads flow, but
 * anything with side effects — shell, file edits, network fetches — is set to
 * "ask", so it surfaces as an approval before it runs. The board UI turns those
 * asks into approve/deny chips.
 *
 * MCP: the browser bridge is wired as a local stdio server (opt-in). The Keep
 * Socket is scaffolded but DISABLED — its live endpoint/credential is Adam's to
 * supply, and only read lanes (ask/graph_read) may ever be enabled here. The
 * Librarian holds the pen; concept writes never route through the cockpit.
 */
export interface BoardConfigOptions {
  /** Absolute path to a browser-bridge MCP launch command, if available. */
  browserMcpCommand?: string[];
  /** Remote URL for the Keep Socket MCP, if Adam has provided one. */
  keepSocketUrl?: string;
}

export function buildBoardConfig(options: BoardConfigOptions = {}) {
  const mcp: Record<string, unknown> = {};

  if (options.browserMcpCommand && options.browserMcpCommand.length > 0) {
    mcp["browser"] = {
      type: "local",
      command: options.browserMcpCommand,
      enabled: true
    };
  }

  // Keep Socket: read lanes only, disabled until an endpoint is supplied.
  mcp["keep_socket"] = {
    type: "remote",
    url: options.keepSocketUrl ?? "http://127.0.0.1:8010",
    enabled: Boolean(options.keepSocketUrl)
  };

  return {
    $schema: "https://opencode.ai/config.json",
    // GPT-5.4 Mini: cheap ($0.75/$4.50 per 1M) and good enough for the board's
    // text-first assistant + light tool use. Bump to "openai/gpt-5.4" (full,
    // $2.50/$15) if multi-step tool reliability ever needs it. Requires an
    // OPENAI_API_KEY (injected by the supervisor from .env.local); without one
    // opencode falls back to its free default model.
    model: "openai/gpt-5.4-mini",
    permission: {
      bash: "ask",
      edit: "ask",
      webfetch: "ask"
    },
    mcp
  };
}

/**
 * Write opencode.json into the workspace. Never clobber a user-authored config:
 * if the file exists and wasn't written by us, leave it alone.
 */
export function ensureBoardConfig(workspaceDir: string, options: BoardConfigOptions = {}) {
  const target = path.join(workspaceDir, "opencode.json");
  const marker = "mission-control-managed";

  if (fs.existsSync(target)) {
    try {
      const existing = JSON.parse(fs.readFileSync(target, "utf8")) as Record<string, unknown>;
      if (existing["x-managed-by"] !== marker) {
        return { written: false, reason: "user-authored config left untouched", path: target };
      }
    } catch {
      return { written: false, reason: "unparseable config left untouched", path: target };
    }
  }

  const config = { "x-managed-by": marker, ...buildBoardConfig(options) };
  fs.writeFileSync(target, JSON.stringify(config, null, 2) + "\n");
  return { written: true, path: target };
}
