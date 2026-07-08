import { describe, expect, it } from "vitest";
import { buildBoardConfig } from "./boardConfig";

describe("buildBoardConfig", () => {
  it("gates side-effecting tools behind ask", () => {
    const config = buildBoardConfig();
    expect(config.permission).toEqual({ bash: "ask", edit: "ask", webfetch: "ask" });
  });

  it("keeps the Keep Socket disabled until an endpoint is supplied", () => {
    const config = buildBoardConfig();
    const keep = (config.mcp as Record<string, { enabled: boolean; type: string }>).keep_socket;
    expect(keep.enabled).toBe(false);
    expect(keep.type).toBe("remote");
  });

  it("enables the Keep Socket read lane only when a URL is given", () => {
    const config = buildBoardConfig({ keepSocketUrl: "http://100.112.20.36:8088" });
    const keep = (config.mcp as Record<string, { enabled: boolean; url: string }>).keep_socket;
    expect(keep.enabled).toBe(true);
    expect(keep.url).toBe("http://100.112.20.36:8088");
  });

  it("wires the browser MCP only when a command is provided", () => {
    const without = buildBoardConfig();
    expect((without.mcp as Record<string, unknown>).browser).toBeUndefined();

    const withCmd = buildBoardConfig({ browserMcpCommand: ["node", "bridge.js"] });
    const browser = (withCmd.mcp as Record<string, { command: string[]; enabled: boolean }>).browser;
    expect(browser.enabled).toBe(true);
    expect(browser.command).toEqual(["node", "bridge.js"]);
  });
});
