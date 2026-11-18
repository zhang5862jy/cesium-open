import type { WorkerCalloutHandle } from "./workerHandle";
export type CalloutHoverEventType = "mouseenter" | "mousemove" | "mouseleave" | "close" | "fixedchange";
export interface CalloutHoverEvent {
    type: CalloutHoverEventType;
    callout: WorkerCalloutHandle;
    properties: ReturnType<WorkerCalloutHandle["getProperties"]>;
    originalEvent?: Event;
}
type Listener = (event: CalloutHoverEvent) => void;
/** One toolbar for the entire batch. Call update after rendering current screen bounds. */
export declare class TargetCalloutHoverController {
    private active;
    private pointer;
    private inside;
    private overToolbar;
    private dragging;
    private listeners;
    readonly element: HTMLDivElement;
    private pin;
    private close;
    private container;
    private canvas;
    private getCallouts;
    private ownsEventTarget;
    constructor(container: HTMLElement, canvas: HTMLElement, getCallouts: () => readonly WorkerCalloutHandle[], ownsEventTarget?: (target: EventTarget | null) => boolean);
    on(type: CalloutHoverEventType, listener: Listener): () => void;
    private emit;
    private stopToolbarPropagation;
    private select;
    private move;
    private down;
    private up;
    private leave;
    private hasActions;
    private hide;
    private togglePin;
    update(event?: Event): void;
    destroy(): void;
}
export {};
//# sourceMappingURL=hover.d.ts.map