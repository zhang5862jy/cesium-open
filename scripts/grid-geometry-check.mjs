import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
import * as C from "cesium";
import proj4 from "proj4";

// Run the real geometry module with deterministic camera bounds. Only the scene
// boundary is supplied here; projection, clipping, sampling and LOD are real.
// The browser regression separately verifies Cesium's actual camera and GPU.
async function load(name, dependencies) {
  const source = await readFile(
    new URL(
      `../packages/cesium-gauss-kruger-grid/src/${name}.ts`,
      import.meta.url,
    ),
    "utf8",
  );
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText,
    {
      exports,
      require(name) {
        if (name in dependencies) return dependencies[name];
        throw new Error(`Unexpected geometry dependency ${name}`);
      },
    },
  );
  return exports;
}
const projection = await load("gaussKrugerProjection", { cesium: C, proj4 });
const { buildVisibleGrid, resolveGridOptions } = await load("gridGeometry", {
  cesium: C,
  "./gaussKrugerProjection.js": projection,
});
let checks = 0;
function check(condition, message) {
  assert.ok(condition, message);
  checks++;
}
function sceneFor(bounds, longitude, latitude = 0, height = 30000000) {
  return {
    mode: C.SceneMode.SCENE3D,
    canvas: { clientHeight: 900 },
    camera: {
      positionWC: C.Cartesian3.fromDegrees(longitude, latitude, height),
      positionCartographic: C.Cartographic.fromDegrees(
        longitude,
        latitude,
        height,
      ),
      computeViewRectangle: () => C.Rectangle.fromDegrees(...bounds),
    },
  };
}

// 不创建 WebGL，只提供 Camera 计算视锥/拾取射线需要的场景边界。
// 必须使用真正的 Camera：倾斜视角下 computeViewRectangle 会把未命中的
// 屏幕角点补到地平线，单纯手写一个小矩形无法复现本次消失问题。
function cameraSceneFor({
  longitude = 117,
  latitude = 39.907,
  height = 1000,
  pitch = -5,
  heading = 0,
  roll = 0,
} = {}) {
  const scene = {
    mode: C.SceneMode.SCENE3D,
    canvas: { clientWidth: 1200, clientHeight: 900 },
    drawingBufferWidth: 1200,
    drawingBufferHeight: 900,
    ellipsoid: C.Ellipsoid.WGS84,
    mapProjection: new C.GeographicProjection(),
  };
  scene.camera = new C.Camera(scene);
  scene.camera.setView({
    destination: C.Cartesian3.fromDegrees(longitude, latitude, height),
    orientation: {
      heading: C.Math.toRadians(heading),
      pitch: C.Math.toRadians(pitch),
      roll: C.Math.toRadians(roll),
    },
  });
  return scene;
}

// 按投影带和真实坐标去重，避免把一条格线的多个裁切片段重复计数。
// 东向范围预算按所有带累加，北向预算取单带最大值，与坐标系含义一致。
function respectsLineBudget(built, maximumLinesPerAxis) {
  const zones = new Map();
  for (const line of built.lines) {
    let zone = zones.get(line.zoneNumber);
    if (!zone) {
      zone = { easting: new Set(), northing: new Set() };
      zones.set(line.zoneNumber, zone);
    }
    zone[line.axis].add(line.coordinate);
  }
  const eastingCount = [...zones.values()].reduce(
    (total, zone) => total + zone.easting.size,
    0,
  );
  return (
    eastingCount <= maximumLinesPerAxis &&
    [...zones.values()].every(
      (zone) => zone.northing.size <= maximumLinesPerAxis,
    )
  );
}

