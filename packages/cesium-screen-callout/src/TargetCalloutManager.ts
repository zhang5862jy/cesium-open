import * as C from "cesium";
import type OpenLayersMap from "ol/Map.js";
import LayoutWorker from "./layout.worker?worker&inline";
import { TargetCalloutDragController } from "./drag";
import { TargetCalloutClickController } from "./click";
import { createCesiumInteractionHost, type CalloutInteractionHost } from "./interactionHost";
import { DomCalloutRenderer } from "./domRenderer";
import type { CalloutRenderer } from "./rendererInterface";
import { TargetCalloutHoverController, type CalloutHoverEventType } from "./hover";
import { DEFAULT_CALLOUT_STYLE, type TargetCalloutStyle } from "./legacyCallout";
import {
  DEFAULT_TEXT_RENDERING,
  ScreenBatchRenderer,
  type CalloutTextRenderingOptions,
} from "./screenBatchRenderer";
import type { GlyphBatch } from "./glyphBatch";
import {
  WorkerCalloutHandle,
  type CalloutPatch,
  type TargetCalloutId,
  type WorkerFrame,
  type PreparedCalloutContent,
} from "./workerHandle";
import { normalizeTitle, normalizeBadgeText, validateLines, validateMaxOffsetDistance, validatePosition, validateStyle } from "./validation";
import { normalizeAvoidance, type CalloutAvoidanceOptions, type CalloutAvoidanceStats } from "./avoidance";
import { DEFAULT_COMPACT_CALLOUT_STYLE, DEFAULT_TITLE_CALLOUT_STYLE, copyCalloutFields, formatCompactFields, getFieldTitle, validateDisplayMode,
  type CalloutDisplayMode, type CalloutField, type CompactFieldFormatter } from "./display";

export interface TargetCalloutDefinition {
  /** Stable business key. Defaults to the target's initial array index. */
  id?: TargetCalloutId;
  position: C.Cartesian3;
  lines?: readonly string[];
  style?: Partial<TargetCalloutStyle>;
  compactStyle?: Partial<TargetCalloutStyle>;
  titleStyle?: Partial<TargetCalloutStyle>;
  /** Value-only detailed header. Empty values still reserve the header row. */
  title?: string;
  /** One identification letter, normalized to uppercase. Defaults to A. */
  badgeText?: string;
  fields?: readonly CalloutField[];
  displayMode?: CalloutDisplayMode;
  compactFieldFormatter?: CompactFieldFormatter;
  offset?: C.Cartesian2;
  maxOffsetDistance?: number;
  show?: boolean;
}

export interface TargetCalloutLineUpdate {
  index: number;
  text: readonly string[];
}
export interface TargetCalloutFieldUpdate { index: number; fields: readonly CalloutField[] }
export interface TargetCalloutTitleUpdate { index: number; title: string }
export interface TargetCalloutBadgeUpdate { index: number; badgeText: string }

export interface TargetCalloutBulkUpdate {
  /** Exactly targetCount * 3 ECEF values. */
  positions?: Float64Array;
  lines?: readonly TargetCalloutLineUpdate[];
  fields?: readonly TargetCalloutFieldUpdate[];
  titles?: readonly TargetCalloutTitleUpdate[];
  badges?: readonly TargetCalloutBadgeUpdate[];
}

export interface TargetCalloutManagerStats {
  computeMs: number;
  layoutMs: number;
  applyMs: number;
  latencyMs: number;
  visibleCount: number;
}

