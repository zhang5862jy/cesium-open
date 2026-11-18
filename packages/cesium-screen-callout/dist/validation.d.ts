import type { TargetCalloutStyle } from "./legacyCallout";
export declare function validatePosition(position: {
    x: number;
    y: number;
    z: number;
}): void;
export declare function validateLines(lines: readonly string[]): void;
export declare function normalizeTitle(title: string): string;
export declare function normalizeBadgeText(text: string): string;
export declare function validateMaxOffsetDistance(distance?: number): number;
/** Validate before committing state, so a rejected update never poisons the next frame. */
export declare function validateStyle(style: TargetCalloutStyle): TargetCalloutStyle;
//# sourceMappingURL=validation.d.ts.map