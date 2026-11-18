import * as C from "cesium";
import { DEFAULT_CALLOUT_STYLE, type TargetCalloutStyle } from "./legacyCallout";
import { normalizeTitle, normalizeBadgeText, validateLines, validateMaxOffsetDistance, validatePosition, validateStyle } from "./validation";
import { ACTION_WIDTH, ACTION_SIZE } from "./presentationLayout";
import {
  DEFAULT_COMPACT_CALLOUT_STYLE, DEFAULT_TITLE_CALLOUT_STYLE, copyCalloutFields, formatCompactFields, getFieldTitle, validateDisplayMode, validateStyleSection,
  type CalloutDisplayMode, type CalloutStyleSection, type CalloutField, type CompactFieldFormatter,
} from "./display";

export type TargetCalloutId = string | number;
export type TargetCalloutOverride = "position" | "lines";
export interface CalloutPatch {
  index: number; style?: TargetCalloutStyle; x?: number; y?: number;
  position?: number[] | null; lines?: string[] | null; show?: boolean;
  displayMode?: CalloutDisplayMode; compactLines?: string[];
  title?: string; badgeText?: string; titleStyle?: TargetCalloutStyle;
}
export interface PreparedCalloutContent { fields: CalloutField[]; sourceLines: string[]; compactLines: string[]; title?: string }
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
export class WorkerCalloutHandle {
  private static dragSequence = 0;
  readonly index: number;
  readonly id: TargetCalloutId;
  private readonly frame: () => WorkerFrame;
  private readonly change: (patch: CalloutPatch) => void;
  private styles: Record<CalloutStyleSection, TargetCalloutStyle> = {
    detailed: { ...DEFAULT_CALLOUT_STYLE }, compact: { ...DEFAULT_COMPACT_CALLOUT_STYLE },
    title: { ...DEFAULT_TITLE_CALLOUT_STYLE },
  };
  private title = "";
  private badgeText = "A";
  private displayMode: CalloutDisplayMode = "detailed";
  private fields: CalloutField[] = [];
  private sourceLines: string[] = [];
  private compactLines: string[] = [];
  private compactFieldFormatter: CompactFieldFormatter | undefined;
  private offset = new C.Cartesian2(80, -80);
  private displayOffset = new C.Cartesian2(80, -80);
  private dragOrder = 0;
  private maxOffsetDistance = Number.POSITIVE_INFINITY;
  private fixedScreenPosition: C.Cartesian2 | undefined;
  private dragScreenPosition: C.Cartesian2 | undefined;
  private show = true;
  private readonly options: WorkerCalloutHandleOptions;
  constructor(index: number, frame: () => WorkerFrame, change: (patch: CalloutPatch) => void, options: WorkerCalloutHandleOptions = {}) {
    this.index = index; this.frame = frame; this.change = change;
    this.id = options.id ?? index;
    this.options = options;
    this.compactFieldFormatter = options.compactFieldFormatter;
  }
  getStyle(mode: CalloutStyleSection = this.displayMode): TargetCalloutStyle {
    validateStyleSection(mode);
    return { ...this.styles[mode] };
  }
  setStyle(patch: Partial<TargetCalloutStyle>, mode: CalloutStyleSection = this.displayMode): void {
    this.options.ensureAlive?.();
    validateStyleSection(mode);
    const next = validateStyle({ ...this.styles[mode], ...patch });
    if ((Object.keys(next) as (keyof TargetCalloutStyle)[]).every(key => next[key] === this.styles[mode][key])) return;
    this.styles[mode] = next;
    if (mode === "title") this.change({ index: this.index, titleStyle: { ...next } });
    else if (mode === this.displayMode) this.change({ index: this.index, style: { ...next } });
  }
  getTitle(): string { return this.title; }
  setTitle(title: string): void {
    this.options.ensureAlive?.();
    const next = normalizeTitle(title);
    if (next === this.title) return;
    this.title = next;
    this.change({ index: this.index, title: next });
  }
  getBadgeText(): string { return this.badgeText; }
  setBadgeText(text: string): void {
    this.options.ensureAlive?.();
    const next = normalizeBadgeText(text);
    if (next === this.badgeText) return;
    this.badgeText = next;
    this.change({ index: this.index, badgeText: next });
  }
  getDisplayMode(): CalloutDisplayMode { return this.displayMode; }
  getRenderedDisplayMode(): CalloutDisplayMode { return this.frame().displayModes?.[this.index] === 1 ? "compact" : "detailed"; }
  setDisplayMode(mode: CalloutDisplayMode): void {
    this.options.ensureAlive?.();
    validateDisplayMode(mode);
    if (mode === this.displayMode) return;
    this.displayMode = mode;
    this.change({ index: this.index, displayMode: mode, style: this.getStyle() });
    this.options.onDisplayModeChange?.(this);
  }
  toggleDisplayMode(): void { this.setDisplayMode(this.displayMode === "detailed" ? "compact" : "detailed"); }
  getFields(): CalloutField[] { return this.fields.map(field => ({ ...field })); }
  /** Prepare all content before committing any part of a bulk update. */
  prepareContent(fields?: readonly CalloutField[], lines: readonly string[] = this.sourceLines): PreparedCalloutContent {
    validateLines(lines);
    const snapshot = copyCalloutFields(fields ?? this.fields);
    return { fields: snapshot, sourceLines: [...lines], compactLines: formatCompactFields(snapshot, this.compactFieldFormatter, this.id, lines),
      title: fields === undefined ? undefined : getFieldTitle(snapshot) };
  }
  /** Manager-only commit; formatter/validation already succeeded. */
  applyContent(content: PreparedCalloutContent): void {
    this.fields = content.fields; this.sourceLines = content.sourceLines;
    if (content.title !== undefined) this.setTitle(content.title);
    const changed = content.compactLines.length !== this.compactLines.length
      || content.compactLines.some((line, index) => line !== this.compactLines[index]);
    this.compactLines = content.compactLines;
    if (changed) this.change({ index: this.index, compactLines: [...this.compactLines] });
  }
  setFields(fields: readonly CalloutField[]): void {
    this.options.ensureAlive?.();
    this.applyContent(this.prepareContent(fields));
  }
  setCompactFieldFormatter(formatter: CompactFieldFormatter | undefined): void {
    this.options.ensureAlive?.();
    const compactLines = formatCompactFields(this.fields, formatter, this.id, this.sourceLines);
    this.compactFieldFormatter = formatter;
    this.applyContent({ fields: this.fields, sourceLines: this.sourceLines, compactLines });
  }
  /** Actual displayed offset, including automatic avoidance. */
  getOffset(result = new C.Cartesian2()): C.Cartesian2 { return C.Cartesian2.clone(this.displayOffset, result); }
  /** User-configured offset before automatic avoidance. */
  getPreferredOffset(result = new C.Cartesian2()): C.Cartesian2 { return C.Cartesian2.clone(this.offset, result); }
  isDragging(): boolean { return this.dragScreenPosition !== undefined; }
  getAvoidancePriority(): number { return this.dragOrder ? this.dragOrder + 1 : Number(this.isScreenFixed()); }
  /** Renderer-only placement; never sends a Worker patch or overwrites user configuration. */
  applyAvoidanceOffset(x: number, y: number): void {
    this.displayOffset.x = x; this.displayOffset.y = y;
  }
  getMaxOffsetDistance(): number { return this.maxOffsetDistance; }
  /** Maximum distance from target to panel center in CSS pixels. Infinity disables the limit. */
  setMaxOffsetDistance(distance = Number.POSITIVE_INFINITY): void {
    this.options.ensureAlive?.();
    validateMaxOffsetDistance(distance);
    if (distance === this.maxOffsetDistance) return;
    this.maxOffsetDistance = distance;
    this.setOffset(C.Cartesian2.clone(this.offset));
    this.options.requestRender?.();
  }
  isScreenFixed(): boolean { return this.fixedScreenPosition !== undefined; }
  /** Capture the panel's bottom-left in canvas CSS pixels. Returns false before a visible frame. */
  setScreenFixed(fixed: boolean): boolean {
    this.options.ensureAlive?.();
    if (fixed === this.isScreenFixed()) return true;
    const b = this.frame().bounds, i = this.index * 5;
    if (fixed) {
      if (!this.show || !b[i + 4]) return false;
      this.fixedScreenPosition = new C.Cartesian2(b[i]! + this.displayOffset.x, b[i + 1]! + this.displayOffset.y);
      C.Cartesian2.clone(this.displayOffset, this.offset);
    } else {
      // Keep the current separation rather than restoring the offset captured at pin time.
      C.Cartesian2.clone(this.displayOffset, this.offset);
      this.fixedScreenPosition = undefined;
    }
    this.options.requestRender?.();
    return true;
  }
  /** Called with the current camera projection; pinning never waits for the Worker. */
  resolveScreenOffset(x: number, y: number, result = this.offset): C.Cartesian2 {
    const screen = this.dragScreenPosition ?? this.fixedScreenPosition;
    if (screen) {
      this.offset.x = screen.x - x;
      this.offset.y = screen.y - y;
    }
    this.clampOffset(this.offset);
    C.Cartesian2.clone(this.offset, this.displayOffset);
    return C.Cartesian2.clone(this.offset, result);
  }
  /** Drag owns absolute screen position until release; incoming target data only moves the leader. */
  setDragScreenPosition(position: C.Cartesian2 | undefined): void {
    if (position) {
      if (!this.dragScreenPosition) this.dragOrder = ++WorkerCalloutHandle.dragSequence;
      this.dragScreenPosition = C.Cartesian2.clone(position, this.dragScreenPosition);
    } else if (this.dragScreenPosition) {
      const b = this.frame().bounds, i = this.index * 5;
      this.resolveScreenOffset(b[i]!, b[i + 1]!);
      // 固定实际显示的位置，不保留距离限制外的鼠标位置，避免解除限制后跳变。
      if (this.fixedScreenPosition) {
        this.fixedScreenPosition.x = b[i]! + this.offset.x;
        this.fixedScreenPosition.y = b[i + 1]! + this.offset.y;
      }
      this.dragScreenPosition = undefined;
    }
    this.options.requestRender?.();
  }
  setOffset(offset: C.Cartesian2): void {
    this.options.ensureAlive?.();
    if (!Number.isFinite(offset.x) || !Number.isFinite(offset.y)) throw new RangeError("偏移必须是有限数");
    const next = C.Cartesian2.clone(offset);
    this.clampOffset(next);
    const nextX = next.x, nextY = next.y;
    if (nextX === this.offset.x && nextY === this.offset.y && nextX === this.displayOffset.x && nextY === this.displayOffset.y) return;
    this.offset.x = nextX;
    this.offset.y = nextY;
    C.Cartesian2.clone(this.offset, this.displayOffset);
    if (this.fixedScreenPosition) {
      const b = this.frame().bounds, i = this.index * 5;
      this.fixedScreenPosition.x = b[i]! + nextX;
      this.fixedScreenPosition.y = b[i + 1]! + nextY;
    }
    this.change({ index: this.index, x: nextX, y: nextY });
  }
  setDistance(distance: number): void {
    if (!Number.isFinite(distance) || distance < 0) throw new RangeError("距离必须是非负有限数");
    this.setOffset(new C.Cartesian2(distance / Math.SQRT2, -distance / Math.SQRT2));
  }
  setPosition(position: C.Cartesian3): void {
    this.options.ensureAlive?.();
    validatePosition(position);
    this.change({ index: this.index, position: [position.x, position.y, position.z] });
  }
  setLines(lines: readonly string[]): void {
    this.options.ensureAlive?.();
    validateLines(lines);
    this.change({ index: this.index, lines: [...lines] });
  }
  /** Resume the latest source data, including updates received while overridden. */
  resetOverrides(fields: readonly TargetCalloutOverride[] = ["position", "lines"]): void {
    this.options.ensureAlive?.();
    if (fields.some(field => field !== "position" && field !== "lines")) throw new RangeError("无效覆写字段");
    if (!fields.length) return;
    const patch: CalloutPatch = { index: this.index };
    for (const field of fields) patch[field] = null;
    this.change(patch);
  }
  setShow(show: boolean): void {
    this.options.ensureAlive?.();
    if (typeof show !== "boolean") throw new TypeError("show 必须是布尔值");
    if (show === this.show) return;
    this.show = show; this.change({ index: this.index, show });
  }
  getShow(): boolean { return this.show; }
  getScreenBounds(): { left: number; top: number; width: number; height: number; visible: boolean } {
    const b = this.frame().bounds, i = this.index * 5;
    return { left: b[i]! + this.displayOffset.x, top: b[i + 1]! + this.displayOffset.y - b[i + 3]!, width: b[i + 2]!, height: b[i + 3]!, visible: this.show && !!b[i + 4] };
  }
  getActionBounds(): { left: number; top: number; width: number; height: number; visible: boolean } {
    const bounds = this.getScreenBounds(), rects = this.frame().actionRects, i = this.index * 4;
    const width = rects ? rects[i + 2]! : ACTION_WIDTH, height = rects ? rects[i + 3]! : ACTION_SIZE;
    return { left: bounds.left + (rects ? rects[i]! : Math.max(0, bounds.width - width)),
      top: bounds.top + (rects ? rects[i + 1]! : 0), width, height,
      visible: bounds.visible && this.getRenderedDisplayMode() === "detailed" && width > 0 && height > 0 };
  }
  getProperties() {
    return { id: this.id, index: this.index, position: this.getPosition(), offset: this.getOffset(), maxOffsetDistance: this.maxOffsetDistance, style: this.getStyle(), titleStyle: this.getStyle("title"), title: this.title, badgeText: this.badgeText, displayMode: this.displayMode, fields: this.getFields(), screenFixed: this.isScreenFixed(), show: this.show, bounds: this.getScreenBounds() };
  }
  getPosition(result = new C.Cartesian3()): C.Cartesian3 {
    const p = this.frame().positions, i = this.index * 3;
    return C.Cartesian3.fromElements(p[i]!, p[i + 1]!, p[i + 2]!, result);
  }
  getTargetScreenPosition(result = new C.Cartesian2()): C.Cartesian2 | undefined {
    const b = this.frame().bounds, i = this.index * 5;
    return b[i + 4] ? C.Cartesian2.fromElements(b[i]!, b[i + 1]!, result) : undefined;
  }
  hitTest(point: C.Cartesian2): boolean {
    const b = this.frame().bounds, i = this.index * 5;
    const left = b[i]! + this.displayOffset.x, bottom = b[i + 1]! + this.displayOffset.y;
    return this.show && !!b[i + 4] && point.x >= left && point.x <= left + b[i + 2]! && point.y >= bottom - b[i + 3]! && point.y <= bottom;
  }
  private clampOffset(offset: C.Cartesian2): void {
    // 对外保留左下角 offset；约束使用中心点，计算后换回左下角。
    if (this.maxOffsetDistance === Number.POSITIVE_INFINITY) return;
    const b = this.frame().bounds, i = this.index * 5;
    const halfWidth = b[i + 2]! / 2;
    const halfHeight = b[i + 3]! / 2;
    const centerX = offset.x + halfWidth;
    const centerY = offset.y - halfHeight;
    const magnitude = Math.hypot(centerX, centerY);
    if (magnitude > this.maxOffsetDistance && magnitude > 0) {
      const scale = this.maxOffsetDistance / magnitude;
      offset.x = centerX * scale - halfWidth;
      offset.y = centerY * scale + halfHeight;
    }
  }
}
