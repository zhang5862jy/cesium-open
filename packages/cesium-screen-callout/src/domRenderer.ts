import * as C from "cesium";
import type Map from "ol/Map.js";
import type Projection from "ol/proj/Projection.js";
import { fromLonLat, getUserProjection, transform } from "ol/proj.js";
import {
  CalloutAvoidanceLayout, DEFAULT_CALLOUT_AVOIDANCE, normalizeAvoidance,
  type AvoidanceItem, type CalloutAvoidanceOptions, type CalloutAvoidanceStats,
} from "./avoidance";
import { validateDisplayMode, type CalloutDisplayMode } from "./display";
import { createCalloutFont } from "./font";
import type { TargetCalloutStyle } from "./legacyCallout";
import { DEFAULT_TEXT_RENDERING, type CalloutTextRenderingOptions } from "./screenBatchRenderer";
import type { CalloutPatch, WorkerCalloutHandle, WorkerFrame } from "./workerHandle";
import type { CalloutRenderer } from "./rendererInterface";
import { isCalloutInViewport } from "./visibility";
import {
  BADGE_FONT_FAMILY, BADGE_FONT_SIZE, layoutCalloutPresentation, normalizeCalloutRow,
  type CalloutPresentationLayout, type PresentationRect,
} from "./presentationLayout";

export interface DomCalloutTarget {
  position: readonly number[];
  lines: readonly string[];
  compactLines?: readonly string[];
  displayMode?: CalloutDisplayMode;
  style: TargetCalloutStyle;
  title?: string;
  badgeText?: string;
  titleStyle?: TargetCalloutStyle;
  show: boolean;
}

export interface DomCalloutUpdate {
  positions?: Float64Array;
  lines?: readonly { index: number; text: readonly string[] }[];
  patches: readonly CalloutPatch[];
}

export interface DomCalloutRenderStats { computeMs: number; layoutMs: number; applyMs: number }

interface DomItem {
  panel: HTMLDivElement;
  leader: HTMLDivElement;
  anchor: HTMLDivElement;
  style: TargetCalloutStyle;
  title?: string;
  badgeText?: string;
  titleStyle?: TargetCalloutStyle;
  headerNode?: HTMLDivElement;
  bodyNode?: HTMLDivElement;
  titleNode?: HTMLDivElement;
  badgeNode?: HTMLDivElement;
  rowNodes: HTMLDivElement[];
  sourceLines: readonly string[];
  compactLines: readonly string[];
  lines: readonly string[];
  lineOverride?: readonly string[];
  positionOverride?: readonly number[];
  mode: CalloutDisplayMode;
  enabled: boolean;
  dirty: boolean;
  width: number;
  height: number;
  transform: string;
  visible: boolean;
  projectable: boolean;
}

function createAvoidanceGroup() {
  return {
    options: { ...DEFAULT_CALLOUT_AVOIDANCE }, layout: new CalloutAvoidanceLayout(),
    items: [] as AvoidanceItem[], stats: { unresolved: 0, moved: 0, candidateChecks: 0 } as CalloutAvoidanceStats,
  };
}

const sameLines = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((line, index) => line === b[index]);

/** OpenLayers backend. The public handles and ECEF source data are shared with the Cesium backend. */
export class DomCalloutRenderer implements CalloutRenderer {
  readonly overlay: HTMLDivElement;
  visibleCount = 0;
  private readonly map: Map;
  private readonly viewport: HTMLElement;
  private readonly getFrame: () => WorkerFrame;
  private readonly getHandles: () => readonly WorkerCalloutHandle[];
  private readonly items: DomItem[];
  private readonly sourcePositions: Float64Array;
  private readonly projected: Float64Array;
  private readonly offset = new C.Cartesian2();
  private readonly previousOffset = new C.Cartesian2();
  private readonly previousPreference = new C.Cartesian2();
  private readonly cartesian = new C.Cartesian3();
  private readonly cartographic = new C.Cartographic();
  private projection: Projection | undefined;
  private projectedVersion: number | undefined;
  private readonly avoidanceGroups = { detailed: createAvoidanceGroup(), compact: createAvoidanceGroup() };
  private readonly avoidanceItems: AvoidanceItem[] = [];
  private textRendering: CalloutTextRenderingOptions = { ...DEFAULT_TEXT_RENDERING };
  private readonly beforeRenderListeners = new Set<() => void>();
  private readonly postRenderListeners = new Set<() => void>();
  private destroyed = false;
  private rendering = false;
  private errorHandler: ((error: Error) => void) | undefined;

