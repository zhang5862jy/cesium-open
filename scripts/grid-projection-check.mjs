import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as C from "cesium";
import {
  GaussKrugerGrid,
  GaussKrugerProjection,
  DrawCommandGaussKrugerGridPrimitive,
  formatGridCoordinate,
  zoneNumberFromLongitude,
} from "../packages/cesium-gauss-kruger-grid/dist/index.js";

// These fixtures come from Python PROJ/EPSG, independently of the package's
// JavaScript projection implementation. Regenerate only with the adjacent
// generate-grid-projection-reference.py tool, never from the code under test.
const reference = JSON.parse(await readFile(new URL("./grid-projection-reference.json", import.meta.url), "utf8"));
let checks = 0;
function check(condition, message) {
  assert.ok(condition, message);
  checks++;
}
function rejects(operation, message, expected = RangeError) {
  assert.throws(operation, expected, message);
  checks++;
}

let maximumForwardError = 0;
for (const item of reference.cases) {
  const projection = new GaussKrugerProjection(item.zone, item.width);
  const input = C.Cartographic.fromDegrees(item.longitude, item.latitude);
  const actual = projection.project(input);
  const error = Math.hypot(actual.easting - item.easting, actual.northing - item.northing);
  maximumForwardError = Math.max(maximumForwardError, error);
  check(error < 0.001, `EPSG:${item.epsg}: forward reference at ${item.longitude},${item.latitude}`);
  const inverse = projection.unproject(item.easting, item.northing, 123);
  check(Math.abs(inverse.longitude - input.longitude) < 1e-9 && Math.abs(inverse.latitude - input.latitude) < 1e-9,
    `EPSG:${item.epsg}: inverse independent reference at ${item.longitude},${item.latitude}`);
  check(inverse.height === 123, "inverse conversion preserves the caller's ellipsoidal height");
}

// Conventional eastward zone numbering must identify the same geographic zone
// on both sides of the longitude wrap. The old implementation emitted negative
// bands and lost half of a fixed 3-degree band at the antimeridian.
for (const [width, longitude, expected] of [
  [6, 0, 1], [6, 3, 1], [6, 117, 20], [6, -3, 60],
  [6, -180, 31], [6, 180, 31], [6, 360, 1], [6, -360, 1],
  [6, 120 - 1e-8, 20], [6, 120 + 1e-8, 21],
  [3, 0, 0], [3, 117, 39], [3, 120, 40], [3, -3, 119],
  [3, -180, 60], [3, 180, 60], [3, 360, 0],
  [3, 178.5 - 1e-8, 59], [3, 178.5 + 1e-8, 60],
  [3, -178.5 - 1e-8, 60], [3, -178.5 + 1e-8, 61],
]) {
  check(zoneNumberFromLongitude(C.Math.toRadians(longitude), width) === expected,
    `${width}-degree longitude ${longitude} maps to band ${expected}`);
}
for (const [width, zone, longitude] of [[6, 20, 117], [6, 60, -3], [3, 0, 0], [3, 60, 180], [3, 119, -3]]) {
  const projected = new GaussKrugerProjection(zone, width).project(C.Cartographic.fromDegrees(longitude, 0));
  check(Math.abs(projected.easting - 500000) < 1e-6 && Math.abs(projected.northing) < 1e-6,
    `${width}-degree band ${zone} has 500 km false easting and zero northing at its equatorial origin`);
}

for (const width of [0, 4, 9, NaN, Infinity]) {
  rejects(() => new GaussKrugerProjection(20, width), `reject unsupported projection width ${width}`);
  rejects(() => zoneNumberFromLongitude(0, width), `reject unsupported band width ${width}`);
}
for (const [width, zone] of [[6, 0], [6, -1], [6, 61], [3, -1], [3, 120], [3, 1.5], [6, Infinity], [6, NaN]]) {
  rejects(() => new GaussKrugerProjection(zone, width), `reject band ${zone} at width ${width}`);
}
for (const longitude of [NaN, Infinity, -Infinity]) {
  rejects(() => zoneNumberFromLongitude(longitude, 6), "reject non-finite longitude before band calculation");
}
const projection = new GaussKrugerProjection(20, 6);
for (const [longitude, latitude] of [[NaN, 0], [Infinity, 0], [0, NaN], [0, Infinity], [0, Math.PI], [0, -Math.PI]]) {
  rejects(() => projection.project(new C.Cartographic(longitude, latitude)), "reject invalid geographic input");
}
for (const [easting, northing, height] of [[NaN, 0, 0], [0, Infinity, 0], [0, 0, NaN], [0, 0, Infinity]]) {
  rejects(() => projection.unproject(easting, northing, height), "reject invalid projected coordinate or height");
}

