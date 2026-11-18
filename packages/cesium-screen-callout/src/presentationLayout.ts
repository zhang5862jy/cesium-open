import type { CalloutDisplayMode } from "./display";
import type { TargetCalloutStyle } from "./legacyCallout";

export const BADGE_SIZE = 20;
export const BADGE_GAP = 6;
export const BADGE_FONT_SIZE = 14;
export const BADGE_FONT_FAMILY = "sans-serif";
export const ACTION_SIZE = 16;
export const ACTION_GAP = 4;
export const ACTION_WIDTH = ACTION_SIZE * 2 + ACTION_GAP;
export const ACTION_TEXT_GAP = 6;

export interface PresentationRect { x: number; y: number; width: number; height: number }
export interface CalloutPresentationItem {
  style: TargetCalloutStyle;
  titleStyle?: TargetCalloutStyle;
  title?: string;
  badgeText?: string;
  displayMode?: CalloutDisplayMode;
  lines: readonly string[];
}
export interface CalloutPresentationLayout {
  width: number;
  height: number;
  body: PresentationRect;
  header?: PresentationRect;
  badge?: PresentationRect;
  bodyText: { x: number; y: number };
  bodyLineHeight: number;
  titleText?: { x: number; y: number };
  actions?: PresentationRect;
}

/** Canvas text preparation preserves one source row, including embedded whitespace. */
export function normalizeCalloutRow(text: string): string { return text.replace(/[\t\n\f\r]/g, " "); }

/** Shared CSS-pixel layout. Text origins refer to the top of the font-size line box. */
export function layoutCalloutPresentation(
  item: CalloutPresentationItem,
  metrics: { bodyWidth: number; titleWidth?: number; roundWidth?: boolean },
): CalloutPresentationLayout {
  const s = item.style, t = item.titleStyle ?? s;
  const hasHeader = item.displayMode !== "compact" && item.title !== undefined;
  const hasBadge = !!item.badgeText;
  const inlineBadge = hasBadge && !hasHeader;
  const rows = Math.max(1, item.lines.length);
  const textHeight = rows * s.fontSize + (rows - 1) * s.lineGap;
  const bodyInnerHeight = inlineBadge ? Math.max(BADGE_SIZE, textHeight) : textHeight;
  const bodyHeight = bodyInnerHeight + s.paddingTop + s.paddingBottom + 4;
  const roundWidth = metrics.roundWidth === false ? (width: number) => width : Math.ceil;
  const bodyWidth = roundWidth(Math.max(1, metrics.bodyWidth) + s.paddingLeft + s.paddingRight + 4
    + (inlineBadge ? BADGE_SIZE + BADGE_GAP : 0));
  const headerInnerHeight = Math.max(BADGE_SIZE, ACTION_SIZE, t.fontSize);
  const headerHeight = hasHeader ? headerInnerHeight + t.paddingTop + t.paddingBottom + 4 : 0;
  const headerWidth = hasHeader ? roundWidth(Math.max(0, metrics.titleWidth ?? 0) + t.paddingLeft + t.paddingRight + 4
    + (hasBadge ? BADGE_SIZE + BADGE_GAP : 0) + ACTION_WIDTH + ACTION_TEXT_GAP) : 0;
  const width = Math.max(bodyWidth, headerWidth), height = headerHeight + bodyHeight;
  const layout: CalloutPresentationLayout = {
    width, height,
    body: { x: 0, y: headerHeight, width, height: bodyHeight },
    bodyText: { x: 2 + s.paddingLeft + (inlineBadge ? BADGE_SIZE + BADGE_GAP : 0),
      y: headerHeight + 2 + s.paddingTop + (bodyInnerHeight - textHeight) / 2 },
    bodyLineHeight: s.fontSize + s.lineGap,
  };
  if (hasHeader) {
    const innerTop = 2 + t.paddingTop;
    layout.header = { x: 0, y: 0, width, height: headerHeight };
    layout.titleText = { x: 2 + t.paddingLeft + (hasBadge ? BADGE_SIZE + BADGE_GAP : 0),
      y: innerTop + (headerInnerHeight - t.fontSize) / 2 };
    layout.actions = { x: width - 2 - t.paddingRight - ACTION_WIDTH,
      y: innerTop + (headerInnerHeight - ACTION_SIZE) / 2, width: ACTION_WIDTH, height: ACTION_SIZE };
    if (hasBadge) layout.badge = { x: 2 + t.paddingLeft, y: innerTop + (headerInnerHeight - BADGE_SIZE) / 2,
      width: BADGE_SIZE, height: BADGE_SIZE };
  } else if (inlineBadge) {
    layout.badge = { x: 2 + s.paddingLeft, y: 2 + s.paddingTop + (bodyInnerHeight - BADGE_SIZE) / 2,
      width: BADGE_SIZE, height: BADGE_SIZE };
  }
  return layout;
}
