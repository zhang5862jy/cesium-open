import { simulate, isTargetVisible, type SimulationConfig, type SimulationRequest, type SimulationResult } from "./simulation";
import { WorkerCalloutRenderer, type PaintItem } from "../../../cesium/tools/target-callout/workerRenderer";
import type { CalloutPatch } from "../../../cesium/tools/target-callout/workerHandle";

let config: SimulationConfig;
let renderer: WorkerCalloutRenderer;
let items: PaintItem[];
let result: SimulationResult | undefined;
let previousSeconds = Number.NaN;
const overrides = new Map<number, CalloutPatch>();

self.onmessage = (event: MessageEvent) => {
  const data = event.data;
  if (data.type === "init") {
    config = data.config;
    renderer = new WorkerCalloutRenderer(data.canvas);
    items = Array.from({ length: config.count }, () => ({ style: { ...data.style }, x: 80, y: -80, lines: [] }));
    return;
  }
  if (data.type !== "step") return;
  const start = performance.now();
  const request = data.request as SimulationRequest;
  for (const patch of data.patches as CalloutPatch[]) {
    const item = items[patch.index];
    if (!item) continue;
    if (patch.style) item.style = patch.style;
    if (patch.x !== undefined) item.x = patch.x;
    if (patch.y !== undefined) item.y = patch.y;
    if (patch.lines || patch.position || patch.show !== undefined) overrides.set(patch.index, { ...overrides.get(patch.index), ...patch });
  }
  if (!result || request.seconds !== previousSeconds) {
    result = simulate(config, request);
    previousSeconds = request.seconds;
    for (const row of result.lines) items[row.index]!.lines = [result.titles[row.index]!.title, ...row.text];
  }
  for (let i = 0; i < config.count; i++) {
    const override = overrides.get(i);
    if (override?.position) result.positions.set(override.position, i * 3);
    if (override?.lines) items[i]!.lines = override.lines;
    const p = result.positions;
    result.visible[i] = override?.show === false ? 0 : Number(isTargetVisible(p[i * 3]!, p[i * 3 + 1]!, p[i * 3 + 2]!, request.viewProjection, request.camera));
  }
  const positions: Float64Array = data.positions ?? new Float64Array(config.count * 3);
  const bounds: Float32Array = data.bounds ?? new Float32Array(config.count * 5);
  positions.set(result.positions);
  const computeMs = performance.now() - start;
  const visible = renderer.draw(items, positions, result.visible, request.viewProjection, data.width, data.height, data.ratio, bounds);
  self.postMessage({ id: request.id, positions, bounds, visible, computeMs, paintMs: performance.now() - start - computeMs }, { transfer: [positions.buffer, bounds.buffer] });
};
