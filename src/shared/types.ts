export const TASK_KEYS = [
  "gid",
  "status",
  "totalLength",
  "completedLength",
  "uploadLength",
  "downloadSpeed",
  "uploadSpeed",
  "files",
  "bittorrent",
  "errorCode",
  "errorMessage",
  "dir",
  "connections",
  "numSeeders",
  "infoHash",
  "seeder",
] as const;

export type TaskStatus =
  | "active"
  | "waiting"
  | "paused"
  | "error"
  | "complete"
  | "removed";

export type Aria2FileUri = {
  uri: string;
  status?: string;
};

export type Aria2File = {
  index?: string;
  path?: string;
  length?: string;
  completedLength?: string;
  selected?: string;
  uris?: Aria2FileUri[];
};

export type Aria2Bittorrent = {
  info?: { name?: string };
  mode?: string;
};

export type Aria2Task = {
  gid: string;
  status: TaskStatus;
  totalLength?: string;
  completedLength?: string;
  uploadLength?: string;
  downloadSpeed?: string;
  uploadSpeed?: string;
  files?: Aria2File[];
  bittorrent?: Aria2Bittorrent;
  errorCode?: string;
  errorMessage?: string;
  dir?: string;
  connections?: string;
  numSeeders?: string;
  infoHash?: string;
  seeder?: string | boolean;
};

export type Aria2GlobalStat = {
  downloadSpeed: string;
  uploadSpeed: string;
  numActive: string;
  numWaiting: string;
  numStopped: string;
  numStoppedTotal?: string;
};

export type Aria2Version = {
  version: string;
  enabledFeatures: string[];
};

export type QueueName = "active" | "waiting" | "stopped";

export type Snapshot = {
  connected: boolean;
  error: string | null;
  version: string | null;
  captureEnabled: boolean;
  stat: Aria2GlobalStat | null;
  tasks: Record<QueueName, Aria2Task[]>;
};

export type RpcProfile = {
  id: string;
  name: string;
  protocol: "http" | "https";
  host: string;
  port: number;
  path: string;
  secret: string;
};

export type CaptureSettings = {
  enabled: boolean;
  minSizeBytes: number | null;
  excludeUrlGlobs: string[];
  excludePageGlobs: string[];
  excludeExtensions: string[];
  excludeMimes: string[];
  capturePdf: boolean;
  capturePrivate: boolean;
  torrentHandling: "uri" | "upload";
};

export type Settings = {
  activeProfileId: string;
  profiles: RpcProfile[];
  capture: CaptureSettings;
  notifications: { capture: boolean; rpcError: boolean };
  pollMsVisible: number;
  pollMsBackground: number;
};

export type ExtensionMessage =
  | { type: "getSettings" }
  | { type: "saveSettings"; settings: Settings }
  | { type: "testConnection" }
  | { type: "getSnapshot" }
  | { type: "toggleCapture" }
  | { type: "pause"; gid: string }
  | { type: "unpause"; gid: string }
  | { type: "remove"; gid: string; queue: QueueName }
  | { type: "pauseAll" }
  | { type: "unpauseAll" }
  | { type: "purgeStopped" }
  | { type: "addUris"; uris: string[]; options?: Record<string, string | string[]> }
  | { type: "addTorrent"; data: string }
  | { type: "retry"; gid: string }
  | { type: "tellStatus"; gid: string }
  | { type: "openManager"; hash?: string };

export type ExtensionResponse<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };
