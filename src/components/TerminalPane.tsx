import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { RotateCcw, Square } from "lucide-react";
import type { PaneProfile } from "../missionControlApi";
import "@xterm/xterm/css/xterm.css";

interface TerminalPaneProps {
  paneId: string;
  profile: PaneProfile;
  title: string;
}

type PaneStatus = "starting" | "running" | "exited" | "unavailable";

export function TerminalPane({ paneId, profile, title }: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const [status, setStatus] = useState<PaneStatus>("starting");
  const [exitCode, setExitCode] = useState<number | null>(null);

  const bridge = window.missionControl?.terminal;

  const spawn = async () => {
    if (!bridge || !termRef.current || !fitRef.current) return;
    fitRef.current.fit();
    const { cols, rows } = termRef.current;
    setStatus("starting");
    setExitCode(null);
    const result = await bridge.spawn(paneId, profile, cols, rows);
    setStatus(result.ok ? "running" : "unavailable");
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    if (!bridge) {
      setStatus("unavailable");
      return;
    }

    const term = new Terminal({
      fontSize: 13,
      fontFamily: '"Cascadia Mono", "Consolas", monospace',
      cursorBlink: true,
      theme: {
        background: "#0a1016",
        foreground: "#d8ecf8",
        cursor: "#7fd4ff",
        selectionBackground: "rgba(127, 212, 255, 0.3)"
      }
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(container);
    termRef.current = term;
    fitRef.current = fit;

    const offData = bridge.onData((id, data) => {
      if (id === paneId) term.write(data);
    });
    const offExit = bridge.onExit((id, code) => {
      if (id !== paneId) return;
      setStatus("exited");
      setExitCode(code);
      term.write(`\r\n\x1b[90m[${title} exited with code ${code}]\x1b[0m\r\n`);
    });

    const inputDisposable = term.onData((data) => {
      void bridge.input(paneId, data);
    });

    const resizeObserver = new ResizeObserver(() => {
      if (!fitRef.current || !termRef.current) return;
      fitRef.current.fit();
      const { cols, rows } = termRef.current;
      void bridge.resize(paneId, cols, rows);
    });
    resizeObserver.observe(container);

    void spawn();

    return () => {
      offData();
      offExit();
      inputDisposable.dispose();
      resizeObserver.disconnect();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
      // Kill the pty on unmount so nothing runs detached from the UI.
      // (StrictMode dev double-mount just restarts the pane once.)
      void bridge.kill(paneId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paneId, profile]);

  return (
    <section className="desk-pane" aria-label={`${title} terminal`}>
      <header className="desk-pane-header">
        <span className={`pane-status pane-status-${status}`} aria-hidden="true" />
        <h2>{title}</h2>
        <div className="pane-actions">
          <button onClick={() => void spawn()} title={`Restart ${title}`} aria-label={`Restart ${title}`}>
            <RotateCcw size={14} />
          </button>
          <button
            onClick={() => void bridge?.kill(paneId)}
            title={`Stop ${title}`}
            aria-label={`Stop ${title}`}
            disabled={status !== "running" && status !== "starting"}
          >
            <Square size={14} />
          </button>
        </div>
      </header>
      <div className="desk-pane-terminal" ref={containerRef} />
      {status === "exited" ? (
        <div className="pane-overlay">
          <p>
            {title} exited{exitCode !== null ? ` (code ${exitCode})` : ""}.
          </p>
          <button onClick={() => void spawn()}>Restart</button>
        </div>
      ) : null}
      {status === "unavailable" ? (
        <div className="pane-overlay">
          <p>Terminal bridge unavailable.</p>
        </div>
      ) : null}
    </section>
  );
}
