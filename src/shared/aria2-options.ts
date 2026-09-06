export const OVERALL_DOWNLOAD_LIMIT = "max-overall-download-limit";
export const OVERALL_UPLOAD_LIMIT = "max-overall-upload-limit";

const MIB = 1024 * 1024;

const SPEED_UNLIMITED_HINT = "0 is unlimited.";

export type OptionFieldType = "text" | "number" | "boolean" | "select" | "speed" | "size";

export type OptionField = {
  key: string;
  label: string;
  hint?: string;
  type: OptionFieldType;
  wide?: boolean;
  min?: number;
  step?: number | "any";
  choices?: { value: string; label: string }[];
};

export type OptionGroup = {
  title: string;
  fields: OptionField[];
};

export const GLOBAL_OPTION_GROUPS: OptionGroup[] = [
  {
    title: "General",
    fields: [
      { key: "dir", label: "Download directory", type: "text", wide: true },
      { key: "max-concurrent-downloads", label: "Max concurrent downloads", type: "number", min: 1 },
      {
        key: "file-allocation",
        label: "File allocation",
        type: "select",
        choices: [
          { value: "none", label: "none" },
          { value: "prealloc", label: "prealloc" },
          { value: "trunc", label: "trunc" },
          { value: "falloc", label: "falloc" },
        ],
      },
      { key: "disk-cache", label: "Disk cache (in MiB)", type: "size" },
      { key: "continue", label: "Continue unfinished downloads", type: "boolean" },
      { key: "always-resume", label: "Always resume", type: "boolean" },
      { key: "auto-file-renaming", label: "Auto-rename files", type: "boolean" },
      { key: "allow-overwrite", label: "Allow overwrite", type: "boolean" },
    ],
  },
  {
    title: "Transfer",
    fields: [
      {
        key: OVERALL_DOWNLOAD_LIMIT,
        label: "Overall download limit (in MiB/s)",
        type: "speed",
        hint: SPEED_UNLIMITED_HINT,
      },
      {
        key: OVERALL_UPLOAD_LIMIT,
        label: "Overall upload limit (in MiB/s)",
        type: "speed",
        hint: SPEED_UNLIMITED_HINT,
      },
      {
        key: "max-download-limit",
        label: "Default download limit (in MiB/s)",
        type: "speed",
        hint: SPEED_UNLIMITED_HINT,
      },
      {
        key: "max-upload-limit",
        label: "Default upload limit (in MiB/s)",
        type: "speed",
        hint: SPEED_UNLIMITED_HINT,
      },
      { key: "max-connection-per-server", label: "Connections per server", type: "number", min: 1 },
      { key: "split", label: "Split", type: "number", min: 1 },
      { key: "min-split-size", label: "Min split size (in MiB)", type: "size" },
      {
        key: "lowest-speed-limit",
        label: "Lowest speed limit (in MiB/s)",
        type: "speed",
        hint: "0 disables this check.",
      },
    ],
  },
  {
    title: "Retry",
    fields: [
      { key: "max-tries", label: "Max tries", type: "number", min: 0 },
      { key: "retry-wait", label: "Retry wait (seconds)", type: "number", min: 0 },
      { key: "timeout", label: "Timeout (seconds)", type: "number", min: 1 },
      { key: "connect-timeout", label: "Connect timeout (seconds)", type: "number", min: 1 },
    ],
  },
  {
    title: "HTTP",
    fields: [
      { key: "user-agent", label: "User agent", type: "text", wide: true },
      { key: "referer", label: "Referer", type: "text", wide: true },
      { key: "all-proxy", label: "Proxy", type: "text", wide: true },
      { key: "no-proxy", label: "No proxy for", type: "text", wide: true },
    ],
  },
  {
    title: "BitTorrent",
    fields: [
      { key: "seed-ratio", label: "Seed ratio", type: "number", min: 0, step: "any" },
      { key: "seed-time", label: "Seed time (minutes)", type: "number", min: 0 },
      { key: "bt-max-peers", label: "Max peers", type: "number", min: 0 },
      {
        key: "follow-torrent",
        label: "Follow torrent",
        type: "select",
        choices: [
          { value: "true", label: "true" },
          { value: "false", label: "false" },
          { value: "mem", label: "mem" },
        ],
      },
      { key: "bt-save-metadata", label: "Save .torrent metadata", type: "boolean" },
      { key: "bt-seed-unverified", label: "Seed unverified", type: "boolean" },
      { key: "bt-force-encryption", label: "Force encryption", type: "boolean" },
      { key: "enable-peer-exchange", label: "Peer exchange", type: "boolean" },
    ],
  },
];

export function flattenFields(groups: OptionGroup[]): OptionField[] {
  return groups.flatMap((group) => group.fields);
}

