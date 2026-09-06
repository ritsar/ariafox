import { t } from "../shared/messages.js";
import { sendMessage } from "../shared/messaging.js";
import {
  DEFAULT_PROFILE,
  MAX_PROFILES,
  isLoopbackHost,
  mergeSettings,
  newProfile,
} from "../shared/settings.js";
import type { RpcProfile, Settings } from "../shared/types.js";

const form = document.querySelector<HTMLFormElement>("#form")!;
const serversEl = document.querySelector("#servers")!;
const addServerBtn = document.querySelector<HTMLButtonElement>("#add-server")!;
const addServerNote = document.querySelector("#add-server-note")!;
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

function field(
  card: Element,
  name: string,
): HTMLInputElement | HTMLSelectElement {
  return card.querySelector(`[data-field="${name}"]`) as
    | HTMLInputElement
    | HTMLSelectElement;
}

function readCard(card: Element): RpcProfile {
  const protocol = field(card, "protocol").value === "https" ? "https" : "http";
  return {
    id: (card as HTMLElement).dataset.id || crypto.randomUUID(),
    name: field(card, "name").value.trim() || "Server",
    protocol,
    host: field(card, "host").value.trim() || "127.0.0.1",
    port: Number(field(card, "port").value) || 6800,
    path: field(card, "path").value.trim().replace(/^\/+/, "") || "jsonrpc",
    secret: field(card, "secret").value,
  };
}

function readServers(): RpcProfile[] {
  return [...serversEl.querySelectorAll(".server-card")].map(readCard).slice(0, MAX_PROFILES);
}

function updateCardWarnings(card: Element): void {
  const warn = card.querySelector<HTMLElement>(".insecure")!;
  const protocol = field(card, "protocol").value;
  const host = field(card, "host").value.trim();
  const show = protocol === "http" && !isLoopbackHost(host);
  warn.hidden = !show;
  warn.textContent = t("insecureRpc");
}

function renderCard(profile: RpcProfile): string {
  const selectedHttp = profile.protocol === "http" ? "selected" : "";
  const selectedHttps = profile.protocol === "https" ? "selected" : "";
  return `<article class="server-card" data-id="${profile.id}">
    <div class="server-card-head">
      <strong>${profile.name || profile.host}</strong>
      <button class="btn" type="button" data-action="remove-server">${t("removeServer")}</button>
    </div>
    <div class="grid">
      <label>Name <input data-field="name" type="text" value="${escapeAttr(profile.name)}" /></label>
      <label>Protocol
        <select data-field="protocol">
          <option value="http" ${selectedHttp}>http</option>
          <option value="https" ${selectedHttps}>https</option>
        </select>
      </label>
      <label>Host <input data-field="host" type="text" value="${escapeAttr(profile.host)}" /></label>
      <label>Port <input data-field="port" type="number" min="1" max="65535" value="${profile.port}" /></label>
      <label>RPC path <input data-field="path" type="text" value="${escapeAttr(profile.path)}" /></label>
      <label>Secret <input data-field="secret" type="password" autocomplete="off" value="${escapeAttr(profile.secret)}" /></label>
    </div>
    <p class="warn insecure" hidden></p>
    <div class="row">
      <button class="btn" type="button" data-action="test-server">${t("testConnection")}</button>
      <span class="test-result muted"></span>
    </div>
  </article>`;
}

function escapeAttr(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;");
}

function renderServers(profiles: RpcProfile[]): void {
  serversEl.innerHTML = profiles.map(renderCard).join("");
  for (const card of serversEl.querySelectorAll(".server-card")) {
    updateCardWarnings(card);
  }
  addServerBtn.disabled = profiles.length >= MAX_PROFILES;
  addServerNote.textContent =
    profiles.length >= MAX_PROFILES ? t("maxServers") : "";
}

function fill(next: Settings): void {
  settings = next;
  const named = form.elements as unknown as Record<string, HTMLInputElement>;
  renderServers(next.profiles);
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
  void updateCapturePermNote(next.capture.enabled);
}

function readForm(): Settings {
  const named = form.elements as unknown as Record<string, HTMLInputElement>;
  const current = settings ?? mergeSettings(null);
  const profiles = readServers();
  const activeStillThere = profiles.some(
    (profile) => profile.id === current.activeProfileId,
  );
  return {
    ...current,
    activeProfileId: activeStillThere
      ? current.activeProfileId
      : profiles[0]?.id ?? DEFAULT_PROFILE.id,
    profiles: profiles.length > 0 ? profiles : [structuredClone(DEFAULT_PROFILE)],
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

function rpcOrigins(next: Settings): string[] {
  const origins = new Set<string>();
  for (const profile of next.profiles) {
    if (!isLoopbackHost(profile.host)) {
      origins.add(`${profile.protocol}://${profile.host}:${profile.port}/*`);
    }
  }
  return [...origins];
}

async function hasSiteAccess(): Promise<boolean> {
  return browser.permissions.contains({ origins: ["<all_urls>"] });
}

async function requestPermissions(
  next: Settings,
  includeSites: boolean,
): Promise<boolean> {
  const origins = [
    ...rpcOrigins(next),
    ...(includeSites ? ["<all_urls>"] : []),
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

async function persist(next: Settings): Promise<void> {
  const granted = await requestPermissions(next, next.capture.enabled);
  if (next.capture.enabled && !granted && !(await hasSiteAccess())) {
    captureEnabledEl().checked = false;
    next.capture.enabled = false;
  }
  await sendMessage({ type: "saveSettings", settings: next });
  settings = next;
  await updateCapturePermNote(next.capture.enabled);
}

form.addEventListener("input", (event) => {
  const card = (event.target as HTMLElement).closest(".server-card");
  if (card) updateCardWarnings(card);
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const next = readForm();
  void persist(next)
    .then(() => {
      saveResult.textContent = t("saved");
    })
    .catch((error: unknown) => {
      saveResult.textContent = error instanceof Error ? error.message : String(error);
    });
});

captureEnabledEl().addEventListener("change", () => {
  const next = readForm();
  void persist(next).catch((error: unknown) => {
    captureEnabledEl().checked = false;
    capturePerm.textContent =
      error instanceof Error ? error.message : String(error);
  });
});

addServerBtn.addEventListener("click", () => {
  const profiles = readServers();
  if (profiles.length >= MAX_PROFILES) return;
  profiles.push(newProfile(profiles.length + 1));
  renderServers(profiles);
});

serversEl.addEventListener("click", (event) => {
  const target = event.target as HTMLElement;
  const action = target.closest<HTMLElement>("[data-action]")?.dataset.action;
  const card = target.closest(".server-card");
  if (!action || !card) return;
  if (action === "remove-server") {
    const profiles = readServers().filter(
      (profile) => profile.id !== (card as HTMLElement).dataset.id,
    );
    if (profiles.length === 0) return;
    renderServers(profiles);
    return;
  }
  if (action === "test-server") {
    const result = card.querySelector(".test-result")!;
    result.textContent = "…";
    const profile = readCard(card);
    void sendMessage<{ version: string }>({ type: "testConnection", profile })
      .then((data) => {
        result.textContent = t("connectionOk", { version: data.version });
      })
      .catch((error: unknown) => {
        result.textContent = error instanceof Error ? error.message : String(error);
      });
  }
});

void sendMessage<Settings>({ type: "getSettings" }).then(fill);
