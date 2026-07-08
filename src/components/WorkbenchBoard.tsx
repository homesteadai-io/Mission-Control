import { useEffect, useRef, useState, type DragEvent } from "react";
import { FileText, FolderOpen, Image as ImageIcon, Inbox, UploadCloud } from "lucide-react";
import type { WorkspaceFileInfo } from "../missionControlApi";

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"]);

export function WorkbenchBoard() {
  const [files, setFiles] = useState<WorkspaceFileInfo[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const dragDepth = useRef(0);

  const workspace = window.missionControl?.workspace;

  useEffect(() => {
    if (!workspace) return;
    void workspace.list().then((result) => {
      if (result.ok && result.files) setFiles(result.files);
    });
  }, []);

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

  const onDragOver = (event: DragEvent) => {
    event.preventDefault();
  };

  const onDrop = async (event: DragEvent) => {
    event.preventDefault();
    dragDepth.current = 0;
    setDragActive(false);
    if (!workspace) return;

    const dropped = [...event.dataTransfer.files];
    for (const file of dropped) {
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

  const reveal = (file: WorkspaceFileInfo) => {
    void workspace?.reveal(file.path);
  };

  return (
    <section
      className={`desk-pane workbench-board ${dragActive ? "is-drop-target" : ""}`}
      aria-label="Charli workbench"
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={(event) => void onDrop(event)}
    >
      <header className="desk-pane-header">
        <span className="pane-status pane-status-starting" aria-hidden="true" />
        <h2>Workbench</h2>
      </header>

      <div className="workbench-feed">
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

        {files.length === 0 && !dragActive ? (
          <div className="workbench-placeholder">
            <Inbox size={28} />
            <p>Charli's board.</p>
            <small>
              Drop photos, screenshots, or docs — they land in the shared workspace all three agents can see. Board
              brain lands in slice 4.
            </small>
          </div>
        ) : (
          <ul className="workbench-files">
            {files.map((file) => (
              <li key={file.path}>
                <button className="file-card" onClick={() => reveal(file)} title="Reveal in folder">
                  {isImage(file.name) ? <ImageIcon size={16} /> : <FileText size={16} />}
                  <span className="file-name">{file.name}</span>
                  <small>{formatSize(file.size)}</small>
                  <FolderOpen size={13} className="file-reveal" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <footer className="workbench-composer">
        <input type="text" placeholder="Message Charli (text-first)…" disabled aria-label="Message Charli" />
      </footer>
    </section>
  );
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