export interface TargetCalloutSharedOptions {
  targets: readonly TargetCalloutDefinition[];
  container?: HTMLElement;
  defaultStyle?: Partial<TargetCalloutStyle>;
  defaultCompactStyle?: Partial<TargetCalloutStyle>;
  defaultTitleStyle?: Partial<TargetCalloutStyle>;
  compactFieldFormatter?: CompactFieldFormatter;
  /** Default maximum target-to-panel-center distance in CSS pixels. Undefined means unlimited. */
  maxOffsetDistance?: number;
  textRendering?: Partial<CalloutTextRenderingOptions>;
  /** Screen-space collision avoidance; disabled by default for compatibility. */
  avoidance?: boolean | Partial<CalloutAvoidanceOptions>;
  /** Keep displayed positions as the new preferred offsets when disabling avoidance. Defaults to true. */
  preservePositionOnAvoidanceDisable?: boolean;
  draggable?: boolean;
  hoverActions?: boolean;
  onSelect?: (callout: WorkerCalloutHandle) => void;
  onClick?: (callout: WorkerCalloutHandle, event: MouseEvent) => void;
  onDoubleClick?: (callout: WorkerCalloutHandle, event: MouseEvent) => void;
  onDragEnd?: (callout: WorkerCalloutHandle) => void;
  onDisplayModeChange?: (callout: WorkerCalloutHandle) => void;
  onStats?: (stats: TargetCalloutManagerStats) => void;
  onError?: (error: Error) => void;
}

/** Choose exactly one host; all target data and handle APIs remain identical. */
export type TargetCalloutManagerOptions = TargetCalloutSharedOptions & (
  { scene: C.Scene; map?: never } | { scene?: never; map: OpenLayersMap }
);

interface WorkerResult extends GlyphBatch {
  id: number;
  positions: Float64Array;
  enabled: Uint8Array;
  displayModes?: Uint8Array;
  computeMs: number;
  layoutMs: number;
  error?: string;
}

/**
 * 标牌系统的公共入口：共享目标数据、轻量句柄及交互控制器。
 * 根据宿主选择 Cesium Worker/GPU 后端或 OpenLayers DOM 后端。
 */
export class TargetCalloutManager {
  readonly callouts: readonly WorkerCalloutHandle[];
  readonly ready: Promise<void>;
  readonly hover: TargetCalloutHoverController | undefined;
  private readonly options: TargetCalloutManagerOptions;
  private readonly preservePositionOnAvoidanceDisable: boolean;
  private readonly renderer!: CalloutRenderer;
  private readonly gpuRenderer?: ScreenBatchRenderer;
  private readonly domRenderer?: DomCalloutRenderer;
  private readonly worker!: Worker;
  private readonly drag: TargetCalloutDragController<WorkerCalloutHandle> | undefined;
  private readonly removePostRender?: () => void;
  private readonly clicks?: TargetCalloutClickController;
  private readonly byId = new Map<TargetCalloutId, WorkerCalloutHandle>();
  private readonly pendingLines = new Map<number, TargetCalloutLineUpdate>();
  private readonly waiters = new Set<{ resolve: () => void; reject: (error: Error) => void }>();
  private readonly pendingPatches = new Map<number, CalloutPatch>();
  private frame: WorkerFrame;
  private pendingBulk: TargetCalloutBulkUpdate | undefined;
  private recycledPositions: Float64Array = new Float64Array(0);
  private recycledInstances: Float32Array = new Float32Array(0);
  private requestId = 0;
  private sentAt = 0;
  private busy = false;
  private scheduled = false;
  private destroyed = false;
  private resolveReady!: () => void;
  private rejectReady!: (error: Error) => void;
  private readySettled = false;
  private failure: Error | undefined;
  private stats: TargetCalloutManagerStats = {
    computeMs: 0,
    layoutMs: 0,
    applyMs: 0,
    latencyMs: 0,
    visibleCount: 0,
  };

