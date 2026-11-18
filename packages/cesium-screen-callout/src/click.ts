import { Cartesian2 } from "cesium";
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
export class TargetCalloutClickController {
  private downX = 0;
  private downY = 0;
  private moved = false;
  private pointerId: number | undefined;
  private blockedPointerId: number | undefined;
  private readonly point = new Cartesian2();
  private readonly host: CalloutInteractionHost;
  private readonly getCallouts: () => readonly WorkerCalloutHandle[];
  private readonly options: CalloutClickOptions;

  constructor(
    host: CalloutInteractionHost,
    getCallouts: () => readonly WorkerCalloutHandle[],
    options: CalloutClickOptions,
  ) {
    this.host = host; this.getCallouts = getCallouts; this.options = options;
    const element = host.element;
    element.addEventListener("pointerdown", this.down, true);
    element.addEventListener("pointermove", this.move, true);
    element.addEventListener("pointerup", this.up, true);
    element.addEventListener("pointercancel", this.cancel, true);
    element.addEventListener("lostpointercapture", this.lostCapture);
    element.addEventListener("click", this.click, true);
    element.addEventListener("dblclick", this.doubleClick, true);
    window.addEventListener("blur", this.cancel);
  }
  private owns(target: EventTarget | null): boolean {
    return this.host.ownsEventTarget?.(target) ?? target === this.host.element;
  }
  private down = (event: PointerEvent): void => {
    if (event.button !== 0 || !this.owns(event.target)) return;
    this.downX = event.clientX; this.downY = event.clientY;
    this.moved = false; this.pointerId = event.pointerId;
    // OpenLayers emits its own click/dblclick from pointerup, before a native
    // dblclick handler can stop DoubleClickZoom. Own the complete label gesture.
    if (this.options.blockMapGestures && this.pick(event)) {
      this.blockedPointerId = event.pointerId;
      try { this.host.element.setPointerCapture(event.pointerId); } catch { /* Synthetic events have no active pointer. */ }
      event.preventDefault(); event.stopImmediatePropagation();
    }
  };
  private move = (event: PointerEvent): void => {
    if (this.pointerId === event.pointerId && Math.hypot(event.clientX - this.downX, event.clientY - this.downY) >= 3) this.moved = true;
    if (event.pointerId === this.blockedPointerId) { event.preventDefault(); event.stopImmediatePropagation(); }
  };
  private up = (event: PointerEvent): void => {
    if (event.pointerId !== this.blockedPointerId) return;
    event.preventDefault(); event.stopImmediatePropagation();
    this.releaseBlockedPointer();
  };
  private releaseBlockedPointer(): void {
    const id = this.blockedPointerId;
    this.blockedPointerId = undefined;
    if (id !== undefined && this.host.element.hasPointerCapture(id)) this.host.element.releasePointerCapture(id);
  }
  private cancel = (event?: Event): void => {
    if (this.blockedPointerId !== undefined && event?.type === "pointercancel") {
      event.preventDefault(); event.stopImmediatePropagation();
    }
    this.releaseBlockedPointer(); this.moved = true; this.pointerId = undefined;
  };
  private lostCapture = (event: PointerEvent): void => {
    if (event.pointerId === this.blockedPointerId) this.cancel(event);
  };
  private pick(event: MouseEvent): WorkerCalloutHandle | undefined {
    if (event.button !== 0 || this.moved || !this.owns(event.target)) return;
    const element = this.host.element, rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    this.point.x = (event.clientX - rect.left) * element.clientWidth / rect.width;
    this.point.y = (event.clientY - rect.top) * element.clientHeight / rect.height;
    const callouts = this.getCallouts();
    if (callouts.some(callout => callout.isDragging())) return;
    for (let index = callouts.length - 1; index >= 0; index--) {
      if (callouts[index]!.hitTest(this.point)) return callouts[index];
    }
    return undefined;
  }
  private click = (event: MouseEvent): void => {
    const callout = this.pick(event);
    this.pointerId = undefined;
    if (!callout) return;
    event.preventDefault(); event.stopImmediatePropagation();
    this.options.onSelect?.(callout);
    this.options.onClick?.(callout, event);
  };
  private doubleClick = (event: MouseEvent): void => {
    const callout = this.pick(event);
    if (!callout) return;
    event.preventDefault(); event.stopImmediatePropagation();
    callout.toggleDisplayMode();
    this.options.onDoubleClick?.(callout, event);
  };
  destroy(): void {
    const element = this.host.element;
    element.removeEventListener("pointerdown", this.down, true);
    element.removeEventListener("pointermove", this.move, true);
    element.removeEventListener("pointerup", this.up, true);
    element.removeEventListener("pointercancel", this.cancel, true);
    element.removeEventListener("lostpointercapture", this.lostCapture);
    element.removeEventListener("click", this.click, true);
    element.removeEventListener("dblclick", this.doubleClick, true);
    window.removeEventListener("blur", this.cancel);
    this.releaseBlockedPointer();
  }
}
