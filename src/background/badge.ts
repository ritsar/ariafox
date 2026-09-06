import type { Snapshot } from "../shared/types.js";

const COLOR_OK = "#0d9488";
const COLOR_OFF = "#a8a29e";
const COLOR_BAD = "#ea580c";

export async function updateBadge(snapshot: Snapshot): Promise<void> {
  const action = browser.action;
  if (!action) return;
  const active = Number(snapshot.stat?.numActive ?? 0);
  const text = snapshot.connected && active > 0 ? String(active) : "";
  await action.setBadgeText({ text });
  let color = COLOR_OFF;
  if (!snapshot.connected) color = COLOR_BAD;
  else if (snapshot.captureEnabled) color = COLOR_OK;
  await action.setBadgeBackgroundColor({ color });
  try {
    await action.setBadgeTextColor({ color: "#ffffff" });
  } catch {
    /* not all channels */
  }
}
