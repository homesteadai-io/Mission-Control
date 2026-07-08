import fs from "node:fs";
import path from "node:path";

const MAX_IMPORT_BYTES = 100 * 1024 * 1024; // 100 MB per dropped file

// Windows-invalid filename characters plus ASCII control characters.
const INVALID_NAME_CHARS = new RegExp("[<>:\"|?*\u0000-\u001f]", "g");

export interface WorkspaceFileInfo {
  name: string;
  path: string;
  size: number;
  modifiedAt: string;
}

/**
 * Strip anything path-like from a dropped file name. The workspace dir is the
 * boundary — imports may never escape it.
 */
export function sanitizeFileName(rawName: string) {
  const base = path.basename(rawName).replaceAll("\\", "").replaceAll("/", "").trim();
  const cleaned = base.replace(INVALID_NAME_CHARS, "_").slice(0, 120);
  if (!cleaned || cleaned === "." || cleaned === "..") {
    return `dropped-${Date.now()}`;
  }
  return cleaned;
}

/** Collision-safe target path inside the workspace: name.ext, name-1.ext, ... */
export function resolveCollisionFreePath(workspaceDir: string, fileName: string) {
  const parsed = path.parse(fileName);
  let candidate = path.join(workspaceDir, fileName);
  let counter = 1;
  while (fs.existsSync(candidate)) {
    candidate = path.join(workspaceDir, `${parsed.name}-${counter}${parsed.ext}`);
    counter += 1;
  }
  return candidate;
}

export function importFile(workspaceDir: string, rawName: string, bytes: Uint8Array): WorkspaceFileInfo {
  if (bytes.byteLength > MAX_IMPORT_BYTES) {
    throw new Error(`File exceeds the ${Math.round(MAX_IMPORT_BYTES / 1024 / 1024)} MB import limit`);
  }

  const safeName = sanitizeFileName(rawName);
  const target = resolveCollisionFreePath(workspaceDir, safeName);

  const resolved = path.resolve(target);
  if (!resolved.startsWith(path.resolve(workspaceDir) + path.sep)) {
    throw new Error("Import escaped the workspace boundary");
  }

  fs.writeFileSync(resolved, bytes);
  const stat = fs.statSync(resolved);
  return {
    name: path.basename(resolved),
    path: resolved,
    size: stat.size,
    modifiedAt: stat.mtime.toISOString()
  };
}

export function listFiles(workspaceDir: string): WorkspaceFileInfo[] {
  if (!fs.existsSync(workspaceDir)) return [];
  return fs
    .readdirSync(workspaceDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const fullPath = path.join(workspaceDir, entry.name);
      const stat = fs.statSync(fullPath);
      return {
        name: entry.name,
        path: fullPath,
        size: stat.size,
        modifiedAt: stat.mtime.toISOString()
      };
    })
    .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
}

export function isInsideWorkspace(workspaceDir: string, candidate: string) {
  const resolved = path.resolve(candidate);
  return resolved.startsWith(path.resolve(workspaceDir) + path.sep);
}