// 独立检查输出是否真的穿过相机视锥，而不只验证“生成了若干线段”。
// 将 CPU 世界坐标乘以真实相机矩阵，按齐次裁剪空间的六个半空间裁切线段；
// GPU 同样遵循 -w <= x/y/z <= w，但这里不复用包中的范围或裁切实现。
function intersectsCameraFrustum(scene, built) {
  const matrix = C.Matrix4.multiply(
    scene.camera.frustum.projectionMatrix,
    scene.camera.viewMatrix,
    new C.Matrix4(),
  );
  const planes = (point) => [
    point.w + point.x,
    point.w - point.x,
    point.w + point.y,
    point.w - point.y,
    point.w + point.z,
    point.w - point.z,
  ];
  for (const line of built.lines) {
    const points = line.positions.map((point) =>
      planes(
        C.Matrix4.multiplyByVector(
          matrix,
          new C.Cartesian4(point.x, point.y, point.z, 1),
          new C.Cartesian4(),
        ),
      ),
    );
    for (let index = 1; index < points.length; index++) {
      const start = points[index - 1];
      const end = points[index];
      let minimum = 0;
      let maximum = 1;
      for (let plane = 0; plane < 6; plane++) {
        if (start[plane] < 0 && end[plane] < 0) {
          maximum = -1;
          break;
        }
        if (start[plane] < 0 || end[plane] < 0) {
          const boundary = start[plane] / (start[plane] - end[plane]);
          if (start[plane] < 0) minimum = Math.max(minimum, boundary);
          else maximum = Math.min(maximum, boundary);
        }
      }
      if (minimum <= maximum) return true;
    }
  }
  return false;
}

function latitudes(line) {
  return line.positions.map(
    (position) => C.Ellipsoid.WGS84.cartesianToCartographic(position).latitude,
  );
}

const split = buildVisibleGrid(
  sceneFor([119, -60, 119.8, 60], 119),
  resolveGridOptions({
    zoneNumber: 20,
    calculationMode: "bounded",
    gridSpacing: 50000,
    maximumLinesPerAxis: 512,
    viewPadding: 0,
  }),
);
const splitLines =
  split?.lines.filter(
    (line) => line.axis === "easting" && line.coordinate === 650000,
  ) ?? [];
check(
  splitLines.length === 2,
  "one easting coordinate crossing the frame twice produces two disconnected paths",
);
check(
  splitLines.some((line) => latitudes(line).every((value) => value < 0)) &&
    splitLines.some((line) => latitudes(line).every((value) => value > 0)),
  "no segment bridges the excluded equatorial interval between the two paths",
);

// At longitude 120 degrees, easting reaches its maximum at the equator.
// The previous 5x5 bounds samples missed latitude 0 for [-15, 30], so a valid
// 834 km line was never generated. The narrow longitude window keeps the
// candidate count small enough to test that missing extreme directly.
const equator = buildVisibleGrid(
  sceneFor([119.8, -15, 120, 30], 119.9),
  resolveGridOptions({
    zoneNumber: 20,
    calculationMode: "lod",
    maximumEastingSpacing: 100,
    viewPadding: 0,
    spacingLevels: [{ maximumCameraHeight: Infinity, gridSpacing: 1000000 }],
  }),
);
check(
  equator?.lines.some(
    (line) => line.axis === "easting" && line.coordinate === 834000,
  ),
  "projected bounds include an easting extreme between the uniform latitude samples",
);

const globalSeam = buildVisibleGrid(
  sceneFor([-180, -80, 180, 84], 180),
  resolveGridOptions({
    zoneWidthDegrees: 3,
    zoneNumber: 60,
    calculationMode: "lod",
    viewPadding: 0,
  }),
);
const seamLongitudes =
  globalSeam?.lines.flatMap((line) =>
    line.positions.map(
      (position) =>
        C.Ellipsoid.WGS84.cartesianToCartographic(position).longitude,
    ),
  ) ?? [];
check(
  globalSeam?.status.zoneNumbers.length === 1 &&
    globalSeam.status.zoneNumbers[0] === 60,
  "a full-world rectangle reports antimeridian band 60 only once",
);
check(
  seamLongitudes.some((value) => value < 0) &&
    seamLongitudes.some((value) => value > 0),
  "a full-world rectangle retains both periodic pieces of fixed 3-degree band 60",
);

const close = buildVisibleGrid(
  sceneFor([116.999, 29.999, 117.001, 30.001], 117, 30, 10000),
  resolveGridOptions({
    zoneNumber: 20,
    gridSpacing: 1000,
    sampleSpacing: 100000,
    viewPadding: 0,
  }),
);
check(
  close?.lines.some(
    (line) => line.axis === "easting" && line.coordinate === 500000,
  ),
  "sub-sampling-step views retain a grid line even when both padded endpoints fall outside the frame",
);

