import { Inbox } from "lucide-react";

export function WorkbenchBoard() {
  return (
    <section className="desk-pane workbench-board" aria-label="Charli workbench">
      <header className="desk-pane-header">
        <span className="pane-status pane-status-starting" aria-hidden="true" />
        <h2>Workbench</h2>
      </header>
      <div className="workbench-feed">
        <div className="workbench-placeholder">
          <Inbox size={28} />
          <p>Charli's board.</p>
          <small>Drop files, chat by text, and hand work between agents. Board brain lands in slice 4.</small>
        </div>
      </div>
      <footer className="workbench-composer">
        <input type="text" placeholder="Message Charli (text-first)…" disabled aria-label="Message Charli" />
      </footer>
    </section>
  );
}
