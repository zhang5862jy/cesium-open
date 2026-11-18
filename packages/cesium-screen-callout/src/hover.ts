import * as C from "cesium";
import type { WorkerCalloutHandle } from "./workerHandle";
import { ACTION_GAP, ACTION_SIZE, ACTION_WIDTH } from "./presentationLayout";

export type CalloutHoverEventType = "mouseenter" | "mousemove" | "mouseleave" | "close" | "fixedchange";
export interface CalloutHoverEvent {
  type: CalloutHoverEventType;
  callout: WorkerCalloutHandle;
  properties: ReturnType<WorkerCalloutHandle["getProperties"]>;
  originalEvent?: Event;
}
type Listener = (event: CalloutHoverEvent) => void;
const toolbarEvents = ["pointerdown", "pointermove", "pointerup", "pointercancel", "click", "dblclick", "wheel", "contextmenu"] as const;

/** One toolbar for the entire batch. Call update after rendering current screen bounds. */
export class TargetCalloutHoverController {
  private active: WorkerCalloutHandle | undefined;
  private pointer = new C.Cartesian2();
  private inside = false;
  private overToolbar = false;
  private dragging = false;
  private listeners = new Map<CalloutHoverEventType, Set<Listener>>();
  readonly element = document.createElement("div");
  private pin = document.createElement("button");
  private close = document.createElement("button");
  private container: HTMLElement;
  private canvas: HTMLElement;
  private getCallouts: () => readonly WorkerCalloutHandle[];
  private ownsEventTarget: (target: EventTarget | null) => boolean;

