<template>
  <div ref="container" class="cesium-container"></div>

  <aside class="panel">
    <div class="eyebrow">WEBGL2 · CUSTOM DRAWCOMMAND</div>
    <h2>全息立方体</h2>
    <p>完全封装 Cesium 底层渲染管线，用自定义 GLSL 着色器绘制全息立方体，并演示 GPU Instancing 批量绘制。</p>

    <div class="metrics">
      <div><strong>{{ state.instancedCount }}</strong><span>实例立方体</span></div>
      <div><strong>{{ state.showField ? 2 : 1 }}</strong><span>DrawCommand</span></div>
      <div><strong>1</strong><span>共享网格</span></div>
    </div>

    <label>
      <span>主体尺寸 <output>{{ Math.round(state.size / 1000) }} km</output></span>
      <input v-model.number="state.size" type="range" min="100000" max="1000000" step="50000" />
    </label>
    <label>
      <span>实例数量 <output>{{ state.instancedCount }}</output></span>
      <input v-model.number="state.instancedCount" type="range" min="0" max="2000" step="100" />
    </label>
    <button type="button" @click="state.showField = !state.showField">
      {{ state.showField ? "隐藏实例场" : "显示实例场" }}
    </button>

    <div class="api">
      <code>new HolographicCubePrimitive(...)</code>
      <span>单个立方体 · Buffer → VertexArray → ShaderProgram → DrawCommand</span>
    </div>
    <div class="api">
      <code>new InstancedHolographicCubePrimitive(...)</code>
      <span>批量立方体 · 一次 draw call 绘制 N 个实例</span>
    </div>
  </aside>
</template>

<script setup lang="ts">
import * as Cesium from "cesium";
import { onMounted, onUnmounted, reactive, ref, watch } from "vue";
import {
  HolographicCubePrimitive,
  InstancedHolographicCubePrimitive,
  type HolographicCubeData,
} from "../../../cesium/tools/holographic-cube";
import {
  completeLocalWorldBaseLayer,
  createLocalWorldBaseLayers,
} from "../../../cesium/tools/localWorldImagery";
import { applyDefaultViewerConfig } from "../../../cesium/tools/viewerConfig";

const container = ref<HTMLDivElement>();
const state = reactive({
  size: 600_000,
  instancedCount: 400,
  showField: true,
});

let viewer: Cesium.Viewer | undefined;
let heroCube: HolographicCubePrimitive | undefined;
let cubeField: InstancedHolographicCubePrimitive | undefined;
let fieldData: HolographicCubeData[] = [];
let removePreRender: (() => void) | undefined;
let componentUnmounted = false;

// 主体立方体中心（中国上空约 1900km）
const heroCenter = Cesium.Cartesian3.fromDegrees(108.5, 30, 1_900_000);
const heroOrientation = new Cesium.HeadingPitchRoll();

const palette = ["#19cfff", "#50f2b3", "#ffd166", "#8d9eff", "#ff6bd6"].map(
  (value) => Cesium.Color.fromCssColorString(value).withAlpha(0.85),
);

function buildFieldData(count: number): HolographicCubeData[] {
  const result: HolographicCubeData[] = [];
  const columns = Math.ceil(Math.sqrt(count * 1.6));
  const rows = Math.ceil(count / columns);
  for (let index = 0; index < count; index += 1) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const longitude = 100 + (column / Math.max(columns - 1, 1)) * 17;
    const latitude = 22 + (row / Math.max(rows - 1, 1)) * 16;
    const scale = 120_000 + (index % 9) * 22_000;
    result.push({
      id: `cube-${index}`,
      position: Cesium.Cartesian3.fromDegrees(longitude, latitude, 1_600_000),
      orientation: new Cesium.HeadingPitchRoll(
        index * 0.4,
        index * 0.23,
        index * 0.17,
      ),
      scale: new Cesium.Cartesian3(scale, scale * 0.8, scale),
      color: palette[index % palette.length],
    });
  }
  return result;
}

watch(
  () => state.instancedCount,
  (count) => {
    fieldData = buildFieldData(count);
    cubeField?.set(fieldData);
  },
);
watch(
  () => state.size,
  (size) => {
    heroCube?.setTransform(
      heroCenter,
      new Cesium.Cartesian3(size, size, size),
      heroOrientation,
    );
  },
);
watch(
  () => state.showField,
  (show) => {
    if (cubeField) cubeField.show = show;
  },
);