  constructor(map: Map, getFrame: () => WorkerFrame, getHandles: () => readonly WorkerCalloutHandle[], targets: readonly DomCalloutTarget[]) {
    this.map = map;
    this.getFrame = getFrame;
    this.getHandles = getHandles;
    this.sourcePositions = new Float64Array(targets.length * 3);
    this.projected = new Float64Array(targets.length * 2);
    const viewport = map.getViewport();
    if (!viewport) throw new Error("二维标牌需要具有 DOM 容器的 OpenLayers 地图");
    this.viewport = viewport;
    const document = viewport.ownerDocument;
    this.overlay = document.createElement("div");
    this.overlay.className = "target-callout-dom-overlay";
    this.overlay.style.cssText = "position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:2;isolation:isolate";
    const leaders = document.createElement("div");
    const panels = document.createElement("div");
    leaders.style.cssText = panels.style.cssText = "position:absolute;inset:0;pointer-events:none";
    this.overlay.append(leaders, panels);
    this.items = targets.map((target, index) => {
      this.sourcePositions.set(target.position, index * 3);
      const panel = document.createElement("div");
      panel.className = "target-callout-dom-panel";
      panel.dataset.calloutIndex = String(index);
      panel.style.cssText = "position:absolute;left:0;top:0;width:1px;height:1px;box-sizing:border-box;white-space:pre;pointer-events:none;user-select:none;visibility:hidden;transition:none;animation:none";
      const leader = document.createElement("div");
      leader.className = "target-callout-dom-leader";
      leader.style.cssText = "position:absolute;left:0;top:0;height:2px;transform-origin:0 50%;pointer-events:none;visibility:hidden;transition:none;animation:none";
      const anchor = document.createElement("div");
      anchor.className = "target-callout-dom-anchor";
      anchor.style.cssText = "position:absolute;left:0;top:0;width:6px;height:6px;border-radius:50%;pointer-events:none;visibility:hidden;transition:none;animation:none";
      leaders.append(leader, anchor);
      panels.appendChild(panel);
      return {
        panel, leader, anchor, style: { ...target.style }, sourceLines: [...target.lines],
        title: target.title, badgeText: target.badgeText,
        titleStyle: target.titleStyle && { ...target.titleStyle }, rowNodes: [],
        compactLines: [...(target.compactLines ?? [])], lines: [],
        mode: target.displayMode ?? "detailed", enabled: target.show, dirty: true,
        width: 0, height: 0, transform: "", visible: false, projectable: false,
      };
    });
    try {
      viewport.appendChild(this.overlay);
      map.on("postrender", this.handleMapRender);
      document.fonts?.addEventListener("loadingdone", this.fontsChanged);
      this.update({ patches: [] });
    } catch (cause) {
      this.destroy();
      throw cause;
    }
  }

