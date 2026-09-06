import {
  displayStatus,
  fileLabel,
  formatBytes,
  formatEta,
  formatRatio,
  formatSpeed,
  isSeeding,
  isTorrentTask,
  percentComplete,
  taskName,
  toNumber,
} from "../shared/format.js";
import { t } from "../shared/messages.js";
import { connectUi, sendMessage } from "../shared/messaging.js";
import type { Aria2Task, QueueName, Snapshot } from "../shared/types.js";

const listEl = document.querySelector("#list")!;
const detailEl = document.querySelector<HTMLElement>("#detail")!;
const layoutEl = document.querySelector(".layout")!;
const serverEl = document.querySelector<HTMLSelectElement>("#server")!;
const speedsEl = document.querySelector("#speeds")!;
const dialog = document.querySelector<HTMLDialogElement>("#add-dialog")!;
const addError = document.querySelector<HTMLElement>("#add-error")!;
const addUrls = document.querySelector<HTMLTextAreaElement>("#add-urls")!;
const addOut = document.querySelector<HTMLInputElement>("#add-out")!;
const addTorrent = document.querySelector<HTMLInputElement>("#add-torrent")!;

let snapshot: Snapshot | null = null;
let queue: QueueName = "active";
let selectedGid: string | null = null;

const ICON_PAUSE =
  '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M7 5h3v14H7V5zm7 0h3v14h-3V5z"/></svg>';
const ICON_PLAY =
  '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M8 5v14l11-7L8 5z"/></svg>';
const ICON_STOP =
  '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M7 7h10v10H7V7z"/></svg>';
const ICON_REMOVE =
  '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 6h2v9h-2V9zm4 0h2v9h-2V9zM6 8h12l-1 12H7L6 8z"/></svg>';
const ICON_RETRY =
  '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M12 6V3L8 7l4 4V8c2.76 0 5 2.24 5 5a5 5 0 0 1-8.9 3.1L6.68 17.5A7 7 0 0 0 19 13c0-3.87-3.13-7-7-7z"/></svg>';

