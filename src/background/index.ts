import { updateBadge } from "./badge.js";
import { aria2OptionsFromPage, handleCreatedDownload } from "./capture.js";
import { createContextMenus, registerMenuClickHandler } from "./menus.js";
import { RpcError, clientFrom } from "./rpc.js";
import {
  DEFAULT_SETTINGS,
  loadSettings,
  profileSummaries,
  saveSettings,
} from "../shared/settings.js";
import type {
  ExtensionMessage,
  ExtensionResponse,
  RpcProfile,
  Settings,
  Snapshot,
} from "../shared/types.js";

let settings: Settings = structuredClone(DEFAULT_SETTINGS);
let client = clientFrom(settings);
const uiPorts = new Set<browser.runtime.Port>();
let pollTimer: ReturnType<typeof setInterval> | null = null;
let lastSnapshot: Snapshot = emptySnapshot();

function emptySnapshot(): Snapshot {
  return {
    connected: false,
    error: null,
    version: null,
    captureEnabled: settings.capture.enabled,
    stat: null,
    tasks: { active: [], waiting: [], stopped: [] },
    activeProfileId: settings.activeProfileId,
    profiles: profileSummaries(settings),
  };
}

async function refreshSettings(): Promise<void> {
  settings = await loadSettings();
  client = clientFrom(settings);
}

async function refreshSnapshot(): Promise<Snapshot> {
  lastSnapshot = {
    ...emptySnapshot(),
    captureEnabled: settings.capture.enabled,
  };
  try {
    const data = await client.snapshot();
    lastSnapshot = {
      connected: true,
      error: null,
      version: data.version,
      captureEnabled: settings.capture.enabled,
      stat: data.stat,
      tasks: data.tasks,
      activeProfileId: settings.activeProfileId,
      profiles: profileSummaries(settings),
    };
  } catch (error) {
    lastSnapshot.error = error instanceof Error ? error.message : String(error);
  }
  await updateBadge(lastSnapshot);
  return lastSnapshot;
}

function broadcast(): void {
  for (const port of uiPorts) {
    try {
      port.postMessage({ type: "snapshot", data: lastSnapshot });
    } catch {
      uiPorts.delete(port);
    }
  }
}

function pollDelay(): number | null {
  if (uiPorts.size > 0) return settings.pollMsVisible;
  if (settings.capture.enabled) return settings.pollMsBackground;
  return null;
}

function restartPoll(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  const delay = pollDelay();
  if (delay === null) return;
  pollTimer = setInterval(() => {
    void refreshSnapshot().then(broadcast);
  }, delay);
  void refreshSnapshot().then(broadcast);
}

async function openManager(hash = ""): Promise<void> {
  const base = browser.runtime.getURL("manager/index.html");
  const existing = await browser.tabs.query({ url: `${base}*` });
  if (existing[0]?.id) {
    await browser.tabs.update(existing[0].id, {
      active: true,
      url: hash ? `${base}${hash}` : undefined,
    });
    if (existing[0].windowId !== undefined) {
      await browser.windows.update(existing[0].windowId, { focused: true });
    }
    return;
  }
  await browser.tabs.create({ url: `${base}${hash}` });
}

async function sendUrls(uris: string[], referrer?: string): Promise<void> {
  const options = aria2OptionsFromPage(referrer);
  try {
    const cookie = uris[0]
      ? await browser.cookies.getAll({ url: uris[0] })
      : [];
    if (cookie.length > 0) {
      const headers = Array.isArray(options.header) ? options.header : [];
      options.header = [
        `Cookie: ${cookie.map((c) => `${c.name}=${c.value}`).join("; ")}`,
        ...headers,
      ];
    }
  } catch {
    /* missing host permission */
  }
  await client.addUri(uris, options);
  await refreshSnapshot().then(broadcast);
}

function clientFor(profile: RpcProfile) {
  const profiles = settings.profiles.some((item) => item.id === profile.id)
    ? settings.profiles.map((item) => (item.id === profile.id ? profile : item))
    : [...settings.profiles, profile];
  return clientFrom({
    ...settings,
    activeProfileId: profile.id,
    profiles,
  });
}

async function retryTask(gid: string): Promise<void> {
  const status = await client.tellStatus(gid);
  const uris = (status.files ?? []).flatMap((file) =>
    (file.uris ?? []).map((entry) => entry.uri).filter(Boolean),
  );
  if (uris.length === 0) {
    throw new RpcError("No URIs to retry");
  }
  await client.addUri(uris);
}

async function removeTask(
  gid: string,
  queue: "active" | "waiting" | "stopped",
): Promise<void> {
  if (queue === "stopped") {
    await client.removeDownloadResult(gid);
    return;
  }
  try {
    await client.remove(gid);
  } catch {
    await client.forceRemove(gid);
  }
}

