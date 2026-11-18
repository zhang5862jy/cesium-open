<template>
  <div ref="container" class="cesium-container"></div>

  <aside class="control-panel">
    <div class="heading-row">
      <span class="eyebrow">COLOR + DEPTH SOBEL</span>
      <button
        type="button"
        :class="{ muted: !state.enabled }"
        @click="state.enabled = !state.enabled"
      >
        {{ state.enabled ? "GPU 描边中" : "查看原图" }}
      </button>
    </div>

    <h2>深度边缘描边</h2>
    <p>
      9 点卷积同时寻找颜色与眼空间深度突变；即使相邻建筑颜色接近，遮挡边界仍会被准确描出。
    </p>

    <div class="metrics">
      <div><strong>17</strong><span>纹理采样 / 像素</span></div>
      <div><strong>3×3</strong><span>Sobel 核</span></div>
      <div><strong>1</strong><span>全屏 Pass</span></div>
    </div>

    <label>
      <span>采样半径 <output>{{ state.sampleRadius.toFixed(2) }} px</output></span>
      <input
        v-model.number="state.sampleRadius"
        type="range"
        min="0.5"
        max="3"
        step="0.05"
      />
    </label>

    <label>
      <span>边缘阈值 <output>{{ state.threshold.toFixed(3) }}</output></span>
      <input
        v-model.number="state.threshold"
        type="range"
        min="0.01"
        max="0.16"
        step="0.002"
      />
    </label>

    <label>
      <span>线条强度 <output>{{ state.strength.toFixed(2) }}×</output></span>
      <input
        v-model.number="state.strength"
        type="range"
        min="0"
        max="4"
        step="0.05"
      />
    </label>

    <label>
      <span>深度权重 <output>{{ state.depthWeight.toFixed(1) }}×</output></span>
      <input
        v-model.number="state.depthWeight"
        type="range"
        min="0"
        max="12"
        step="0.25"
      />
    </label>

    <label>
      <span>蓝图混合 <output>{{ Math.round(state.blueprint * 100) }}%</output></span>
      <input
        v-model.number="state.blueprint"
        type="range"
        min="0"
        max="1"
        step="0.02"
      />
    </label>

    <div class="color-control">
      <span>描边颜色</span>
      <input v-model="state.outlineColor" type="color" />
      <code>log2(eyeDistance) → Sobel</code>
    </div>
  </aside>
</template>

