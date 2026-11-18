import type Map from "ol/Map.js";
import { type CalloutAvoidanceOptions, type CalloutAvoidanceStats } from "./avoidance";
import { type CalloutDisplayMode } from "./display";
import type { TargetCalloutStyle } from "./legacyCallout";
import { type CalloutTextRenderingOptions } from "./screenBatchRenderer";
import type { CalloutPatch, WorkerCalloutHandle, WorkerFrame } from "./workerHandle";
import type { CalloutRenderer } from "./rendererInterface";
export interface DomCalloutTarget {
    position: readonly number[];
    lines: readonly string[];
    compactLines?: readonly string[];
    displayMode?: CalloutDisplayMode;
    style: TargetCalloutStyle;
    title?: string;
    badgeText?: string;
    titleStyle?: TargetCalloutStyle;
    show: boolean;
}
export interface DomCalloutUpdate {
    positions?: Float64Array;
    lines?: readonly {
        index: number;
        text: readonly string[];
    }[];
    patches: readonly CalloutPatch[];
}
export interface DomCalloutRenderStats {
    computeMs: number;
    layoutMs: number;
    applyMs: number;
}
/** OpenLayers backend. The public handles and ECEF source data are shared with the Cesium backend. */
export declare class DomCalloutRenderer implements CalloutRenderer {
    readonly overlay: HTMLDivElement;
    visibleCount: number;
    private readonly map;
    private readonly viewport;
    private readonly getFrame;
    private readonly getHandles;
    private readonly items;
    private readonly sourcePositions;
    private readonly projected;
    private readonly offset;
    private readonly previousOffset;
    private readonly previousPreference;
    private readonly cartesian;
    private readonly cartographic;
    private projection;
    private projectedVersion;
    private readonly avoidanceGroups;
    private readonly avoidanceItems;
    private textRendering;
    private readonly beforeRenderListeners;
    private readonly postRenderListeners;
    private destroyed;
    private rendering;
    private errorHandler;
    constructor(map: Map, getFrame: () => WorkerFrame, getHandles: () => readonly WorkerCalloutHandle[], targets: readonly DomCalloutTarget[]);
    /** Applies validated data in one batch; no Worker, glyph atlas, or WebGL context is allocated. */
    update(data: DomCalloutUpdate): DomCalloutRenderStats;
    /** Every style/content write precedes all size reads, avoiding per-panel forced layout. */
    private measureDirtyItems;
    /** Map viewport coordinates are always CSS pixels, independent of devicePixelRatio. */
    render: () => void;
    /** Synchronous update errors propagate to the caller; asynchronous map errors go to the owner. */
    setErrorHandler(handler: (error: Error) => void): void;
    private handleMapRender;
    private draw;
    private projectTargets;
    private placeLeader;
    onBeforeRender(listener: () => void): () => void;
    onPostRender(listener: () => void): () => void;
    ownsEventTarget(target: EventTarget | null): boolean;
    setAvoidance(options: boolean | Partial<CalloutAvoidanceOptions>, mode?: CalloutDisplayMode): void;
    getAvoidance(mode?: CalloutDisplayMode): CalloutAvoidanceOptions;
    getAvoidanceStats(mode?: CalloutDisplayMode): CalloutAvoidanceStats;
    setTextRendering(options: Partial<CalloutTextRenderingOptions>): void;
    getTextRendering(): CalloutTextRenderingOptions;
    private fontsChanged;
    isDestroyed(): boolean;
    destroy(): void;
}
//# sourceMappingURL=domRenderer.d.ts.map