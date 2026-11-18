export interface CalloutAvoidanceOptions {
    enabled: boolean;
    /** Minimum spacing between panel rectangles, in CSS pixels. */
    gap: number;
    /** Maximum expanded local repair candidates per panel (heap estimates are separate). */
    maxCandidates: number;
    /** Maximum separation-projection sweeps; work is also capped for dense scenes. */
    maxIterations: number;
    /** Maximum automatic displacement from the configured position, in CSS pixels. Infinity disables it. */
    maxDisplacement: number;
    /** Preference for the configured position after collision constraints are satisfied. */
    distanceWeight: number;
}
export declare const DEFAULT_CALLOUT_AVOIDANCE: Readonly<CalloutAvoidanceOptions>;
export interface CalloutAvoidanceStats {
    /** Visible panels participating in a remaining overlap (including the spacing gap). */
    unresolved: number;
    moved: number;
    /** Expanded local candidates / density samples; excludes broad-phase and heap estimates. */
    candidateChecks: number;
}
export declare function normalizeAvoidance(value: boolean | Partial<CalloutAvoidanceOptions>, previous?: Readonly<CalloutAvoidanceOptions>): CalloutAvoidanceOptions;
export interface AvoidanceItem {
    index: number;
    visible: boolean;
    preferredLeft: number;
    preferredTop: number;
    anchorX: number;
    anchorY: number;
    width: number;
    height: number;
    maxDistance: number;
    dragging: boolean;
    priority: number;
    /** Output: top-left corner in canvas CSS pixels. */
    left: number;
    top: number;
}
/**
 * Warm-started rectangle separation via projected Gauss-Seidel relaxation.
 * Like VPSC/adjustText, solves interacting rectangles with minimum-displacement
 * corrections. Existing placements reserve their space and local repairs try
 * to move one conflicting rectangle before propagating a correction. This is
 * a bounded 2D heuristic, NOT a VPSC quadratic solver or a minimum-cardinality
 * optimizer. Active drags defer layout; the released rectangle is protected.
 */
export declare class CalloutAvoidanceLayout {
    private previous;
    private cells;
    private stamps;
    private queryId;
    private bodies;
    private dragged;
    private viewportWidth;
    private viewportHeight;
    private configuration;
    private stats;
    private gap;
    private maxDisplacement;
    private distanceWeight;
    private settledInputs;
    private deferred;
    clear(): void;
    /** defer also freezes this group while a different display group is dragged. */
    layout(items: readonly AvoidanceItem[], width: number, height: number, options: CalloutAvoidanceOptions, defer?: boolean): CalloutAvoidanceStats;
    private canReusePlacement;
    private finish;
    /**
     * When requested area exceeds the viewport, use an occupancy energy field.
     * Every panel contributes (including unresolved ones); bounded local moves
     * reduce crowding without performing an infeasible quadratic pair solve.
     * Exact local passes surround this approximation; density is never the only
     * collision check for an independently repairable sparse neighborhood.
     */
    private layoutSaturated;
    /** Distance intervals, plus conditional containment for collision repairs. */
    private interval;
    private constrain;
    private overlap;
    private hasOverlap;
    /** Propagate the released panel's precedence through touching neighbors. */
    private propagateDragPriority;
    private separate;
    private better;
    private betterDensity;
    private changed;
    private displacementCost;
    private localScore;
    private measure;
    /** Bounded exact repairs for small neighborhoods, even in saturated views. */
    private repairSparse;
    private repair;
    private protectDrag;
    private remove;
    private insert;
    private query;
    private visitCells;
}
//# sourceMappingURL=avoidance.d.ts.map