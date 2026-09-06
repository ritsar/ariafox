import { basename } from "../shared/format.js";
import { t } from "../shared/messages.js";
import type { Settings } from "../shared/types.js";
import {
  isMagnet,
  isMetalink,
  isTorrent,
  skipReason,
  type DownloadLike,
} from "./filters.js";
import { Aria2Client } from "./rpc.js";

const inFlight = new Set<number>();

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function downloadName(item: DownloadLike): string {
  if (item.filename) return basename(item.filename);
  try {
    return basename(new URL(item.url).pathname) || t("unknownTask");
  } catch {
    return t("unknownTask");
  }
}

async function cookieHeader(
  url: string,
  storeId?: string,
): Promise<string | null> {
  try {
    const cookies = await browser.cookies.getAll({
      url,
      ...(storeId ? { storeId } : {}),
    });
    if (cookies.length === 0) return null;
    return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
  } catch {
    return null;
  }
}

function buildOptions(
  item: DownloadLike,
  cookie: string | null,
): Record<string, string | string[]> {
  const headers: string[] = [];
  if (cookie) headers.push(`Cookie: ${cookie}`);
  if (item.referrer) headers.push(`Referer: ${item.referrer}`);
  headers.push(`User-Agent: ${navigator.userAgent}`);
  const options: Record<string, string | string[]> = {};
  if (headers.length > 0) options.header = headers;
  const out = downloadName(item);
  if (out && out !== t("unknownTask") && !out.includes("/")) options.out = out;
  return options;
}

async function fetchAsBase64(
  url: string,
  cookie: string | null,
  referrer?: string | null,
): Promise<string> {
  const headers = new Headers();
  if (cookie) headers.set("Cookie", cookie);
  if (referrer) headers.set("Referer", referrer);
  const response = await fetch(url, { headers, credentials: "omit" });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching ${url}`);
  }
  const buffer = new Uint8Array(await response.arrayBuffer());
  return bytesToBase64(buffer);
}

async function restoreFirefoxDownload(
  item: browser.downloads.DownloadItem,
): Promise<void> {
  try {
    await browser.downloads.download({
      url: item.url,
      filename: item.filename ? basename(item.filename) : undefined,
      cookieStoreId: item.cookieStoreId,
      incognito: item.incognito,
    });
  } catch (error) {
    console.warn("AriaFox: failed to restore Firefox download", error);
  }
}

async function eraseDownload(id: number): Promise<void> {
  try {
    await browser.downloads.erase({ id });
  } catch {
    /* already gone */
  }
}

async function notify(
  settings: Settings,
  kind: "capture" | "error",
  message: string,
): Promise<void> {
  if (kind === "capture" && !settings.notifications.capture) return;
  if (kind === "error" && !settings.notifications.rpcError) return;
  try {
    await browser.notifications.create({
      type: "basic",
      iconUrl: browser.runtime.getURL("icons/icon-48.png"),
      title: t("extName"),
      message,
    });
  } catch {
    /* notifications may be blocked */
  }
}

export async function handleCreatedDownload(
  item: browser.downloads.DownloadItem,
  settings: Settings,
  client: Aria2Client,
  extensionId: string,
): Promise<"captured" | "skipped" | "restored"> {
  if (inFlight.has(item.id)) return "skipped";
  inFlight.add(item.id);
  try {
    const like: DownloadLike = {
      id: item.id,
      url: item.url,
      referrer: item.referrer,
      filename: item.filename,
      mime: item.mime,
      fileSize: item.fileSize,
      totalBytes: item.totalBytes,
      incognito: item.incognito,
      byExtensionId: item.byExtensionId,
    };
    const reason = skipReason(like, settings.capture, extensionId);
    if (reason) return "skipped";

    let cancelled = false;
    try {
      await browser.downloads.cancel(item.id);
      cancelled = true;
    } catch {
      cancelled = false;
    }

    const cookie = await cookieHeader(item.url, item.cookieStoreId);
    const options = buildOptions(like, cookie);
    const name = downloadName(like);

    try {
      if (isMagnet(item.url)) {
        await client.addUri([item.url]);
      } else if (isTorrent(like) && settings.capture.torrentHandling === "upload") {
        const data = await fetchAsBase64(item.url, cookie, item.referrer);
        await client.addTorrent(data, options);
      } else if (isMetalink(like) && settings.capture.torrentHandling === "upload") {
        const data = await fetchAsBase64(item.url, cookie, item.referrer);
        await client.addMetalink(data, options);
      } else {
        await client.addUri([item.url], options);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (cancelled) await restoreFirefoxDownload(item);
      await notify(
        settings,
        "error",
        cancelled
          ? t("notifyRestored", { name })
          : t("notifyCaptureFailed", { error: message }),
      );
      return cancelled ? "restored" : "skipped";
    }

    await eraseDownload(item.id);
    if (!cancelled) {
      try {
        await browser.downloads.removeFile(item.id);
      } catch {
        /* never landed on disk or already erased */
      }
    }
    await notify(settings, "capture", t("notifyCaptured", { name }));
    return "captured";
  } finally {
    inFlight.delete(item.id);
  }
}

export function aria2OptionsFromPage(
  referrer?: string,
): Record<string, string | string[]> {
  const headers = [`User-Agent: ${navigator.userAgent}`];
  if (referrer) headers.push(`Referer: ${referrer}`);
  return { header: headers };
}
