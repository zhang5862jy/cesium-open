import type { CalloutDisplayMode } from "./display";
import type { TargetCalloutStyle } from "./legacyCallout";
export declare const BADGE_SIZE = 20;
export declare const BADGE_GAP = 6;
export declare const BADGE_FONT_SIZE = 14;
export declare const BADGE_FONT_FAMILY = "sans-serif";
export declare const ACTION_SIZE = 16;
export declare const ACTION_GAP = 4;
export declare const ACTION_WIDTH: number;
export declare const ACTION_TEXT_GAP = 6;
export interface PresentationRect {
    x: number;
    y: number;
    width: number;
    height: number;
}
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
    bodyText: {
        x: number;
        y: number;
    };
    bodyLineHeight: number;
    titleText?: {
        x: number;
        y: number;
    };
    actions?: PresentationRect;
}
/** Canvas text preparation preserves one source row, including embedded whitespace. */
export declare function normalizeCalloutRow(text: string): string;
/** Shared CSS-pixel layout. Text origins refer to the top of the font-size line box. */
export declare function layoutCalloutPresentation(item: CalloutPresentationItem, metrics: {
    bodyWidth: number;
    titleWidth?: number;
    roundWidth?: boolean;
}): CalloutPresentationLayout;
//# sourceMappingURL=presentationLayout.d.ts.map