onMounted(async () => {
  const baseLayers = await createLocalWorldBaseLayers();
  if (componentUnmounted || !container.value) return;

  // requestWebgl1: false 明确要求 WebGL2（对应 GLSL ES 3.00）
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
  viewer.scene.backgroundColor = Cesium.Color.fromCssColorString("#050d17");
  viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString("#0c2335");
  viewer.scene.globe.showWaterEffect = false;
  viewer.scene.globe.enableLighting = false;

  // 单个主体立方体
  heroCube = viewer.scene.primitives.add(
    new HolographicCubePrimitive({
      position: heroCenter,
      dimensions: new Cesium.Cartesian3(state.size, state.size, state.size),
      orientation: heroOrientation,
    }),
  );

  // 实例化批量立方体场
  cubeField = viewer.scene.primitives.add(
    new InstancedHolographicCubePrimitive({ capacity: 2_000 }),
  );
  fieldData = buildFieldData(state.instancedCount);
  cubeField?.set(fieldData);

  const startTime = performance.now();
  removePreRender = viewer.scene.preRender.addEventListener(() => {
    const seconds = (performance.now() - startTime) * 0.001;

    // 主体缓慢旋转，演示 setTransform 动态更新 modelMatrix
    heroOrientation.heading = seconds * 0.12;
    heroOrientation.pitch = Math.sin(seconds * 0.2) * 0.15;
    heroCube?.setTransform(
      heroCenter,
      new Cesium.Cartesian3(state.size, state.size, state.size),
      heroOrientation,
    );

    // 实例场整体缓慢自转，演示每帧只更新实例缓冲、不重建网格
    for (let index = 0; index < fieldData.length; index += 1) {
      const cube = fieldData[index];
      if (cube.orientation) cube.orientation.heading += 0.004;
    }
    cubeField?.set(fieldData);
  });

  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(108.5, 30, 6_500_000),
    orientation: {
      heading: 0,
      pitch: Cesium.Math.toRadians(-62),
      roll: 0,
    },
  });
});

onUnmounted(() => {
  componentUnmounted = true;
  removePreRender?.();
  removePreRender = undefined;
  if (viewer && heroCube && viewer.scene.primitives.contains(heroCube)) {
    viewer.scene.primitives.remove(heroCube);
  }
  if (viewer && cubeField && viewer.scene.primitives.contains(cubeField)) {
    viewer.scene.primitives.remove(cubeField);
  }
  heroCube = undefined;
  cubeField = undefined;
  if (viewer && !viewer.isDestroyed()) viewer.destroy();
  viewer = undefined;
});
</script>

<style scoped>
.cesium-container { width: 100%; height: 100%; }
.panel { position: absolute; top: 18px; right: 18px; z-index: 2; width: min(330px, calc(100% - 36px)); padding: 18px; color: #dff8ff; background: rgb(4 18 31 / 88%); border: 1px solid rgb(73 213 255 / 34%); border-radius: 14px; box-shadow: 0 18px 48px rgb(0 5 14 / 45%); backdrop-filter: blur(15px); }
.eyebrow { color: #53d9ff; font: 600 10px/1.2 ui-monospace, monospace; letter-spacing: .16em; }
h2 { margin: 7px 0 5px; font-size: 19px; }
p { margin: 0 0 15px; color: #94b8c7; font-size: 12px; line-height: 1.55; }
.metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 7px; margin-bottom: 16px; }
.metrics div { display: grid; gap: 2px; padding: 9px 6px; text-align: center; background: rgb(42 200 255 / 8%); border: 1px solid rgb(42 200 255 / 15%); border-radius: 8px; }
.metrics strong { color: #68e3ff; font: 600 17px/1 ui-monospace, monospace; }
.metrics span { color: #789aa9; font-size: 9px; }
label { display: grid; gap: 6px; margin: 12px 0; }
label span { display: flex; justify-content: space-between; color: #b7d1db; font-size: 11px; }
output { color: #61ddff; font-family: ui-monospace, monospace; }
input { width: 100%; accent-color: #42d3ff; }
button { width: 100%; margin-top: 5px; padding: 8px; color: #03131f; background: #62dcff; border: 0; border-radius: 7px; cursor: pointer; }
.api { display: grid; gap: 5px; margin-top: 14px; padding-top: 12px; border-top: 1px solid rgb(83 217 255 / 16%); }
.api code { color: #7be7ff; font-size: 11px; }
.api span { color: #718e9a; font-size: 10px; }
</style>
