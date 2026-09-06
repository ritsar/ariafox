import type { ExtensionMessage, ExtensionResponse } from "./types.js";

export async function sendMessage<T>(message: ExtensionMessage): Promise<T> {
  const response = (await browser.runtime.sendMessage(
    message,
  )) as ExtensionResponse<T>;
  if (!response || response.ok === false) {
    throw new Error(response?.error ?? "No response from background");
  }
  return response.data;
}

export function connectUi(): browser.runtime.Port {
  return browser.runtime.connect({ name: "ui" });
}
