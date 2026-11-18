import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
import * as C from "cesium";

// Execute the real TypeScript with Cesium's real Cartesian3. Only visibility
// setters are instrumented; this manager does not require a browser or WebGL.
const source = await readFile(
  new URL("../src/cesium/tools/lod/LodManager.ts", import.meta.url),
  "utf8",
);
const exports = {};
vm.runInNewContext(
  ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText,
  {
    exports,
    require(name) {
      assert.equal(name, "cesium");
      return C;
    },
  },
);
const { LodManager, asLodView } = exports;

function renderObject() {
  let show = true;
  return {
    writes: [],
    destroyed: false,
    get show() {
      return show;
    },
    set show(value) {
      show = value;
      this.writes.push(value);
    },
    destroy() {
      this.destroyed = true;
    },
  };
}

const camera = new C.Cartesian3();
const movingPosition = new C.Cartesian3(50, 0, 0);
const model = renderObject();
const billboard = renderObject();
const manager = new LodManager();
manager.add({
  id: "moving",
  metric: "distance",
  getPosition: () => movingPosition,
  hysteresis: 10,
  levels: [
    { min: 0, max: 100, view: asLodView(model) },
    { min: 100, max: 300, view: asLodView(billboard) },
  ],
});
assert.equal(manager.size, 1);
assert.equal(model.show, false);
assert.equal(billboard.show, false);
assert.equal(manager.getLevel("moving"), -1);
assert.equal(manager.update(camera, 50), true);
assert.equal(model.show, true);
assert.equal(manager.getLevel("moving"), 0);
const initialWrites = model.writes.length + billboard.writes.length;
assert.equal(manager.update(camera, 50), false);
assert.equal(model.writes.length + billboard.writes.length, initialWrites);

function moveTo(distance, expectedLevel, changed) {
  // Reuse exactly the same object with a stationary camera.
  movingPosition.x = distance;
  assert.equal(manager.update(camera, 50), changed);
  assert.equal(manager.getLevel("moving"), expectedLevel);
  assert.equal(model.show, expectedLevel === 0);
  assert.equal(billboard.show, expectedLevel === 1);
}
moveTo(105, 0, false);
moveTo(110, 1, true);
moveTo(95, 1, false);
moveTo(89, 0, true);
moveTo(1000, -1, true); // Cross all visible ranges in one update.
moveTo(295, -1, false); // The hidden region also retains its state.
moveTo(289, 1, true);
moveTo(50, 0, true);

// Camera mutation must also be detected by value, rather than object identity.
camera.x = -200;
assert.equal(manager.update(camera, 50), true);
assert.equal(manager.getLevel("moving"), 1);
manager.setMetric("moving", "cameraHeight");
assert.equal(manager.update(camera, 50), true);
assert.equal(manager.getLevel("moving"), 0);
camera.x = -2000;
movingPosition.x = 1000;
assert.equal(manager.update(camera, 50), false);
assert.equal(manager.update(camera, 110), true);
assert.equal(manager.getLevel("moving"), 1);
assert.equal(manager.update(camera, -20), true);
assert.equal(manager.getLevel("moving"), -1);
assert.equal(manager.update(camera, 5), false);
assert.equal(manager.update(camera, 10), true);
assert.equal(manager.getLevel("moving"), 0);
manager.setMetric("moving", "distance");
assert.equal(manager.update(camera, 10), true);
assert.equal(manager.getLevel("moving"), -1);

// Disable and reenable still work when the camera and position do not move.
camera.x = 950;
manager.update(camera, 10);
manager.setEnabled("moving", false);
assert.equal(manager.update(camera, 10), true);
assert.equal(manager.getLevel("moving"), -1);
manager.setEnabled("moving", true);
assert.equal(manager.update(camera, 10), true);
assert.equal(manager.getLevel("moving"), 0);
assert.throws(() => manager.setPosition("moving", movingPosition));

