import * as C from "cesium";
import { normalizeCalloutInteractionHost, type CalloutInteractionHost } from "./interactionHost";
export interface DraggableCallout {
  hitTest(point: C.Cartesian2): boolean;
  getTargetScreenPosition(result: C.Cartesian2): C.Cartesian2 | undefined;
  getOffset(result?: C.Cartesian2): C.Cartesian2;
  setOffset(offset: C.Cartesian2): void;
  setDragScreenPosition?(position: C.Cartesian2 | undefined): void;
}

/** One pointer controller per host. Transparent panel interiors remain draggable. */
export class TargetCalloutDragController<T extends DraggableCallout = DraggableCallout> {
  private readonly host: CalloutInteractionHost;
  private readonly getCallouts: () => readonly T[];
  private readonly onSelect?: (callout: T) => void;
  private readonly onDragEnd?: (callout: T) => void;
  private active: T | undefined;
  private pointerId: number | undefined;
  private readonly pointer = new C.Cartesian2();
  private readonly grab = new C.Cartesian2();
  private readonly downPoint = new C.Cartesian2();
  private dragStarted = false;
  private readonly scratch = new C.Cartesian2();
  private restoreInputs: (() => void) | undefined;
  private previousCursor = "";
  private readonly removeUpdate: () => void;

  constructor(source: C.Scene | CalloutInteractionHost, getCallouts: () => readonly T[], onSelect?: (callout: T) => void, onDragEnd?: (callout: T) => void) {
    this.host = normalizeCalloutInteractionHost(source);
    this.getCallouts = getCallouts;
    this.onSelect = onSelect;
    this.onDragEnd = onDragEnd;
    const canvas = this.host.element;
    canvas.addEventListener("pointerdown", this.down, true);
    canvas.addEventListener("pointermove", this.move, true);
    canvas.addEventListener("pointerup", this.up, true);
    canvas.addEventListener("pointercancel", this.up, true);
    canvas.addEventListener("lostpointercapture", this.cancel);
    window.addEventListener("blur", this.cancel);
    this.removeUpdate = this.host.onBeforeRender(() => this.updateDrag());
  }

  private locate(event: PointerEvent): boolean {
    const element = this.host.element;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0 || element.clientWidth <= 0 || element.clientHeight <= 0) return false;
    this.pointer.x = (event.clientX - rect.left) * element.clientWidth / rect.width;
    this.pointer.y = (event.clientY - rect.top) * element.clientHeight / rect.height;
    return true;
  }

  private down = (event: PointerEvent): void => {
    if (event.button !== 0 || this.active) return;
    if (this.host.ownsEventTarget && !this.host.ownsEventTarget(event.target)) return;
    if (!this.locate(event)) return;
    const items = this.getCallouts();
    let selected: T | undefined;
    for (let index = items.length - 1; index >= 0; index--) {
      if (items[index]!.hitTest(this.pointer)) { selected = items[index]; break; }
    }
    if (!selected) return;
    const anchor = selected.getTargetScreenPosition(this.scratch);
    if (!anchor) return;
    const offset = selected.getOffset();
    this.grab.x = this.pointer.x - anchor.x - offset.x;
    this.grab.y = this.pointer.y - anchor.y - offset.y;
    this.active = selected;
    C.Cartesian2.clone(this.pointer, this.downPoint);
    this.dragStarted = false;
    this.pointerId = event.pointerId;
    const element = this.host.element;
    this.previousCursor = element.style.cursor;
    this.restoreInputs = this.host.suspendInputs();
    element.style.cursor = "grabbing";
    try { element.setPointerCapture(event.pointerId); }
    catch { this.finish(false); return; }
    event.preventDefault();
    event.stopImmediatePropagation();
    this.onSelect?.(selected);
  };

  private updateDrag(): void {
    if (!this.active || !this.dragStarted) return;
    this.host.requestRender();
    if (this.active.setDragScreenPosition) {
      this.active.setDragScreenPosition(C.Cartesian2.fromElements(
        this.pointer.x - this.grab.x, this.pointer.y - this.grab.y, this.scratch,
      ));
      return;
    }
    const anchor = this.active.getTargetScreenPosition(this.scratch);
    if (anchor) this.active.setOffset(new C.Cartesian2(
      this.pointer.x - anchor.x - this.grab.x, this.pointer.y - anchor.y - this.grab.y,
    ));
  }

  private move = (event: PointerEvent): void => {
    if (!this.active || event.pointerId !== this.pointerId) return;
    if (!this.locate(event)) return;
    if (!this.dragStarted && C.Cartesian2.distance(this.pointer, this.downPoint) >= 3) this.dragStarted = true;
    this.updateDrag();
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  private up = (event: PointerEvent): void => {
    if (!this.active || event.pointerId !== this.pointerId) return;
    if (this.locate(event)) this.updateDrag();
    event.preventDefault();
    event.stopImmediatePropagation();
    this.cancel();
  };

  private cancel = (): void => { this.finish(true); };

  private finish(notify: boolean): void {
    if (!this.active) return;
    const selected = this.active;
    const wasDragging = this.dragStarted;
    if (wasDragging) selected.setDragScreenPosition?.(undefined);
    const id = this.pointerId;
    this.active = undefined;
    this.dragStarted = false;
    this.pointerId = undefined;
    this.restoreInputs?.();
    this.restoreInputs = undefined;
    const element = this.host.element;
    element.style.cursor = this.previousCursor;
    if (id !== undefined && element.hasPointerCapture(id)) element.releasePointerCapture(id);
    if (wasDragging) this.host.requestRender();
    if (notify && wasDragging) this.onDragEnd?.(selected);
  }

  destroy(): void {
    this.finish(false);
    this.removeUpdate();
    const canvas = this.host.element;
    canvas.removeEventListener("pointerdown", this.down, true);
    canvas.removeEventListener("pointermove", this.move, true);
    canvas.removeEventListener("pointerup", this.up, true);
    canvas.removeEventListener("pointercancel", this.up, true);
    canvas.removeEventListener("lostpointercapture", this.cancel);
    window.removeEventListener("blur", this.cancel);
  }
}
