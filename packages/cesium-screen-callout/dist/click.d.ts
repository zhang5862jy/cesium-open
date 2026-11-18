import type { CalloutInteractionHost } from "./interactionHost";
import type { WorkerCalloutHandle } from "./workerHandle";
export interface CalloutClickOptions {
    onClick?: (callout: WorkerCalloutHandle, event: MouseEvent) => void;
    onDoubleClick?: (callout: WorkerCalloutHandle, event: MouseEvent) => void;
    onSelect?: (callout: WorkerCalloutHandle) => void;
    /** Consume label pointer gestures when no drag controller owns them. */
    blockMapGestures?: boolean;
}
/** Shared click handling; both map backends use the same screen-space hit regions. */
export declare class TargetCalloutClickController {
    private downX;
    private downY;
    private moved;
    private pointerId;
    private blockedPointerId;
    private readonly point;
    private readonly host;
    private readonly getCallouts;
    private readonly options;
    constructor(host: CalloutInteractionHost, getCallouts: () => readonly WorkerCalloutHandle[], options: CalloutClickOptions);
    private owns;
    private down;
    private move;
    private up;
    private releaseBlockedPointer;
    private cancel;
    private lostCapture;
    private pick;
    private click;
    private doubleClick;
    destroy(): void;
}
//# sourceMappingURL=click.d.ts.map