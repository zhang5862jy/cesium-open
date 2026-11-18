import type { PaintItem } from "./workerRenderer";
interface Glyph {
    uv: number[];
    w: number;
    h: number;
    advance: number;
    left: number;
    ascent: number;
}
interface CachedRow {
    font: string;
    text: string;
    glyphs: Glyph[];
    width: number;
}
interface CachedText {
    rows: CachedRow[];
    title?: CachedRow;
    badge?: CachedRow;
}
export declare const ATLAS_SIZE = 4096;
export declare const GLYPH_FONT_SIZE = 64;
/** 字形图集与逐行布局缓存：负责字体栅格化、容量回收和文字测量。 */
export declare class GlyphLayoutCache {
    readonly canvas: OffscreenCanvas;
    private ctx;
    private glyphs;
    private textCache;
    private atlasX;
    private atlasY;
    private atlasRowHeight;
    constructor();
    private resetAtlas;
    /** 未变化的行复用缓存；图集满时仅保留当前字符并重新排布。 */
    prepare(items: PaintItem[]): {
        texts: CachedText[];
        maximum: number;
        changed: boolean;
    };
}
export {};
//# sourceMappingURL=GlyphLayoutCache.d.ts.map