import { useCallback, useEffect, useRef, useState } from "react";
import { TerminalPane } from "./TerminalPane";
import { WorkbenchBoard } from "./WorkbenchBoard";

const STORAGE_KEY = "mc.deskColumns";
const MIN_FR = 0.18; // a pane can shrink to ~18% before it's effectively parked
const DEFAULT_COLUMNS: [number, number, number] = [1, 1, 1];

function loadColumns(): [number, number, number] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_COLUMNS;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length === 3 && parsed.every((n) => typeof n === "number" && n > 0)) {
      return parsed as [number, number, number];
    }
  } catch {
    // ignore malformed persisted state
  }
  return DEFAULT_COLUMNS;
}

export function OperatorDesk() {
  const [columns, setColumns] = useState<[number, number, number]>(loadColumns);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const dragState = useRef<{
    divider: 0 | 1;
    startX: number;
    left: number;
    right: number;
    totalPx: number;
    sumAllFr: number;
  } | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(columns));
    } catch {
      // storage may be unavailable; sizing still works in-session
    }
  }, [columns]);

  const onPointerMove = useCallback((event: PointerEvent) => {
    const drag = dragState.current;
    if (!drag) return;
    // Move fr between the two adjacent columns only; their sum stays constant so
    // the third pane never drifts. Full grid width maps to the full fr total.
    const totalFr = drag.sumAllFr;
    const deltaFr = ((event.clientX - drag.startX) / drag.totalPx) * totalFr;
    const pairFr = drag.left + drag.right;
    let left = drag.left + deltaFr;
    let right = drag.right - deltaFr;
    if (left < MIN_FR) {
      left = MIN_FR;
      right = pairFr - MIN_FR;
    }
    if (right < MIN_FR) {
      right = MIN_FR;
      left = pairFr - MIN_FR;
    }
    setColumns((current) => {
      const next = [...current] as [number, number, number];
      next[drag.divider] = left;
      next[drag.divider + 1] = right;
      return next;
    });
  }, []);

  const stopDrag = useCallback(() => {
    dragState.current = null;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", stopDrag);
    document.body.classList.remove("is-resizing-desk");
  }, [onPointerMove]);

  const startDrag = (divider: 0 | 1) => (event: React.PointerEvent) => {
    event.preventDefault();
    const gridWidth = gridRef.current?.getBoundingClientRect().width ?? window.innerWidth;
    dragState.current = {
      divider,
      startX: event.clientX,
      left: columns[divider],
      right: columns[divider + 1],
      totalPx: gridWidth,
      sumAllFr: columns[0] + columns[1] + columns[2]
    };
    document.body.classList.add("is-resizing-desk");
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stopDrag);
  };

  const resetColumns = () => setColumns(DEFAULT_COLUMNS);

  return (
    <div
      className="desk-panes"
      ref={gridRef}
      style={{ gridTemplateColumns: `${columns[0]}fr var(--divider) ${columns[1]}fr var(--divider) ${columns[2]}fr` }}
    >
      <TerminalPane paneId="claude" profile="claude" title="Claude Code" />
      <div
        className="desk-divider"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize Claude Code and Codex panes"
        onPointerDown={startDrag(0)}
        onDoubleClick={resetColumns}
        title="Drag to resize · double-click to reset"
      />
      <TerminalPane paneId="codex" profile="codex" title="Codex" />
      <div
        className="desk-divider"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize Codex and Workbench panes"
        onPointerDown={startDrag(1)}
        onDoubleClick={resetColumns}
        title="Drag to resize · double-click to reset"
      />
      <WorkbenchBoard />
    </div>
  );
}
