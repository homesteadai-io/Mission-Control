import { describe, expect, it, vi } from "vitest";
import { normalizeTarget, routeCommand, type SwitchboardDeps } from "./switchboard";

describe("normalizeTarget", () => {
  it("maps canonical and loosely-transcribed names", () => {
    expect(normalizeTarget("Claude Code")).toBe("claude");
    expect(normalizeTarget("cloud code")).toBe("claude"); // common mis-transcription
    expect(normalizeTarget("CODEX")).toBe("codex");
    expect(normalizeTarget("Flux")).toBe("flux");
    expect(normalizeTarget("the notepad")).toBe("flux");
  });

  it("no longer recognizes the retired board target", () => {
    expect(normalizeTarget("the workbench")).toBeNull();
    expect(normalizeTarget("board")).toBeNull();
  });

  it("returns null for unknown targets", () => {
    expect(normalizeTarget("the printer")).toBeNull();
  });
});

function makeDeps(overrides: Partial<SwitchboardDeps> = {}): SwitchboardDeps {
  return {
    submitToPane: vi.fn().mockResolvedValue({ ok: true }),
    surfaceFlux: vi.fn().mockResolvedValue({ ok: true }),
    logDispatch: vi.fn(),
    ...overrides
  };
}

describe("routeCommand", () => {
  it("submits a coding-pane command via the two-step submit (text, then Enter)", async () => {
    const deps = makeDeps();
    const result = await routeCommand("codex", "npm test", deps);
    expect(deps.submitToPane).toHaveBeenCalledWith("codex", "npm test");
    expect(deps.surfaceFlux).not.toHaveBeenCalled();
    expect(result.target).toBe("codex");
    expect(result.ok).toBe(true);
    expect(deps.logDispatch).toHaveBeenCalledWith("codex", 8);
  });

  it("surfaces Flux without sending any command text", async () => {
    const deps = makeDeps();
    const result = await routeCommand("flux", "whatever was said", deps);
    expect(deps.surfaceFlux).toHaveBeenCalledOnce();
    expect(deps.submitToPane).not.toHaveBeenCalled();
    expect(result).toEqual({ target: "flux", ok: true, detail: "Flux is up." });
  });

  it("reports a Flux surface failure", async () => {
    const deps = makeDeps({
      surfaceFlux: vi.fn().mockResolvedValue({ ok: false, detail: "No window matching /Flux/i found" })
    });
    const result = await routeCommand("flux", "", deps);
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("No window matching");
  });

  it("rejects an empty command without dispatching", async () => {
    const deps = makeDeps();
    const result = await routeCommand("claude", "   ", deps);
    expect(result.ok).toBe(false);
    expect(deps.submitToPane).not.toHaveBeenCalled();
    expect(deps.logDispatch).not.toHaveBeenCalled();
  });

  it("surfaces a pane failure back to the caller", async () => {
    const deps = makeDeps({ submitToPane: vi.fn().mockResolvedValue({ ok: false, error: "pane dead" }) });
    const result = await routeCommand("claude", "ls", deps);
    expect(result).toEqual({ target: "claude", ok: false, detail: "pane dead" });
  });

  it("collapses control characters so only one line can ever be submitted", async () => {
    const deps = makeDeps();
    await routeCommand("codex", "npm test\r\nrm -rf /\x1b[31mred", deps);
    // control chars collapsed to spaces; no raw CR reaches the pane (Enter is separate)
    expect(deps.submitToPane).toHaveBeenCalledWith("codex", "npm test rm -rf / [31mred");
  });

  it("rejects commands that are only control characters", async () => {
    const deps = makeDeps();
    const result = await routeCommand("codex", "\r\n", deps);
    expect(result.ok).toBe(false);
    expect(deps.submitToPane).not.toHaveBeenCalled();
  });
});
