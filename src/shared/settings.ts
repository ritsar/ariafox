import type { CaptureSettings, RpcProfile, Settings } from "./types.js";

export const DEFAULT_PROFILE_ID = "default";

export const DEFAULT_PROFILE: RpcProfile = {
  id: DEFAULT_PROFILE_ID,
  name: "Local",
  protocol: "http",
  host: "127.0.0.1",
  port: 6800,
  path: "jsonrpc",
  secret: "",
};

export const DEFAULT_CAPTURE: CaptureSettings = {
  enabled: false,
  minSizeBytes: 1024,
  excludeUrlGlobs: [],
  excludePageGlobs: [],
  excludeExtensions: ["htm", "html", "php", "asp", "aspx", "mhtml", "shtml"],
  excludeMimes: ["text/html", "application/xhtml+xml"],
  capturePdf: false,
  capturePrivate: false,
  torrentHandling: "upload",
};

export const DEFAULT_SETTINGS: Settings = {
  activeProfileId: DEFAULT_PROFILE_ID,
  profiles: [DEFAULT_PROFILE],
  capture: DEFAULT_CAPTURE,
  notifications: { capture: false, rpcError: true },
  pollMsVisible: 1000,
  pollMsBackground: 5000,
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function mergeProfile(raw: unknown, fallback: RpcProfile): RpcProfile {
  if (!isObject(raw)) return { ...fallback };
  return {
    id: typeof raw.id === "string" ? raw.id : fallback.id,
    name: typeof raw.name === "string" ? raw.name : fallback.name,
    protocol: raw.protocol === "https" ? "https" : "http",
    host: typeof raw.host === "string" ? raw.host : fallback.host,
    port: typeof raw.port === "number" ? raw.port : fallback.port,
    path: typeof raw.path === "string" ? raw.path : fallback.path,
    secret: typeof raw.secret === "string" ? raw.secret : fallback.secret,
  };
}

export function mergeSettings(raw: unknown): Settings {
  if (!isObject(raw)) return structuredClone(DEFAULT_SETTINGS);
  const profiles = Array.isArray(raw.profiles)
    ? raw.profiles.map((item, index) =>
        mergeProfile(item, {
          ...DEFAULT_PROFILE,
          id: `profile-${index}`,
          name: `Profile ${index + 1}`,
        }),
      )
    : structuredClone(DEFAULT_SETTINGS.profiles);
  const captureRaw = isObject(raw.capture) ? raw.capture : {};
  const notificationsRaw = isObject(raw.notifications) ? raw.notifications : {};
  const activeProfileId =
    typeof raw.activeProfileId === "string" &&
    profiles.some((profile) => profile.id === raw.activeProfileId)
      ? raw.activeProfileId
      : profiles[0]?.id ?? DEFAULT_PROFILE_ID;

  return {
    activeProfileId,
    profiles: profiles.length > 0 ? profiles : structuredClone(DEFAULT_SETTINGS.profiles),
    capture: {
      enabled: Boolean(captureRaw.enabled),
      minSizeBytes:
        typeof captureRaw.minSizeBytes === "number" || captureRaw.minSizeBytes === null
          ? (captureRaw.minSizeBytes as number | null)
          : DEFAULT_CAPTURE.minSizeBytes,
      excludeUrlGlobs: Array.isArray(captureRaw.excludeUrlGlobs)
        ? captureRaw.excludeUrlGlobs.filter((item) => typeof item === "string")
        : DEFAULT_CAPTURE.excludeUrlGlobs,
      excludePageGlobs: Array.isArray(captureRaw.excludePageGlobs)
        ? captureRaw.excludePageGlobs.filter((item) => typeof item === "string")
        : DEFAULT_CAPTURE.excludePageGlobs,
      excludeExtensions: Array.isArray(captureRaw.excludeExtensions)
        ? captureRaw.excludeExtensions.filter((item) => typeof item === "string")
        : DEFAULT_CAPTURE.excludeExtensions,
      excludeMimes: Array.isArray(captureRaw.excludeMimes)
        ? captureRaw.excludeMimes.filter((item) => typeof item === "string")
        : DEFAULT_CAPTURE.excludeMimes,
      capturePdf: Boolean(captureRaw.capturePdf),
      capturePrivate: Boolean(captureRaw.capturePrivate),
      torrentHandling:
        captureRaw.torrentHandling === "uri" ? "uri" : "upload",
    },
    notifications: {
      capture: Boolean(notificationsRaw.capture),
      rpcError:
        typeof notificationsRaw.rpcError === "boolean"
          ? notificationsRaw.rpcError
          : true,
    },
    pollMsVisible:
      typeof raw.pollMsVisible === "number"
        ? raw.pollMsVisible
        : DEFAULT_SETTINGS.pollMsVisible,
    pollMsBackground:
      typeof raw.pollMsBackground === "number"
        ? raw.pollMsBackground
        : DEFAULT_SETTINGS.pollMsBackground,
  };
}

export function activeProfile(settings: Settings): RpcProfile {
  return (
    settings.profiles.find((profile) => profile.id === settings.activeProfileId) ??
    settings.profiles[0] ??
    DEFAULT_PROFILE
  );
}

export function rpcHttpUrl(profile: RpcProfile): string {
  const path = profile.path.replace(/^\/+/, "");
  return `${profile.protocol}://${profile.host}:${profile.port}/${path}`;
}

export function isLoopbackHost(host: string): boolean {
  const normalized = host.toLowerCase().replace(/^\[|\]$/g, "");
  return (
    normalized === "127.0.0.1" ||
    normalized === "localhost" ||
    normalized === "::1" ||
    normalized === "0:0:0:0:0:0:0:1"
  );
}

export async function loadSettings(): Promise<Settings> {
  const stored = await browser.storage.local.get("settings");
  return mergeSettings(stored.settings);
}

export async function saveSettings(settings: Settings): Promise<void> {
  await browser.storage.local.set({ settings });
}
