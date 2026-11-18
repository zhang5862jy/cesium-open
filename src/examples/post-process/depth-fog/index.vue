<template>
  <div ref="container" class="cesium-container"></div>

  <aside class="control-panel">
    <div class="panel-heading">
      <span class="eyebrow">DEPTH TEXTURE · EYE SPACE</span>
      <button
        type="button"
        class="power-button"
        :class="{ 'is-off': !state.enabled }"
        @click="state.enabled = !state.enabled"
      >
        {{ state.enabled ? "雾效开启" : "雾效关闭" }}
      </button>
    </div>

    <h2>动态深度雾</h2>
    <p>
      从深度纹理重建每个像素的眼空间距离，让远处建筑逐层融入流动雾场，而天空保持不受影响。
    </p>

    <div class="pipeline">
      <span>depthTexture</span><i>→</i><span>eye distance</span><i>→</i
      ><span>fog mix</span>
    </div>

    <label>
      <span
        >起雾距离 <output>{{ Math.round(state.nearDistance / 1000) }} km</output></span
      >
      <input
        v-model.number="state.nearDistance"
        type="range"
        min="0"
        max="80000"
        step="2000"
      />
    </label>

    <label>
      <span
        >完全笼罩
        <output>{{ Math.round(state.farDistance / 1000) }} km</output></span
      >
      <input
        v-model.number="state.farDistance"
        type="range"
        min="90000"
        max="300000"
        step="5000"
      />
    </label>

    <label>
      <span>指数密度 <output>{{ state.density.toFixed(2) }}</output></span>
      <input
        v-model.number="state.density"
        type="range"
        min="0"
        max="3"
        step="0.05"
      />
    </label>

    <label>
      <span>雾团扰动 <output>{{ Math.round(state.noiseStrength * 100) }}%</output></span>
      <input
        v-model.number="state.noiseStrength"
        type="range"
        min="0"
        max="1"
        step="0.02"
      />
    </label>

    <div class="color-row">
      <label>
        <span>雾色</span>
        <input v-model="state.tint" type="color" />
      </label>
      <label>
        <span>最大遮蔽 <output>{{ Math.round(state.opacity * 100) }}%</output></span>
        <input
          v-model.number="state.opacity"
          type="range"
          min="0.2"
          max="1"
          step="0.02"
        />
      </label>
    </div>

    <div class="note">
      <strong>WebGL 要点</strong>
      <span><code>czm_unpackDepth</code> + <code>czm_windowToEyeCoordinates</code></span>
    </div>
  </aside>
</template>

<script setup lang="ts">
import * as Cesium from "cesium";
import { onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { DepthFogStage } from "../../../cesium/tools/depth-fog";
import {
  completeLocalWorldBaseLayer,
  createLocalWorldBaseLayers,
} from "../../../cesium/tools/localWorldImagery";
import { applyDefaultViewerConfig } from "../../../cesium/tools/viewerConfig";

const container = ref<HTMLDivElement>();
const state = reactive({
  enabled: true,
  nearDistance: 18_000,
  farDistance: 190_000,
  density: 1.35,
  noiseStrength: 0.42,
  opacity: 0.9,
  tint: "#9dbbc3",
});

let viewer: Cesium.Viewer | undefined;
let cityPrimitive: Cesium.Primitive | undefined;
let fogStage: DepthFogStage | undefined;
let removePreRender: (() => void) | undefined;
let componentUnmounted = false;

const cityOrigin = Cesium.Cartesian3.fromDegrees(116.39, 39.91);

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function createDepthCity(): Cesium.Primitive {
  const originFrame = Cesium.Transforms.eastNorthUpToFixedFrame(cityOrigin);
  const instances: Cesium.GeometryInstance[] = [];

  for (let row = 0; row < 14; row += 1) {
    for (let column = -4; column <= 4; column += 1) {
      if ((row + column + 8) % 7 === 0) continue;

      const east = column * 8_500 + Math.sin(row * 1.7 + column) * 1_100;
      const north = (row - 2) * 13_000 + Math.cos(column * 1.3) * 1_400;
      const footprint =
        2_200 + positiveModulo(row * 17 + column * 13 + 40, 5) * 460;
      const height =
        3_600 + positiveModulo(row * 29 + column * 19 + 70, 8) * 1_050;
      const worldCenter = Cesium.Matrix4.multiplyByPoint(
        originFrame,
        new Cesium.Cartesian3(east, north, height * 0.5),
        new Cesium.Cartesian3(),
      );
      const modelMatrix = Cesium.Transforms.eastNorthUpToFixedFrame(worldCenter);
      const normalizedDepth = row / 13;
      const color = Cesium.Color.fromHsl(
        0.54 - normalizedDepth * 0.08,
        0.62,
        0.48 + ((column + 4) % 3) * 0.055,
        1,
      );

      instances.push(
        new Cesium.GeometryInstance({
          id: `depth-building-${row}-${column}`,
          geometry: Cesium.BoxGeometry.fromDimensions({
            dimensions: new Cesium.Cartesian3(
              footprint,
              footprint * (0.72 + ((row + column + 8) % 4) * 0.09),
              height,
            ),
            vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT,
          }),
          modelMatrix,
          attributes: {
            color: Cesium.ColorGeometryInstanceAttribute.fromColor(color),
          },
        }),
      );
    }
  }

  return new Cesium.Primitive({
    geometryInstances: instances,
    appearance: new Cesium.PerInstanceColorAppearance({
      translucent: false,
      closed: true,
    }),
    asynchronous: true,
    allowPicking: false,
  });
}

function applyFogControls(): void {
  if (!fogStage) return;
  const tint =
    Cesium.Color.fromCssColorString(state.tint) ?? Cesium.Color.LIGHTGRAY.clone();
  tint.alpha = state.opacity;
  fogStage.show = state.enabled;
  fogStage.setOptions({
    nearDistance: state.nearDistance,
    farDistance: Math.max(state.farDistance, state.nearDistance + 1_000),
    density: state.density,
    noiseStrength: state.noiseStrength,
    color: tint,
  });
}

watch(
  () => [
    state.enabled,
    state.nearDistance,
    state.farDistance,
    state.density,
    state.noiseStrength,
    state.opacity,
    state.tint,
  ],
  applyFogControls,
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
  scene.backgroundColor = Cesium.Color.fromCssColorString("#071018");
  scene.globe.baseColor = Cesium.Color.fromCssColorString("#18313a");
  scene.globe.enableLighting = false;
  scene.globe.showWaterEffect = false;
  scene.globe.depthTestAgainstTerrain = true;

  cityPrimitive = scene.primitives.add(createDepthCity());
  fogStage = new DepthFogStage(scene);
  applyFogControls();

  const startedAt = performance.now();
  removePreRender = scene.preRender.addEventListener(() => {
    fogStage?.setTime((performance.now() - startedAt) * 0.001);
  });

  const originFrame = Cesium.Transforms.eastNorthUpToFixedFrame(cityOrigin);
  const target = Cesium.Matrix4.multiplyByPoint(
    originFrame,
    new Cesium.Cartesian3(0, 66_000, 2_500),
    new Cesium.Cartesian3(),
  );
  viewer.camera.lookAt(
    target,
    new Cesium.HeadingPitchRange(
      Cesium.Math.toRadians(182),
      Cesium.Math.toRadians(-14),
      168_000,
    ),
  );
  viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
});

