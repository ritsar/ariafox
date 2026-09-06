import type { Aria2File, Aria2Task } from "./types.js";

const UNITS = ["B", "KB", "MB", "GB", "TB"];

export function toNumber(value: string | number | undefined | null): number {
  if (value === undefined || value === null || value === "") return 0;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatBytes(value: string | number | undefined | null): string {
  let size = toNumber(value);
  if (size <= 0) return "0 B";
  let unit = 0;
  while (size >= 1024 && unit < UNITS.length - 1) {
    size /= 1024;
    unit += 1;
  }
  const digits = unit === 0 ? 0 : size >= 10 ? 1 : 2;
  return `${size.toFixed(digits)} ${UNITS[unit]}`;
}

export function formatSpeed(value: string | number | undefined | null): string {
  const bytes = toNumber(value);
  if (bytes <= 0) return "0 B/s";
  return `${formatBytes(bytes)}/s`;
}

export function percentComplete(task: Aria2Task): number {
  const total = toNumber(task.totalLength);
  if (total <= 0) return 0;
  return Math.min(100, (toNumber(task.completedLength) / total) * 100);
}

export function isSeeding(task: Aria2Task): boolean {
  if (task.status !== "active") return false;
  if (task.seeder === true || task.seeder === "true") return true;
  const torrent = Boolean(task.bittorrent || task.infoHash);
  return torrent && percentComplete(task) >= 100 && toNumber(task.totalLength) > 0;
}

export function displayStatus(task: Aria2Task): string {
  if (isSeeding(task)) return "seeding";
  return task.status;
}

export function formatEta(task: Aria2Task): string {
  const remaining = toNumber(task.totalLength) - toNumber(task.completedLength);
  const speed = toNumber(task.downloadSpeed);
  if (remaining <= 0) return "";
  if (speed <= 0) return "—";
  const seconds = Math.round(remaining / speed);
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

export function taskName(task: Aria2Task): string {
  const torrentName = task.bittorrent?.info?.name;
  if (torrentName) return torrentName;
  const selected = (task.files ?? []).find(
    (file) => file.selected !== "false" && file.path,
  );
  if (selected?.path) return basename(selected.path);
  const first = task.files?.[0];
  if (first?.path) return basename(first.path);
  const uri = first?.uris?.[0]?.uri;
  if (uri) return basename(uri.split("?")[0] ?? uri);
  return task.gid;
}

export function basename(path: string): string {
  const trimmed = path.replace(/\/+$/, "");
  const parts = trimmed.split(/[/\\]/);
  return parts[parts.length - 1] || trimmed;
}

export function extensionOf(name: string): string {
  const base = basename(name);
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return "";
  return base.slice(dot + 1).toLowerCase();
}

export function fileLabel(file: Aria2File): string {
  if (file.path) return file.path;
  return file.uris?.[0]?.uri ?? "";
}
