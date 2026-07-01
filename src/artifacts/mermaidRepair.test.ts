import { describe, expect, it } from "vitest";
import { repairMermaid } from "./mermaidRepair";

describe("repairMermaid", () => {
  it("adds a flowchart header to bare edge lists", () => {
    const result = repairMermaid("Adam --> MissionControl");
    expect(result.changed).toBe(true);
    expect(result.repaired).toContain("flowchart LR");
    expect(result.repaired).toContain("Adam --> MissionControl");
  });

  it("does not rewrite valid graph headers", () => {
    const input = "flowchart LR\n  A --> B";
    const result = repairMermaid(input);
    expect(result.changed).toBe(false);
    expect(result.repaired).toBe(input);
  });
});
