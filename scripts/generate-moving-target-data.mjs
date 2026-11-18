import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const outputPath = resolve(
  scriptDirectory,
  "../public/data/moving-targets.json",
);
const startTimestamp = Date.parse("2026-07-30T00:00:00Z");
const durationSeconds = 60;
const targetCount = 100;

const models = [
  {
    type: "j20",
    name: "J-20",
    targetType: "fighter",
    url: "/model/lod/j20-lod.glb",
    forwardAxis: "X",
    upAxis: "Z",
    scale: 0.0035,
    minimumPixelSize: 24,
    altitudeRange: [8_000, 16_000],
    travelDegrees: 1.2,
  },
  {
    type: "v22",
    name: "V-22 Osprey",
    targetType: "tiltrotor",
    url: "/model/lod/v22-lod.glb",
    forwardAxis: "X",
    upAxis: "Z",
    scale: 0.1,
    minimumPixelSize: 24,
    altitudeRange: [1_500, 5_000],
    travelDegrees: 0.55,
  },
  {
    type: "fire-engine",
    name: "消防车",
    targetType: "ground-vehicle",
    url: "/model/lod/fire-engine-lod.glb",
    forwardAxis: "X",
    upAxis: "Z",
    scale: 3,
    minimumPixelSize: 22,
    altitudeRange: [30, 160],
    travelDegrees: 0.06,
  },
  {
    type: "elephant-man",
    name: "大象人",
    targetType: "ground-unit",
    url: "/model/lod/elephant-man-lod.glb",
    forwardAxis: "Z",
    upAxis: "Y",
    scale: 60,
    minimumPixelSize: 22,
    altitudeRange: [30, 160],
    travelDegrees: 0.012,
  },
];

const factions = [
  { id: "blue", name: "蓝方", color: "#35a7ff" },
  { id: "red", name: "红方", color: "#ff4d62" },
  { id: "neutral", name: "中立", color: "#ffd166" },
];

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x1_0000_0000;
  };
}

function round(value, digits = 6) {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}

function hashIndex(value) {
  let hash = Math.imul(value + 1, 0x45d9f3b);
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
  return (hash ^ (hash >>> 16)) >>> 0;
}

function createTarget(index) {
  const random = seededRandom(index + 0x2f6e2b1);
  // 前四个目标固定覆盖全部模型，其余目标使用可复现随机分配。
  const model =
    index < models.length
      ? models[index]
      : models[hashIndex(index) % models.length];
  const faction = factions[Math.floor(random() * factions.length)];
  const baseLongitude = 74 + random() * 59;
  const baseLatitude = 20 + random() * 27;
  const direction = random() * Math.PI * 2;
  const travel = model.travelDegrees * (0.65 + random() * 0.7);
  const longitudeTravel = Math.sin(direction) * travel;
  const latitudeTravel = Math.cos(direction) * travel;
  const baseAltitude =
    model.altitudeRange[0] +
    random() * (model.altitudeRange[1] - model.altitudeRange[0]);
  const headingDegrees = ((direction * 180) / Math.PI + 360) % 360;
  const maxHealth = 100;
  const health = Math.max(10, Math.round(35 + random() * 65));

  const track = Array.from({ length: 4 }, (_, sampleIndex) => {
    const seconds = sampleIndex * 20;
    const progress = seconds / durationSeconds;
    const phase = progress * Math.PI * 2 + index * 0.013;
    const isAircraft =
      model.targetType === "fighter" || model.targetType === "tiltrotor";
    const curve = Math.sin(phase) * (isAircraft ? 0.025 : 0.0002);
    const altitudeWave = isAircraft ? Math.sin(phase) * 650 : 0;
    return {
      time: new Date(startTimestamp + seconds * 1000).toISOString(),
      longitude: round(
        baseLongitude + longitudeTravel * progress + curve,
      ),
      latitude: round(
        baseLatitude + latitudeTravel * progress + curve * 0.55,
      ),
      height: round(baseAltitude + altitudeWave, 2),
      heading: round(headingDegrees + Math.sin(phase) * 9, 3),
      pitch: round(isAircraft ? Math.sin(phase) * 4 : 0, 3),
      roll: round(isAircraft ? Math.cos(phase) * 14 : 0, 3),
    };
  });

  return {
    id: `TARGET-${String(index + 1).padStart(4, "0")}`,
    name: `${model.name}-${String(index + 1).padStart(4, "0")}`,
    modelType: model.type,
    targetType: model.targetType,
    faction: faction.id,
    health,
    maxHealth,
    status: health < 50 ? "damaged" : "active",
    showModel: index % 5 !== 4,
    speedLevel: round(0.65 + random() * 0.35, 2),
    track,
  };
}

const document = {
  schemaVersion: "1.0",
  scenario: {
    id: "china-mixed-moving-targets",
    name: "中国区域多类型动目标演示",
    description:
      "包含飞机、倾转旋翼机、消防车和地面单位的合成轨迹数据，仅用于 Cesium 性能和插值演示。",
    startTime: new Date(startTimestamp).toISOString(),
    stopTime: new Date(
      startTimestamp + durationSeconds * 1000,
    ).toISOString(),
    loop: true,
    sampleIntervalSeconds: 20,
  },
  factions,
  models: models.map(
    ({
      altitudeRange: _altitudeRange,
      travelDegrees: _travelDegrees,
      ...model
    }) => model,
  ),
  targets: Array.from({ length: targetCount }, (_, index) =>
    createTarget(index),
  ),
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
console.log(
  `Generated ${document.targets.length} targets at ${outputPath}`,
);