  constructor(options: TargetCalloutManagerOptions) {
    this.options = options;
    if (!!options.scene === !!options.map) throw new TypeError("必须且只能传入 scene 或 map");
    if (options.preservePositionOnAvoidanceDisable !== undefined && typeof options.preservePositionOnAvoidanceDisable !== "boolean") {
      throw new TypeError("preservePositionOnAvoidanceDisable 必须是布尔值");
    }
    this.preservePositionOnAvoidanceDisable = options.preservePositionOnAvoidanceDisable ?? true;
    if (!options.targets.length) throw new RangeError("targets 至少需要一个目标");
    const defaultStyle = validateStyle({ ...DEFAULT_CALLOUT_STYLE, ...options.defaultStyle });
    const defaultCompactStyle = validateStyle({ ...DEFAULT_COMPACT_CALLOUT_STYLE, ...options.defaultCompactStyle });
    const defaultTitleStyle = validateStyle({ ...DEFAULT_TITLE_CALLOUT_STYLE, ...options.defaultTitleStyle });
    validateMaxOffsetDistance(options.maxOffsetDistance);
    const avoidance = normalizeAvoidance(options.avoidance ?? false);
    const ids = new Set<TargetCalloutId>();
    this.frame = {
      positions: new Float64Array(options.targets.length * 3),
      bounds: new Float32Array(options.targets.length * 5),
      positionsVersion: 0,
    };
    const serialized = options.targets.map((target, index) => {
      const id = target.id ?? index;
      if ((typeof id !== "string" && typeof id !== "number") || (typeof id === "number" && !Number.isFinite(id))) {
        throw new TypeError("目标 id 必须是字符串或有限数");
      }
      if (ids.has(id)) throw new RangeError(`重复目标 id：${id}`);
      ids.add(id);
      validatePosition(target.position);
      validateLines(target.lines ?? []);
      const displayMode = target.displayMode ?? "detailed";
      validateDisplayMode(displayMode);
      const fields = copyCalloutFields(target.fields ?? []);
      const compactLines = formatCompactFields(fields, target.compactFieldFormatter ?? options.compactFieldFormatter, id, target.lines);
      const detailedStyle = validateStyle({ ...defaultStyle, ...target.style });
      const compactStyle = validateStyle({ ...defaultCompactStyle, ...target.compactStyle });
      const titleStyle = validateStyle({ ...defaultTitleStyle, ...target.titleStyle });
      const title = normalizeTitle(target.title ?? getFieldTitle(fields) ?? "");
      const badgeText = normalizeBadgeText(target.badgeText ?? "A");
      validateMaxOffsetDistance(target.maxOffsetDistance);
      if (target.offset && (!Number.isFinite(target.offset.x) || !Number.isFinite(target.offset.y))) throw new RangeError("偏移必须是有限数");
      if (target.show !== undefined && typeof target.show !== "boolean") throw new TypeError("show 必须是布尔值");
      this.frame.positions.set([target.position.x, target.position.y, target.position.z], index * 3);
      return {
        position: [target.position.x, target.position.y, target.position.z] as [number, number, number],
        lines: [...(target.lines ?? [])],
        fields, compactLines, displayMode, title, badgeText, titleStyle,
        style: displayMode === "compact" ? compactStyle : detailedStyle,
        show: target.show !== false,
      };
    });
    let handlesInitialized = false;
    const handles = options.targets.map((target, index) => {
      const handle = new WorkerCalloutHandle(index, () => this.frame, (patch) => this.queuePatch(patch), {
        id: target.id ?? index,
        ensureAlive: () => this.ensureAlive(),
        requestRender: () => this.requestRender(),
        compactFieldFormatter: target.compactFieldFormatter ?? options.compactFieldFormatter,
        onDisplayModeChange: handle => {
          // Initial mode is configuration, not an interaction; the manager is
          // not yet available to callers while these handles are constructed.
          if (!handlesInitialized) return;
          try { this.options.onDisplayModeChange?.(handle); }
          catch (cause) { this.notifyError(cause instanceof Error ? cause : new Error(String(cause))); }
        },
      });
      handle.setStyle({ ...defaultStyle, ...target.style });
      handle.setStyle({ ...defaultCompactStyle, ...target.compactStyle }, "compact");
      handle.setStyle({ ...defaultTitleStyle, ...target.titleStyle }, "title");
      const content = serialized[index]!;
      handle.applyContent({ fields: content.fields, sourceLines: content.lines, compactLines: content.compactLines });
      handle.setTitle(content.title);
      handle.setBadgeText(content.badgeText);
      handle.setDisplayMode(content.displayMode);
      handle.setMaxOffsetDistance(target.maxOffsetDistance ?? options.maxOffsetDistance);
      if (target.offset) handle.setOffset(target.offset);
      if (target.show === false) handle.setShow(false);
      this.byId.set(handle.id, handle);
      return handle;
    });
    this.callouts = Object.freeze(handles);
    handlesInitialized = true;
    this.ready = new Promise<void>((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });
    // Observe internally without changing the rejection seen by callers awaiting ready.
    void this.ready.catch(() => {});
    try {
      let host: CalloutInteractionHost;
      let subscribeAfterRender: (callback: () => void) => () => void;
      if (options.map) {
        const map = options.map;
        const renderer = new DomCalloutRenderer(map, () => this.frame, () => handles, serialized);
        this.domRenderer = renderer;
        this.renderer = renderer;
        renderer.setErrorHandler(error => this.fail(error));
        host = {
          element: map.getViewport()!,
          requestRender: () => map.render(),
          onBeforeRender: listener => renderer.onBeforeRender(listener),
          ownsEventTarget: target => renderer.ownsEventTarget(target),
          suspendInputs: () => {
            const interactions = map.getInteractions().getArray().filter(interaction => interaction.getActive());
            interactions.forEach(interaction => interaction.setActive(false));
            let restored = false;
            return () => {
              if (restored) return;
              restored = true;
              const current = map.getInteractions().getArray();
              for (const interaction of interactions) if (current.includes(interaction)) interaction.setActive(true);
            };
          },
        };
        subscribeAfterRender = listener => renderer.onPostRender(listener);
      } else {
        const scene = options.scene!;
        this.gpuRenderer = new ScreenBatchRenderer(scene, handles.length, () => this.frame, () => handles);
        this.renderer = this.gpuRenderer;
        host = createCesiumInteractionHost(scene);
        subscribeAfterRender = listener => scene.postRender.addEventListener(listener);
        this.worker = new LayoutWorker();
        this.worker.onmessage = (event: MessageEvent<WorkerResult>) => this.receive(event.data);
        this.worker.onerror = (event) => this.fail(new Error(`标牌 Worker 出错：${event.message}`));
        this.worker.onmessageerror = () => this.fail(new Error("无法解码标牌 Worker 消息"));
        this.worker.postMessage({ type: "init", targets: serialized });
      }
      this.renderer.setTextRendering({ ...DEFAULT_TEXT_RENDERING, ...options.textRendering });
      if (options.avoidance !== undefined) this.renderer.setAvoidance(avoidance);
      // Register before dragging so click suppression observes the same pointer stream.
      if (host.element) {
        this.clicks = new TargetCalloutClickController(host, () => handles, {
          blockMapGestures: options.draggable === false,
          onSelect: options.draggable === false ? callout => this.invoke(() => options.onSelect?.(callout)) : undefined,
          onClick: (callout, event) => this.invoke(() => options.onClick?.(callout, event)),
          onDoubleClick: (callout, event) => this.invoke(() => options.onDoubleClick?.(callout, event)),
        });
      }
      this.drag = options.draggable === false ? undefined : new TargetCalloutDragController(
        host,
        () => handles,
        callout => this.invoke(() => options.onSelect?.(callout)),
        callout => this.invoke(() => options.onDragEnd?.(callout)),
      );
      const container = options.map ? options.map.getViewport() : options.container;
      this.hover = container && options.hoverActions !== false
        ? new TargetCalloutHoverController(container, host.element, () => handles, host.ownsEventTarget)
        : undefined;
      if (options.map && this.hover) this.hover.element.style.zIndex = "3";
      this.removePostRender = subscribeAfterRender(() => {
        this.stats.visibleCount = this.renderer.visibleCount;
        this.hover?.update();
      });
      this.schedule();
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error(String(cause));
      this.failure = error;
      this.destroy();
      throw error;
    }
  }

