import * as C from "cesium";
import { type TargetCalloutStyle } from "./legacyCallout";
import { type CalloutDisplayMode, type CalloutStyleSection, type CalloutField, type CompactFieldFormatter } from "./display";
export type TargetCalloutId = string | number;
export type TargetCalloutOverride = "position" | "lines";
export interface CalloutPatch {
    index: number;
    style?: TargetCalloutStyle;
    x?: number;
    y?: number;
    position?: number[] | null;
    lines?: string[] | null;
    show?: boolean;
    displayMode?: CalloutDisplayMode;
    compactLines?: string[];
    title?: string;
    badgeText?: string;
    titleStyle?: TargetCalloutStyle;
}
export interface PreparedCalloutContent {
    fields: CalloutField[];
    sourceLines: string[];
    compactLines: string[];
    title?: string;
}
export interface WorkerFrame {
    positions: Float64Array;
    bounds: Float32Array;
    /** Mode of the displayed geometry, committed when matching screen bounds are projected. */
    displayModes?: Uint8Array;
    /** Button rectangles relative to the panel top-left; committed with matching screen bounds. */
    actionRects?: Float32Array;
    /** Optional revision for bounding-sphere caching. Increment whenever positions change. */
    positionsVersion?: number;
}
export interface WorkerCalloutHandleOptions {
    id?: TargetCalloutId;
    ensureAlive?: () => void;
    requestRender?: () => void;
    onDisplayModeChange?: (handle: WorkerCalloutHandle) => void;
    compactFieldFormatter?: CompactFieldFormatter;
}
/** 单目标轻量句柄：维护配置、屏幕偏移及命中区域，不拥有渲染资源。 */
export declare class WorkerCalloutHandle {
    private static dragSequence;
    readonly index: number;
    readonly id: TargetCalloutId;
    private readonly frame;
    private readonly change;
    private styles;
    private title;
    private badgeText;
    private displayMode;
    private fields;
    private sourceLines;
    private compactLines;
    private compactFieldFormatter;
    private offset;
    private displayOffset;
    private dragOrder;
    private maxOffsetDistance;
    private fixedScreenPosition;
    private dragScreenPosition;
    private show;
    private readonly options;
    constructor(index: number, frame: () => WorkerFrame, change: (patch: CalloutPatch) => void, options?: WorkerCalloutHandleOptions);
    getStyle(mode?: CalloutStyleSection): TargetCalloutStyle;
    setStyle(patch: Partial<TargetCalloutStyle>, mode?: CalloutStyleSection): void;
    getTitle(): string;
    setTitle(title: string): void;
    getBadgeText(): string;
    setBadgeText(text: string): void;
    getDisplayMode(): CalloutDisplayMode;
    getRenderedDisplayMode(): CalloutDisplayMode;
    setDisplayMode(mode: CalloutDisplayMode): void;
    toggleDisplayMode(): void;
    getFields(): CalloutField[];
    /** Prepare all content before committing any part of a bulk update. */
    prepareContent(fields?: readonly CalloutField[], lines?: readonly string[]): PreparedCalloutContent;
    /** Manager-only commit; formatter/validation already succeeded. */
    applyContent(content: PreparedCalloutContent): void;
    setFields(fields: readonly CalloutField[]): void;
    setCompactFieldFormatter(formatter: CompactFieldFormatter | undefined): void;
    /** Actual displayed offset, including automatic avoidance. */
    getOffset(result?: C.Cartesian2): C.Cartesian2;
    /** User-configured offset before automatic avoidance. */
    getPreferredOffset(result?: C.Cartesian2): C.Cartesian2;
    isDragging(): boolean;
    getAvoidancePriority(): number;
    /** Renderer-only placement; never sends a Worker patch or overwrites user configuration. */
    applyAvoidanceOffset(x: number, y: number): void;
    getMaxOffsetDistance(): number;
    /** Maximum distance from target to panel center in CSS pixels. Infinity disables the limit. */
    setMaxOffsetDistance(distance?: number): void;
    isScreenFixed(): boolean;
    /** Capture the panel's bottom-left in canvas CSS pixels. Returns false before a visible frame. */
    setScreenFixed(fixed: boolean): boolean;
    /** Called with the current camera projection; pinning never waits for the Worker. */
    resolveScreenOffset(x: number, y: number, result?: C.Cartesian2): C.Cartesian2;
    /** Drag owns absolute screen position until release; incoming target data only moves the leader. */
    setDragScreenPosition(position: C.Cartesian2 | undefined): void;
    setOffset(offset: C.Cartesian2): void;
    setDistance(distance: number): void;
    setPosition(position: C.Cartesian3): void;
    setLines(lines: readonly string[]): void;
    /** Resume the latest source data, including updates received while overridden. */
    resetOverrides(fields?: readonly TargetCalloutOverride[]): void;
    setShow(show: boolean): void;
    getShow(): boolean;
    getScreenBounds(): {
        left: number;
        top: number;
        width: number;
        height: number;
        visible: boolean;
    };
    getActionBounds(): {
        left: number;
        top: number;
        width: number;
        height: number;
        visible: boolean;
    };
    getProperties(): {
        id: TargetCalloutId;
        index: number;
        position: C.Cartesian3;
        offset: C.Cartesian2;
        maxOffsetDistance: number;
        style: TargetCalloutStyle;
        titleStyle: TargetCalloutStyle;
        title: string;
        badgeText: string;
        displayMode: CalloutDisplayMode;
        fields: CalloutField[];
        screenFixed: boolean;
        show: boolean;
        bounds: {
            left: number;
            top: number;
            width: number;
            height: number;
            visible: boolean;
        };
    };
    getPosition(result?: C.Cartesian3): C.Cartesian3;
    getTargetScreenPosition(result?: C.Cartesian2): C.Cartesian2 | undefined;
    hitTest(point: C.Cartesian2): boolean;
    private clampOffset;
}
//# sourceMappingURL=workerHandle.d.ts.map