function iconBtn(action: string, gid: string, label: string, svg: string): string {
  return `<button class="icon-btn" data-action="${action}" data-gid="${gid}" type="button" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${svg}</button>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function currentTasks(): Aria2Task[] {
  return snapshot?.tasks[queue] ?? [];
}

function renderServerSelect(): void {
  const profiles = snapshot?.profiles ?? [];
  const activeId = snapshot?.activeProfileId ?? "";
  const active = profiles.find((profile) => profile.id === activeId);
  serverEl.className = `server-select ${snapshot?.connected ? "ok" : "bad"}`;
  const status = snapshot?.connected
    ? snapshot.version
      ? `aria2 ${snapshot.version}`
      : t("connected")
    : snapshot?.error || t("disconnected");
  serverEl.title = active ? `${active.name} · ${active.url} · ${status}` : status;
  const current = serverEl.value;
  serverEl.innerHTML = profiles
    .map((profile) => {
      const name = profile.name.trim() || "Server";
      return `<option value="${escapeHtml(profile.id)}">${escapeHtml(name)}</option>`;
    })
    .join("");
  if (profiles.some((profile) => profile.id === activeId)) {
    serverEl.value = activeId;
  } else if (profiles.some((profile) => profile.id === current)) {
    serverEl.value = current;
  }
  speedsEl.textContent = snapshot?.stat
    ? `↓ ${formatSpeed(snapshot.stat.downloadSpeed)}   ↑ ${formatSpeed(snapshot.stat.uploadSpeed)}`
    : "";
}

function renderTabs(): void {
  const counts = {
    active: snapshot?.tasks.active.length ?? 0,
    waiting: snapshot?.tasks.waiting.length ?? 0,
    stopped: snapshot?.tasks.stopped.length ?? 0,
  };
  for (const button of document.querySelectorAll<HTMLButtonElement>("#tabs button")) {
    const name = button.dataset.queue as QueueName;
    button.classList.toggle("on", name === queue);
    const label =
      name === "active"
        ? t("queueActive")
        : name === "waiting"
          ? t("queueWaiting")
          : t("queueStopped");
    button.textContent = `${label} ${counts[name]}`;
  }
}

function renderList(): void {
  const tasks = currentTasks();
  if (!snapshot?.connected) {
    listEl.innerHTML = `<div class="empty"><h2>${t("notConnectedTitle")}</h2><p>${t("notConnectedBody")}</p></div>`;
    return;
  }
  if (tasks.length === 0) {
    const empty =
      queue === "active"
        ? t("emptyActive")
        : queue === "waiting"
          ? t("emptyWaiting")
          : t("emptyStopped");
    const extra =
      queue === "stopped"
        ? ""
        : `<p><button class="btn btn-primary" data-action="open-add" type="button">${t("addTask")}</button></p>`;
    listEl.innerHTML = `<div class="empty"><h2>${empty}</h2>${extra}</div>`;
    return;
  }

  listEl.innerHTML = tasks
    .map((task) => {
      const pct = percentComplete(task);
      const size =
        toNumber(task.totalLength) > 0
          ? `${formatBytes(task.completedLength)} / ${formatBytes(task.totalLength)}`
          : formatBytes(task.completedLength);
      const seeding = isSeeding(task);
      const statusLabel = seeding ? t("seeding") : displayStatus(task);
      const paused = task.status === "paused";
      const pauseLabel = paused ? t("resume") : t("pause");
      const pauseAction = paused ? "unpause" : "pause";
      const showPause = queue !== "stopped";
      const speedBits = seeding
        ? `<span>↑ ${formatSpeed(task.uploadSpeed)}</span><span>${t("ratio")} ${formatRatio(task)}</span>`
        : `<span>↓ ${formatSpeed(task.downloadSpeed)}</span><span>${formatEta(task)}</span>`;
      const torrentPause = seeding
        ? iconBtn("stop-seeding", task.gid, t("stopSeeding"), ICON_STOP)
        : showPause
          ? iconBtn(pauseAction, task.gid, pauseLabel, paused ? ICON_PLAY : ICON_PAUSE)
          : "";
      return `<article class="task${task.gid === selectedGid ? " selected" : ""}${seeding ? " is-seeding" : ""}" data-gid="${task.gid}">
        <div>
          <div class="name">${escapeHtml(taskName(task))}</div>
          <div class="progress${seeding ? " seeding" : ""}" style="margin:6px 0"><span style="width:${pct.toFixed(1)}%"></span></div>
          <div class="meta">
            <span>${pct.toFixed(1)}%</span>
            <span>${size}</span>
            ${speedBits}
          </div>
        </div>
        <div class="muted status-text${seeding ? " seeding" : ""}">${escapeHtml(statusLabel)}</div>
        <div class="task-actions">
          ${torrentPause}
          ${queue === "stopped" ? iconBtn("retry", task.gid, t("retry"), ICON_RETRY) : ""}
          ${iconBtn("remove", task.gid, t("remove"), ICON_REMOVE)}
        </div>
      </article>`;
    })
    .join("");

  if (queue === "stopped" && tasks.length > 0) {
    listEl.insertAdjacentHTML(
      "beforeend",
      `<div style="padding:10px 14px;text-align:right">
        <button class="btn" data-action="purge" type="button">${t("clearStopped")}</button>
      </div>`,
    );
  }
}

function renderDetail(): void {
  const task = currentTasks().find((item) => item.gid === selectedGid);
  if (!task) {
    selectedGid = null;
    detailEl.hidden = true;
    layoutEl.classList.add("no-detail");
    return;
  }
  layoutEl.classList.remove("no-detail");
  detailEl.hidden = false;
  const torrent = isTorrentTask(task);
  const canSelectFiles = torrent && (task.status === "active" || task.status === "waiting" || task.status === "paused");
  const files = (task.files ?? [])
    .map((file) => {
      const index = Number(file.index ?? 0);
      const checked = file.selected !== "false";
      const body = `${escapeHtml(fileLabel(file) || "—")} · ${formatBytes(file.length)}`;
      if (!canSelectFiles || index <= 0) return `<li>${body}</li>`;
      return `<li><label><input type="checkbox" data-file-index="${index}" ${checked ? "checked" : ""} /> ${body}</label></li>`;
    })
    .join("");
  const ratio = torrent ? formatRatio(task) : "";
  detailEl.innerHTML = `
    <h2>${escapeHtml(taskName(task))}</h2>
    <div class="kv">
      <span class="muted">${t("detailGid")}</span><span>${escapeHtml(task.gid)}</span>
      <span class="muted">${t("detailStatus")}</span><span>${escapeHtml(isSeeding(task) ? t("seeding") : task.status)}</span>
      <span class="muted">${t("detailDir")}</span><span>${escapeHtml(task.dir ?? "—")}</span>
      <span class="muted">${t("detailConnections")}</span><span>${escapeHtml(task.connections ?? "—")}</span>
      ${ratio ? `<span class="muted">${t("ratio")}</span><span>${escapeHtml(ratio)}</span>` : ""}
      ${
        task.errorMessage
          ? `<span class="muted">${t("detailError")}</span><span>${escapeHtml(task.errorMessage)}</span>`
          : ""
      }
    </div>
    <h3>${t("detailFiles")}</h3>
    <ul class="files">${files || "<li>—</li>"}</ul>
    ${
      canSelectFiles
        ? `<p><button class="btn" data-action="apply-files" data-gid="${task.gid}" type="button">${t("applyFiles")}</button></p>`
        : ""
    }
  `;
}

function render(): void {
  renderServerSelect();
  renderTabs();
  renderList();
  renderDetail();
}

async function run(action: string, gid?: string): Promise<void> {
  try {
    if (action === "open-add") {
      dialog.showModal();
      return;
    }
    if (action === "pause" && gid) await sendMessage({ type: "pause", gid });
    if (action === "unpause" && gid) await sendMessage({ type: "unpause", gid });
    if (action === "remove" && gid) {
      await sendMessage({ type: "remove", gid, queue });
    }
    if (action === "stop-seeding" && gid) {
      await sendMessage({ type: "stopSeeding", gid });
    }
    if (action === "apply-files" && gid) {
      const indexes = [...detailEl.querySelectorAll<HTMLInputElement>("input[data-file-index]:checked")]
        .map((input) => Number(input.dataset.fileIndex))
        .filter((index) => index > 0);
      await sendMessage({ type: "selectFiles", gid, indexes });
    }
    if (action === "retry" && gid) await sendMessage({ type: "retry", gid });
    if (action === "purge") await sendMessage({ type: "purgeStopped" });
  } catch (error) {
    window.alert(error instanceof Error ? error.message : String(error));
  }
}

listEl.addEventListener("click", (event) => {
  const target = event.target as HTMLElement;
  const action = target.closest<HTMLElement>("[data-action]")?.dataset.action;
  const actionGid = target.closest<HTMLElement>("[data-gid]")?.dataset.gid;
  if (action) {
    event.stopPropagation();
    void run(action, actionGid);
    return;
  }
  const row = target.closest<HTMLElement>(".task");
  if (row?.dataset.gid) {
    selectedGid = row.dataset.gid;
    renderDetail();
    for (const el of listEl.querySelectorAll(".task")) {
      el.classList.toggle("selected", (el as HTMLElement).dataset.gid === selectedGid);
    }
  }
});

detailEl.addEventListener("click", (event) => {
  const target = event.target as HTMLElement;
  const action = target.closest<HTMLElement>("[data-action]")?.dataset.action;
  const gid = target.closest<HTMLElement>("[data-gid]")?.dataset.gid;
  if (action) {
    event.stopPropagation();
    void run(action, gid);
  }
});

document.querySelector("#tabs")!.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-queue]");
  if (!button?.dataset.queue) return;
  queue = button.dataset.queue as QueueName;
  selectedGid = null;
  render();
});

document.querySelector("#add")!.addEventListener("click", () => dialog.showModal());
document.querySelector("#add-cancel")!.addEventListener("click", () => dialog.close());
document.querySelector("#settings")!.addEventListener("click", () => {
  void browser.runtime.openOptionsPage();
});
serverEl.addEventListener("change", () => {
  void sendMessage({ type: "setActiveProfile", id: serverEl.value });
});
document.querySelector("#pause-all")!.addEventListener("click", () => {
  void sendMessage({ type: "pauseAll" });
});
document.querySelector("#resume-all")!.addEventListener("click", () => {
  void sendMessage({ type: "unpauseAll" });
});

document.querySelector("#add-form")!.addEventListener("submit", (event) => {
  event.preventDefault();
  addError.hidden = true;
  void (async () => {
    try {
      const file = addTorrent.files?.[0];
      if (file) {
        const buffer = new Uint8Array(await file.arrayBuffer());
        let binary = "";
        for (let i = 0; i < buffer.length; i += 0x8000) {
          binary += String.fromCharCode(...buffer.subarray(i, i + 0x8000));
        }
        await sendMessage({ type: "addTorrent", data: btoa(binary) });
      }
      const uris = addUrls.value
        .split(/\s+/)
        .map((line) => line.trim())
        .filter(Boolean);
      if (uris.length > 0) {
        const options: Record<string, string | string[]> = {};
        if (addOut.value.trim()) options.out = addOut.value.trim();
        await sendMessage({ type: "addUris", uris, options });
      }
      if (!file && uris.length === 0) {
        throw new Error("Add a URL, magnet, or torrent file");
      }
      addUrls.value = "";
      addOut.value = "";
      addTorrent.value = "";
      dialog.close();
    } catch (error) {
      addError.hidden = false;
      addError.textContent = error instanceof Error ? error.message : String(error);
    }
  })();
});

async function consumeHash(): Promise<void> {
  const hash = location.hash;
  if (hash.startsWith("#magnet=")) {
    const magnet = decodeURIComponent(hash.slice("#magnet=".length));
    history.replaceState(null, "", location.pathname + location.search);
    if (magnet) await sendMessage({ type: "addUris", uris: [magnet] });
  }
}

const port = connectUi();
port.onMessage.addListener((message: { type?: string; data?: Snapshot }) => {
  if (message.type === "snapshot" && message.data) {
    snapshot = message.data;
    render();
  }
});

void consumeHash();