  get count(): number { return this.callouts.length; }
  get visibleCount(): number { return this.renderer.visibleCount; }
  getStats(): TargetCalloutManagerStats { return { ...this.stats, visibleCount: this.renderer.visibleCount }; }
  get(index: number): WorkerCalloutHandle | undefined { return this.callouts[index]; }
  getById(id: TargetCalloutId): WorkerCalloutHandle | undefined { return this.byId.get(id); }
  isDestroyed(): boolean { return this.destroyed; }
  getTextRendering(): CalloutTextRenderingOptions { return this.renderer.getTextRendering(); }
  setAvoidance(options: boolean | Partial<CalloutAvoidanceOptions>, mode?: CalloutDisplayMode): void {
    this.ensureAlive();
    const modes: CalloutDisplayMode[] = mode === undefined ? ["detailed", "compact"] : [mode];
    const enabledModes = this.preservePositionOnAvoidanceDisable
      ? modes.filter(name => this.renderer.getAvoidance(name).enabled) : [];
    // Validate and apply all mode settings before committing any saved position.
    // Clearing layout caches does not change the currently displayed handle offsets.
    this.renderer.setAvoidance(options, mode);
    const disabledModes = new Set(enabledModes.filter(name => !this.renderer.getAvoidance(name).enabled));
    if (disabledModes.size) {
      for (const callout of this.callouts) {
        if (disabledModes.has(callout.getRenderedDisplayMode())) callout.setOffset(callout.getOffset());
      }
    }
  }
  getAvoidance(mode: CalloutDisplayMode = "detailed"): CalloutAvoidanceOptions { return this.renderer.getAvoidance(mode); }
  getAvoidanceStats(mode?: CalloutDisplayMode): CalloutAvoidanceStats { return this.renderer.getAvoidanceStats(mode); }

