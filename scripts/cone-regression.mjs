// pnpm dev -> /scripts/cone-regression.html
import * as C from "cesium";
import { DrawCommandConePrimitive } from "../src/cesium/tools/draw-command-cone/index.ts";
import { createLocalWorldBaseLayers, completeLocalWorldBaseLayer } from "../src/cesium/tools/localWorldImagery.ts";
import { applyDefaultViewerConfig } from "../src/cesium/tools/viewerConfig.ts";

const output = document.querySelector("#result");
const results = [];
let viewer;
function check(condition, message) {
  if (!condition) throw new Error(message);
  results.push(`PASS ${message}`);
}
try {
  const base = await createLocalWorldBaseLayers();
  viewer = new C.Viewer("viewer", {
    baseLayer: base.west, baseLayerPicker: false, geocoder: false,
    animation: false, timeline: false, useDefaultRenderLoop: false,
  });
  applyDefaultViewerConfig(viewer);
  completeLocalWorldBaseLayer(viewer, base);
  viewer.camera.setView({ destination: C.Cartesian3.fromDegrees(105, 35, 7500000) });
  let renderError;
  viewer.scene.renderError.addEventListener((_scene, error) => { renderError = error; });
  const draw = () => {
    viewer.resize();
    viewer.scene.requestRender();
    viewer.render();
    if (renderError) throw renderError;
  };
  const layer = viewer.scene.primitives.add(new DrawCommandConePrimitive({
    capacity: 1200, slices: 16,
    renderState: { depthTest: { enabled: true }, depthMask: false, blending: C.BlendingState.ALPHA_BLEND },
  }));
  const data = Array.from({ length: 1000 }, (_, i) => ({
    start: C.Cartesian3.fromDegrees(100 + i % 40 * .2, 30 + Math.floor(i / 40) * .2, 20000),
    direction: new C.Cartesian3(1, 2, -3), length: 10000 + i,
    startRadius: i % 2 ? 0 : 1000, angle: .5,
    type: ["transparent", "wave", "gradient"][i % 3],
    animationSpeed: 1, materialCount: 9, color: new C.Color(.2, .8, 1, .5),
  }));
  layer.setInstances(data);
  draw();
  let uploads = [];
  const copy = layer.instanceBuffer.copyFromArrayView.bind(layer.instanceBuffer);
  layer.instanceBuffer.copyFromArrayView = (view, offset = 0) => {
    uploads.push({ bytes: view.byteLength, offset }); copy(view, offset);
  };
  const initial = layer.values.slice();
  layer.setInstances(data);
  draw();
  check(uploads.length === 0 && !layer.boundsDirty, "identical full list: zero upload / bounds rebuild");
  data[500].color.red = .9;
  layer.updateInstances(500, [data[500]]);
  check(!layer.boundsDirty, "material update skips geometry and bounds work");
  draw();
  check(uploads.length === 1 && uploads[0].bytes === 80 && uploads[0].offset === 40000,
    "1 of 1000 changed: 80-byte upload at correct offset");
  check(layer.values.slice(500 * 20, 500 * 20 + 13).every((x, i) => x === initial[500 * 20 + i]),
    "material update preserves packed position, orientation and shape");
  uploads = [];
  data[501].length += 100;
  data[502].start.x += 500;
  layer.updateInstances(501, [data[501]]);
  layer.updateInstances(502, [data[502]]);
  draw();
  check(uploads.length === 1 && uploads[0].bytes === 160 && uploads[0].offset === 40080,
    "multiple calls merge adjacent dirty instances");
  const snapshot = layer.values.slice();
  let rejected = false;
  try { layer.updateInstances(0, [{ ...data[0], length: 999 }, { ...data[1], length: -1 }]); }
  catch { rejected = true; }
  check(rejected && layer.values.every((x, i) => x === snapshot[i]), "invalid range data rejected atomically");
  rejected = false;
  try { layer.updateInstances(1000, [data[0]]); } catch { rejected = true; }
  check(rejected, "out-of-range patch rejected");
  uploads = [];
  data[999].length += 1;
  layer.updateInstances(999, [data[999]]);
  layer.setInstances(data.slice(0, 10));
  draw();
  check(uploads.length === 0 && layer.command.instanceCount === 10, "shrink removes pending stale uploads");
  layer.setInstances([]);
  draw();
  layer.setInstances(data);
  draw();
  check(layer.command.instanceCount === 1000 && uploads.at(-1).bytes === 80000,
    "clear and re-add force initialization of all live slots");
  // Check aggregate sphere contains actual cap-rim points, including arbitrary directions.
  const point = new C.Cartesian3();
  const axis = new C.Cartesian3();
  const radial = new C.Cartesian3();
  let contained = true;
  for (const item of data) {
    C.Cartesian3.normalize(item.direction, axis);
    C.Cartesian3.cross(axis, C.Cartesian3.UNIT_X, radial);
    C.Cartesian3.normalize(radial, radial);
    for (const t of [0, 1]) for (const sign of [-1, 1]) {
      const radius = item.startRadius + t * item.length * Math.tan(item.angle / 2);
      point.x = item.start.x + axis.x * item.length * t + radial.x * radius * sign;
      point.y = item.start.y + axis.y * item.length * t + radial.y * radius * sign;
      point.z = item.start.z + axis.z * item.length * t + radial.z * radius * sign;
      contained &&= C.Cartesian3.distance(point, layer.boundingVolume.center) <= layer.boundingVolume.radius + 1e-6;
    }
  }
  check(contained, "batch bounds contain sampled start/end cap rims");
  uploads = [];
  layer.show = false;
  data[0].length += 1;
  layer.updateInstances(0, [data[0]]);
  draw();
  check(uploads.length === 0, "hidden primitive defers GPU upload");
  layer.show = true;
  draw();
  check(uploads.length === 1 && uploads[0].bytes === 80, "show restores pending update");
  const resources = [layer.instanceBuffer, layer.positionBuffer, layer.normalBuffer, layer.indexBuffer];
  viewer.scene.primitives.remove(layer);
  check(resources.every(resource => resource.isDestroyed()), "destroy releases all GPU buffers");
  results.push("ALL PASSED");
} catch (error) {
  results.push(`FAIL ${error.stack ?? error}`);
  console.error(error);
} finally {
  if (viewer && !viewer.isDestroyed()) viewer.destroy();
  output.textContent = results.join("\n");
}