  /** Applies validated data in one batch; no Worker, glyph atlas, or WebGL context is allocated. */
  update(data: DomCalloutUpdate): DomCalloutRenderStats {
    if (this.destroyed) return { computeMs: 0, layoutMs: 0, applyMs: 0 };
    const started = performance.now();
    let positionsChanged = data.positions !== undefined;
    if (data.positions) this.sourcePositions.set(data.positions);
    for (const update of data.lines ?? []) this.items[update.index]!.sourceLines = [...update.text];
    for (const patch of data.patches) {
      const item = this.items[patch.index]!;
      if (patch.compactLines !== undefined) item.compactLines = [...patch.compactLines];
      if (patch.displayMode !== undefined && patch.displayMode !== item.mode) { item.mode = patch.displayMode; item.dirty = true; }
      if (patch.style && (Object.keys(patch.style) as (keyof TargetCalloutStyle)[]).some(key => item.style[key] !== patch.style![key])) {
        item.style = { ...patch.style };
        item.dirty = true;
      }
      if (patch.title !== undefined && patch.title !== item.title) { item.title = patch.title; item.dirty = true; }
      if (patch.badgeText !== undefined && patch.badgeText !== item.badgeText) { item.badgeText = patch.badgeText; item.dirty = true; }
      if (patch.titleStyle && (Object.keys(patch.titleStyle) as (keyof TargetCalloutStyle)[]).some(key => item.titleStyle?.[key] !== patch.titleStyle![key])) {
        item.titleStyle = { ...patch.titleStyle };
        item.dirty = true;
      }
      if (patch.lines !== undefined) item.lineOverride = patch.lines === null ? undefined : [...patch.lines];
      if (patch.position !== undefined) {
        item.positionOverride = patch.position === null ? undefined : [...patch.position];
        positionsChanged = true;
      }
      if (patch.show !== undefined) item.enabled = patch.show;
    }
    const frame = this.getFrame();
    if (!frame.displayModes || frame.displayModes.length !== this.items.length) frame.displayModes = new Uint8Array(this.items.length);
    if (positionsChanged || this.projectedVersion === undefined) {
      frame.positions.set(this.sourcePositions);
      this.items.forEach((item, index) => { if (item.positionOverride) frame.positions.set(item.positionOverride, index * 3); });
      frame.positionsVersion = (frame.positionsVersion ?? 0) + 1;
    }
    this.items.forEach((item, index) => {
      const lines = item.mode === "compact" ? item.compactLines : item.lineOverride ?? item.sourceLines;
      if (!sameLines(item.lines, lines)) { item.lines = lines; item.dirty = true; }
      frame.displayModes![index] = Number(item.mode === "compact");
    });
    const computeMs = performance.now() - started;
    const layoutStarted = performance.now();
    this.measureDirtyItems();
    const layoutMs = performance.now() - layoutStarted;
    const applyStarted = performance.now();
    this.render();
    this.map.render();
    return { computeMs, layoutMs, applyMs: performance.now() - applyStarted };
  }

