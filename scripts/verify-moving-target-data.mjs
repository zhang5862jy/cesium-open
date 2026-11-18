import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const dataPath = resolve(root, "public/data/moving-targets.json");
const document = JSON.parse(readFileSync(dataPath, "utf8"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(document.schemaVersion === "1.0", "Unexpected schema version.");
assert(document.targets.length === 100, "Expected exactly 100 targets.");
assert(
  Date.parse(document.scenario.stopTime) -
    Date.parse(document.scenario.startTime) ===
    60_000,
  "Expected a 60-second scenario.",
);

const modelMap = new Map(
  document.models.map((model) => [model.type, model]),
);
const factionIds = new Set(
  document.factions.map((faction) => faction.id),
);
const usedModels = new Set();

for (const model of document.models) {
  const modelPath = resolve(root, "public", model.url.replace(/^\//, ""));
  assert(existsSync(modelPath), `Missing model file: ${model.url}`);
  assert(
    model.url.startsWith("/model/lod/"),
    `Model is not using a generated LOD asset: ${model.url}`,
  );
  assert(
    Number.isFinite(model.scale) && model.scale > 0,
    `Invalid model scale: ${model.type}`,
  );

  const glb = readFileSync(modelPath);
  const jsonChunkLength = glb.readUInt32LE(12);
  const gltf = JSON.parse(
    glb
      .subarray(20, 20 + jsonChunkLength)
      .toString("utf8")
      .replace(/\0/g, "")
      .trim(),
  );
  const primitiveCount = (gltf.meshes ?? []).reduce(
    (total, mesh) => total + (mesh.primitives?.length ?? 0),
    0,
  );
  assert(
    gltf.meshes?.length === 1 &&
      primitiveCount === 1 &&
      gltf.materials?.length === 1,
    `${model.type}: LOD must contain one mesh, primitive, and material.`,
  );
}

for (const target of document.targets) {
  assert(modelMap.has(target.modelType), `${target.id}: unknown model type.`);
  assert(
    typeof target.showModel === "boolean",
    `${target.id}: showModel must be boolean.`,
  );
  assert(factionIds.has(target.faction), `${target.id}: unknown faction.`);
  assert(
    Number.isFinite(target.health) &&
      target.health >= 0 &&
      target.health <= target.maxHealth,
    `${target.id}: invalid health.`,
  );
  assert(target.track.length >= 2, `${target.id}: track is too short.`);
  assert(
    target.track[0].time === document.scenario.startTime &&
      target.track.at(-1).time === document.scenario.stopTime,
    `${target.id}: track must cover the complete scenario.`,
  );
  usedModels.add(target.modelType);

  let previousTime = Number.NEGATIVE_INFINITY;
  for (const sample of target.track) {
    const time = Date.parse(sample.time);
    assert(Number.isFinite(time), `${target.id}: invalid sample time.`);
    assert(time > previousTime, `${target.id}: samples are not ordered.`);
    assert(
      Number.isFinite(sample.longitude) &&
        sample.longitude >= -180 &&
        sample.longitude <= 180,
      `${target.id}: invalid longitude.`,
    );
    assert(
      Number.isFinite(sample.latitude) &&
        sample.latitude >= -90 &&
        sample.latitude <= 90,
      `${target.id}: invalid latitude.`,
    );
    for (const field of ["height", "heading", "pitch", "roll"]) {
      assert(
        Number.isFinite(sample[field]),
        `${target.id}: invalid ${field}.`,
      );
    }
    previousTime = time;
  }
}

assert(
  usedModels.size === modelMap.size,
  "Not every configured model is used by a target.",
);
assert(
  document.targets.some((target) => target.showModel) &&
    document.targets.some((target) => !target.showModel),
  "Expected both visible and data-hidden targets.",
);

const interpolationSource = readFileSync(
  resolve(
    root,
    "src/cesium/tools/moving-targets/MovingTargetLayer.ts",
  ),
  "utf8",
);
for (const forbidden of [
  "SampledPositionProperty",
  "SampledProperty",
  "Cartesian3.lerp",
  "Quaternion.slerp",
]) {
  assert(
    !interpolationSource.includes(forbidden),
    `Forbidden Cesium interpolation API found: ${forbidden}`,
  );
}
assert(
  !interpolationSource.includes("Billboard"),
  "Moving target layer must not use Billboard fallback.",
);

const modelCounts = Object.fromEntries(
  [...usedModels].map((modelType) => [
    modelType,
    document.targets.filter(
      (target) => target.modelType === modelType,
    ).length,
  ]),
);

console.log(
  JSON.stringify(
    {
      targets: document.targets.length,
      samples: document.targets.reduce(
        (total, target) => total + target.track.length,
        0,
      ),
      modelCounts,
      dataVisibleTargets: document.targets.filter(
        (target) => target.showModel,
      ).length,
      factions: [...factionIds],
    },
    null,
    2,
  ),
);
