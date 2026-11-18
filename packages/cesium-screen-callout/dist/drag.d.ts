import * as C from "cesium";
import { type CalloutInteractionHost } from "./interactionHost";
export interface DraggableCallout {
    hitTest(point: C.Cartesian2): boolean;
    getTargetScreenPosition(result: C.Cartesian2): C.Cartesian2 | undefined;
    getOffset(result?: C.Cartesian2): C.Cartesian2;
    setOffset(offset: C.Cartesian2): void;
    setDragScreenPosition?(position: C.Cartesian2 | undefined): void;
}
/** One pointer controller per host. Transparent panel interiors remain draggable. */
export declare class TargetCalloutDragController<T extends DraggableCallout = DraggableCallout> {
    private readonly host;
    private readonly getCallouts;
    private readonly onSelect?;
    private readonly onDragEnd?;
    private active;
    private pointerId;
    private readonly pointer;
    private readonly grab;
    private readonly downPoint;
    private dragStarted;
    private readonly scratch;
    private restoreInputs;
    private previousCursor;
    private readonly removeUpdate;
    constructor(source: C.Scene | CalloutInteractionHost, getCallouts: () => readonly T[], onSelect?: (callout: T) => void, onDragEnd?: (callout: T) => void);
    private locate;
    private down;
    private updateDrag;
    private move;
    private up;
    private cancel;
    private finish;
    destroy(): void;
}
//# sourceMappingURL=drag.d.ts.map