import { Color } from "cesium";
import type { TargetCalloutStyle } from "./legacyCallout";

export function validatePosition(position: { x: number; y: number; z: number }): void {
  if (![position.x, position.y, position.z].every(Number.isFinite)) {
    throw new RangeError("目标 ECEF 坐标必须是有限数");
  }
}

export function validateLines(lines: readonly string[]): void {
  if (!Array.isArray(lines) || lines.length > 6 || lines.some(line => typeof line !== "string")) {
    throw new RangeError("标牌最多支持六行字符串");
  }
}

export function normalizeTitle(title: string): string {
  if (typeof title !== "string") throw new TypeError("标牌 title 必须是字符串");
  return title.replace(/\s+/g, " ").trim();
}

export function normalizeBadgeText(text: string): string {
  if (typeof text !== "string" || !/^[a-z]$/i.test(text.trim())) throw new RangeError("标牌字母须为单个英文字母 A–Z");
  return text.trim().toUpperCase();
}

export function validateMaxOffsetDistance(distance = Number.POSITIVE_INFINITY): number {
  if (distance !== Number.POSITIVE_INFINITY && (!Number.isFinite(distance) || distance < 0)) {
    throw new RangeError("最大偏移距离必须是非负有限数或 Infinity");
  }
  return distance;
}

/** Validate before committing state, so a rejected update never poisons the next frame. */
export function validateStyle(style: TargetCalloutStyle): TargetCalloutStyle {
  for (const value of [style.leaderColor, style.borderColor, style.textColor, style.backgroundColor, style.badgeColor, style.badgeTextColor]) {
    if (typeof value !== "string" || !Color.fromCssColorString(value)) throw new RangeError("无效颜色：" + value);
  }
  if (!Number.isFinite(style.fontSize) || style.fontSize < 8 || style.fontSize > 48) throw new RangeError("文字大小须为 8–48px");
  for (const spacing of [style.lineGap, style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft]) {
    if (!Number.isFinite(spacing) || spacing < 0 || spacing > 200) throw new RangeError("行间距和内边距须为 0–200px");
  }
  if (!["normal", "bold", "italic", "bold italic"].includes(style.fontStyle)
    || typeof style.fontFamily !== "string" || !style.fontFamily.trim()) throw new RangeError("无效文字样式");
  if (![100, 200, 300, 400, 500, 600, 700, 800, 900].includes(style.fontWeight)) throw new RangeError("文字粗细须为 100–900 的整百数");
  if (typeof style.showBorder !== "boolean" || typeof style.showLeader !== "boolean") throw new TypeError("显隐配置必须是布尔值");
  return style;
}