  /** Resolves after queued updates reach the selected rendering backend; does not wait for the next map/scene frame. */
  flush(): Promise<void> {
    if (this.destroyed) return Promise.reject(this.failure ?? new Error("TargetCalloutManager 已销毁"));
    if (this.readySettled && !this.busy && !this.scheduled && !this.hasPending()) return Promise.resolve();
    return new Promise<void>((resolve, reject) => { this.waiters.add({ resolve, reject }); });
  }

  setTextRendering(options: Partial<CalloutTextRenderingOptions>): void {
    this.ensureAlive();
    this.renderer.setTextRendering(options);
    this.requestRender();
  }

  onHover(type: CalloutHoverEventType, listener: Parameters<TargetCalloutHoverController["on"]>[1]): () => void {
    this.ensureAlive();
    return this.hover?.on(type, listener) ?? (() => {});
  }

  /**
   * Keeps the latest full position batch and merges sparse lines by target.
   * transfer=true hands over the positions buffer from this call onward.
   */
  updateTargets(update: TargetCalloutBulkUpdate, transfer = false): void {
    this.ensureAlive();
    if (update.positions && (!(update.positions instanceof Float64Array) || update.positions.length !== this.count * 3)) {
      throw new RangeError(`positions 长度必须是 ${this.count * 3}`);
    }
    if (update.positions && !update.positions.every(Number.isFinite)) throw new RangeError("positions 必须只包含有限数");
    if (transfer && update.positions && !(update.positions.buffer instanceof ArrayBuffer)) {
      throw new TypeError("transfer=true 需要可转移的 ArrayBuffer");
    }
    for (const row of update.lines ?? []) {
      if (!Number.isInteger(row.index) || row.index < 0 || row.index >= this.count) throw new RangeError("文字更新包含无效目标索引");
      validateLines(row.text);
    }
    for (const row of update.fields ?? []) {
      if (!Number.isInteger(row.index) || row.index < 0 || row.index >= this.count) throw new RangeError("字段更新包含无效目标索引");
      copyCalloutFields(row.fields);
    }
    const titles = (update.titles ?? []).map(row => {
      if (!Number.isInteger(row.index) || row.index < 0 || row.index >= this.count) throw new RangeError("标题更新包含无效目标索引");
      return { index: row.index, title: normalizeTitle(row.title) };
    });
    const badges = (update.badges ?? []).map(row => {
      if (!Number.isInteger(row.index) || row.index < 0 || row.index >= this.count) throw new RangeError("字母更新包含无效目标索引");
      return { index: row.index, badgeText: normalizeBadgeText(row.badgeText) };
    });
    if (!update.positions && !update.lines?.length && !update.fields?.length && !titles.length && !badges.length) return;
    const lineUpdates = new Map((update.lines ?? []).map(row => [row.index, row.text]));
    const fieldUpdates = new Map((update.fields ?? []).map(row => [row.index, row.fields]));
    const prepared = new Map<number, PreparedCalloutContent>();
    for (const index of new Set([...lineUpdates.keys(), ...fieldUpdates.keys()])) {
      prepared.set(index, this.callouts[index]!.prepareContent(fieldUpdates.get(index), lineUpdates.get(index)));
    }
    this.pendingBulk = {
      positions: update.positions
        ? transfer ? update.positions : new Float64Array(update.positions)
        : this.pendingBulk?.positions,
    };
    for (const row of update.lines ?? []) this.pendingLines.set(row.index, { index: row.index, text: [...row.text] });
    for (const [index, content] of prepared) this.callouts[index]!.applyContent(content);
    // Explicit sparse title values take precedence over a title in this batch's fields.
    for (const row of titles) this.callouts[row.index]!.setTitle(row.title);
    for (const row of badges) this.callouts[row.index]!.setBadgeText(row.badgeText);
    this.schedule();
  }

