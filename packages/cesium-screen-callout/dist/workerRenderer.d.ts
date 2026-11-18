import { type CalloutPresentationItem } from "./presentationLayout";
export interface PaintItem extends CalloutPresentationItem {
    x: number;
    y: number;
    lines: string[];
}
/** One fixed-size screen canvas; no per-target textures or unbounded glyph/bitmap cache. */
export declare class WorkerCalloutRenderer {
    private readonly context;
    private canvas;
    constructor(canvas: OffscreenCanvas);
    draw(items: PaintItem[], positions: Float64Array, visibility: Uint8Array, vp: number[], width: number, height: number, ratio: number, bounds: Float32Array, actionRects?: Float32Array): number;
}
//# sourceMappingURL=workerRenderer.d.ts.map