async function handleMessage(
  message: ExtensionMessage,
): Promise<unknown> {
  switch (message.type) {
    case "getSettings":
      return settings;
    case "saveSettings":
      await saveSettings(message.settings);
      await refreshSettings();
      restartPoll();
      return settings;
    case "testConnection": {
      const rpc = message.profile ? clientFor(message.profile) : client;
      const version = await rpc.getVersion();
      const stat = await rpc.getGlobalStat();
      return { version: version.version, stat };
    }
    case "getSnapshot":
      return refreshSnapshot();
    case "toggleCapture":
      settings = {
        ...settings,
        capture: { ...settings.capture, enabled: !settings.capture.enabled },
      };
      await saveSettings(settings);
      restartPoll();
      await refreshSnapshot().then(broadcast);
      return settings.capture.enabled;
    case "setActiveProfile": {
      if (!settings.profiles.some((profile) => profile.id === message.id)) {
        throw new RpcError("Unknown server");
      }
      settings = { ...settings, activeProfileId: message.id };
      await saveSettings(settings);
      await refreshSettings();
      restartPoll();
      return settings.activeProfileId;
    }
    case "pause":
      await client.pause(message.gid);
      return refreshSnapshot();
    case "unpause":
      await client.unpause(message.gid);
      return refreshSnapshot();
    case "remove":
      await removeTask(message.gid, message.queue);
      return refreshSnapshot();
    case "stopSeeding":
      await client.pause(message.gid);
      return refreshSnapshot();
    case "selectFiles": {
      if (message.indexes.length === 0) {
        throw new RpcError("Select at least one file");
      }
      await client.changeOption(message.gid, {
        "select-file": message.indexes.join(","),
      });
      return refreshSnapshot();
    }
    case "pauseAll":
      await client.pauseAll();
      return refreshSnapshot();
    case "unpauseAll":
      await client.unpauseAll();
      return refreshSnapshot();
    case "purgeStopped":
      await client.purgeDownloadResult();
      return refreshSnapshot();
    case "addUris":
      await client.addUri(message.uris, message.options ?? {});
      return refreshSnapshot();
    case "addTorrent":
      await client.addTorrent(message.data);
      return refreshSnapshot();
    case "retry":
      await retryTask(message.gid);
      return refreshSnapshot();
    case "tellStatus":
      return client.tellStatus(message.gid);
    case "getGlobalOption": {
      const rpc = message.profile ? clientFor(message.profile) : client;
      return rpc.getGlobalOption();
    }
    case "changeGlobalOption": {
      const rpc = message.profile ? clientFor(message.profile) : client;
      await rpc.changeGlobalOption(message.options);
      if (!message.profile || message.profile.id === settings.activeProfileId) {
        return refreshSnapshot();
      }
      return rpc.getGlobalOption();
    }
    case "openManager":
      await openManager(message.hash ?? "");
      return null;
  }
}

function wrapResponse(run: () => Promise<unknown>): Promise<ExtensionResponse> {
  return run()
    .then((data) => ({ ok: true as const, data }))
    .catch((error: unknown) => ({
      ok: false as const,
      error: error instanceof Error ? error.message : String(error),
    }));
}

browser.runtime.onInstalled.addListener((details) => {
  createContextMenus();
  if (details.reason === "install") {
    void browser.runtime.openOptionsPage();
  }
});
browser.runtime.onStartup.addListener(() => createContextMenus());
createContextMenus();
registerMenuClickHandler(async (urls, referrer) => {
  try {
    await sendUrls(urls, referrer);
  } catch (error) {
    console.warn("AriaFox menu send failed", error);
  }
});

browser.runtime.onConnect.addListener((port) => {
  if (port.name !== "ui") return;
  uiPorts.add(port);
  port.postMessage({ type: "snapshot", data: lastSnapshot });
  restartPoll();
  port.onDisconnect.addListener(() => {
    uiPorts.delete(port);
    restartPoll();
  });
});

browser.runtime.onMessage.addListener(
  (message: ExtensionMessage): Promise<ExtensionResponse> =>
    wrapResponse(() => handleMessage(message)),
);

browser.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes.settings) return;
  void refreshSettings().then(() => {
    restartPoll();
  });
});

browser.downloads.onCreated.addListener((item) => {
  void handleCreatedDownload(
    item,
    settings,
    client,
    browser.runtime.id,
  ).then((result) => {
    if (result === "captured") void refreshSnapshot().then(broadcast);
  });
});

browser.commands?.onCommand.addListener((command) => {
  if (command === "toggle-capture") {
    void handleMessage({ type: "toggleCapture" });
  }
  if (command === "open-manager") {
    void openManager();
  }
});

void refreshSettings().then(() => {
  restartPoll();
});