  destroy(): void {
    if (this.destroyed) return;
    // Unhook asynchronous work before releasing scene resources.
    if (this.worker) {
      this.worker.onmessage = null;
      this.worker.onerror = null;
      this.worker.onmessageerror = null;
      this.worker.terminate();
    }
    this.destroyed = true;
    this.drag?.destroy();
    this.clicks?.destroy();
    this.hover?.destroy();
    this.removePostRender?.();
    this.renderer?.destroy();
    this.pendingPatches.clear();
    this.pendingBulk = undefined;
    this.pendingLines.clear();
    this.byId.clear();
    this.recycledPositions = new Float64Array(0);
    this.recycledInstances = new Float32Array(0);
    const error = this.failure ?? new Error("TargetCalloutManager 已销毁");
    if (!this.readySettled) { this.readySettled = true; this.rejectReady(error); }
    for (const waiter of this.waiters) waiter.reject(error);
    this.waiters.clear();
    this.frame = { positions: new Float64Array(0), bounds: new Float32Array(0) };
  }

  private queuePatch(patch: CalloutPatch): void {
    // 同目标的多次操作合并到一个待处理补丁，减少线程消息数量。
    if (this.destroyed) return;
    this.requestRender();
    // Screen offsets live entirely on the main thread; never round-trip them through layout.
    if (patch.style === undefined && patch.position === undefined && patch.lines === undefined && patch.show === undefined
      && patch.displayMode === undefined && patch.compactLines === undefined && patch.titleStyle === undefined
      && patch.title === undefined && patch.badgeText === undefined) return;
    const previous = this.pendingPatches.get(patch.index);
    this.pendingPatches.set(patch.index, { ...previous, ...patch });
    this.schedule();
  }

  private requestRender(): void {
    if (this.destroyed) return;
    if (this.options.map) this.options.map.render();
    else if (!this.options.scene!.isDestroyed()) this.options.scene!.requestRender();
  }

  private hasPending(): boolean {
    return !!this.pendingBulk || this.pendingLines.size > 0 || this.pendingPatches.size > 0;
  }

