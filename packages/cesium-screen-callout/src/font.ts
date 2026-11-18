export type TargetCalloutFontStyle = "normal" | "bold" | "italic" | "bold italic";
export type TargetCalloutFontWeight = 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;

interface CalloutFontOptions {
  fontFamily: string;
  fontSize: number;
  fontStyle: TargetCalloutFontStyle;
  fontWeight: TargetCalloutFontWeight;
}

/** Builds a normalized CSS font string while retaining legacy bold styles. */
export function createCalloutFont(
  style: CalloutFontOptions,
  fontSize = style.fontSize,
): string {
  const italic = style.fontStyle.includes("italic") ? "italic" : "normal";
  const legacyBold = style.fontStyle.startsWith("bold");
  const weight = legacyBold ? Math.max(700, style.fontWeight) : style.fontWeight;
  return `${italic} ${weight} ${fontSize}px ${style.fontFamily}`;
}
