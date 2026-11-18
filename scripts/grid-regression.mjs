import * as C from "cesium";
import {
  GaussKrugerGrid,
  GaussKrugerProjection,
} from "cesium-gauss-kruger-grid";
import {
  buildVisibleGrid,
  resolveGridOptions,
} from "../packages/cesium-gauss-kruger-grid/src/gridGeometry.ts";
import { ScreenGridLabelOverlay } from "../packages/cesium-gauss-kruger-grid/src/screenLabels.ts";
import {
  createLocalWorldBaseLayers,
  completeLocalWorldBaseLayer,
} from "../src/cesium/tools/localWorldImagery.ts";
import { applyDefaultViewerConfig } from "../src/cesium/tools/viewerConfig.ts";

const output = document.querySelector("#result");
const results = [];
const owned = new Set();
let viewer;
let renderError;
function report(message) {
  results.push(message);
  output.textContent = results.join("\n");
}
function check(condition, message) {
  if (!condition) throw new Error(message);
  report(`PASS ${message}`);
}
function retain(resource) {
  owned.add(resource);
  return resource;
}
function release(resource) {
  resource.destroy();
  owned.delete(resource);
}
function render() {
  viewer.resize();
  viewer.render();
  if (renderError) throw renderError;
}
function view(
  longitude,
  height,
  pitch = -90,
  latitude = 39.907,
  heading = 0,
  roll = 0,
) {
  viewer.camera.setView({
    destination: C.Cartesian3.fromDegrees(longitude, latitude, height),
    orientation: {
      heading: C.Math.toRadians(heading),
      pitch: C.Math.toRadians(pitch),
      roll: C.Math.toRadians(roll),
    },
  });
  viewer.scene.requestRender();
  render();
}
async function runFrames(duration) {
  const end = performance.now() + duration;
  do {
    await new Promise(requestAnimationFrame);
    render();
  } while (performance.now() < end);
}
function listeners() {
  const { scene, camera } = viewer;
  return [
    scene.preUpdate,
    scene.preRender,
    camera.moveStart,
    camera.moveEnd,
  ].map((event) => event.numberOfListeners);
}
function measure(fn) {
  for (let i = 0; i < 3; i++) fn();
  const samples = [];
  for (let i = 0; i < 9; i++) {
    const start = performance.now();
    fn();
    samples.push(performance.now() - start);
  }
  return samples.sort((a, b) => a - b)[4].toFixed(3);
}

