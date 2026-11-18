import { GlyphBatchBuilder } from "./glyphBatch";
import type { TargetCalloutStyle } from "./legacyCallout";
import type { PaintItem } from "./workerRenderer";
import type { CalloutPatch } from "./workerHandle";
import type { CalloutDisplayMode } from "./display";

interface SerializedTarget {
  position: [number, number, number];
  lines: string[];
  style: TargetCalloutStyle;
  compactLines?: string[];
  displayMode?: CalloutDisplayMode;
  title?: string;
  badgeText?: string;
  titleStyle?: TargetCalloutStyle;
  show: boolean;
}

interface LineUpdate { index: number; text: string[] }

let items: PaintItem[] = [];
let positions: Float64Array = new Float64Array(0);
let sourceLines: string[][] = [];
let compactLines: string[][] = [];
let displayModes = new Uint8Array(0);
let enabled = new Uint8Array(0);
const overrides = new Map<number, CalloutPatch>();
const builder = new GlyphBatchBuilder();
// 位置和显隐不影响文字几何；只有内容或样式变化才重新生成实例。
let layoutDirty = true;

function updateLines(item: PaintItem, lines: string[]): void {
  if (item.lines.length === lines.length && item.lines.every((line, index) => line === lines[index])) return;
  item.lines = lines;
  layoutDirty = true;
}

self.onmessage = async (event: MessageEvent) => {
  const data = event.data;
  if (data.type === "init") {
    const targets = data.targets as SerializedTarget[];
    layoutDirty = true;
    overrides.clear();
    sourceLines = targets.map(target => target.lines);
    compactLines = targets.map(target => target.compactLines ?? []);
    displayModes = new Uint8Array(targets.map(target => Number(target.displayMode === "compact")));
    items = targets.map((target) => ({
      style: target.style,
      titleStyle: target.titleStyle,
      title: target.title,
      badgeText: target.badgeText,
      displayMode: target.displayMode ?? "detailed",
      x: 0,
      y: 0,
      lines: target.displayMode === "compact" ? target.compactLines ?? [] : target.lines,
    }));
    positions = new Float64Array(targets.length * 3);
    enabled = new Uint8Array(targets.length);
    targets.forEach((target, index) => {
      positions.set(target.position, index * 3);
      enabled[index] = Number(target.show);
    });
    return;
  }
  if (data.type !== "layout") return;
  try {
    const started = performance.now();
    if (data.positions) positions = data.positions as Float64Array;
    for (const update of (data.lines ?? []) as LineUpdate[]) {
      sourceLines[update.index] = update.text;
      if (!displayModes[update.index] && !overrides.get(update.index)?.lines && items[update.index]) {
        updateLines(items[update.index]!, update.text);
      }
    }
    for (const patch of data.patches as CalloutPatch[]) {
      const item = items[patch.index];
      if (!item) continue;
      if (patch.compactLines !== undefined) compactLines[patch.index] = patch.compactLines;
      if (patch.displayMode !== undefined) {
        displayModes[patch.index] = Number(patch.displayMode === "compact");
        if (item.displayMode !== patch.displayMode) { item.displayMode = patch.displayMode; layoutDirty = true; }
      }
      if (patch.title !== undefined && patch.title !== item.title) {
        item.title = patch.title;
        if (item.displayMode !== "compact") layoutDirty = true;
      }
      if (patch.badgeText !== undefined && patch.badgeText !== item.badgeText) {
        item.badgeText = patch.badgeText; layoutDirty = true;
      }
      if (patch.titleStyle) {
        const keys = Object.keys(patch.titleStyle) as (keyof TargetCalloutStyle)[];
        if (keys.some(key => item.titleStyle?.[key] !== patch.titleStyle![key])) {
          item.titleStyle = patch.titleStyle;
          if (item.displayMode !== "compact") layoutDirty = true;
        }
      }
      if (patch.style) {
        const keys = Object.keys(patch.style) as (keyof TargetCalloutStyle)[];
        if (keys.some((key) => item.style[key] !== patch.style![key])) {
          item.style = patch.style;
          layoutDirty = true;
        }
      }
      const override = { ...overrides.get(patch.index), ...patch };
      if (patch.lines === null) {
        delete override.lines;
      }
      if (patch.position === null) delete override.position;
      if (patch.lines !== undefined || patch.position !== undefined || patch.show !== undefined) overrides.set(patch.index, override);
    }
    for (const [index, patch] of overrides) {
      if (patch.show !== undefined) enabled[index] = Number(patch.show);
    }
    items.forEach((item, index) => updateLines(item, displayModes[index]
      ? compactLines[index]! : overrides.get(index)?.lines ?? sourceLines[index]!));
    const computeMs = performance.now() - started;
    const batch = layoutDirty
      ? await builder.build(items, data.instances)
      : { instances: data.instances as Float32Array, count: 0, sizes: new Float32Array(0), unchanged: true };
    const outputPositions = data.outputPositions?.length === positions.length
      ? data.outputPositions as Float64Array
      : new Float64Array(positions.length);
    outputPositions.set(positions);
    // Preserve source positions while an override is active, so reset restores the latest input.
    for (const [index, patch] of overrides) if (patch.position) outputPositions.set(patch.position, index * 3);
    const outputEnabled = new Uint8Array(enabled);
    const outputModes = new Uint8Array(displayModes);
    const transfer: Transferable[] = [
      outputPositions.buffer,
      outputEnabled.buffer,
      outputModes.buffer,
      batch.instances.buffer,
      batch.sizes.buffer,
    ];
    if (batch.atlas) transfer.push(batch.atlas);
    if (batch.actionRects) transfer.push(batch.actionRects.buffer);
    self.postMessage({
      id: data.id,
      positions: outputPositions,
      enabled: outputEnabled,
      displayModes: outputModes,
      ...batch,
      computeMs,
      layoutMs: performance.now() - started - computeMs,
    }, { transfer });
    layoutDirty = false;
  } catch (cause) {
    self.postMessage({
      id: data.id,
      error: cause instanceof Error ? cause.message : String(cause),
    });
  }
};
