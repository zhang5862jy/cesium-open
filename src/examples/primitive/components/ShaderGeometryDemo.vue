<template>
  <div ref="container" class="cesium-container" />

  <div v-if="webgl2Error" class="webgl-error">
    <strong>需要 WebGL 2.0</strong>
    <span>{{ webgl2Error }}</span>
  </div>

  <aside class="control-panel">
    <div class="panel-heading">
      <span class="eyebrow">VERTEX SHADER LAB</span>
      <h2>{{ title }}</h2>
      <p>{{ description }}</p>
    </div>

    <div class="toolbar">
      <button type="button" @click="paused = !paused">
        {{ paused ? "继续动画" : "暂停动画" }}
      </button>
      <label class="toggle">
        <input v-model="state.gridEnabled" type="checkbox" />
        <span>参数网格</span>
      </label>
    </div>

    <div class="controls">
      <label>
        <span>动画速度 <output>{{ state.animationSpeed.toFixed(1) }}×</output></span>
        <input v-model.number="state.animationSpeed" type="range" min="0" max="3" step="0.1" />
      </label>
      <label>
        <span>表面透明度 <output>{{ state.opacity.toFixed(2) }}</output></span>
        <input v-model.number="state.opacity" type="range" min="0.08" max="0.72" step="0.01" />
      </label>

      <label v-if="kind === 'cube'">
        <span>边长 <output>{{ kilometres(state.size) }}</output></span>
        <input v-model.number="state.size" type="range" min="50000" max="320000" step="5000" />
      </label>

      <template v-if="kind === 'triangular-pyramid'">
        <label>
          <span>底面半径 <output>{{ kilometres(state.baseRadius) }}</output></span>
          <input v-model.number="state.baseRadius" type="range" min="50000" max="280000" step="5000" />
        </label>
        <label>
          <span>高度 <output>{{ kilometres(state.height) }}</output></span>
          <input v-model.number="state.height" type="range" min="50000" max="360000" step="5000" />
        </label>
      </template>

      <label v-if="kind === 'hemisphere-radar' || kind === 'sphere-radar'">
        <span>探测半径 <output>{{ kilometres(state.radius) }}</output></span>
        <input v-model.number="state.radius" type="range" min="100000" max="600000" step="10000" />
      </label>

      <template v-if="kind === 'phased-array-radar'">
        <label>
          <span>探测距离 <output>{{ kilometres(state.range) }}</output></span>
          <input v-model.number="state.range" type="range" min="100000" max="700000" step="10000" />
        </label>
        <label>
          <span>方位宽度 <output>{{ state.azimuthSpan }}°</output></span>
          <input v-model.number="state.azimuthSpan" type="range" min="10" max="120" step="1" />
        </label>
        <label>
          <span>俯仰宽度 <output>{{ state.elevationSpan }}°</output></span>
          <input v-model.number="state.elevationSpan" type="range" min="5" max="90" step="1" />
        </label>
        <label>
          <span>航向 <output>{{ state.heading }}°</output></span>
          <input v-model.number="state.heading" type="range" min="0" max="360" step="1" />
        </label>
        <label>
          <span>中心俯仰 <output>{{ state.pitch }}°</output></span>
          <input v-model.number="state.pitch" type="range" min="-20" max="70" step="1" />
        </label>
      </template>

      <template v-if="kind === 'torus-knot'">
        <label>
          <span>主半径 <output>{{ kilometres(state.majorRadius) }}</output></span>
          <input v-model.number="state.majorRadius" type="range" min="60000" max="230000" step="5000" />
        </label>
        <label>
          <span>管半径 <output>{{ kilometres(state.tubeRadius) }}</output></span>
          <input v-model.number="state.tubeRadius" type="range" min="10000" max="70000" step="2500" />
        </label>
        <label>
          <span>缠绕参数 p <output>{{ state.p }}</output></span>
          <input v-model.number="state.p" type="range" min="2" max="7" step="1" />
        </label>
        <label>
          <span>缠绕参数 q <output>{{ state.q }}</output></span>
          <input v-model.number="state.q" type="range" min="2" max="7" step="1" />
        </label>
      </template>
    </div>

    <div class="tech-note">
      CPU：参数与索引<br />GPU：坐标、法线、网格与扫描
    </div>
  </aside>
