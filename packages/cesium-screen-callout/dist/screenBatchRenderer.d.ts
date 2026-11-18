import * as C from "cesium";
import type { GlyphBatch } from "./glyphBatch";
import type { WorkerCalloutHandle, WorkerFrame } from "./workerHandle";
import { type CalloutAvoidanceOptions, type CalloutAvoidanceStats } from "./avoidance";
import { type CalloutDisplayMode } from "./display";
import type { CalloutRenderer } from "./rendererInterface";
export interface CalloutTextRenderingOptions {
    /** SDF 边缘平滑范围，越小越锐利。 */
    smoothing: number;
    /** 笔画补偿：正值加粗，负值变细，不改变字形布局。 */
    weight: number;
    pixelSnap: boolean;
}
export declare const DEFAULT_TEXT_RENDERING: Readonly<CalloutTextRenderingOptions>;
/** 持有 GPU 资源，在共享场景中依次提交牵引线和标牌两个绘制命令。 */
export declare class ScreenBatchRenderer implements CalloutRenderer {
    private context;
    private program;
    private leaderCommand;
    private buffer;
    private vao;
    private panelVao;
    private panelStart;
    private corners;
    private atlas;
    private targets;
    private targetData;
    private capacity;
    private count;
    private targetCount;
    private vp;
    private matrix;
    private camera;
    private offset;
    private previousOffset;
    private previousPreference;
    private viewport;
    private textRendering;
    private sizes;
    private enabled;
    private pendingPresentation;
    private boundsDirty;
    private positionsVersion;
    private avoidanceGroups;
    private avoidanceItems;
    private command;
    private destroyed;
    private scene;
    private primitive;
    visibleCount: number;
    setAvoidance(options: boolean | Partial<CalloutAvoidanceOptions>, mode?: CalloutDisplayMode): void;
    getAvoidance(mode?: CalloutDisplayMode): CalloutAvoidanceOptions;
    getAvoidanceStats(mode?: CalloutDisplayMode): CalloutAvoidanceStats;
    /** Global batch setting; uniforms update immediately without rebuilding glyphs. */
    setTextRendering(options: Partial<CalloutTextRenderingOptions>): void;
    getTextRendering(): CalloutTextRenderingOptions;
    constructor(scene: C.Scene, targetCount: number, getFrame: () => WorkerFrame, getHandles: () => readonly WorkerCalloutHandle[]);
    update(batch: GlyphBatch, enabled: Uint8Array, displayModes?: Uint8Array): void;
    private createVertexArray;
    /** Prepare screen parameters inside primitive.update, before Cesium executes scene commands. */
    draw(scene: C.Scene, frame: WorkerFrame, handles: readonly WorkerCalloutHandle[]): number;
    isDestroyed(): boolean;
    destroy(): void;
    private release;
}
//# sourceMappingURL=screenBatchRenderer.d.ts.map