// Invalid options must fail before touching scene/DOM/GPU resources. This also
// makes the checks usable under Node without replacing any projection code.
for (const options of [
  { calculationMode: "adaptive" }, { zoneWidthDegrees: 4 },
  { zoneWidthDegrees: 6, zoneNumber: 0 }, { zoneWidthDegrees: 6, zoneNumber: 61 },
  { zoneWidthDegrees: 3, zoneNumber: -1 }, { zoneWidthDegrees: 3, zoneNumber: 120 },
  { gridSpacing: 0 }, { gridSpacing: NaN }, { maximumEastingSpacing: Infinity },
  { sampleSpacing: 0 }, { sampleSpacing: NaN },
  { altitude: 0 }, { altitude: -1 }, { altitude: Infinity },
  { viewPadding: -1 }, { maximumLinesPerAxis: 1 }, { maximumLinesPerAxis: 2.5 },
  { lineWidth: 0 }, { majorLineWidth: NaN }, { majorLineEvery: 1.5 },
  { minimumLabelSpacing: 0 }, { labelPixelRatio: 0 },
  { refreshInterval: -1 }, { labelUpdateInterval: Infinity },
  { largeViewRefreshInterval: NaN }, { largeViewZoneThreshold: 0 },
  { spacingLevels: [] },
  { spacingLevels: [{ maximumCameraHeight: -1, gridSpacing: 100 }] },
  { spacingLevels: [{ maximumCameraHeight: 100, gridSpacing: 100 }, { maximumCameraHeight: 50, gridSpacing: 1000 }] },
  { spacingLevels: [{ maximumCameraHeight: 100, gridSpacing: 1000 }, { maximumCameraHeight: 1000, gridSpacing: 100 }] },
]) {
  rejects(() => new GaussKrugerGrid({}, options), `reject invalid grid options ${JSON.stringify(options)}`);
}

rejects(() => new GaussKrugerGrid({ isDestroyed: () => true }),
  "reject a destroyed scene before constructing DOM overlays", /has not been destroyed/);
rejects(() => new GaussKrugerGrid({ isDestroyed: () => false, ellipsoid: C.Ellipsoid.UNIT_SPHERE }),
  "reject an incompatible ellipsoid before constructing DOM overlays", /WGS84 scene ellipsoid/);
const primitiveOptions = { lineColor: C.Color.WHITE, lineWidth: 1, majorLineWidth: 2 };
for (const initialCapacity of [0, -1, 0.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1]) {
  rejects(() => new DrawCommandGaussKrugerGridPrimitive({ ...primitiveOptions, initialCapacity }),
    "reject invalid initial segment capacity before allocating a typed array");
}
for (const name of ["lineWidth", "majorLineWidth"]) {
  for (const value of [0, -1, NaN, Infinity]) {
    rejects(() => new DrawCommandGaussKrugerGridPrimitive({ ...primitiveOptions, [name]: value }),
      `reject invalid primitive ${name}`);
  }
}
for (const component of ["red", "green", "blue", "alpha"]) {
  for (const value of [-0.1, 1.1, NaN, Infinity]) {
    const lineColor = C.Color.WHITE.clone();
    lineColor[component] = value;
    rejects(() => new DrawCommandGaussKrugerGridPrimitive({ ...primitiveOptions, lineColor }),
      `reject invalid primitive color ${component}`);
    rejects(() => new GaussKrugerGrid({}, { lineColor }), `reject invalid grid color ${component}`);
  }
}

for (const [input, expected] of [
  [{ axis: "easting", zoneNumber: 20, coordinate: 500000 }, "Y 20500 km"],
  [{ axis: "easting", zoneNumber: 0, coordinate: 500000 }, "Y 500 km"],
  [{ axis: "northing", zoneNumber: 20, coordinate: 4419000 }, "X 4419 km"],
  [{ axis: "northing", zoneNumber: 20, coordinate: -250 }, "X -0.25 km"],
  [{ axis: "northing", zoneNumber: 20, coordinate: 0 }, "X 0 km"],
]) {
  check(formatGridCoordinate(input) === expected, `coordinate label ${expected}`);
}
console.log(`Gauss-Kruger package: ${checks} checks passed; independent PROJ maximum forward error ${(maximumForwardError * 1000).toFixed(6)} mm.`);
