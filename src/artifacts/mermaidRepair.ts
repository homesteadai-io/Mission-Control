export interface MermaidRepairResult {
  repaired: string;
  changed: boolean;
  note: string | null;
}

export function repairMermaid(input: string): MermaidRepairResult {
  const trimmed = input.trim();
  const lines = trimmed.split(/\r?\n/);
  const hasGraphHeader = /^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|journey|gantt)\b/.test(
    lines[0] ?? ""
  );

  const repairedLines = hasGraphHeader ? lines : ["flowchart LR", ...lines];
  const repaired = repairedLines.join("\n");
  const changed = repaired !== trimmed;

  return {
    repaired,
    changed,
    note: changed ? "Mermaid syntax was lightly repaired before rendering." : null
  };
}
