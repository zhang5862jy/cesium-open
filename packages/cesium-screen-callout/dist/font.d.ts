export type TargetCalloutFontStyle = "normal" | "bold" | "italic" | "bold italic";
export type TargetCalloutFontWeight = 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;
interface CalloutFontOptions {
    fontFamily: string;
    fontSize: number;
    fontStyle: TargetCalloutFontStyle;
    fontWeight: TargetCalloutFontWeight;
}
/** Builds a normalized CSS font string while retaining legacy bold styles. */
export declare function createCalloutFont(style: CalloutFontOptions, fontSize?: number): string;
export {};
//# sourceMappingURL=font.d.ts.map