  /** Every style/content write precedes all size reads, avoiding per-panel forced layout. */
  private measureDirtyItems(): void {
    const setBoxStyle = (node: HTMLDivElement, style: TargetCalloutStyle, openEdge?: "top" | "bottom") => {
      node.style.cssText = "position:absolute;box-sizing:border-box;pointer-events:none";
      node.style.font = createCalloutFont(style);
      node.style.lineHeight = `${style.fontSize}px`;
      node.style.color = style.textColor;
      node.style.backgroundColor = style.backgroundColor;
      node.style.boxShadow = !style.showBorder ? "none" : openEdge
        ? `inset 2px 0 0 ${style.borderColor}, inset -2px 0 0 ${style.borderColor}, inset 0 ${openEdge === "top" ? -2 : 2}px 0 ${style.borderColor}`
        : `inset 0 0 0 2px ${style.borderColor}`;
    };
    for (const item of this.items) if (item.dirty) {
      const s = item.style, t = item.titleStyle ?? s, panel = item.panel, document = panel.ownerDocument;
      const hasHeader = item.mode !== "compact" && item.title !== undefined;
      panel.style.font = createCalloutFont(s);
      panel.style.lineHeight = `${s.fontSize}px`;
      panel.style.color = s.textColor;
      const body = document.createElement("div");
      body.className = "target-callout-dom-body";
      setBoxStyle(body, s, hasHeader ? "top" : undefined);
      item.bodyNode = body;
      item.rowNodes = item.lines.map(line => {
        const row = document.createElement("div");
        row.className = "target-callout-dom-row";
        row.style.cssText = `position:absolute;width:max-content;height:${s.fontSize}px`;
        row.textContent = normalizeCalloutRow(line);
        return row;
      });
      body.append(...item.rowNodes);
      item.headerNode = item.titleNode = item.badgeNode = undefined;
      const children: HTMLDivElement[] = [];
      if (hasHeader) {
        const header = document.createElement("div"), title = document.createElement("div");
        header.className = "target-callout-dom-header";
        setBoxStyle(header, t, "bottom");
        title.className = "target-callout-dom-title";
        title.style.cssText = `position:absolute;width:max-content;height:${t.fontSize}px`;
        title.textContent = normalizeCalloutRow(item.title!);
        header.appendChild(title);
        item.headerNode = header; item.titleNode = title;
        children.push(header);
      }
      if (item.badgeText) {
        const badge = document.createElement("div"), badgeStyle = hasHeader ? t : s;
        badge.className = "target-callout-dom-badge";
        badge.style.cssText = `position:absolute;display:flex;align-items:center;justify-content:center;box-sizing:border-box;font:700 ${BADGE_FONT_SIZE}px ${BADGE_FONT_FAMILY};line-height:${BADGE_FONT_SIZE}px`;
        badge.style.backgroundColor = badgeStyle.badgeColor;
        badge.style.color = badgeStyle.badgeTextColor;
        badge.textContent = normalizeCalloutRow(item.badgeText);
        (item.headerNode ?? body).appendChild(badge);
        item.badgeNode = badge;
      }
      children.push(body);
      panel.replaceChildren(...children);
      panel.dataset.displayMode = item.mode;
      item.leader.style.backgroundColor = item.anchor.style.backgroundColor = s.leaderColor;
    }
    const layouts: { item: DomItem; index: number; layout: CalloutPresentationLayout }[] = [];
    this.items.forEach((item, index) => {
      if (!item.dirty) return;
      // A detached or display:none map cannot provide usable layout metrics.
      // Keep the previous bounds and retry when its next visible frame renders.
      if (item.panel.offsetWidth <= 0 || item.panel.offsetHeight <= 0) return;
      const view = item.panel.ownerDocument.defaultView;
      const textWidth = (node: HTMLDivElement) => {
        const value = Number.parseFloat(view?.getComputedStyle(node).width ?? "");
        return Number.isFinite(value) ? value : node.offsetWidth;
      };
      const layout = layoutCalloutPresentation({ style: item.style, titleStyle: item.titleStyle,
        title: item.title, badgeText: item.badgeText, displayMode: item.mode, lines: item.lines }, {
        bodyWidth: Math.max(0, ...item.rowNodes.map(textWidth)),
        titleWidth: item.titleNode ? textWidth(item.titleNode) : 0, roundWidth: false,
      });
      layouts.push({ item, index, layout });
    });
    const place = (node: HTMLDivElement, rect: PresentationRect, origin = { x: 0, y: 0 }) => {
      node.style.left = `${rect.x - origin.x}px`; node.style.top = `${rect.y - origin.y}px`;
      node.style.width = `${rect.width}px`; node.style.height = `${rect.height}px`;
    };
    for (const { item, layout } of layouts) {
      item.panel.style.width = `${layout.width}px`; item.panel.style.height = `${layout.height}px`;
      place(item.bodyNode!, layout.body);
      if (item.headerNode && layout.header) place(item.headerNode, layout.header);
      if (item.titleNode && layout.titleText) {
        item.titleNode.style.left = `${layout.titleText.x}px`; item.titleNode.style.top = `${layout.titleText.y}px`;
      }
      if (item.badgeNode && layout.badge) place(item.badgeNode, layout.badge, layout.header ?? layout.body);
      item.rowNodes.forEach((row, index) => {
        row.style.left = `${layout.bodyText.x - layout.body.x}px`;
        row.style.top = `${layout.bodyText.y - layout.body.y + index * layout.bodyLineHeight}px`;
      });
    }
    const frame = this.getFrame(), bounds = frame.bounds;
    if (!frame.actionRects || frame.actionRects.length !== this.items.length * 4) frame.actionRects = new Float32Array(this.items.length * 4);
    for (const { item, index, layout } of layouts) {
      // Final border-box sizes retain CSS pixel fractions without inheriting
      // an ancestor's transform scale as getBoundingClientRect would.
      const computed = item.panel.ownerDocument.defaultView?.getComputedStyle(item.panel);
      const width = Number.parseFloat(computed?.width ?? ""), height = Number.parseFloat(computed?.height ?? "");
      item.width = Number.isFinite(width) && width > 0 ? width : item.panel.offsetWidth;
      item.height = Number.isFinite(height) && height > 0 ? height : item.panel.offsetHeight;
      bounds[index * 5 + 2] = item.width;
      bounds[index * 5 + 3] = item.height;
      const actions = layout.actions;
      frame.actionRects.set(actions ? [actions.x, actions.y, actions.width, actions.height] : [0, 0, 0, 0], index * 4);
      item.dirty = false;
    }
  }

