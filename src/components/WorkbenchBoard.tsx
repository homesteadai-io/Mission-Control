import { useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import {
  Check,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  MessageSquarePlus,
  Send,
  ShieldAlert,
  UploadCloud,
  X
} from "lucide-react";
import type { BoardMessage, BoardPermission, BoardStatus, PermissionReply, WorkspaceFileInfo } from "../missionControlApi";

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"]);
const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 180_000;

export function WorkbenchBoard() {
  const [files, setFiles] = useState<WorkspaceFileInfo[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [boardStatus, setBoardStatus] = useState<BoardStatus>("starting");
  const [statusDetail, setStatusDetail] = useState<string | null>(null);
  const [messages, setMessages] = useState<BoardMessage[]>([]);
  const [permissions, setPermissions] = useState<BoardPermission[]>([]);
  const [draft, setDraft] = useState("");
  const [awaitingReply, setAwaitingReply] = useState(false);
  const dragDepth = useRef(0);
  const pollStop = useRef(false);
  const feedRef = useRef<HTMLDivElement | null>(null);

  const workspace = window.missionControl?.workspace;
  const board = window.missionControl?.board;

  useEffect(() => {
    if (!workspace || !board) {
      setBoardStatus("error");
      setStatusDetail("Board bridge unavailable");
      return;
    }

    void workspace.list().then((result) => {
      if (result.ok && result.files) setFiles(result.files);
    });
    void board.status().then((result) => {
      if (result.ok && result.status) setBoardStatus(result.status);
    });

    const offStatus = board.onStatusChanged((status, detail) => {
      setBoardStatus(status);
      setStatusDetail(detail);
    });

    return () => {
      pollStop.current = true;
      offStatus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight });
  }, [messages, awaitingReply, permissions]);

  // Poll opencode for ask-gated tool requests and surface them as chips.
  useEffect(() => {
    if (!board || boardStatus !== "ready") return;
    let cancelled = false;
    const tick = async () => {
      const result = await board.permissions();
      if (!cancelled && result.ok && result.permissions) setPermissions(result.permissions);
    };
    void tick();
    const timer = window.setInterval(() => void tick(), 1500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [boardStatus]);

  const decide = async (permission: BoardPermission, reply: PermissionReply) => {
    if (!board) return;
    // optimistic removal so the chip doesn't linger while the tool resumes
    setPermissions((current) => current.filter((p) => p.id !== permission.id));
    const result = await board.replyPermission(permission.id, reply);
    if (!result.ok) {
      setNotice(result.error ?? "Could not send the approval");
      const refreshed = await board.permissions();
      if (refreshed.ok && refreshed.permissions) setPermissions(refreshed.permissions);
    }
  };

  const startNewSession = async () => {
    if (!board) return;
    await board.newSession();
    setMessages([]);
    setPermissions([]);
    setNotice(null);
  };

  const refreshMessages = async () => {
    if (!board) return [] as BoardMessage[];
    const result = await board.messages();
    if (result.ok && result.messages) {
      setMessages(result.messages);
      return result.messages;
    }
    return [] as BoardMessage[];
  };

  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (!board || !draft.trim() || awaitingReply || boardStatus !== "ready") return;

    const text = draft.trim();
    setDraft("");
    setAwaitingReply(true);
    setNotice(null);

    const result = await board.prompt(text);
    if (!result.ok) {
      setAwaitingReply(false);
      setNotice(result.error ?? "Board prompt failed");
      return;
    }

    const deadline = Date.now() + POLL_TIMEOUT_MS;
    pollStop.current = false;
    while (Date.now() < deadline && !pollStop.current) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      const latest = await refreshMessages();
      const last = latest[latest.length - 1];
      if (last && last.role === "assistant" && last.completed) break;
    }
    setAwaitingReply(false);
  };

  const onDragEnter = (event: DragEvent) => {
    event.preventDefault();
    dragDepth.current += 1;
    setDragActive(true);
  };

  const onDragLeave = (event: DragEvent) => {
    event.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragActive(false);
  };

  const onDrop = async (event: DragEvent) => {
    event.preventDefault();
    dragDepth.current = 0;
    setDragActive(false);
    if (!workspace) return;

    for (const file of [...event.dataTransfer.files]) {
      try {
        const bytes = await file.arrayBuffer();
        const result = await workspace.importFile(file.name, bytes);
        if (result.ok && result.file) {
          setFiles((current) => [result.file!, ...current.filter((f) => f.path !== result.file!.path)]);
        } else {
          setNotice(result.error ?? `Could not import ${file.name}`);
        }
      } catch {
        setNotice(`Could not read ${file.name}`);
      }
    }
  };

  return (
    <section
      className={`desk-pane workbench-board ${dragActive ? "is-drop-target" : ""}`}
      aria-label="Charli workbench"
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => void onDrop(event)}
    >
      <header className="desk-pane-header">
        <span className={`pane-status pane-status-${boardStatusToDot(boardStatus)}`} aria-hidden="true" />
        <h2>Workbench</h2>
        <small className="board-status-text">{statusDetail ?? boardStatusLabel(boardStatus)}</small>
        <div className="pane-actions">
          <button
            onClick={() => void startNewSession()}
            title="Start a fresh board conversation"
            aria-label="New board session"
            disabled={boardStatus !== "ready" || awaitingReply}
          >
            <MessageSquarePlus size={14} />
          </button>
        </div>
      </header>

      <div className="workbench-feed" ref={feedRef}>
        {dragActive ? (
          <div className="workbench-drophint">
            <UploadCloud size={28} />
            <p>Drop to add to the shared workspace</p>
          </div>
        ) : null}

        {notice ? (
          <div className="workbench-notice" role="alert">
            {notice}
            <button onClick={() => setNotice(null)}>Dismiss</button>
          </div>
        ) : null}

        {files.length > 0 ? (
          <ul className="workbench-files">
            {files.slice(0, 6).map((file) => (
              <li key={file.path}>
                <button
                  className="file-card"
                  onClick={() => void workspace?.reveal(file.path)}
                  title="Reveal in folder"
                >
                  {isImage(file.name) ? <ImageIcon size={16} /> : <FileText size={16} />}
                  <span className="file-name">{file.name}</span>
                  <small>{formatSize(file.size)}</small>
                  <FolderOpen size={13} className="file-reveal" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {messages.length === 0 && files.length === 0 && !dragActive ? (
          <div className="workbench-placeholder">
            <p>Charli's board.</p>
            <small>Drop files into the shared workspace, or message the board agent below. Text-first — no voice required.</small>
          </div>
        ) : null}

        <div className="board-chat">
          {messages.map((message) => (
            <div key={message.id} className={`board-bubble board-bubble-${message.role}`}>
              <span>{message.text || "…"}</span>
              {message.role === "assistant" && message.model ? <small>{message.model}</small> : null}
            </div>
          ))}
          {awaitingReply ? (
            <div className="board-bubble board-bubble-assistant board-bubble-pending">
              <span>Working…</span>
            </div>
          ) : null}
        </div>

        {permissions.map((permission) => (
          <div key={permission.id} className="approval-chip" role="alertdialog" aria-label="Tool approval">
            <div className="approval-head">
              <ShieldAlert size={15} />
              <span>
                Charli wants to run <b>{permission.action}</b>
              </span>
            </div>
            {permission.resources.length > 0 ? (
              <pre className="approval-detail">{permission.resources.join("\n").slice(0, 500)}</pre>
            ) : null}
            <div className="approval-actions">
              <button className="approve" onClick={() => void decide(permission, "once")}>
                <Check size={13} /> Allow once
              </button>
              <button className="approve-always" onClick={() => void decide(permission, "always")}>
                Always
              </button>
              <button className="deny" onClick={() => void decide(permission, "reject")}>
                <X size={13} /> Deny
              </button>
            </div>
          </div>
        ))}
      </div>

      <footer className="workbench-composer">
        <form onSubmit={(event) => void send(event)}>
          <input
            type="text"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={
              boardStatus === "ready" ? "Message Charli's board agent…" : `Board ${boardStatusLabel(boardStatus)}`
            }
            disabled={boardStatus !== "ready" || awaitingReply}
            aria-label="Message the board agent"
          />
          <button type="submit" disabled={boardStatus !== "ready" || awaitingReply || !draft.trim()} aria-label="Send">
            <Send size={15} />
          </button>
        </form>
      </footer>
    </section>
  );
}

function boardStatusToDot(status: BoardStatus) {
  if (status === "ready") return "running";
  if (status === "starting") return "starting";
  return "exited";
}

function boardStatusLabel(status: BoardStatus) {
  switch (status) {
    case "ready":
      return "ready";
    case "starting":
      return "starting…";
    case "stopped":
      return "stopped";
    case "error":
      return "unavailable";
  }
}

function isImage(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_EXTENSIONS.has(ext);
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
