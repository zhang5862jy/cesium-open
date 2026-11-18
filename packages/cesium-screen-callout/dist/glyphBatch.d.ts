import type { PaintItem } from "./workerRenderer";
export interface GlyphBatch {
    instances: Float32Array;
    count: number;
    /** Leading instances contain only leaders; absent on older batches. */
    leaderCount?: number;
    sizes: Float32Array;
    /** Local toolbar rectangles, committed together with the matching panel sizes. */
    actionRects?: Float32Array;
    atlas?: ImageBitmap;
    /** 仅位置或显隐变化，主线程应保留现有 GPU 字符缓冲。 */
    unchanged?: boolean;
}
/** 将布局转换为实例缓冲；图集管理交给 GlyphLayoutCache。公开接口保持兼容。 */
export declare class GlyphBatchBuilder {
    private readonly layout;
    private colorCanvas;
    private colorContext;
    private colors;
    private color;
    build(items: PaintItem[], reusable?: Float32Array): Promise<GlyphBatch>;
}
//# sourceMappingURL=glyphBatch.d.ts.map