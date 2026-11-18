import * as C from "cesium";
import type OpenLayersMap from "ol/Map.js";
import { TargetCalloutHoverController, type CalloutHoverEventType } from "./hover";
import { type TargetCalloutStyle } from "./legacyCallout";
import { type CalloutTextRenderingOptions } from "./screenBatchRenderer";
import { WorkerCalloutHandle, type TargetCalloutId } from "./workerHandle";
import { type CalloutAvoidanceOptions, type CalloutAvoidanceStats } from "./avoidance";
import { type CalloutDisplayMode, type CalloutField, type CompactFieldFormatter } from "./display";
export interface TargetCalloutDefinition {
    /** Stable business key. Defaults to the target's initial array index. */
    id?: TargetCalloutId;
    position: C.Cartesian3;
    lines?: readonly string[];
    style?: Partial<TargetCalloutStyle>;
    compactStyle?: Partial<TargetCalloutStyle>;
    titleStyle?: Partial<TargetCalloutStyle>;
    /** Value-only detailed header. Empty values still reserve the header row. */
    title?: string;
    /** One identification letter, normalized to uppercase. Defaults to A. */
    badgeText?: string;
    fields?: readonly CalloutField[];
    displayMode?: CalloutDisplayMode;
    compactFieldFormatter?: CompactFieldFormatter;
    offset?: C.Cartesian2;
    maxOffsetDistance?: number;
    show?: boolean;
}
export interface TargetCalloutLineUpdate {
    index: number;
    text: readonly string[];
}
export interface TargetCalloutFieldUpdate {
    index: number;
    fields: readonly CalloutField[];
}
export interface TargetCalloutTitleUpdate {
    index: number;
    title: string;
}
export interface TargetCalloutBadgeUpdate {
    index: number;
    badgeText: string;
}
export interface TargetCalloutBulkUpdate {
    /** Exactly targetCount * 3 ECEF values. */
    positions?: Float64Array;
    lines?: readonly TargetCalloutLineUpdate[];
    fields?: readonly TargetCalloutFieldUpdate[];
    titles?: readonly TargetCalloutTitleUpdate[];
    badges?: readonly TargetCalloutBadgeUpdate[];
}
export interface TargetCalloutManagerStats {
    computeMs: number;
    layoutMs: number;
    applyMs: number;
    latencyMs: number;
    visibleCount: number;
}
export interface TargetCalloutSharedOptions {
    targets: readonly TargetCalloutDefinition[];
    container?: HTMLElement;
    defaultStyle?: Partial<TargetCalloutStyle>;
    defaultCompactStyle?: Partial<TargetCalloutStyle>;
    defaultTitleStyle?: Partial<TargetCalloutStyle>;
    compactFieldFormatter?: CompactFieldFormatter;
    /** Default maximum target-to-panel-center distance in CSS pixels. Undefined means unlimited. */
    maxOffsetDistance?: number;
    textRendering?: Partial<CalloutTextRenderingOptions>;
    /** Screen-space collision avoidance; disabled by default for compatibility. */
    avoidance?: boolean | Partial<CalloutAvoidanceOptions>;
    /** Keep displayed positions as the new preferred offsets when disabling avoidance. Defaults to true. */
    preservePositionOnAvoidanceDisable?: boolean;
    draggable?: boolean;
    hoverActions?: boolean;
    onSelect?: (callout: WorkerCalloutHandle) => void;
    onClick?: (callout: WorkerCalloutHandle, event: MouseEvent) => void;
    onDoubleClick?: (callout: WorkerCalloutHandle, event: MouseEvent) => void;
    onDragEnd?: (callout: WorkerCalloutHandle) => void;
    onDisplayModeChange?: (callout: WorkerCalloutHandle) => void;
    onStats?: (stats: TargetCalloutManagerStats) => void;
    onError?: (error: Error) => void;
}
/** Choose exactly one host; all target data and handle APIs remain identical. */
export type TargetCalloutManagerOptions = TargetCalloutSharedOptions & ({
    scene: C.Scene;
    map?: never;
} | {
    scene?: never;
    map: OpenLayersMap;
});
/**
 * 标牌系统的公共入口：共享目标数据、轻量句柄及交互控制器。
 * 根据宿主选择 Cesium Worker/GPU 后端或 OpenLayers DOM 后端。
 */
export declare class TargetCalloutManager {
    readonly callouts: readonly WorkerCalloutHandle[];
    readonly ready: Promise<void>;
    readonly hover: TargetCalloutHoverController | undefined;
    private readonly options;
    private readonly preservePositionOnAvoidanceDisable;
    private readonly renderer;
    private readonly gpuRenderer?;
    private readonly domRenderer?;
    private readonly worker;
    private readonly drag;
    private readonly removePostRender?;
    private readonly clicks?;
    private readonly byId;
    private readonly pendingLines;
    private readonly waiters;
    private readonly pendingPatches;
    private frame;
    private pendingBulk;
    private recycledPositions;
    private recycledInstances;
    private requestId;
    private sentAt;
    private busy;
    private scheduled;
    private destroyed;
    private resolveReady;
    private rejectReady;
    private readySettled;
    private failure;
    private stats;
    constructor(options: TargetCalloutManagerOptions);
    get count(): number;
    get visibleCount(): number;
    getStats(): TargetCalloutManagerStats;
    get(index: number): WorkerCalloutHandle | undefined;
    getById(id: TargetCalloutId): WorkerCalloutHandle | undefined;
    isDestroyed(): boolean;
    getTextRendering(): CalloutTextRenderingOptions;
    setAvoidance(options: boolean | Partial<CalloutAvoidanceOptions>, mode?: CalloutDisplayMode): void;
    getAvoidance(mode?: CalloutDisplayMode): CalloutAvoidanceOptions;
    getAvoidanceStats(mode?: CalloutDisplayMode): CalloutAvoidanceStats;
    /** Resolves after queued updates reach the selected rendering backend; does not wait for the next map/scene frame. */
    flush(): Promise<void>;
    setTextRendering(options: Partial<CalloutTextRenderingOptions>): void;
    onHover(type: CalloutHoverEventType, listener: Parameters<TargetCalloutHoverController["on"]>[1]): () => void;
    /**
     * Keeps the latest full position batch and merges sparse lines by target.
     * transfer=true hands over the positions buffer from this call onward.
     */
    updateTargets(update: TargetCalloutBulkUpdate, transfer?: boolean): void;
    destroy(): void;
    private queuePatch;
    private requestRender;
    private hasPending;
    private schedule;
    private dispatch;
    private receive;
    private completeUpdate;
    private fail;
    private notifyError;
    private invoke;
    private ensureAlive;
}
//# sourceMappingURL=TargetCalloutManager.d.ts.map