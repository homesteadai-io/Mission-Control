import { TerminalPane } from "./TerminalPane";
import { WorkbenchBoard } from "./WorkbenchBoard";

export function OperatorDesk() {
  return (
    <div className="desk-panes">
      <TerminalPane paneId="claude" profile="claude" title="Claude Code" />
      <TerminalPane paneId="codex" profile="codex" title="Codex" />
      <WorkbenchBoard />
    </div>
  );
}