const originalLevels = [{ maximumCameraHeight: Infinity, gridSpacing: 1000 }];
const originalColor = new C.Color(0.2, 0.4, 0.6, 0.8);
const copied = resolveGridOptions({
  spacingLevels: originalLevels,
  lineColor: originalColor,
});
originalLevels[0].gridSpacing = 0;
originalColor.alpha = 0;
check(
  copied.spacingLevels[0].gridSpacing === 1000 &&
    copied.lineColor.alpha === 0.8,
  "later caller mutations cannot invalidate validated spacing levels or grid color",
);
const budgetScene = sceneFor([116.9, 29.9, 117.1, 30.1], 117, 30, 10000);
const start = performance.now();
check(
  buildVisibleGrid(budgetScene, resolveGridOptions({ sampleSpacing: 1e-9 })) ===
    undefined,
  "an impractical sampling request is rejected before allocating line vertices",
);
check(
  performance.now() - start < 1000,
  "the geometry budget check completes without iterating over requested samples",
);

// 低空视锥跨过地平线时，保留近处的一公里网格，只缩小计算范围。
// -30° 可直接得到小视域，也一并覆盖，防止修复影响普通倾斜视角。
const tiltedOptions = resolveGridOptions({
  calculationMode: "bounded",
  gridSpacing: 1000,
  maximumLinesPerAxis: 64,
  altitude: 20,
});
for (const height of [100, 500, 1000]) {
  for (const pitch of [-5, -15, -30]) {
    const tiltedScene = cameraSceneFor({ height, pitch });
    const tilted = buildVisibleGrid(tiltedScene, tiltedOptions);
    check(
      tilted?.status.segmentCount > 0,
      `${height} m / pitch ${pitch} degrees retains visible fixed-grid segments`,
    );
    check(
      tilted.status.eastingGridSpacing === 1000 &&
        tilted.status.northingGridSpacing === 1000 &&
        tilted.lines.every((line) => Math.abs(line.coordinate % 1000) < 1e-6),
      `${height} m / pitch ${pitch} degrees preserves integer kilometre coordinates`,
    );
    check(
      respectsLineBudget(tilted, tiltedOptions.maximumLinesPerAxis),
      `${height} m / pitch ${pitch} degrees stays within the projected line budget`,
    );
    check(
      intersectsCameraFrustum(tiltedScene, tilted),
      `${height} m / pitch ${pitch} degrees places actual grid segments inside the view frustum`,
    );
    if (pitch > -30) {
      check(
        tilted.status.rangeLimited === true,
        `${height} m / pitch ${pitch} degrees reports its limited calculation range`,
      );
    }
  }
}

// 高纬处经度尺度明显收缩；偏离中央经线时不能靠 E=500000 这条特殊线过关。
for (const position of [{ latitude: 83 }, { longitude: 117.23 }]) {
  const edgeScene = cameraSceneFor(position);
  const edgeGrid = buildVisibleGrid(edgeScene, tiltedOptions);
  check(
    edgeGrid?.status.segmentCount > 0 &&
      edgeGrid.status.rangeLimited === true &&
      respectsLineBudget(edgeGrid, tiltedOptions.maximumLinesPerAxis) &&
      intersectsCameraFrustum(edgeScene, edgeGrid),
    `${JSON.stringify(position)} retains visible kilometre lines within the limited budget`,
  );
}
const tinyBudgetScene = cameraSceneFor({ height: 100 });
const tinyBudgetGrid = buildVisibleGrid(
  tinyBudgetScene,
  resolveGridOptions({
    calculationMode: "bounded",
    gridSpacing: 1000,
    maximumLinesPerAxis: 2,
    altitude: 20,
  }),
);
check(
  tinyBudgetGrid?.status.segmentCount > 0 &&
    tinyBudgetGrid.status.rangeLimited === true &&
    respectsLineBudget(tinyBudgetGrid, 2) &&
    intersectsCameraFrustum(tinyBudgetScene, tinyBudgetGrid),
  "a two-line budget remains bounded and can retain a nearby kilometre line",
);