</template>

<script setup lang="ts">
import * as Cesium from "cesium";
import { onMounted, onUnmounted, reactive, ref, watch } from "vue";
import {
  completeLocalWorldBaseLayer,
  createLocalWorldBaseLayers,
} from "../../../cesium/tools/localWorldImagery";
import { applyDefaultViewerConfig } from "../../../cesium/tools/viewerConfig";
import {
  ParametricGeometryPrimitive,
  type ShaderGeometryController,
  type ShaderGeometryKind,
  type ShaderGeometryOptions,
} from "../../../cesium/tools/custom-geometry";

const props = defineProps<{
  kind: ShaderGeometryKind;
  title: string;
  description: string;
}>();

const container = ref<HTMLDivElement>();
const paused = ref(false);
const webgl2Error = ref("");
const state = reactive({
  animationSpeed: 1,
  opacity: 0.28,
  gridEnabled: true,
  size: 180_000,
  baseRadius: 170_000,
  height: 260_000,
  radius: 320_000,
  range: 430_000,
  azimuthSpan: 58,
  elevationSpan: 34,
  heading: 24,
  pitch: 20,
  majorRadius: 125_000,
  tubeRadius: 32_000,
  p: 2,
  q: 3,
});

const demoPosition = Cesium.Cartesian3.fromDegrees(110, 30, 4_000);
const surfaceColor = Cesium.Color.fromCssColorString("#23aee8");
const gridColor = Cesium.Color.fromCssColorString("#d2f8ff");

let viewer: Cesium.Viewer | undefined;
let controller: ShaderGeometryController | undefined;
let removeTickListener: (() => void) | undefined;
let componentUnmounted = false;
let animationTime = 0;
let lastFrameTime = 0;

function kilometres(value: number): string {
  return `${Math.round(value / 1_000)} km`;
}

function commonOptions() {
  return {
    position: demoPosition,
    color: surfaceColor,
    gridColor,
    opacity: state.opacity,
    gridEnabled: state.gridEnabled,
    animationSpeed: state.animationSpeed,
  };
}

function buildOptions(): ShaderGeometryOptions {
  const common = commonOptions();
  switch (props.kind) {
    case "cube":
      return { ...common, kind: props.kind, size: state.size };
    case "triangular-pyramid":
      return {
        ...common,
        kind: props.kind,
        baseRadius: state.baseRadius,
        height: state.height,
      };
    case "hemisphere-radar":
    case "sphere-radar":
      return { ...common, kind: props.kind, radius: state.radius };
    case "phased-array-radar":
      return {
        ...common,
        kind: props.kind,
        range: state.range,
        azimuthSpan: state.azimuthSpan,
        elevationSpan: state.elevationSpan,
        heading: state.heading,
        pitch: state.pitch,
      };
    case "torus-knot":
      return {
        ...common,
        kind: props.kind,
        majorRadius: state.majorRadius,
        tubeRadius: state.tubeRadius,
        p: state.p,
        q: state.q,
      };
  }
}