  /** Map viewport coordinates are always CSS pixels, independent of devicePixelRatio. */
  render = (): void => {
    if (this.destroyed || this.rendering) return;
    this.rendering = true;
    try {
      for (const listener of this.beforeRenderListeners) listener();
      this.measureDirtyItems();
      this.draw();
      for (const listener of this.postRenderListeners) listener();
    } finally { this.rendering = false; }
  };

  /** Synchronous update errors propagate to the caller; asynchronous map errors go to the owner. */
  setErrorHandler(handler: (error: Error) => void): void { this.errorHandler = handler; }

  private handleMapRender = (): void => {
    try { this.render(); }
    catch (cause) {
      if (!this.errorHandler) throw cause;
      this.errorHandler(cause instanceof Error ? cause : new Error(String(cause)));
    }
  };

  private draw(): void {
    const frame = this.getFrame(), handles = this.getHandles(), bounds = frame.bounds;
    const size = this.map.getSize(), width = size?.[0] ?? 0, height = size?.[1] ?? 0;
    const view = this.map.getView(), projection = view.getProjection(), userProjection = getUserProjection();
    const center = view.getCenter();
    const viewCenter = center && userProjection ? transform(center, userProjection, projection) : center;
    const extent = projection.getExtent();
    const worldWidth = projection.canWrapX() && extent ? extent[2]! - extent[0]! : 0;
    if (projection !== this.projection || this.projectedVersion !== frame.positionsVersion || frame.positionsVersion === undefined) {
      this.projectTargets(projection, frame.positions);
      this.projection = projection;
      this.projectedVersion = frame.positionsVersion;
    }
    const groups = Object.values(this.avoidanceGroups);
    for (const group of groups) group.items.length = 0;
    const deferred = handles.some(handle => handle.isDragging());
    this.visibleCount = 0;
    for (let index = 0; index < this.items.length; index++) {
      const item = this.items[index]!, handle = handles[index]!, k = index * 5;
      let x = this.projected[index * 2]!, y = this.projected[index * 2 + 1]!;
      if (worldWidth > 0 && viewCenter && Number.isFinite(x)) x += Math.round((viewCenter[0]! - x) / worldWidth) * worldWidth;
      const coordinate = userProjection ? transform([x, y], projection, userProjection) : [x, y];
      const pixel = Number.isFinite(x) && Number.isFinite(y) ? this.map.getPixelFromCoordinate(coordinate) : null;
      x = pixel?.[0] ?? 0; y = pixel?.[1] ?? 0;
      item.projectable = item.enabled && handle.getShow() && width > 0 && height > 0 && !!pixel
        && Number.isFinite(x) && Number.isFinite(y);
      bounds[k] = x; bounds[k + 1] = y; bounds[k + 2] = item.width; bounds[k + 3] = item.height;
      // Handles share a Float32 bounds buffer with the GPU backend. Use its exact
      // anchor values throughout placement so dragging has no mixed-precision drift.
      x = bounds[k]!; y = bounds[k + 1]!;
      handle.getOffset(this.previousOffset);
      handle.getPreferredOffset(this.previousPreference);
      const automaticX = this.previousOffset.x - this.previousPreference.x, automaticY = this.previousOffset.y - this.previousPreference.y;
      handle.resolveScreenOffset(x, y, this.offset);
      const visible = item.projectable && (isCalloutInViewport(x, y,
        x + this.offset.x + automaticX, y + this.offset.y + automaticY - item.height, item.width, item.height, width, height)
        || isCalloutInViewport(x, y, x + this.offset.x, y + this.offset.y - item.height, item.width, item.height, width, height));
      bounds[k + 4] = Number(visible);
      const group = this.avoidanceGroups[item.mode];
      if (group.options.enabled) {
        const collision = this.avoidanceItems[index] ??= {} as AvoidanceItem;
        collision.index = index; collision.visible = visible;
        collision.anchorX = x; collision.anchorY = y;
        collision.width = item.width; collision.height = item.height;
        collision.preferredLeft = x + this.offset.x; collision.preferredTop = y + this.offset.y - item.height;
        collision.maxDistance = handle.getMaxOffsetDistance();
        collision.dragging = handle.isDragging(); collision.priority = handle.getAvoidancePriority();
        group.items.push(collision);
      }
      item.visible = visible;
    }
    for (const group of groups) if (group.options.enabled) {
      group.stats = group.layout.layout(group.items, width, height, group.options, deferred);
      for (const item of group.items) handles[item.index]!.applyAvoidanceOffset(item.left - item.anchorX, item.top + item.height - item.anchorY);
    }
    this.items.forEach((item, index) => {
      const k = index * 5, x = bounds[k]!, y = bounds[k + 1]!;
      const offset = handles[index]!.getOffset(this.offset);
      let left = x + offset.x, top = y + offset.y - item.height;
      item.visible = item.projectable && isCalloutInViewport(x, y, left, top, item.width, item.height, width, height);
      bounds[k + 4] = Number(item.visible);
      const visibility = item.visible ? "visible" : "hidden";
      item.panel.style.visibility = item.anchor.style.visibility = visibility;
      item.leader.style.visibility = item.visible && item.style.showLeader ? "visible" : "hidden";
      if (!item.visible) return;
      this.visibleCount++;
      const handle = handles[index]!, group = this.avoidanceGroups[item.mode];
      if (this.textRendering.pixelSnap && !handle.isDragging() && handle.getMaxOffsetDistance() === Infinity
        && (!group.options.enabled || group.options.maxDisplacement === Infinity)) {
        left = Math.round(left); top = Math.round(top);
        // Keep hit tests, leaders, pinning and the next drag in the same coordinates as the DOM.
        handles[index]!.applyAvoidanceOffset(left - x, top + item.height - y);
      }
      const value = `translate(${left}px,${top}px)`;
      if (value !== item.transform) { item.panel.style.transform = value; item.transform = value; }
      item.anchor.style.transform = `translate(${x - 3}px,${y - 3}px)`;
      if (item.style.showLeader) this.placeLeader(item, x, y, left, top);
    });
  }