export function parseAria2Bytes(value: string | undefined): number {
  const raw = (value ?? "").trim();
  if (!raw) return 0;
  const match = /^(0|[1-9]\d*(?:\.\d+)?)([kmg])?$/i.exec(raw);
  if (match) {
    const n = Number(match[1]);
    const unit = (match[2] ?? "").toUpperCase();
    if (unit === "K") return n * 1024;
    if (unit === "M") return n * MIB;
    if (unit === "G") return n * 1024 * MIB;
    return n;
  }
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function bytesToMib(bytes: number): number {
  if (bytes <= 0) return 0;
  return Math.max(1, Math.round(bytes / MIB));
}

export function mibToAria2(mib: number): string {
  if (!Number.isFinite(mib) || mib <= 0) return "0";
  return `${Math.round(mib)}M`;
}

export function displayMib(value: string | undefined): string {
  return String(bytesToMib(parseAria2Bytes(value)));
}

export function isNonNegativeInteger(value: string): boolean {
  return /^(0|[1-9]\d*)$/.test(value.trim());
}

function escapeAttr(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;");
}

function fieldValue(field: OptionField, values: Record<string, string>): string {
  const raw = values[field.key] ?? "";
  if (field.type === "speed" || field.type === "size") return displayMib(raw);
  return raw;
}

function renderField(field: OptionField, values: Record<string, string>): string {
  const hint = field.hint
    ? `<span class="option-hint">${escapeAttr(field.hint)}</span>`
    : "";
  const wide = field.wide ? " wide" : "";
  if (field.type === "boolean") {
    const checked = values[field.key] === "true" ? " checked" : "";
    return `<label class="check"><input data-option="${escapeAttr(field.key)}" type="checkbox"${checked} /> ${escapeAttr(field.label)}</label>`;
  }
  if (field.type === "select") {
    const current = values[field.key] ?? "";
    const choices = [...(field.choices ?? [])];
    if (current && !choices.some((choice) => choice.value === current)) {
      choices.unshift({ value: current, label: current });
    }
    const options = choices
      .map((choice) => {
        const selected = choice.value === current ? " selected" : "";
        return `<option value="${escapeAttr(choice.value)}"${selected}>${escapeAttr(choice.label)}</option>`;
      })
      .join("");
    return `<label class="${wide}">${escapeAttr(field.label)}
      <select data-option="${escapeAttr(field.key)}">${options}</select>
      ${hint}
    </label>`;
  }
  if (field.type === "number" || field.type === "speed" || field.type === "size") {
    const isMib = field.type === "speed" || field.type === "size";
    const step = isMib ? "1" : field.step === undefined ? "1" : String(field.step);
    const min = isMib ? 0 : field.min;
    const minAttr = min === undefined ? "" : ` min="${min}"`;
    return `<label class="${wide}">${escapeAttr(field.label)}
      <input data-option="${escapeAttr(field.key)}" type="number"${minAttr} step="${step}" inputmode="numeric" value="${escapeAttr(fieldValue(field, values))}" />
      ${hint}
    </label>`;
  }
  return `<label class="${wide}">${escapeAttr(field.label)}
    <input data-option="${escapeAttr(field.key)}" type="text" spellcheck="false" value="${escapeAttr(fieldValue(field, values))}" />
    ${hint}
  </label>`;
}

export function renderOptionGroups(
  groups: OptionGroup[],
  values: Record<string, string>,
): string {
  return groups
    .map((group) => {
      const valueFields = group.fields.filter((field) => field.type !== "boolean");
      const flags = group.fields.filter((field) => field.type === "boolean");
      const grid = valueFields.length
        ? `<div class="option-grid">${valueFields.map((field) => renderField(field, values)).join("")}</div>`
        : "";
      const checks = flags.length
        ? `<div class="option-checks">${flags.map((field) => renderField(field, values)).join("")}</div>`
        : "";
      return `<div class="option-group"><h3>${escapeAttr(group.title)}</h3>${grid}${checks}</div>`;
    })
    .join("");
}

export function validateOptionForm(
  root: Element,
  groups: OptionGroup[] = GLOBAL_OPTION_GROUPS,
): string | null {
  for (const field of flattenFields(groups)) {
    if (field.type === "boolean" || field.type === "select" || field.type === "text") {
      continue;
    }
    const el = root.querySelector<HTMLInputElement>(`[data-option="${field.key}"]`);
    if (!el) continue;
    if (el.validity.badInput) {
      return field.step === "any"
        ? `${field.label} must be a number.`
        : `${field.label} must be a whole number.`;
    }
    const value = el.value.trim();
    if (value === "") continue;
    if (field.step === "any") {
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed < 0) {
        return `${field.label} must be a number.`;
      }
      continue;
    }
    if (!isNonNegativeInteger(value)) {
      return `${field.label} must be a whole number.`;
    }
  }
  return null;
}

export function readOptionForm(
  root: Element,
  groups: OptionGroup[] = GLOBAL_OPTION_GROUPS,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const field of flattenFields(groups)) {
    const el = root.querySelector<HTMLInputElement | HTMLSelectElement>(
      `[data-option="${field.key}"]`,
    );
    if (!el) continue;
    if (field.type === "boolean") {
      out[field.key] = (el as HTMLInputElement).checked ? "true" : "false";
      continue;
    }
    const value = el.value.trim();
    if (field.type === "speed" || field.type === "size") {
      out[field.key] = value === "" ? "0" : mibToAria2(Number(value));
      continue;
    }
    if (value !== "") out[field.key] = value;
  }
  return out;
}