// 中心射线朝天，不代表整个屏幕都看不到地面；必须保留下方仍可见的格网。
for (const pitch of [0, 5]) {
  const partialSkyScene = cameraSceneFor({ height: 500, pitch });
  check(
    !partialSkyScene.camera.pickEllipsoid(
      new C.Cartesian2(600, 450),
      C.Ellipsoid.WGS84,
    ) &&
      !!partialSkyScene.camera.pickEllipsoid(
        new C.Cartesian2(600, 900),
        C.Ellipsoid.WGS84,
      ),
    `pitch ${pitch} degrees fixture sees ground below a sky-facing centre ray`,
  );
  const partialSky = buildVisibleGrid(partialSkyScene, tiltedOptions);
  check(
    partialSky?.status.segmentCount > 0 &&
      partialSky.status.rangeLimited === true,
    `pitch ${pitch} degrees keeps the ground portion of the fixed grid`,
  );
}
const sky = buildVisibleGrid(cameraSceneFor({ pitch: 60 }), tiltedOptions);
check(
  sky === undefined,
  "a wholly sky-facing frustum does not create a local grid",
);

const rotated = buildVisibleGrid(
  cameraSceneFor({ heading: 45, roll: 20 }),
  tiltedOptions,
);
check(
  rotated?.status.segmentCount > 0 &&
    rotated.status.rangeLimited === true &&
    respectsLineBudget(rotated, tiltedOptions.maximumLinesPerAxis),
  "low oblique grid remains valid with heading and camera roll",
);

const nearBoundary = buildVisibleGrid(
  cameraSceneFor({ longitude: 120 }),
  tiltedOptions,
);
check(
  nearBoundary?.status.segmentCount > 0 &&
    nearBoundary.status.rangeLimited === true &&
    nearBoundary.status.zoneNumbers.includes(20) &&
    nearBoundary.status.zoneNumbers.includes(21) &&
    respectsLineBudget(nearBoundary, tiltedOptions.maximumLinesPerAxis),
  "limited near-ground range preserves both sides of a 6-degree zone boundary",
);
const nearSeam = buildVisibleGrid(
  cameraSceneFor({ longitude: 180 }),
  tiltedOptions,
);
check(
  nearSeam?.status.segmentCount > 0 &&
    nearSeam.status.rangeLimited === true &&
    nearSeam.status.zoneNumbers.includes(30) &&
    nearSeam.status.zoneNumbers.includes(31) &&
    respectsLineBudget(nearSeam, tiltedOptions.maximumLinesPerAxis),
  "limited near-ground range preserves both 6-degree bands at the antimeridian",
);
const nearFixedSeam = buildVisibleGrid(
  cameraSceneFor({ longitude: 180 }),
  resolveGridOptions({
    calculationMode: "bounded",
    gridSpacing: 1000,
    maximumLinesPerAxis: 64,
    altitude: 20,
    zoneWidthDegrees: 3,
    zoneNumber: 60,
  }),
);
const nearSeamLongitudes =
  nearFixedSeam?.lines.flatMap((line) =>
    line.positions.map(
      (position) =>
        C.Ellipsoid.WGS84.cartesianToCartographic(position).longitude,
    ),
  ) ?? [];
check(
  nearFixedSeam?.status.segmentCount > 0 &&
    nearFixedSeam.status.rangeLimited === true &&
    nearFixedSeam.status.zoneNumbers.length === 1 &&
    nearFixedSeam.status.zoneNumbers[0] === 60 &&
    nearSeamLongitudes.some((longitude) => longitude < 0) &&
    nearSeamLongitudes.some((longitude) => longitude > 0),
  "limited fixed 3-degree band 60 retains both periodic pieces without duplicate status bands",
);

const restored = buildVisibleGrid(
  cameraSceneFor({ height: 10000, pitch: -90 }),
  tiltedOptions,
);
check(
  restored?.status.segmentCount > 0 && restored.status.rangeLimited === false,
  "returning to a normal overhead view restores the full calculation range",
);
check(
  buildVisibleGrid(
    cameraSceneFor({ height: 8000000, pitch: -90 }),
    tiltedOptions,
  ) === undefined,
  "a high-altitude fixed grid still hides instead of showing a small local patch",
);
console.log(`Gauss-Kruger geometry: ${checks} checks passed.`);