  private projectTargets(projection: Projection, positions: Float64Array): void {
    for (let index = 0; index < this.items.length; index++) {
      C.Cartesian3.fromElements(positions[index * 3]!, positions[index * 3 + 1]!, positions[index * 3 + 2]!, this.cartesian);
      const cartographic = C.Ellipsoid.WGS84.cartesianToCartographic(this.cartesian, this.cartographic);
      const coordinate = cartographic ? fromLonLat([C.Math.toDegrees(cartographic.longitude), C.Math.toDegrees(cartographic.latitude)], projection) : [Number.NaN, Number.NaN];
      this.projected[index * 2] = coordinate[0]!;
      this.projected[index * 2 + 1] = coordinate[1]!;
    }
  }

  private placeLeader(item: DomItem, x: number, y: number, left: number, top: number): void {
    const right = left + item.width, bottom = top + item.height;
    const dx = (Math.abs(left - x) <= Math.abs(right - x) ? left : right) - x;
    const dy = (Math.abs(bottom - y) <= Math.abs(top - y) ? bottom : top) - y;
    item.leader.style.width = `${Math.hypot(dx, dy)}px`;
    item.leader.style.transform = `translate(${x}px,${y - 1}px) rotate(${Math.atan2(dy, dx)}rad)`;
  }