try {
  output.dataset.status = "running";
  const base = await createLocalWorldBaseLayers();
  viewer = new C.Viewer("viewer", {
    baseLayer: base.west,
    baseLayerPicker: false,
    geocoder: false,
    animation: false,
    timeline: false,
    useDefaultRenderLoop: false,
  });
  applyDefaultViewerConfig(viewer);
  completeLocalWorldBaseLayer(viewer, base);
  viewer.scene.renderError.addEventListener((_scene, error) => {
    renderError = error;
  });
  const initialListeners = listeners();
  const initialPrimitives = viewer.scene.primitives.length;

  view(117, 10000);
  const options = resolveGridOptions({
    calculationMode: "bounded",
    gridSpacing: 1000,
    maximumLinesPerAxis: 64,
    altitude: 20,
    refreshInterval: 0,
  });
  const built = buildVisibleGrid(viewer.scene, options);
  check(
    built?.lines.length > 0 && built.status.gridSpacing === 1000,
    "fixed view generates 1 km projected grid",
  );
  let residual = 0;
  let chordResidual = 0;
  let integerLines = true;
  for (const line of built.lines) {
    const projection = new GaussKrugerProjection(line.zoneNumber, 6);
    for (const position of line.positions) {
      const projected = projection.project(
        C.Ellipsoid.WGS84.cartesianToCartographic(position),
      );
      residual = Math.max(
        residual,
        Math.abs(projected[line.axis] - line.coordinate),
      );
    }
    integerLines &&= Math.abs(line.coordinate % 1000) < 1e-6;
    for (let i = 1; i < line.positions.length; i++) {
      const midpoint = C.Cartesian3.midpoint(
        line.positions[i - 1],
        line.positions[i],
        new C.Cartesian3(),
      );
      const projected = projection.project(
        C.Ellipsoid.WGS84.cartesianToCartographic(midpoint),
      );
      chordResidual = Math.max(
        chordResidual,
        Math.abs(projected[line.axis] - line.coordinate),
      );
    }
  }
  check(integerLines, "all lines lie on integer kilometre coordinates");
  check(
    chordResidual < 0.1,
    `near-view chord midpoint residual ${chordResidual.toFixed(6)} m (<0.1 m)`,
  );
  check(
    residual < 0.001,
    `rendered vertices retain their grid coordinate: ${(residual * 1000).toFixed(6)} mm maximum error`,
  );
  const label = retain(
    new ScreenGridLabelOverlay(viewer.scene, {
      minimumSpacing: 72,
      pixelRatio: 2,
    }),
  );
  check(
    label.update(built.lines) > 0,
    "edge labels survive collision thinning",
  );
  report(
    `Current median: build=${measure(() => buildVisibleGrid(viewer.scene, options))} ms, labels=${measure(() => label.update(built.lines))} ms`,
  );
  release(label);

  const grid = retain(new GaussKrugerGrid(viewer.scene, options));
  render();
  let refreshes = 0;
  grid.changed.addEventListener(() => {
    refreshes++;
  });
  for (let i = 0; i < 10; i++) render();
  check(refreshes === 0, "stationary view does not rebuild geometry");
  view(117, 8000000);
  check(!grid.status, "fixed grid hides instead of changing spacing");
  refreshes = 0;
  for (let i = 0; i < 10; i++) render();
  check(refreshes === 0, "hidden fixed grid does not rebuild while stationary");
  grid.show = false;
  refreshes = 0;
  view(117.01, 10000);
  check(refreshes === 0, "show=false suspends CPU rebuilds");
  grid.show = true;
  render();
  check(grid.status?.segmentCount > 0, "show=true restores the current view");

  // 真实 Viewer 中重复低空俯仰变化：检查状态、GPU 提交和渲染错误，
  // 避免仅 CPU 构造成功，但图层因旧状态或刷新调度而继续隐藏。
  for (const height of [100, 500, 1000]) {
    for (const pitch of [-5, -15, -30]) {
      view(117, height, pitch);
      check(
        grid.status?.segmentCount > 0 &&
          grid.status.eastingGridSpacing === 1000 &&
          grid.status.northingGridSpacing === 1000 &&
          grid.status.drawCommandCount === 1,
        `${height} m / pitch ${pitch} degrees renders fixed 1 km geometry`,
      );
    }
  }
  // 中心射线未命中时，下方视锥仍可能覆盖地面；全天空则必须清空。
  for (const pitch of [0, 5]) {
    view(117, 500, pitch);
    check(
      grid.status?.segmentCount > 0 && grid.status.rangeLimited === true,
      `pitch ${pitch} degrees retains near-ground grid below the horizon`,
    );
  }
  view(117, 1000, 60);
  check(!grid.status, "wholly sky-facing view clears the fixed-grid state");
  view(117, 1000, -5, 39.907, 45, 20);
  check(
    grid.status?.segmentCount > 0 && grid.status.rangeLimited === true,
    "low oblique rendering supports heading changes and camera roll",
  );
  view(120, 1000, -5);
  check(
    grid.status?.segmentCount > 0 &&
      grid.status.rangeLimited === true &&
      grid.status.zoneNumbers.includes(20) &&
      grid.status.zoneNumbers.includes(21),
    "limited near-ground rendering preserves adjacent 6-degree zones",
  );
  view(180, 1000, -5);
  check(
    grid.status?.segmentCount > 0 &&
      grid.status.rangeLimited === true &&
      grid.status.zoneNumbers.includes(30) &&
      grid.status.zoneNumbers.includes(31),
    "limited near-ground rendering survives the antimeridian",
  );
  const lowFixedSeam = retain(
    new GaussKrugerGrid(viewer.scene, {
      ...options,
      zoneWidthDegrees: 3,
      zoneNumber: 60,
    }),
  );
  render();
  check(
    lowFixedSeam.status?.segmentCount > 0 &&
      lowFixedSeam.status.rangeLimited === true &&
      lowFixedSeam.status.zoneNumbers.length === 1 &&
      lowFixedSeam.status.zoneNumbers[0] === 60,
    "limited fixed 3-degree band 60 renders at the antimeridian",
  );
  release(lowFixedSeam);
  view(117, 8000000);
  check(
    !grid.status,
    "low-view fallback does not keep a small patch visible at high altitude",
  );
  view(117, 10000);
  check(
    grid.status?.segmentCount > 0 && grid.status.rangeLimited === false,
    "overhead view restores the complete fixed-grid range after a limited view",
  );

  const oldFov = viewer.camera.frustum.fov;
  const originalMatrix = C.Matrix4.clone(viewer.camera.viewMatrix);
  refreshes = 0;
  viewer.camera.frustum.fov = oldFov * 0.8;
  render();
  render();
  check(
    C.Matrix4.equals(originalMatrix, viewer.camera.viewMatrix) && refreshes > 0,
    "changing FOV rebuilds the visible grid even when the view matrix is unchanged",
  );
  viewer.camera.frustum.fov = oldFov;
  render();

  viewer.scene.morphTo2D(0);
  render();
  check(!grid.status, "unsupported 2D view clears the 3D grid");
  viewer.scene.morphTo3D(0);
  view(117, 10000);
  check(grid.status?.segmentCount > 0, "returning to 3D restores the grid");
  release(grid);

  view(120, 120000);
  const multi = buildVisibleGrid(
    viewer.scene,
    resolveGridOptions({ calculationMode: "lod" }),
  );
  check(
    multi?.status.zoneNumbers.includes(20) &&
      multi.status.zoneNumbers.includes(21),
    "adjacent zones remain separate",
  );
  view(179.99, 1500000);
  const seam = buildVisibleGrid(
    viewer.scene,
    resolveGridOptions({ calculationMode: "lod" }),
  );
  check(
    seam?.status.zoneNumbers.includes(30) &&
      seam.status.zoneNumbers.includes(31),
    "6-degree antimeridian view retains both conventional positive band numbers",
  );
  view(180, 200000);
  const fixedSeam = buildVisibleGrid(
    viewer.scene,
    resolveGridOptions({
      calculationMode: "lod",
      zoneWidthDegrees: 3,
      zoneNumber: 60,
    }),
  );
  const seamLongitudes =
    fixedSeam?.lines.flatMap((line) =>
      line.positions.map(
        (position) =>
          C.Ellipsoid.WGS84.cartesianToCartographic(position).longitude,
      ),
    ) ?? [];
  check(
    fixedSeam?.status.zoneNumbers.length === 1 &&
      fixedSeam.status.zoneNumbers[0] === 60 &&
      seamLongitudes.some((value) => value < 0) &&
      seamLongitudes.some((value) => value > 0),
    "fixed 3-degree band 60 retains both sides of the antimeridian without duplicate status bands",
  );
  let seamChord = 0;
  for (const line of fixedSeam.lines) {
    for (let i = 1; i < line.positions.length; i++) {
      seamChord = Math.max(
        seamChord,
        C.Cartesian3.distance(line.positions[i - 1], line.positions[i]),
      );
    }
  }
  check(
    seamChord < 100000,
    "antimeridian geometry contains no false long connection between clipped pieces",
  );

  view(117, 8000000);
  const globe = buildVisibleGrid(
    viewer.scene,
    resolveGridOptions({ calculationMode: "lod", altitude: 20 }),
  );
  check(globe?.lines.length > 0, "global LOD produces visible geometry");
  let lowestChord = Infinity;
  for (const line of globe.lines) {
    for (let i = 1; i < line.positions.length; i++) {
      const midpoint = C.Cartesian3.midpoint(
        line.positions[i - 1],
        line.positions[i],
        new C.Cartesian3(),
      );
      lowestChord = Math.min(
        lowestChord,
        C.Ellipsoid.WGS84.cartesianToCartographic(midpoint).height,
      );
    }
  }
  check(
    lowestChord > 0,
    `global LOD chords stay above the ellipsoid: minimum height ${lowestChord.toFixed(2)} m`,
  );

  view(117, 10000);
  const budgetStart = performance.now();
  const overBudget = buildVisibleGrid(
    viewer.scene,
    resolveGridOptions({ sampleSpacing: 1e-9 }),
  );
  check(
    overBudget === undefined && performance.now() - budgetStart < 1000,
    "an impractically small sample interval fails closed before generating billions of points",
  );

  // Scene.preUpdate runs even when requestRenderMode skips the render pass.
  // Keep moveEnd delayed so it cannot accidentally rescue a missed throttle.
  const oldEventWait = viewer.scene.cameraEventWaitTime;
  viewer.scene.cameraEventWaitTime = 10000;
  viewer.scene.requestRenderMode = true;
  viewer.scene.maximumRenderTimeChange = Infinity;
  const deferred = retain(
    new GaussKrugerGrid(viewer.scene, { ...options, refreshInterval: 200 }),
  );
  render();
  deferred.refresh();
  let deferredRefreshes = 0;
  deferred.changed.addEventListener(() => {
    deferredRefreshes++;
  });
  viewer.camera.setView({
    destination: C.Cartesian3.fromDegrees(117.02, 39.907, 11000),
    orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 },
  });
  render();
  await runFrames(350);
  check(
    deferredRefreshes > 0 &&
      Math.abs(deferred.status.cameraHeight - 11000) < 0.1,
    "requestRenderMode completes a throttled rebuild without a later camera event",
  );
  release(deferred);
  viewer.scene.requestRenderMode = false;
  viewer.scene.cameraEventWaitTime = oldEventWait;

  const disposable = retain(new GaussKrugerGrid(viewer.scene, options));
  render();
  const ownedPrimitive = viewer.scene.primitives.get(
    viewer.scene.primitives.length - 1,
  );
  viewer.scene.primitives.destroyPrimitives = false;
  release(disposable);
  viewer.scene.primitives.destroyPrimitives = true;
  check(
    ownedPrimitive.isDestroyed(),
    "grid destroys its primitive even when the collection does not own destruction",
  );
  check(
    viewer.scene.primitives.length === initialPrimitives,
    "destroy removes every grid primitive",
  );
  check(
    listeners().every((value, index) => value === initialListeners[index]),
    "destroy restores camera and scene listener counts",
  );
  check(
    document.querySelectorAll(".gauss-kruger-grid-labels").length === 0,
    "destroy removes every label canvas",
  );

  const viewerFirst = retain(new GaussKrugerGrid(viewer.scene, options));
  render();
  viewer.destroy();
  release(viewerFirst);
  viewerFirst.destroy();
  viewerFirst.show = true;
  check(
    viewerFirst.isDestroyed() &&
      document.querySelectorAll(".gauss-kruger-grid-labels").length === 0,
    "viewer-first teardown, repeated destroy, and later show changes are safe",
  );
  output.dataset.status = "passed";
  report("ALL PASSED");
} catch (error) {
  output.dataset.status = "failed";
  report(`FAIL ${error.stack ?? error}`);
  console.error(error);
} finally {
  for (const resource of owned) {
    try {
      resource.destroy();
    } catch (error) {
      console.error("Regression cleanup failed", error);
    }
  }
  if (viewer && !viewer.isDestroyed()) viewer.destroy();
}
