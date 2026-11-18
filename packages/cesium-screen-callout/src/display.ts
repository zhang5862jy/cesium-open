import { DEFAULT_CALLOUT_STYLE, type TargetCalloutStyle } from "./legacyCallout";

export type CalloutDisplayMode = "detailed" | "compact";
export type CalloutStyleSection = CalloutDisplayMode | "title";
export interface CalloutField {
  key: string;
  value: string | number | boolean | null;
}
export type CompactFieldFormatter = (field: Readonly<CalloutField>, index: number, id: string | number) => string;

export const DEFAULT_COMPACT_CALLOUT_STYLE: Readonly<TargetCalloutStyle> = Object.freeze({
  ...DEFAULT_CALLOUT_STYLE, fontSize: 12, lineGap: 0,
  paddingTop: 4, paddingRight: 6, paddingBottom: 4, paddingLeft: 6,
});

export const DEFAULT_TITLE_CALLOUT_STYLE: Readonly<TargetCalloutStyle> = Object.freeze({
  ...DEFAULT_CALLOUT_STYLE, fontSize: 14, fontWeight: 700, lineGap: 0,
  paddingTop: 4, paddingRight: 6, paddingBottom: 4, paddingLeft: 6,
  showLeader: false,
});

export function validateStyleSection(section: CalloutStyleSection): void {
  if (section !== "title") validateDisplayMode(section);
}

/** Only the value is shown; title is independent of the compact formatter. */
export function getFieldTitle(fields: readonly CalloutField[]): string | undefined {
  const field = fields.find(value => value.key === "title");
  return field ? String(field.value ?? "").replace(/\s+/g, " ").trim() : undefined;
}

export function validateDisplayMode(mode: CalloutDisplayMode): void {
  if (mode !== "detailed" && mode !== "compact") throw new RangeError("标牌模式必须为 detailed 或 compact");
}

export function copyCalloutFields(fields: readonly CalloutField[]): CalloutField[] {
  if (!Array.isArray(fields)) throw new TypeError("简标字段必须是数组");
  return fields.map(field => {
    if (!field || typeof field.key !== "string" || !field.key.trim()
      || (field.value !== null && !["string", "number", "boolean"].includes(typeof field.value))
      || (typeof field.value === "number" && !Number.isFinite(field.value))) {
      throw new TypeError("简标字段须包含 key 和字符串、有限数、布尔值或 null 的 value");
    }
    return { key: field.key, value: field.value };
  });
}

/** Functions execute on the main thread. Only the resulting one-line text reaches the Worker. */
export function formatCompactFields(
  fields: readonly CalloutField[], formatter: CompactFieldFormatter | undefined,
  id: string | number, fallbackLines: readonly string[] = [],
): string[] {
  if (formatter !== undefined && typeof formatter !== "function") throw new TypeError("简标字段处理函数必须是函数");
  const values = fields.length ? fields.map((field, index) => formatter
    ? formatter(Object.freeze({ ...field }), index, id) : field.value === null ? "—" : String(field.value)) : fallbackLines;
  const text = values.map(value => {
    if (typeof value !== "string") throw new TypeError("简标字段处理函数必须返回字符串");
    return value.replace(/\s+/g, " ").trim();
  }).filter(Boolean).join(" ");
  return text ? [text] : [];
}
