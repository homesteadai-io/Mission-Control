import type { CockpitMode, TranscriptEntry } from "./types";

export interface VoiceSessionCreateOptions {
  stateSummary?: string;
}

export interface VoiceSessionCreateResult {
  ok: boolean;
  sessionId?: string;
  clientSecret?: string;
  expiresAt?: number;
  model?: "gpt-realtime-2";
  instructions?: string;
  error?: string;
}

export interface VoiceLogEvent {
  type: `voice.${string}`;
  sessionId?: string;
  detail?: Record<string, unknown>;
}

export type PaneProfile = "claude" | "codex";

export interface TerminalApi {
  spawn: (id: string, profile: PaneProfile, cols: number, rows: number) => Promise<{ ok: boolean; error?: string }>;
  input: (id: string, data: string) => Promise<{ ok: boolean; error?: string }>;
  submitLine: (id: string, text: string) => Promise<{ ok: boolean; error?: string }>;
  readRecent: (id: string, maxChars?: number) => Promise<{ ok: boolean; text?: string; error?: string }>;
  resize: (id: string, cols: number, rows: number) => Promise<{ ok: boolean; error?: string }>;
  kill: (id: string) => Promise<{ ok: boolean; error?: string }>;
  isRunning: (id: string) => Promise<{ ok: boolean; running?: boolean }>;
  onData: (callback: (id: string, data: string) => void) => () => void;
  onExit: (callback: (id: string, exitCode: number) => void) => () => void;
}

export interface WorkspaceFileInfo {
  name: string;
  path: string;
  size: number;
  modifiedAt: string;
}

export interface WorkspaceApi {
  importFile: (name: string, bytes: ArrayBuffer) => Promise<{ ok: boolean; file?: WorkspaceFileInfo; error?: string }>;
  list: () => Promise<{ ok: boolean; files?: WorkspaceFileInfo[]; workspaceDir?: string; error?: string }>;
  reveal: (filePath: string) => Promise<{ ok: boolean; error?: string }>;
}

export type BoardStatus = "stopped" | "starting" | "ready" | "error";

export interface BoardMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  completed: boolean;
  model?: string;
}

export interface BoardPermission {
  id: string;
  action: string;
  resources: string[];
}

export type PermissionReply = "once" | "always" | "reject";

export interface BoardApi {
  status: () => Promise<{ ok: boolean; status?: BoardStatus }>;
  prompt: (text: string) => Promise<{ ok: boolean; sessionId?: string; error?: string }>;
  /** Prompt AND wait for the board's reply text (voice conversation path). */
  ask: (text: string) => Promise<{ ok: boolean; reply?: string | null; error?: string }>;
  messages: () => Promise<{ ok: boolean; messages?: BoardMessage[]; error?: string }>;
  newSession: () => Promise<{ ok: boolean }>;
  permissions: () => Promise<{ ok: boolean; permissions?: BoardPermission[]; error?: string }>;
  replyPermission: (requestId: string, reply: PermissionReply) => Promise<{ ok: boolean; error?: string }>;
  onStatusChanged: (callback: (status: BoardStatus, detail: string | null) => void) => () => void;
}

export interface ClipboardApi {
  readText: () => Promise<{ ok: boolean; text?: string }>;
  writeText: (text: string) => Promise<{ ok: boolean; error?: string }>;
}

export type SpineSource = "codex" | "claude";

export interface SpineEventView {
  source: SpineSource;
  thread_id: string;
  turn_id: string;
  cwd: string;
  message: string;
  timestamp: string;
  /** Absolute path of the handoff note written for this turn, if any. */
  notePath?: string;
}

export interface PetSkin {
  name: string;
  displayName: string;
  cols: number;
  rows: number;
  frameWidth: number;
  frameHeight: number;
  idleRow: number;
  idleFrames: number;
  frameRateMs: number;
  scale: number;
  imageDataUrl: string;
}

export type CharliFocusTarget = "claude" | "codex" | "flux";

export interface CharliApi {
  status: () => Promise<{ ok: boolean; codex?: SpineEventView | null; claude?: SpineEventView | null }>;
  skin: () => Promise<{ ok: boolean; skin?: PetSkin; error?: string }>;
  focus: (target: CharliFocusTarget) => Promise<{ ok: boolean; detail?: string }>;
  /** Send the latest turn from `source` to the other brain (click-to-send). */
  sendHandoff: (source: SpineSource) => Promise<{ ok: boolean; detail?: string }>;
  onEvent: (callback: (event: SpineEventView) => void) => () => void;
}

export interface MissionControlApi {
  setWindowMode: (mode: Exclude<CockpitMode, "menu">) => Promise<{ ok: boolean; mode?: string }>;
  voice: {
    createSession: (options?: VoiceSessionCreateOptions) => Promise<VoiceSessionCreateResult>;
    appendTranscript: (sessionId: string, entry: TranscriptEntry) => Promise<{ ok: boolean; error?: string }>;
    logEvent: (entry: VoiceLogEvent) => Promise<{ ok: boolean; error?: string }>;
  };
  terminal: TerminalApi;
  clipboard: ClipboardApi;
  workspace: WorkspaceApi;
  board: BoardApi;
  charli: CharliApi;
}
