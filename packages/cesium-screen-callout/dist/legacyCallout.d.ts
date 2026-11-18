import * as C from "cesium";
import { type TargetCalloutFontStyle, type TargetCalloutFontWeight } from "./font";
export interface TargetCalloutStyle {
    leaderColor: string;
    borderColor: string;
    textColor: string;
    backgroundColor: string;
    /** Square identification badge; used by compact content and the detailed title. */
    badgeColor: string;
    badgeTextColor: string;
    fontSize: number;
    fontFamily: string;
    fontStyle: TargetCalloutFontStyle;
    fontWeight: TargetCalloutFontWeight;
    lineGap: number;
    paddingTop: number;
    paddingRight: number;
    paddingBottom: number;
    paddingLeft: number;
    showBorder: boolean;
    showLeader: boolean;
}
export declare const DEFAULT_CALLOUT_STYLE: Readonly<TargetCalloutStyle>;
export interface TargetCalloutOptions {
    /** CSS pixels from target centre to panel bottom-left. Overrides distance. */
    offset?: C.Cartesian2;
    distance?: number;
    /** Maximum target-to-panel-center distance in CSS pixels. Undefined means unlimited. */
    maxOffsetDistance?: number;
    style?: Partial<TargetCalloutStyle>;
    /** Batch owners can supply visibility instead of registering one per-frame callback per label. */
    externalVisibility?: boolean;
}
export type CalloutCorner = "bottom-left" | "top-left" | "top-right" | "bottom-right";
/** Pixel annotation. All instances in a scene share one texture and two collections. */
export declare class TargetCallout {
    private readonly scene;
    private readonly pool;
    private readonly panel;
    private readonly line;
    private readonly borders;
    private readonly rows;
    private readonly position;
    private readonly screen;
    private readonly direction;
    private readonly ray;
    private readonly offset;
    private readonly leaderEndpoint;
    private leaderCorner;
    private readonly removeUpdate;
    private readonly measure;
    private style;
    private width;
    private height;
    private lineCount;
    private enabled;
    private visible;
    private destroyed;
    private readonly externalVisibility;
    private textDirty;
    private measuredWidth;
    private maxOffsetDistance;
    constructor(scene: C.Scene, position: C.Cartesian3, options?: number | TargetCalloutOptions, legacyStyle?: Partial<TargetCalloutStyle>);
    setPosition(position: C.Cartesian3): void;
    /** At most six rows. Panel grows to accommodate font size and text width. */
    setLines(lines: readonly string[]): void;
    private validateDistance;
    private validateMaxOffsetDistance;
    private validateStyle;
    getStyle(): TargetCalloutStyle;
    setStyle(patch: Partial<TargetCalloutStyle>): void;
    /** Resets direction to upper-right 45 degrees. */
    setDistance(distance: number): void;
    getOffset(result?: C.Cartesian2): C.Cartesian2;
    getMaxOffsetDistance(): number;
    setMaxOffsetDistance(distance?: number): void;
    getLeaderEndpoint(result?: C.Cartesian2): C.Cartesian2;
    getLeaderCorner(): CalloutCorner;
    /** Offset from target centre to bottom-left, in CSS pixels. */
    setOffset(offset: C.Cartesian2): void;
    private clampOffsetToMaxDistance;
    private layout;
    getTargetScreenPosition(result?: C.Cartesian2): C.Cartesian2 | undefined;
    hitTest(point: C.Cartesian2): boolean;
    setShow(show: boolean): void;
    private applyShow;
    private updateVisibility;
    destroy(): void;
}
export { TargetCalloutDragController } from "./drag";
//# sourceMappingURL=legacyCallout.d.ts.map