  private schedule(): void {
    if (this.destroyed || this.busy || this.scheduled) return;
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      this.dispatch();
    });
  }

  private dispatch(): void {
    // 同时只允许一个请求在途；转移缓冲后主线程不能继续访问其内容。
    if (this.destroyed || this.busy) return;
    const bulk = this.pendingBulk;
    this.pendingBulk = undefined;
    const lines = [...this.pendingLines.values()];
    this.pendingLines.clear();
    const patches = [...this.pendingPatches.values()];
    this.pendingPatches.clear();
    this.busy = true;
    this.sentAt = performance.now();
    if (this.domRenderer) {
      try {
        // Honor transfer ownership even though this backend runs on the main thread.
        const positions = bulk?.positions
          ? structuredClone(bulk.positions, { transfer: [bulk.positions.buffer as ArrayBuffer] }) : undefined;
        const result = this.domRenderer.update({ positions, lines, patches });
        this.busy = false;
        this.completeUpdate(result.computeMs, result.layoutMs, result.applyMs);
      } catch (cause) {
        this.fail(cause instanceof Error ? cause : new Error(String(cause)));
      }
      return;
    }
    const transfers: Transferable[] = [];
    if (bulk?.positions) transfers.push(bulk.positions.buffer as ArrayBuffer);
    if (this.recycledPositions.byteLength) transfers.push(this.recycledPositions.buffer as ArrayBuffer);
    if (this.recycledInstances.byteLength) transfers.push(this.recycledInstances.buffer as ArrayBuffer);
    try {
      this.worker.postMessage({
        type: "layout",
        id: ++this.requestId,
        patches,
        positions: bulk?.positions,
        lines,
        outputPositions: this.recycledPositions,
        instances: this.recycledInstances,
      }, transfers);
      this.recycledPositions = new Float64Array(0);
      this.recycledInstances = new Float32Array(0);
    } catch (cause) {
      this.fail(cause instanceof Error ? cause : new Error(String(cause)));
    }
  }

  private receive(result: WorkerResult): void {
    // 旧请求或销毁后的结果必须关闭位图，防止异步资源泄漏。
    if (this.destroyed || !this.busy || result.id !== this.requestId) {
      result.atlas?.close();
      return;
    }
    this.busy = false;
    if (result.error) {
      result.atlas?.close();
      this.fail(new Error(result.error));
      return;
    }
    const applyStarted = performance.now();
    this.recycledPositions = this.frame.positions;
    this.recycledInstances = result.instances;
    this.frame.positions = result.positions;
    this.frame.positionsVersion = (this.frame.positionsVersion ?? 0) + 1;
    try {
      this.gpuRenderer!.update(result, result.enabled, result.displayModes);
    } catch (cause) {
      result.atlas?.close();
      this.fail(cause instanceof Error ? cause : new Error(String(cause)));
      return;
    }
    this.completeUpdate(result.computeMs, result.layoutMs, performance.now() - applyStarted);
  }

  private completeUpdate(computeMs: number, layoutMs: number, applyMs: number): void {
    this.stats = {
      computeMs,
      layoutMs,
      applyMs,
      latencyMs: performance.now() - this.sentAt,
      visibleCount: this.renderer.visibleCount,
    };
    this.requestRender();
    if (!this.readySettled) {
      this.readySettled = true;
      this.resolveReady();
    }
    if (this.hasPending()) this.schedule();
    else {
      for (const waiter of this.waiters) waiter.resolve();
      this.waiters.clear();
    }
    // Consumer callbacks must never strand ready, flush, or the pending data queue.
    try { this.options.onStats?.(this.getStats()); }
    catch (cause) { this.notifyError(cause instanceof Error ? cause : new Error(String(cause))); }
  }

  private fail(error: Error): void {
    if (this.destroyed) return;
    this.busy = false;
    this.failure = error;
    this.destroy();
    this.notifyError(error);
  }

  private notifyError(error: Error): void {
    try { this.options.onError?.(error); }
    catch (cause) { console.error("TargetCalloutManager onError:", cause); }
  }

  private invoke(callback: () => void): void {
    try { callback(); }
    catch (cause) { this.notifyError(cause instanceof Error ? cause : new Error(String(cause))); }
  }

  private ensureAlive(): void {
    if (this.destroyed) throw this.failure ?? new Error("TargetCalloutManager 已销毁");
  }
}