onUnmounted(() => {
  componentUnmounted = true;
  removePreRender?.();
  removePreRender = undefined;
  fogStage?.destroy();
  fogStage = undefined;

  if (viewer && cityPrimitive && viewer.scene.primitives.contains(cityPrimitive)) {
    viewer.scene.primitives.remove(cityPrimitive);
  }
  cityPrimitive = undefined;
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
  width: min(350px, calc(100% - 36px));
  padding: 19px;
  color: #e6f5f7;
  background:
    linear-gradient(155deg, rgb(9 25 31 / 94%), rgb(15 35 40 / 84%)),
    radial-gradient(circle at 0 0, rgb(167 213 220 / 16%), transparent 58%);
  border: 1px solid rgb(169 216 222 / 28%);
  border-radius: 16px 4px 16px 4px;
  box-shadow: 0 22px 70px rgb(0 7 12 / 56%);
  backdrop-filter: blur(16px);
}

.panel-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.eyebrow {
  color: #83cbd5;
  font: 650 9px/1.2 ui-monospace, monospace;
  letter-spacing: 0.16em;
}

.power-button {
  padding: 6px 9px;
  color: #c9f1e4;
  font-size: 10px;
  background: rgb(79 213 167 / 10%);
  border: 1px solid rgb(89 222 176 / 30%);
  border-radius: 999px;
  cursor: pointer;
}

.power-button.is-off {
  color: #9aa9ac;
  background: rgb(143 156 160 / 8%);
  border-color: rgb(161 172 176 / 20%);
}

h2 {
  margin: 8px 0 5px;
  font-size: 21px;
  font-weight: 650;
  letter-spacing: 0.02em;
}

p {
  margin: 0 0 14px;
  color: #9db3b8;
  font-size: 12px;
  line-height: 1.65;
}

.pipeline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  margin-bottom: 16px;
  padding: 9px 10px;
  color: #83a8ae;
  font: 600 9px/1 ui-monospace, monospace;
  background: rgb(126 190 199 / 7%);
  border: 1px solid rgb(132 197 205 / 13%);
}

.pipeline i {
  color: #5e7e83;
  font-style: normal;
}

label {
  display: grid;
  gap: 6px;
  margin: 12px 0;
}

label > span {
  display: flex;
  justify-content: space-between;
  color: #bdd0d3;
  font-size: 11px;
}

output {
  color: #8ed5de;
  font-family: ui-monospace, monospace;
}

input[type="range"] {
  width: 100%;
  accent-color: #79c7d1;
}

.color-row {
  display: grid;
  grid-template-columns: 74px 1fr;
  gap: 14px;
  align-items: end;
}

.color-row label {
  margin-bottom: 8px;
}

input[type="color"] {
  width: 100%;
  height: 23px;
  padding: 1px;
  background: #17333a;
  border: 1px solid rgb(137 203 211 / 22%);
  border-radius: 4px;
}

.note {
  display: grid;
  gap: 5px;
  margin-top: 10px;
  padding-top: 12px;
  border-top: 1px solid rgb(137 203 211 / 14%);
}

.note strong {
  color: #d2e5e8;
  font-size: 10px;
  font-weight: 600;
}

.note span {
  color: #789499;
  font-size: 9px;
}

.note code {
  color: #8fd5de;
  font-family: ui-monospace, monospace;
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