<script setup lang="ts">
import * as Cesium from "cesium";
import { onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { DepthEdgeOutlineStage } from "../../../cesium/tools/depth-edge-outline";
import {
  completeLocalWorldBaseLayer,
  createLocalWorldBaseLayers,
} from "../../../cesium/tools/localWorldImagery";
import { applyDefaultViewerConfig } from "../../../cesium/tools/viewerConfig";

const container = ref<HTMLDivElement>();
const state = reactive({
  enabled: true,
  sampleRadius: 1.2,
  threshold: 0.04,
  strength: 1.85,
  depthWeight: 6,
  blueprint: 0.86,
  outlineColor: "#74f6ff",
});

let viewer: Cesium.Viewer | undefined;
let outlineStage: DepthEdgeOutlineStage | undefined;
const campusPrimitives: Cesium.Primitive[] = [];
let componentUnmounted = false;

const campusOrigin = Cesium.Cartesian3.fromDegrees(121.48, 31.23);

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function localCenter(
  originFrame: Cesium.Matrix4,
  east: number,
  north: number,
  height: number,
): Cesium.Cartesian3 {
  return Cesium.Matrix4.multiplyByPoint(
    originFrame,
    new Cesium.Cartesian3(east, north, height),
    new Cesium.Cartesian3(),
  );
}

function createCampus(): Cesium.Primitive[] {
  const originFrame = Cesium.Transforms.eastNorthUpToFixedFrame(campusOrigin);
  const boxes: Cesium.GeometryInstance[] = [];
  const towers: Cesium.GeometryInstance[] = [];

  for (let row = -4; row <= 5; row += 1) {
    for (let column = -5; column <= 5; column += 1) {
      if ((row * 3 + column * 5 + 30) % 8 === 0) continue;

      const east = column * 7_400 + Math.sin(row + column * 0.7) * 900;
      const north = row * 8_800 + Math.cos(column * 1.2) * 700;
      const height =
        3_800 + positiveModulo(row * 19 + column * 23 + 80, 9) * 980;
      const footprint =
        2_700 + positiveModulo(row + column + 20, 4) * 520;
      const center = localCenter(originFrame, east, north, height * 0.5);
      const hue = 0.55 + ((row + column + 20) % 5) * 0.018;

      boxes.push(
        new Cesium.GeometryInstance({
          id: `blueprint-block-${row}-${column}`,
          geometry: Cesium.BoxGeometry.fromDimensions({
            dimensions: new Cesium.Cartesian3(
              footprint,
              footprint * (0.68 + ((row + 12) % 3) * 0.13),
              height,
            ),
            vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT,
          }),
          modelMatrix: Cesium.Transforms.eastNorthUpToFixedFrame(center),
          attributes: {
            color: Cesium.ColorGeometryInstanceAttribute.fromColor(
              Cesium.Color.fromHsl(hue, 0.52, 0.46, 1),
            ),
          },
        }),
      );

      if ((row + column + 20) % 6 === 0) {
        const towerHeight = height * 1.65;
        const towerCenter = localCenter(
          originFrame,
          east + footprint * 0.9,
          north - footprint * 0.7,
          towerHeight * 0.5,
        );
        towers.push(
          new Cesium.GeometryInstance({
            id: `blueprint-tower-${row}-${column}`,
            geometry: new Cesium.CylinderGeometry({
              length: towerHeight,
              topRadius: footprint * 0.18,
              bottomRadius: footprint * 0.46,
              slices: 32,
              vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT,
            }),
            modelMatrix: Cesium.Transforms.eastNorthUpToFixedFrame(towerCenter),
            attributes: {
              color: Cesium.ColorGeometryInstanceAttribute.fromColor(
                Cesium.Color.fromCssColorString("#e3a96a"),
              ),
            },
          }),
        );
      }
    }
  }

  const appearance = () =>
    new Cesium.PerInstanceColorAppearance({
      translucent: false,
      closed: true,
    });

  return [
    new Cesium.Primitive({
      geometryInstances: boxes,
      appearance: appearance(),
      asynchronous: true,
      allowPicking: false,
    }),
    new Cesium.Primitive({
      geometryInstances: towers,
      appearance: appearance(),
      asynchronous: true,
      allowPicking: false,
    }),
  ];
}

function applyOutlineControls(): void {
  if (!outlineStage) return;
  const color =
    Cesium.Color.fromCssColorString(state.outlineColor) ?? Cesium.Color.CYAN.clone();
  color.alpha = 0.96;
  outlineStage.show = state.enabled;
  outlineStage.setOptions({
    outlineColor: color,
    sampleRadius: state.sampleRadius,
    edgeThreshold: state.threshold,
    edgeStrength: state.strength,
    depthWeight: state.depthWeight,
    blueprintAmount: state.blueprint,
  });
}

watch(
  () => [
    state.enabled,
    state.sampleRadius,
    state.threshold,
    state.strength,
    state.depthWeight,
    state.blueprint,
    state.outlineColor,
  ],
  applyOutlineControls,
);

onMounted(async () => {
  const baseLayers = await createLocalWorldBaseLayers();
  if (componentUnmounted || !container.value) return;

  viewer = new Cesium.Viewer(container.value, {
    animation: false,
    timeline: false,
    baseLayer: baseLayers.west,
    baseLayerPicker: false,
    geocoder: false,
    navigationHelpButton: false,
    sceneModePicker: false,
    fullscreenButton: false,
    infoBox: false,
    selectionIndicator: false,
    homeButton: false,
    skyBox: false,
    scene3DOnly: true,
    contextOptions: { requestWebgl1: false },
  });
  applyDefaultViewerConfig(viewer);
  completeLocalWorldBaseLayer(viewer, baseLayers);

  const scene = viewer.scene;
  scene.backgroundColor = Cesium.Color.fromCssColorString("#02070d");
  scene.globe.baseColor = Cesium.Color.fromCssColorString("#071827");
  scene.globe.enableLighting = false;
  scene.globe.showWaterEffect = false;
  scene.globe.depthTestAgainstTerrain = true;

  for (const primitive of createCampus()) {
    campusPrimitives.push(scene.primitives.add(primitive));
  }
  outlineStage = new DepthEdgeOutlineStage(scene);
  applyOutlineControls();

  viewer.camera.lookAt(
    campusOrigin,
    new Cesium.HeadingPitchRange(
      Cesium.Math.toRadians(142),
      Cesium.Math.toRadians(-26),
      132_000,
    ),
  );
  viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
});

onUnmounted(() => {
  componentUnmounted = true;
  outlineStage?.destroy();
  outlineStage = undefined;

  if (viewer) {
    for (const primitive of campusPrimitives) {
      if (viewer.scene.primitives.contains(primitive)) {
        viewer.scene.primitives.remove(primitive);
      }
    }
  }
  campusPrimitives.length = 0;
  if (viewer && !viewer.isDestroyed()) viewer.destroy();
  viewer = undefined;
});
</script>

<style scoped>
.cesium-container {
  width: 100%;
  height: 100%;
}

.control-panel {
  position: absolute;
  top: 18px;
  right: 18px;
  z-index: 2;
  width: min(346px, calc(100% - 36px));
  padding: 19px;
  color: #dcfaff;
  background:
    linear-gradient(rgb(5 18 31 / 92%), rgb(3 14 26 / 90%)),
    repeating-linear-gradient(0deg, transparent 0 18px, rgb(83 217 255 / 5%) 19px),
    repeating-linear-gradient(90deg, transparent 0 18px, rgb(83 217 255 / 5%) 19px);
  border: 1px solid rgb(74 224 255 / 36%);
  border-radius: 3px;
  box-shadow: 0 22px 68px rgb(0 4 12 / 60%);
  backdrop-filter: blur(14px);
}

.control-panel::before,
.control-panel::after {
  position: absolute;
  width: 32px;
  height: 32px;
  content: "";
  border-color: #5de7ff;
  pointer-events: none;
}

.control-panel::before {
  top: -1px;
  left: -1px;
  border-top: 2px solid;
  border-left: 2px solid;
}

.control-panel::after {
  right: -1px;
  bottom: -1px;
  border-right: 2px solid;
  border-bottom: 2px solid;
}

.heading-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.eyebrow {
  color: #5ce9ff;
  font: 650 9px/1.2 ui-monospace, monospace;
  letter-spacing: 0.17em;
}

button {
  padding: 6px 9px;
  color: #06141f;
  font-size: 9px;
  font-weight: 700;
  background: #69edff;
  border: 0;
  border-radius: 2px;
  cursor: pointer;
}

button.muted {
  color: #8ca4ad;
  background: #152b37;
}

h2 {
  margin: 8px 0 5px;
  font-size: 21px;
  letter-spacing: 0.03em;
}

p {
  margin: 0 0 15px;
  color: #8facb6;
  font-size: 12px;
  line-height: 1.62;
}

.metrics {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 7px;
  margin-bottom: 16px;
}

.metrics div {
  display: grid;
  gap: 3px;
  padding: 8px 5px;
  text-align: center;
  background: rgb(62 215 244 / 7%);
  border: 1px solid rgb(69 220 249 / 14%);
}

.metrics strong {
  color: #71efff;
  font: 650 15px/1 ui-monospace, monospace;
}

.metrics span {
  color: #6f8d97;
  font-size: 8px;
}

label {
  display: grid;
  gap: 6px;
  margin: 12px 0;
}

label span {
  display: flex;
  justify-content: space-between;
  color: #b6cdd5;
  font-size: 11px;
}

output {
  color: #65eaff;
  font-family: ui-monospace, monospace;
}

input[type="range"] {
  width: 100%;
  accent-color: #53dff4;
}

.color-control {
  display: grid;
  grid-template-columns: auto 48px 1fr;
  gap: 10px;
  align-items: center;
  margin-top: 15px;
  padding-top: 13px;
  color: #a8c1c9;
  font-size: 10px;
  border-top: 1px solid rgb(70 219 247 / 15%);
}

.color-control input {
  width: 48px;
  height: 22px;
  padding: 0;
  background: transparent;
  border: 0;
}

.color-control code {
  justify-self: end;
  color: #60818d;
  font: 9px/1 ui-monospace, monospace;
}

@media (max-width: 640px) {
  .control-panel {
    top: 12px;
    right: 12px;
    width: calc(100% - 24px);
    padding: 15px;
  }
}
</style>