watch(state, () => controller?.update(buildOptions()), { deep: true });

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
    contextOptions: {
      requestWebgl1: false,
    },
  });
  applyDefaultViewerConfig(viewer);
  completeLocalWorldBaseLayer(viewer, baseLayers);
  viewer.scene.backgroundColor = Cesium.Color.fromCssColorString("#071526");
  viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString("#16374c");
  viewer.scene.globe.showWaterEffect = false;
  viewer.scene.globe.enableLighting = false;
  viewer.scene.screenSpaceCameraController.minimumZoomDistance = 20_000;

  const context = (
    viewer.scene as Cesium.Scene & { context: { webgl2: boolean } }
  ).context;
  if (!context.webgl2) {
    webgl2Error.value = "当前浏览器或显卡没有提供 WebGL 2.0 渲染上下文。";
    return;
  }

  controller = new ParametricGeometryPrimitive(viewer.scene, buildOptions());
  lastFrameTime = performance.now();
  removeTickListener = viewer.clock.onTick.addEventListener(() => {
    const now = performance.now();
    const delta = Math.min((now - lastFrameTime) / 1_000, 0.1);
    lastFrameTime = now;
    if (!paused.value) animationTime += delta * state.animationSpeed;
    controller?.setTime(animationTime);
  });

  const targetHeight = props.kind === "sphere-radar" ? state.radius : 120_000;
  const target = Cesium.Cartesian3.fromDegrees(110, 30, targetHeight);
  const range = props.kind === "phased-array-radar" ? 1_150_000 : 950_000;
  viewer.camera.lookAt(
    target,
    new Cesium.HeadingPitchRange(
      Cesium.Math.toRadians(25),
      Cesium.Math.toRadians(-24),
      range,
    ),
  );
  viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
});

onUnmounted(() => {
  componentUnmounted = true;
  removeTickListener?.();
  removeTickListener = undefined;
  controller?.destroy();
  controller = undefined;
  if (viewer && !viewer.isDestroyed()) viewer.destroy();
  viewer = undefined;
});
</script>

<style scoped>
.cesium-container {
  width: 100%;
  height: 100%;
}

.webgl-error {
  position: absolute;
  inset: 50% auto auto 50%;
  z-index: 3;
  display: grid;
  gap: 6px;
  width: min(420px, calc(100% - 40px));
  padding: 18px 20px;
  color: #d9f4ff;
  text-align: center;
  background: rgb(5 21 38 / 92%);
  border: 1px solid rgb(255 119 119 / 60%);
  border-radius: 12px;
  transform: translate(-50%, -50%);
}

.webgl-error strong {
  color: #ff9c9c;
}

.webgl-error span {
  color: #aac7d4;
  font-size: 12px;
}

.control-panel {
  position: absolute;
  top: 18px;
  right: 18px;
  z-index: 2;
  width: min(310px, calc(100% - 36px));
  max-height: calc(100% - 36px);
  overflow-y: auto;
  color: #d9f4ff;
  background: rgb(5 21 38 / 88%);
  border: 1px solid rgb(112 211 244 / 32%);
  border-radius: 14px;
  box-shadow: 0 18px 50px rgb(0 7 18 / 38%);
  backdrop-filter: blur(16px);
}

.panel-heading {
  padding: 17px 18px 13px;
  border-bottom: 1px solid rgb(112 211 244 / 18%);
}

.eyebrow {
  color: #5ddcff;
  font: 600 10px/1.2 ui-monospace, monospace;
  letter-spacing: 0.18em;
}

h2 {
  margin: 7px 0 5px;
  color: #f1fbff;
  font-size: 18px;
}

p {
  margin: 0;
  color: #92b5c5;
  font-size: 12px;
  line-height: 1.55;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 18px;
  border-bottom: 1px solid rgb(112 211 244 / 14%);
}

button {
  padding: 7px 11px;
  color: #03121d;
  font: inherit;
  font-size: 12px;
  background: #63ddff;
  border: 0;
  border-radius: 7px;
  cursor: pointer;
}

.toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #b8d2dd;
  font-size: 12px;
}

.controls {
  display: grid;
  gap: 13px;
  padding: 15px 18px 17px;
}

.controls label {
  display: grid;
  gap: 6px;
}

.controls label > span {
  display: flex;
  justify-content: space-between;
  color: #b7d0da;
  font-size: 11px;
}

output {
  color: #69defe;
  font-family: ui-monospace, monospace;
}

input[type="range"] {
  width: 100%;
  accent-color: #4dd7ff;
}

.tech-note {
  padding: 11px 18px 14px;
  color: #678b9c;
  font: 10px/1.6 ui-monospace, monospace;
  border-top: 1px solid rgb(112 211 244 / 14%);
}

@media (max-width: 640px) {
  .control-panel {
    top: 10px;
    right: 10px;
    width: min(280px, calc(100% - 20px));
    max-height: calc(100% - 20px);
  }
}
</style>
