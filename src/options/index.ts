import { t } from "../shared/messages.js";
import { sendMessage } from "../shared/messaging.js";
import {
  activeProfile,
  isLoopbackHost,
  mergeSettings,
} from "../shared/settings.js";
import type { Settings } from "../shared/types.js";

const form = document.querySelector<HTMLFormElement>("#form")!;
const insecure = document.querySelector<HTMLElement>("#insecure")!;
const testResult = document.querySelector("#test-result")!;
const saveResult = document.querySelector("#save-result")!;
const capturePerm = document.querySelector<HTMLElement>("#capture-perm")!;
const captureEnabledEl = () =>
  (form.elements as unknown as Record<string, HTMLInputElement>).captureEnabled;

let settings: Settings | null = null;

function lines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function csv(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim().replace(/^\./, "").toLowerCase())
    .filter(Boolean);
}

function fill(next: Settings): void {
  settings = next;
  const profile = activeProfile(next);
  const named = form.elements as unknown as Record<string, HTMLInputElement>;
  named.name.value = profile.name;
  named.protocol.value = profile.protocol;
  named.host.value = profile.host;
  named.port.value = String(profile.port);
  named.path.value = profile.path;
  named.secret.value = profile.secret;
  named.captureEnabled.checked = next.capture.enabled;
  named.capturePdf.checked = next.capture.capturePdf;
  named.capturePrivate.checked = next.capture.capturePrivate;
  named.torrentUpload.checked = next.capture.torrentHandling === "upload";
  named.minSizeBytes.value = String(next.capture.minSizeBytes ?? 0);
  named.excludeExtensions.value = next.capture.excludeExtensions.join(", ");
  named.excludeUrlGlobs.value = next.capture.excludeUrlGlobs.join("\n");
  named.excludePageGlobs.value = next.capture.excludePageGlobs.join("\n");
  named.notifyCapture.checked = next.notifications.capture;
  named.notifyErrors.checked = next.notifications.rpcError;
  updateInsecure();
  void updateCapturePermNote(next.capture.enabled);
}

function readForm(): Settings {
  const named = form.elements as unknown as Record<string, HTMLInputElement>;
  const current = settings ?? mergeSettings(null);
  const profile = {
    ...activeProfile(current),
    name: named.name.value.trim() || "Local",
    protocol: named.protocol.value === "https" ? "https" as const : "http" as const,
    host: named.host.value.trim() || "127.0.0.1",
    port: Number(named.port.value) || 6800,
    path: named.path.value.trim().replace(/^\/+/, "") || "jsonrpc",
    secret: named.secret.value,
  };
  return {
    ...current,
    activeProfileId: profile.id,
    profiles: current.profiles.map((item) =>
      item.id === profile.id ? profile : item,
    ),
    capture: {
      ...current.capture,
      enabled: named.captureEnabled.checked,
      capturePdf: named.capturePdf.checked,
      capturePrivate: named.capturePrivate.checked,
      torrentHandling: named.torrentUpload.checked ? "upload" : "uri",
      minSizeBytes: named.minSizeBytes.value
        ? Number(named.minSizeBytes.value)
        : null,
      excludeExtensions: csv(named.excludeExtensions.value),
      excludeUrlGlobs: lines(named.excludeUrlGlobs.value),
      excludePageGlobs: lines(named.excludePageGlobs.value),
    },
    notifications: {
      capture: named.notifyCapture.checked,
      rpcError: named.notifyErrors.checked,
    },
  };
}

function updateInsecure(): void {
  const named = form.elements as unknown as Record<string, HTMLInputElement>;
  const show =
    named.protocol.value === "http" && !isLoopbackHost(named.host.value.trim());
  insecure.hidden = !show;
  insecure.textContent = t("insecureRpc");
}

function captureOrigins(): string[] {
  return ["<all_urls>"];
}

function rpcOrigins(next: Settings): string[] {
  const profile = activeProfile(next);
  if (isLoopbackHost(profile.host)) return [];
  return [`${profile.protocol}://${profile.host}:${profile.port}/*`];
}

async function hasSiteAccess(): Promise<boolean> {
  return browser.permissions.contains({ origins: captureOrigins() });
}

async function requestPermissions(
  next: Settings,
  includeSites: boolean,
): Promise<boolean> {
  const origins = [
    ...rpcOrigins(next),
    ...(includeSites ? captureOrigins() : []),
  ];
  if (origins.length === 0) return true;
  try {
    return await browser.permissions.request({ origins });
  } catch (error) {
    console.warn("AriaFox permission request failed", error);
    return false;
  }
}

async function updateCapturePermNote(captureOn: boolean): Promise<void> {
  if (!captureOn) {
    capturePerm.textContent = t("captureCookiesHint");
    return;
  }
  capturePerm.textContent = (await hasSiteAccess())
    ? t("captureSitesGranted")
    : t("captureSitesDenied");
}

form.addEventListener("input", () => updateInsecure());

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const next = readForm();
  void (async () => {
    const granted = await requestPermissions(next, next.capture.enabled);
    if (next.capture.enabled && !granted) {
      captureEnabledEl().checked = false;
      next.capture.enabled = false;
    }
    await sendMessage({ type: "saveSettings", settings: next });
    settings = next;
    saveResult.textContent = t("saved");
    await updateCapturePermNote(next.capture.enabled);
  })().catch((error: unknown) => {
    saveResult.textContent = error instanceof Error ? error.message : String(error);
  });
});

captureEnabledEl().addEventListener("change", () => {
  const next = readForm();
  void (async () => {
    if (next.capture.enabled) {
      const granted = await requestPermissions(next, true);
      if (!granted) {
        captureEnabledEl().checked = false;
        next.capture.enabled = false;
      }
    }
    await sendMessage({ type: "saveSettings", settings: next });
    settings = next;
    await updateCapturePermNote(next.capture.enabled);
  })().catch((error: unknown) => {
    captureEnabledEl().checked = false;
    capturePerm.textContent =
      error instanceof Error ? error.message : String(error);
  });
});

document.querySelector("#test")!.addEventListener("click", () => {
  const next = readForm();
  testResult.textContent = "…";
  void (async () => {
    await sendMessage({ type: "saveSettings", settings: next });
    const result = await sendMessage<{ version: string }>({
      type: "testConnection",
    });
    testResult.textContent = t("connectionOkNext", { version: result.version });
  })().catch((error: unknown) => {
    testResult.textContent = error instanceof Error ? error.message : String(error);
  });
});

void sendMessage<Settings>({ type: "getSettings" }).then(fill);
