// Run with pnpm dev, then open /scripts/circle-text-regression.html.
// Uses real WebGL buffers; only the upload method is wrapped for byte accounting.
import * as C from "cesium";
import { CircleTextDrawCommand } from "../src/cesium/tools/circle-text/CircleTextDrawCommand.ts";
import { createLocalWorldBaseLayers, completeLocalWorldBaseLayer } from "../src/cesium/tools/localWorldImagery.ts";
import { applyDefaultViewerConfig } from "../src/cesium/tools/viewerConfig.ts";

const output = document.querySelector("#result");
const results = [];
let viewer;
function check(condition, message) {
  if (!condition) throw new Error(message);
  results.push(`PASS ${message}`);
}
function texture(color) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 16;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 16, 16);
  return canvas;
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
  const source = texture("cyan");
  const layer = viewer.scene.primitives.add(new CircleTextDrawCommand(viewer.scene, {
    capacity: 2048, ellipseImage: source,
  }));
  const data = Array.from({ length: 1000 }, (_, i) => layer.add({
    id: `test-${i}`, longitude: 100 + i % 40 * .2,
    latitude: 30 + Math.floor(i / 40) * .2, label: { text: "" },
  }));
  draw();
  const bucket = layer.textureBuckets.get(source);
  let uploads = [];
  const copy = bucket.instanceBuffer.copyFromArrayView.bind(bucket.instanceBuffer);
  bucket.instanceBuffer.copyFromArrayView = (view, offset = 0) => {
    uploads.push({ bytes: view.byteLength, offset });
    copy(view, offset);
  };
  let packs = 0;
  const pack = layer.packInstance.bind(layer);
  layer.packInstance = (...args) => { packs++; return pack(...args); };
  draw();
  check(uploads.length === 0 && packs === 0, "static frame: zero instance packing / upload");
  data[500].ellipseRotation = 30;
  draw();
  check(packs === 1 && uploads.length === 1 && uploads[0].bytes === 80 && uploads[0].offset === 40000,
    "1 of 1000 changed: 80 bytes uploaded (previous full batch: 80000 bytes)");
  uploads = []; packs = 0;
  data[500].edit({ label: { text: "updated" } });
  draw();
  check(packs === 0 && uploads.length === 0 && layer.labels.get(data[500].id).text === "updated",
    "text-only edit: native label updated, zero ellipse upload");
  data[501].ellipseRotation = 31;
  data[502].ellipseRotation = 32;
  draw();
  check(uploads.length === 1 && uploads[0].bytes === 160 && uploads[0].offset === 40080,
    "adjacent dirty slots merged into one upload");
  uploads = []; packs = 0;
  data[500].longitude += 1;
  data[500].ellipseAnchor = 0;
  data[500].ellipseOffset.x = 10000;
  data[500].expire();
  draw();
  const bound = bucket.bounds[500];
  check(bound.radius > Math.hypot(data[500].ellipseWidth, data[500].ellipseHeight) / 2,
    "anchor / nested offset included in bounds after expire()");
  check(C.Cartesian3.equals(layer.labels.get(data[500].id).position, bound.center),
    "position update keeps label and ellipse aligned");
  data[500].show = false;
  draw();
  check(bucket.values[500 * 20 + 18] === 0 && !layer.labels.get(data[500].id).show,
    "show=false updates ellipse and label without regrouping");
  data[500].show = true;
  data[500].maximumVisibleHeight = 1;
  draw();
  check(!layer.labels.get(data[500].id).show, "camera-height visibility threshold applied");
  data[500].maximumVisibleHeight = Infinity;
  draw();
  check(layer.labels.get(data[500].id).show, "visibility restored");
  const source2 = texture("red");
  data[500].ellipseImage = source2;
  draw();
  const second = layer.textureBuckets.get(source2);
  check(second.instanceCount === 1 && second.values.byteLength === 16 * 80,
    "texture migration: small bucket allocates 16 slots, not full layer capacity");
  const oldTexture = second.texture;
  const oldBuffer = second.instanceBuffer;
  layer.delete(data[500].id);
  draw();
  check(!layer.textureBuckets.has(source2) && oldTexture.isDestroyed() && oldBuffer.isDestroyed(),
    "last item deleted: unused texture and GPU buffer released");
  data[500].text = "detached";
  check(layer.dirtyItems.size === 0, "deleted Data no longer notifies renderer");
  for (const item of data) item.ellipseRotation += 1;
  uploads = [];
  draw();
  check(uploads.length === 1 && uploads[0].bytes === 999 * 80, "dense changes use a single upload");
  uploads = [];
  for (const item of data) item.show = false;
  draw();
  check(bucket.visibleCount === 0 && uploads.length === 0, "fully hidden bucket skips upload and drawing");
  data[0].show = true;
  draw();
  check(bucket.visibleCount === 1 && uploads.length === 1, "show restores deferred GPU updates");
  const oldShared = layer.positionBuffer;
  layer.clear();
  draw();
  check(layer.textureBuckets.size === 0 && layer.labels.size === 0, "clear releases buckets and labels");
  layer.add({ longitude: 105, latitude: 35, label: { text: "re-added" } });
  draw();
  check(layer.textureBuckets.size === 1 && !oldShared.isDestroyed(), "re-add reuses shared geometry");
  const small = layer.textureBuckets.get(source);
  const smallBuffer = small.instanceBuffer;
  const sharedTexture = small.texture;
  for (let i = 0; i < 20; i++) layer.add({ longitude: 105 + i * .1, latitude: 35, label: { text: "" } });
  draw();
  check(smallBuffer.isDestroyed() && small.instanceBuffer !== smallBuffer && small.texture === sharedTexture,
    "bucket growth replaces buffer while retaining texture");
  check(small.dirtyIndices.size === 0 && small.command.instanceCount === 21,
    "grown buffer contains all live instances");
  let requests = 0;
  const requestRender = viewer.scene.requestRender.bind(viewer.scene);
  viewer.scene.requestRender = () => { requests++; requestRender(); };
  const live = layer.items.values().next().value;
  live.longitude += .1;
  live.latitude += .1;
  check(requests === 1, "direct mutations coalesce into one render request");
  draw();
  viewer.scene.primitives.remove(layer);
  check(layer.isDestroyed() && oldShared.isDestroyed(), "destroy releases shared GPU resources");
  results.push("ALL PASSED");
} catch (error) {
  results.push(`FAIL ${error.stack ?? error}`);
  console.error(error);
} finally {
  if (viewer && !viewer.isDestroyed()) viewer.destroy();
  output.textContent = results.join("\n");
}
