import { simulate, type SimulationConfig, type SimulationResult } from "./simulation";
import { GlyphBatchBuilder } from "cesium-screen-callout/worker";
import type { CalloutPatch, TargetCalloutStyle } from "cesium-screen-callout";

interface PaintItem {
  style: TargetCalloutStyle;
  x: number;
  y: number;
  lines: string[];
}

let config: SimulationConfig;
let items: PaintItem[];
let result: SimulationResult | undefined;
let seconds = Number.NaN;
const overrides = new Map<number, CalloutPatch>();
const builder = new GlyphBatchBuilder();

self.onmessage = async (event: MessageEvent) => {
  const data = event.data;
  if (data.type === "init") {
    config = data.config;
    items = Array.from({ length: config.count }, () => ({
      style: { ...data.style },
      x: 80,
      y: -80,
      lines: [],
    }));
    return;
  }
  if (data.type !== "step") return;
  try {
    const start = performance.now();
    for (const patch of data.patches as CalloutPatch[]) {
      const item = items[patch.index];
      if (!item) continue;
      if (patch.style) item.style = patch.style;
      if (patch.lines || patch.position || patch.show !== undefined) {
        overrides.set(patch.index, { ...overrides.get(patch.index), ...patch });
      }
    }
    if (!result || seconds !== data.seconds) {
      result = simulate(config, {
        id: data.id,
        seconds: data.seconds,
        viewProjection: new Array(16).fill(0),
        camera: [0, 0, 0],
      });
      seconds = data.seconds;
      for (const row of result.lines) items[row.index]!.lines = [result.titles[row.index]!.title, ...row.text];
    }
    const positions: Float64Array = data.positions ?? new Float64Array(config.count * 3);
    positions.set(result.positions);
    const enabled = new Uint8Array(config.count).fill(1);
    for (const [index, patch] of overrides) {
      if (patch.position) positions.set(patch.position, index * 3);
      if (patch.lines) items[index]!.lines = patch.lines;
      if (patch.show === false) enabled[index] = 0;
    }
    const computeMs = performance.now() - start;
    const batch = await builder.build(items, data.instances);
    const transfer: Transferable[] = [positions.buffer, enabled.buffer, batch.instances.buffer, batch.sizes.buffer];
    if (batch.atlas) transfer.push(batch.atlas);
    self.postMessage({
      id: data.id,
      positions,
      enabled,
      ...batch,
      computeMs,
      paintMs: performance.now() - start - computeMs,
    }, { transfer });
  } catch (cause) {
    self.postMessage({
      id: data.id,
      error: cause instanceof Error ? cause.message : String(cause),
    });
  }
};
