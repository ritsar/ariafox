import { activeProfile, rpcHttpUrl } from "../shared/settings.js";
import type { Settings } from "../shared/types.js";
import type {
  Aria2GlobalStat,
  Aria2Task,
  Aria2Version,
  QueueName,
} from "../shared/types.js";
import { TASK_KEYS } from "../shared/types.js";

export class RpcError extends Error {
  readonly code: number | null;

  constructor(message: string, code: number | null = null) {
    super(message);
    this.name = "RpcError";
    this.code = code;
  }
}

type JsonRpcResult<T> = {
  result?: T;
  error?: { code?: number; message?: string };
};

export class Aria2Client {
  private readonly settings: Settings;

  constructor(settings: Settings) {
    this.settings = settings;
  }

  private profile() {
    return activeProfile(this.settings);
  }

  private token(): string | null {
    const secret = this.profile().secret.trim();
    return secret ? `token:${secret}` : null;
  }

  private withToken(params: unknown[]): unknown[] {
    const token = this.token();
    return token ? [token, ...params] : params;
  }

  async call<T>(
    method: string,
    params: unknown[] = [],
    tokenOnOuter = true,
  ): Promise<T> {
    const url = rpcHttpUrl(this.profile());
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: crypto.randomUUID(),
          method,
          params: tokenOnOuter ? this.withToken(params) : params,
        }),
      });
    } catch (error) {
      throw new RpcError(
        error instanceof Error ? error.message : "Failed to reach aria2",
      );
    }
    if (!response.ok) {
      let detail = `HTTP ${response.status} from ${url}`;
      try {
        const failed = (await response.json()) as JsonRpcResult<T>;
        if (failed.error?.message) {
          throw new RpcError(failed.error.message, failed.error.code ?? null);
        }
      } catch (error) {
        if (error instanceof RpcError) throw error;
      }
      throw new RpcError(detail);
    }
    const payload = (await response.json()) as JsonRpcResult<T>;
    if (payload.error) {
      throw new RpcError(
        payload.error.message ?? "aria2 RPC error",
        payload.error.code ?? null,
      );
    }
    return payload.result as T;
  }

  async multicall<T extends unknown[]>(
    calls: { methodName: string; params?: unknown[] }[],
  ): Promise<T> {
    const inner = calls.map((call) => ({
      methodName: call.methodName,
      params: this.withToken(call.params ?? []),
    }));
    // system.multicall does not take the RPC secret as its own first argument;
    // each inner method still must.
    const raw = await this.call<Array<{ error?: { message?: string } } | [unknown]>>(
      "system.multicall",
      [inner],
      false,
    );
    return raw.map((item) => {
      if (item && !Array.isArray(item) && item.error) {
        throw new RpcError(item.error.message ?? "aria2 multicall error");
      }
      return Array.isArray(item) ? item[0] : item;
    }) as T;
  }

  getVersion() {
    return this.call<Aria2Version>("aria2.getVersion");
  }

  getGlobalStat() {
    return this.call<Aria2GlobalStat>("aria2.getGlobalStat");
  }

  addUri(
    uris: string[],
    options: Record<string, string | string[]> = {},
  ) {
    return this.call<string>("aria2.addUri", [uris, options]);
  }

  addTorrent(
    base64: string,
    options: Record<string, string | string[]> = {},
  ) {
    return this.call<string>("aria2.addTorrent", [base64, [], options]);
  }

  addMetalink(
    base64: string,
    options: Record<string, string | string[]> = {},
  ) {
    return this.call<string>("aria2.addMetalink", [base64, options]);
  }

  pause(gid: string) {
    return this.call<string>("aria2.pause", [gid]);
  }

  unpause(gid: string) {
    return this.call<string>("aria2.unpause", [gid]);
  }

  pauseAll() {
    return this.call("aria2.pauseAll");
  }

  unpauseAll() {
    return this.call("aria2.unpauseAll");
  }

  remove(gid: string) {
    return this.call<string>("aria2.remove", [gid]);
  }

  forceRemove(gid: string) {
    return this.call<string>("aria2.forceRemove", [gid]);
  }

  removeDownloadResult(gid: string) {
    return this.call<string>("aria2.removeDownloadResult", [gid]);
  }

  purgeDownloadResult() {
    return this.call("aria2.purgeDownloadResult");
  }

  changeOption(gid: string, options: Record<string, string>) {
    return this.call("aria2.changeOption", [gid, options]);
  }

  tellStatus(gid: string) {
    return this.call<Aria2Task>("aria2.tellStatus", [gid, [...TASK_KEYS]]);
  }

  async snapshot(): Promise<{
    version: string;
    stat: Aria2GlobalStat;
    tasks: Record<QueueName, Aria2Task[]>;
  }> {
    const keys = [...TASK_KEYS];
    const [active, waiting, stopped, stat, version] = await this.multicall<
      [Aria2Task[], Aria2Task[], Aria2Task[], Aria2GlobalStat, Aria2Version]
    >([
      { methodName: "aria2.tellActive", params: [keys] },
      { methodName: "aria2.tellWaiting", params: [0, 100, keys] },
      { methodName: "aria2.tellStopped", params: [0, 100, keys] },
      { methodName: "aria2.getGlobalStat" },
      { methodName: "aria2.getVersion" },
    ]);
    return {
      version: version.version,
      stat,
      tasks: { active, waiting, stopped },
    };
  }
}

export function clientFrom(settings: Settings): Aria2Client {
  return new Aria2Client(settings);
}