  onBeforeRender(listener: () => void): () => void {
    this.beforeRenderListeners.add(listener);
    return () => { this.beforeRenderListeners.delete(listener); };
  }

  onPostRender(listener: () => void): () => void {
    this.postRenderListeners.add(listener);
    return () => { this.postRenderListeners.delete(listener); };
  }

  ownsEventTarget(target: EventTarget | null): boolean {
    if (!(target instanceof Node)) return false;
    const viewport = this.viewport;
    if (target === viewport || this.overlay.contains(target)) return true;
    return target instanceof HTMLElement && target.tagName === "CANVAS" && viewport.contains(target)
      && !target.closest(".ol-control,.ol-overlaycontainer-stopevent");
  }

  setAvoidance(options: boolean | Partial<CalloutAvoidanceOptions>, mode?: CalloutDisplayMode): void {
    if (mode !== undefined) validateDisplayMode(mode);
    const modes: CalloutDisplayMode[] = mode ? [mode] : ["detailed", "compact"];
    const updates = modes.map(name => ({ group: this.avoidanceGroups[name], next: normalizeAvoidance(options, this.avoidanceGroups[name].options) }));
    for (const { group, next } of updates) {
      if ((Object.keys(next) as (keyof CalloutAvoidanceOptions)[]).every(key => next[key] === group.options[key])) continue;
      if (next.enabled !== group.options.enabled) group.layout.clear();
      group.options = next;
      group.stats = { unresolved: 0, moved: 0, candidateChecks: 0 };
      this.map.render();
    }
  }

  getAvoidance(mode: CalloutDisplayMode = "detailed"): CalloutAvoidanceOptions {
    validateDisplayMode(mode);
    return { ...this.avoidanceGroups[mode].options };
  }

  getAvoidanceStats(mode?: CalloutDisplayMode): CalloutAvoidanceStats {
    if (mode !== undefined) { validateDisplayMode(mode); return { ...this.avoidanceGroups[mode].stats }; }
    const a = this.avoidanceGroups.detailed.stats, b = this.avoidanceGroups.compact.stats;
    return { unresolved: a.unresolved + b.unresolved, moved: a.moved + b.moved, candidateChecks: a.candidateChecks + b.candidateChecks };
  }

  setTextRendering(options: Partial<CalloutTextRenderingOptions>): void {
    if (options.smoothing !== undefined && Number.isFinite(options.smoothing)) this.textRendering.smoothing = C.Math.clamp(options.smoothing, 0, 1.5);
    if (options.weight !== undefined && Number.isFinite(options.weight)) this.textRendering.weight = C.Math.clamp(options.weight, -0.5, 0.5);
    if (options.pixelSnap !== undefined) this.textRendering.pixelSnap = options.pixelSnap;
    // SDF smoothing/weight remain stored for API compatibility; DOM text uses browser font rendering.
    this.map.render();
  }

  getTextRendering(): CalloutTextRenderingOptions { return { ...this.textRendering }; }

  private fontsChanged = (): void => {
    for (const item of this.items) item.dirty = true;
    this.map.render();
  };

  isDestroyed(): boolean { return this.destroyed; }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.map.un("postrender", this.handleMapRender);
    this.overlay.ownerDocument.fonts?.removeEventListener("loadingdone", this.fontsChanged);
    this.overlay.remove();
    this.beforeRenderListeners.clear(); this.postRenderListeners.clear();
    this.errorHandler = undefined;
    for (const group of Object.values(this.avoidanceGroups)) { group.layout.clear(); group.items.length = 0; }
    this.avoidanceItems.length = 0;
    this.visibleCount = 0;
    const bounds = this.getFrame().bounds;
    for (let index = 0; index < this.items.length; index++) bounds[index * 5 + 4] = 0;
    this.items.length = 0;
  }
}
