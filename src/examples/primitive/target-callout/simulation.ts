import { isTargetVisible } from "cesium-screen-callout/worker";
import type { CalloutField } from "cesium-screen-callout";
export { isTargetVisible };
// Plain data only: this module runs in a Worker and is also used by the regression page.
export interface SimulationClassification {
  platform: string;
  affiliation: string;
}
export interface SimulationConfig {
  count: number;
  columns: number;
  frame: number[];
  classifications?: readonly SimulationClassification[];
}
export interface SimulationRequest {
  id: number;
  seconds: number;
  viewProjection: number[];
  camera: number[];
}
export interface SimulationResult {
  id: number;
  positions: Float64Array;
  visible: Uint8Array;
  titles: { index: number; title: string }[];
  lines: { index: number; text: string[] }[];
  fields: { index: number; fields: CalloutField[] }[];
  computeMs: number;
}

const A = 6378137;
const B = 6356752.314245179;
const E2 = 1 - B * B / (A * A);

function geographic(x: number, y: number, z: number): [number, number, number] {
  const p = Math.hypot(x, y);
  let latitude = Math.atan2(z, p * (1 - E2));
  let n = A;
  for (let i = 0; i < 8; i++) {
    const sin = Math.sin(latitude);
    n = A / Math.sqrt(1 - E2 * sin * sin);
    const next = Math.atan2(z + E2 * n * sin, p);
    if (Math.abs(next - latitude) < 1e-13) { latitude = next; break; }
    latitude = next;
  }
  n = A / Math.sqrt(1 - E2 * Math.sin(latitude) ** 2);
  return [Math.atan2(y, x) * 180 / Math.PI, latitude * 180 / Math.PI, p / Math.cos(latitude) - n];
}

export function simulate(config: SimulationConfig, request: SimulationRequest): SimulationResult {
  const start = performance.now();
  const positions = new Float64Array(config.count * 3);
  const visible = new Uint8Array(config.count);
  const titles: SimulationResult["titles"] = [];
  const lines: SimulationResult["lines"] = [];
  const fields: SimulationResult["fields"] = [];
  const f = config.frame;
  const rows = Math.ceil(config.count / config.columns);
  for (let index = 0; index < config.count; index++) {
    const phase = request.seconds * 0.14 + index * 0.7;
    const cos = Math.cos(phase), sin = Math.sin(phase);
    const east = (index % config.columns - (config.columns - 1) / 2) * 8000 + 1000 * cos;
    const north = (Math.floor(index / config.columns) - (rows - 1) / 2) * 8000 + 700 * sin;
    const x = f[0]! * east + f[4]! * north + f[12]!;
    const y = f[1]! * east + f[5]! * north + f[13]!;
    const z = f[2]! * east + f[6]! * north + f[14]!;
    positions[index * 3] = x; positions[index * 3 + 1] = y; positions[index * 3 + 2] = z;
    visible[index] = Number(isTargetVisible(x, y, z, request.viewProjection, request.camera));
    const [longitude, latitude, height] = geographic(x, y, z);
    const classification = config.classifications?.[index];
    const speed = Math.hypot(140 * sin, 98 * cos);
    fields.push({ index, fields: [
      { key: "id", value: index + 1 },
      { key: "status", value: "TRACKING" },
      { key: "platform", value: classification?.platform ?? "未分类" },
      { key: "affiliation", value: classification?.affiliation ?? "不明" },
      { key: "longitude", value: longitude },
      { key: "latitude", value: latitude },
      { key: "height", value: height },
      { key: "speed", value: speed },
      { key: "time", value: request.seconds },
    ] });
    titles.push({ index, title: "目标 " + String(index + 1).padStart(3, "0") + " / TRACKING" });
    lines.push({ index, text: [
      "平台  " + (classification?.platform ?? "未分类") + " · 属方  " + (classification?.affiliation ?? "不明"),
      "经度  " + longitude.toFixed(5) + "°", "纬度  " + latitude.toFixed(5) + "°",
      "高度  " + height.toFixed(1) + " m",
      "速度  " + speed.toFixed(1) + " m/s · T " + request.seconds.toFixed(1) + " s",
    ] });
  }
  return { id: request.id, positions, visible, titles, lines, fields, computeMs: performance.now() - start };
}