  constructor(container: HTMLElement, canvas: HTMLElement, getCallouts: () => readonly WorkerCalloutHandle[], ownsEventTarget?: (target: EventTarget | null) => boolean) {
    this.container = container; this.canvas = canvas; this.getCallouts = getCallouts;
    this.ownsEventTarget = ownsEventTarget ?? (target => target === canvas);
    this.element.className = "target-callout-actions";
    this.element.setAttribute("role", "toolbar");
    this.element.setAttribute("aria-label", "标牌操作");
    this.element.style.cssText = `position:absolute;display:none;gap:${ACTION_GAP}px;z-index:1;pointer-events:auto;align-items:center;width:${ACTION_WIDTH}px;height:${ACTION_SIZE}px;transform-origin:0 0;transition:none;animation:none`;
    for (const button of [this.pin, this.close]) {
      button.type = "button";
      button.style.cssText = `box-sizing:border-box;flex:0 0 ${ACTION_SIZE}px;width:${ACTION_SIZE}px;height:${ACTION_SIZE}px;padding:0;border:1px solid #8c9caf;border-radius:50%;color:white;background:#253347;cursor:pointer;font:12px/12px sans-serif;transition:none;animation:none`;
      this.element.appendChild(button);
    }
    this.close.textContent = "×";
    this.close.title = "关闭当前标牌";
    this.close.setAttribute("aria-label", this.close.title);
    this.pin.addEventListener("click", this.togglePin);
    this.close.addEventListener("click", this.hide);
    // Keep button handlers and container capture listeners, but do not let a
    // toolbar gesture bubble into the OpenLayers viewport navigation handlers.
    for (const type of toolbarEvents) this.element.addEventListener(type, this.stopToolbarPropagation);
    this.container.appendChild(this.element);
    container.addEventListener("pointermove", this.move, true);
    container.addEventListener("pointerleave", this.leave);
    container.addEventListener("pointerdown", this.down, true);
    window.addEventListener("pointerup", this.up, true);
    window.addEventListener("pointercancel", this.up, true);
    container.addEventListener("lostpointercapture", this.up, true);
    window.addEventListener("blur", this.leave);
  }
  on(type: CalloutHoverEventType, listener: Listener): () => void {
    let set = this.listeners.get(type);
    if (!set) { set = new Set(); this.listeners.set(type, set); }
    set.add(listener);
    return () => { set.delete(listener); };
  }
  private emit(type: CalloutHoverEventType, callout: WorkerCalloutHandle, originalEvent?: Event): void {
    const event = { type, callout, properties: callout.getProperties(), originalEvent };
    this.listeners.get(type)?.forEach(listener => {
      try { listener(event); }
      catch (cause) { console.error(`TargetCalloutHoverController ${type}:`, cause); }
    });
  }
  private stopToolbarPropagation = (event: Event): void => { event.stopPropagation(); };
  private select(next: WorkerCalloutHandle | undefined, event?: Event): void {
    if (next === this.active) return;
    const old = this.active;
    this.active = next;
    if (old) this.emit("mouseleave", old, event);
    if (next) this.emit("mouseenter", next, event);
  }
  private move = (event: PointerEvent): void => {
    this.overToolbar = this.element.contains(event.target as Node);
    this.inside = this.ownsEventTarget(event.target) || this.overToolbar;
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0 || this.canvas.clientWidth <= 0 || this.canvas.clientHeight <= 0) {
      this.leave();
      return;
    }
    this.pointer.x = (event.clientX - rect.left) * this.canvas.clientWidth / rect.width;
    this.pointer.y = (event.clientY - rect.top) * this.canvas.clientHeight / rect.height;
    this.update(event);
    if (this.active) this.emit("mousemove", this.active, event);
  };
  private down = (event: PointerEvent): void => {
    if (!this.element.contains(event.target as Node) && this.ownsEventTarget(event.target)) {
      this.dragging = true;
      this.update(event);
    }
  };
  private up = (): void => { this.dragging = false; this.update(); };
  private leave = (): void => { this.inside = false; this.overToolbar = false; this.dragging = false; this.select(undefined); this.element.style.display = "none"; };
  private hasActions(callout: WorkerCalloutHandle | undefined): callout is WorkerCalloutHandle {
    // Hide immediately when compact is requested, and wait for detailed geometry
    // before showing again. Worker mode changes may still be in flight.
    return callout?.getDisplayMode() === "detailed" && callout.getRenderedDisplayMode() === "detailed"
      && callout.getScreenBounds().visible;
  }
  private hide = (event: MouseEvent): void => {
    const callout = this.active;
    if (!this.hasActions(callout)) { this.update(); return; }
    callout.setShow(false);
    this.emit("close", callout, event);
    this.leave();
  };
  private togglePin = (event: MouseEvent): void => {
    const callout = this.active;
    if (this.hasActions(callout) && callout.setScreenFixed(!callout.isScreenFixed())) this.emit("fixedchange", callout, event);
    this.update();
  };
  update(event?: Event): void {
    let next: WorkerCalloutHandle | undefined;
    if (this.inside && !this.dragging) {
      const items = this.getCallouts();
      // The viewport can host both controllers: drag's capture listener may
      // consume pointerdown before hover receives it, so also use handle state.
      if (!items.some(item => item.isDragging())) {
        if (this.overToolbar && this.hasActions(this.active)) next = this.active;
        else for (let i = items.length - 1; i >= 0; i--) if (items[i]!.hitTest(this.pointer)) { next = items[i]; break; }
      }
    }
    this.select(next, event);
    if (!this.hasActions(next)) {
      this.element.style.display = "none";
      this.overToolbar = false;
      return;
    }
    this.element.style.display = "flex";
    const bounds = next.getActionBounds();
    if (!bounds.visible || bounds.width <= 0 || bounds.height <= 0) {
      this.element.style.display = "none";
      this.overToolbar = false;
      return;
    }
    // Canvas CSS coordinates may differ from the toolbar's containing block.
    const canvasRect = this.canvas.getBoundingClientRect();
    const parent = this.element.offsetParent as HTMLElement | null;
    const parentRect = parent?.getBoundingClientRect();
    const scaleX = this.canvas.clientWidth ? canvasRect.width / this.canvas.clientWidth : 1;
    const scaleY = this.canvas.clientHeight ? canvasRect.height / this.canvas.clientHeight : 1;
    const parentScaleX = parent?.offsetWidth && parentRect ? parentRect.width / parent.offsetWidth : 1;
    const parentScaleY = parent?.offsetHeight && parentRect ? parentRect.height / parent.offsetHeight : 1;
    this.element.style.transform = `scale(${scaleX / parentScaleX},${scaleY / parentScaleY})`;
    this.element.style.left = `${(canvasRect.left - (parentRect?.left ?? 0) + bounds.left * scaleX) / parentScaleX - (parent?.clientLeft ?? 0) + (parent?.scrollLeft ?? window.scrollX)}px`;
    this.element.style.top = `${(canvasRect.top - (parentRect?.top ?? 0) + bounds.top * scaleY) / parentScaleY - (parent?.clientTop ?? 0) + (parent?.scrollTop ?? window.scrollY)}px`;
    this.pin.textContent = next.isScreenFixed() ? "◇" : "◆";
    this.pin.title = next.isScreenFixed() ? "取消固定" : "固定到屏幕";
    this.pin.setAttribute("aria-label", this.pin.title);
    this.pin.setAttribute("aria-pressed", String(next.isScreenFixed()));
  }
  destroy(): void {
    this.container.removeEventListener("pointermove", this.move, true);
    this.container.removeEventListener("pointerleave", this.leave);
    this.container.removeEventListener("pointerdown", this.down, true);
    window.removeEventListener("pointerup", this.up, true);
    window.removeEventListener("pointercancel", this.up, true);
    this.container.removeEventListener("lostpointercapture", this.up, true);
    window.removeEventListener("blur", this.leave);
    this.pin.removeEventListener("click", this.togglePin);
    this.close.removeEventListener("click", this.hide);
    for (const type of toolbarEvents) this.element.removeEventListener(type, this.stopToolbarPropagation);
    this.element.remove(); this.listeners.clear(); this.active = undefined;
  }
}
