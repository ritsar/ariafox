import {
  formatSpeed,
  isSeeding,
  percentComplete,
  taskName,
} from "../shared/format.js";
import { t } from "../shared/messages.js";
import { connectUi, sendMessage } from "../shared/messaging.js";
import type { Snapshot } from "../shared/types.js";

const connectionEl = document.querySelector<HTMLElement>("#connection")!;
const captureEl = document.querySelector<HTMLInputElement>("#capture")!;
const statsEl = document.querySelector("#stats")!;
const tasksEl = document.querySelector("#tasks")!;

function render(snapshot: Snapshot): void {
  connectionEl.className = `status-dot ${snapshot.connected ? "ok" : "bad"}`;
  const connectionLabel = snapshot.connected
    ? `${t("connected")}${snapshot.version ? ` · aria2 ${snapshot.version}` : ""}`
    : snapshot.error || t("disconnected");
  connectionEl.title = connectionLabel;
  connectionEl.setAttribute("aria-label", connectionLabel);
  captureEl.checked = snapshot.captureEnabled;

  const active = Number(snapshot.stat?.numActive ?? 0);
  const waiting = Number(snapshot.stat?.numWaiting ?? 0);
  statsEl.innerHTML = `
    <div class="stat"><span>${t("speedDown")}</span><b>${formatSpeed(snapshot.stat?.downloadSpeed)}</b></div>
    <div class="stat"><span>${t("speedUp")}</span><b>${formatSpeed(snapshot.stat?.uploadSpeed)}</b></div>
    <div class="stat"><span>${t("queueActive")}</span><b>${active} / ${waiting}</b></div>
  `;

  const rows = snapshot.tasks.active.slice(0, 5);
  if (rows.length === 0) {
    tasksEl.innerHTML = `<li class="muted">${snapshot.connected ? t("emptyActive") : t("notConnectedTitle")}</li>`;
    return;
  }
  tasksEl.innerHTML = rows
    .map((task) => {
      const seeding = isSeeding(task);
      const pct = percentComplete(task).toFixed(0);
      const meta = seeding
        ? `<span class="seeding-label">${t("seeding")}</span> ↑ ${escapeHtml(formatSpeed(task.uploadSpeed))}`
        : "";
      return `<li>
        <div class="name" title="${escapeHtml(taskName(task))}">${escapeHtml(taskName(task))}</div>
        <div class="progress${seeding ? " seeding" : ""}" style="margin-top:6px"><span style="width:${pct}%"></span></div>
        ${meta ? `<div class="task-meta">${meta}</div>` : ""}
      </li>`;
    })
    .join("");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const port = connectUi();
port.onMessage.addListener((message: { type?: string; data?: Snapshot }) => {
  if (message.type === "snapshot" && message.data) render(message.data);
});

captureEl.addEventListener("change", () => {
  void sendMessage({ type: "toggleCapture" }).catch(() => {
    captureEl.checked = !captureEl.checked;
  });
});

document.querySelector("#open-manager")!.addEventListener("click", () => {
  void sendMessage({ type: "openManager" }).then(() => window.close());
});
document.querySelector("#open-options")!.addEventListener("click", () => {
  void browser.runtime.openOptionsPage();
});
