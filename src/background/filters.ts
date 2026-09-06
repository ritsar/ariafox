export type DownloadLike = {
  id: number;
  url: string;
  referrer?: string | null;
  filename?: string | null;
  mime?: string | null;
  fileSize?: number | null;
  totalBytes?: number | null;
  incognito?: boolean;
  byExtensionId?: string | null;
};

export type CaptureFilterSettings = {
  enabled: boolean;
  minSizeBytes: number | null;
  excludeUrlGlobs: string[];
  excludePageGlobs: string[];
  excludeExtensions: string[];
  excludeMimes: string[];
  capturePdf: boolean;
  capturePrivate: boolean;
};

const SKIP_SCHEMES = new Set([
  "blob:",
  "data:",
  "file:",
  "about:",
  "moz-extension:",
  "chrome:",
  "view-source:",
  "javascript:",
  "ws:",
  "wss:",
  "ext:",
]);

export function globToRegExp(glob: string): RegExp {
  const escaped = glob
    .trim()
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`, "i");
}

export function matchesGlob(value: string, glob: string): boolean {
  const trimmed = glob.trim();
  if (!trimmed) return false;
  try {
    return globToRegExp(trimmed).test(value);
  } catch {
    return value.toLowerCase().includes(trimmed.toLowerCase());
  }
}

export function extensionOfFilename(filename: string): string {
  const base = filename.split(/[/\\]/).pop() ?? filename;
  const clean = base.split("?")[0] ?? base;
  const dot = clean.lastIndexOf(".");
  if (dot <= 0) return "";
  return clean.slice(dot + 1).toLowerCase();
}

function knownSize(item: DownloadLike): number | null {
  if (typeof item.fileSize === "number" && item.fileSize > 0) return item.fileSize;
  if (typeof item.totalBytes === "number" && item.totalBytes > 0) {
    return item.totalBytes;
  }
  return null;
}

export function skipReason(
  item: DownloadLike,
  settings: CaptureFilterSettings,
  extensionId: string,
): string | null {
  if (!settings.enabled) return "capture-disabled";
  if (item.byExtensionId && item.byExtensionId === extensionId) {
    return "own-download";
  }
  if (item.incognito && !settings.capturePrivate) return "private";

  let url: URL;
  try {
    url = new URL(item.url);
  } catch {
    return "invalid-url";
  }
  const scheme = `${url.protocol}`;
  if (SKIP_SCHEMES.has(scheme)) return "scheme";
  if (scheme !== "http:" && scheme !== "https:") return "scheme";

  const filename = item.filename || url.pathname;
  const ext = extensionOfFilename(filename) || extensionOfFilename(url.pathname);
  const mime = (item.mime ?? "").toLowerCase();

  if (!settings.capturePdf && (ext === "pdf" || mime === "application/pdf")) {
    return "pdf";
  }
  if (ext && settings.excludeExtensions.includes(ext)) return "extension";
  if (mime && settings.excludeMimes.includes(mime)) return "mime";

  for (const glob of settings.excludeUrlGlobs) {
    if (matchesGlob(item.url, glob) || matchesGlob(url.hostname, glob)) {
      return "url-glob";
    }
  }
  const referrer = item.referrer ?? "";
  if (referrer) {
    for (const glob of settings.excludePageGlobs) {
      if (matchesGlob(referrer, glob)) return "referrer-glob";
    }
  }

  const size = knownSize(item);
  if (
    size !== null &&
    settings.minSizeBytes !== null &&
    size < settings.minSizeBytes
  ) {
    return "too-small";
  }

  return null;
}

export function isTorrent(item: DownloadLike): boolean {
  const mime = (item.mime ?? "").toLowerCase();
  const name = `${item.filename ?? ""} ${item.url}`;
  return (
    mime === "application/x-bittorrent" ||
    extensionOfFilename(item.filename ?? "") === "torrent" ||
    /\.torrent(\?|$)/i.test(name)
  );
}

export function isMetalink(item: DownloadLike): boolean {
  const mime = (item.mime ?? "").toLowerCase();
  const ext = extensionOfFilename(item.filename ?? item.url);
  return (
    mime === "application/metalink+xml" ||
    mime === "application/metalink4+xml" ||
    ext === "metalink" ||
    ext === "meta4"
  );
}

export function isMagnet(url: string): boolean {
  return url.toLowerCase().startsWith("magnet:");
}