const explicitManager = new LodManager();
const explicitObject = renderObject();
const inputPosition = new C.Cartesian3(50, 0, 0);
camera.x = 0;
explicitManager.add({
  id: "explicit",
  metric: "distance",
  position: inputPosition,
  levels: [{ min: 0, max: 100, view: asLodView(explicitObject) }],
});
explicitManager.update(camera, 0);
inputPosition.x = 500;
assert.equal(explicitManager.update(camera, 0), false); // Position was copied.
explicitManager.setPosition("explicit", inputPosition);
assert.equal(explicitManager.update(camera, 0), true);
assert.equal(explicitManager.getLevel("explicit"), -1);
inputPosition.x = 50;
explicitManager.setPosition("explicit", inputPosition);
assert.equal(explicitManager.update(camera, 0), true);

// Height-only LOD ignores target movement but preserves the latest position
// for switching back to distance, including changes received while paused.
explicitManager.setMetric("explicit", "cameraHeight");
assert.equal(explicitManager.update(camera, 50), false);
const heightWrites = explicitObject.writes.length;
inputPosition.x = 500;
explicitManager.setPosition("explicit", inputPosition);
assert.equal(explicitManager.update(camera, 50), false);
assert.equal(explicitObject.writes.length, heightWrites);
explicitManager.setMetric("explicit", "distance");
assert.equal(explicitManager.update(camera, 50), true);
assert.equal(explicitManager.getLevel("explicit"), -1);
inputPosition.x = 50;
explicitManager.setPosition("explicit", inputPosition);
assert.equal(explicitManager.update(camera, 50), true);

// Half-open boundaries, invisible gaps and Infinity work without hysteresis.
const gapManager = new LodManager();
const gapNear = renderObject();
const gapFar = renderObject();
gapManager.add({
  id: "gaps",
  metric: "cameraHeight",
  levels: [
    { min: 0, max: 100, view: asLodView(gapNear) },
    { min: 200, max: Infinity, view: asLodView(gapFar) },
  ],
});
for (const [height, level] of [
  [-1, -1],
  [0, 0],
  [99, 0],
  [100, -1],
  [199, -1],
  [200, 1],
  [1e12, 1],
]) {
  gapManager.update(camera, height);
  assert.equal(gapManager.getLevel("gaps"), level);
}
assert.throws(() => gapManager.setMetric("gaps", "distance"));

const stableGapManager = new LodManager();
stableGapManager.add({
  id: "stable-gap",
  metric: "cameraHeight",
  hysteresis: 10,
  levels: [
    { min: 0, max: 100, view: asLodView(renderObject()) },
    { min: 200, max: 300, view: asLodView(renderObject()) },
  ],
});
for (const [height, level] of [
  [50, 0],
  [120, -1],
  [95, -1],
  [89, 0],
  [250, 1],
  [180, -1],
  [205, -1],
  [210, 1],
]) {
  stableGapManager.update(camera, height);
  assert.equal(stableGapManager.getLevel("stable-gap"), level);
}

// Invalid registration must not alter existing visibility or collection size.
const invalid = new LodManager();
const untouched = renderObject();
assert.throws(() =>
  invalid.add({
    id: "overlap",
    metric: "cameraHeight",
    levels: [
      { min: 0, max: 100, view: asLodView(untouched) },
      { min: 99, max: 200, view: asLodView(untouched) },
    ],
  }),
);
assert.equal(invalid.size, 0);
assert.equal(untouched.writes.length, 0);
assert.throws(() =>
  invalid.add({
    id: "missing-position",
    metric: "distance",
    levels: [{ min: 0, max: Infinity, view: asLodView(untouched) }],
  }),
);

assert.equal(manager.remove("missing"), false);
assert.equal(manager.remove("moving"), true);
assert.equal(manager.size, 0);
assert.equal(model.show, false);
assert.equal(billboard.show, false);
assert.equal(model.destroyed, false);
assert.equal(billboard.destroyed, false);
explicitManager.destroy();
explicitManager.destroy();
assert.equal(explicitManager.size, 0);
assert.equal(explicitObject.show, false);
assert.equal(explicitObject.destroyed, false);
assert.throws(() => explicitManager.update(camera, 0));
manager.destroy();
gapManager.destroy();
stableGapManager.destroy();
invalid.destroy();
console.log(
  "LOD manager checks passed: mutable positions, stationary camera, " +
    "half-open ranges, gaps, hysteresis, large jumps, mode/enable changes, " +
    "unchanged-write suppression, validation and borrowed-object cleanup.",
);
