<template>
  <div ref="container" class="cesium-container"></div>

  <aside class="panel">
    <div class="eyebrow">CUSTOM RENDER PIPELINE</div>
    <h2>动态批量半球雷达</h2>
    <p>共享 1 份半球网格，通过实例缓冲更新位置、姿态、缩放和颜色。</p>

    <div class="metrics">
      <div><strong>{{ state.count }}</strong><span>实例</span></div>
      <div><strong>1</strong><span>DrawCommand</span></div>
      <div><strong>{{ updateRate }}</strong><span>set / 秒</span></div>
    </div>

    <label>
      <span>雷达数量 <output>{{ state.count }}</output></span>
      <input v-model.number="state.count" type="range" min="100" max="2000" step="100" />
    </label>
    <label>
      <span>基础半径 <output>{{ Math.round(state.radius / 1000) }} km</output></span>
      <input v-model.number="state.radius" type="range" min="20000" max="100000" step="5000" />
    </label>
    <label>
      <span>移动速度 <output>{{ state.speed.toFixed(1) }}×</output></span>
      <input v-model.number="state.speed" type="range" min="0" max="3" step="0.1" />
    </label>
    <button type="button" @click="paused = !paused">
      {{ paused ? "继续更新" : "暂停更新" }}
    </button>

    <div class="api">
      <code>primitive.set(data)</code>
      <span>每帧上传 {{ state.count }} 条实例数据，不重建网格。</span>
    </div>
  </aside>
</template>

<script setup lang="ts">
import * as Cesium from "cesium";
import { onMounted, onUnmounted, reactive, ref, watch } from "vue";
import {
  InstancedHemisphereRadarPrimitive,
  type HemisphereRadarData,
} from "../../../cesium/tools/instanced-hemisphere-radar";
import {
  completeLocalWorldBaseLayer,
  createLocalWorldBaseLayers,
} from "../../../cesium/tools/localWorldImagery";
import { applyDefaultViewerConfig } from "../../../cesium/tools/viewerConfig";

interface AnimatedRadar extends HemisphereRadarData {
  baseLongitude: number;
  baseLatitude: number;
  phase: number;
}

const container = ref<HTMLDivElement>();
const paused = ref(false);
const updateRate = ref(0);
const state = reactive({ count: 600, radius: 55_000, speed: 1 });
const palette = ["#19cfff", "#50f2b3", "#ffd166", "#8d9eff"].map((value) =>
  Cesium.Color.fromCssColorString(value).withAlpha(0.2),
);

let viewer: Cesium.Viewer | undefined;
let primitive: InstancedHemisphereRadarPrimitive | undefined;
let radars: AnimatedRadar[] = [];
let removePreRender: (() => void) | undefined;
let componentUnmounted = false;
let startTime = 0;
let updateCounter = 0;
let rateWindowStart = 0;

function createRadarData(count: number): AnimatedRadar[] {
  const result: AnimatedRadar[] = [];
  const columns = Math.ceil(Math.sqrt(count * 1.6));
  const rows = Math.ceil(count / columns);
  for (let index = 0; index < count; index += 1) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const longitude = 95 + (column / Math.max(columns - 1, 1)) * 27;
    const latitude = 20 + (row / Math.max(rows - 1, 1)) * 20;
    const radiusFactor = 0.68 + (index % 7) * 0.055;
    result.push({
      id: `radar-${index}`,
      baseLongitude: longitude,
      baseLatitude: latitude,
      phase: index * 0.618,
      position: Cesium.Cartesian3.fromDegrees(longitude, latitude, 2_000),
      orientation: new Cesium.HeadingPitchRoll(),
      scale: new Cesium.Cartesian3(
        state.radius * radiusFactor,
        state.radius * radiusFactor * 0.78,
        state.radius * radiusFactor * 0.58,
      ),
      color: palette[index % palette.length],
    });
  }
  return result;
}

function rebuildData(): void {
  radars = createRadarData(state.count);
  primitive?.set(radars);
}

function updateScale(): void {
  for (let index = 0; index < radars.length; index += 1) {
    const radar = radars[index];
    const factor = 0.68 + (index % 7) * 0.055;
    const scale = radar.scale as Cesium.Cartesian3;
    scale.x = state.radius * factor;
    scale.y = state.radius * factor * 0.78;
    scale.z = state.radius * factor * 0.58;
  }
  primitive?.set(radars);
}

watch(() => state.count, rebuildData);
watch(() => state.radius, updateScale);

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
  viewer.scene.backgroundColor = Cesium.Color.fromCssColorString("#06111d");
  viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString("#102c3a");
  viewer.scene.globe.showWaterEffect = false;
  viewer.scene.globe.enableLighting = false;

  primitive = viewer.scene.primitives.add(
    new InstancedHemisphereRadarPrimitive({ capacity: 2_000 }),
  );
  rebuildData();

  startTime = performance.now();
  rateWindowStart = startTime;
  removePreRender = viewer.scene.preRender.addEventListener(() => {
    if (paused.value || !primitive) return;
    const now = performance.now();
    const seconds = (now - startTime) * 0.001 * state.speed;
    for (let index = 0; index < radars.length; index += 1) {
      const radar = radars[index];
      const longitude = radar.baseLongitude + Math.sin(seconds * 0.32 + radar.phase) * 0.16;
      const latitude = radar.baseLatitude + Math.cos(seconds * 0.27 + radar.phase) * 0.1;
      Cesium.Cartesian3.fromDegrees(longitude, latitude, 2_000, Cesium.Ellipsoid.default, radar.position);
      if (radar.orientation) {
        radar.orientation.heading = seconds * 0.35 + radar.phase;
        radar.orientation.pitch = Math.sin(seconds * 0.4 + radar.phase) * 0.13;
        radar.orientation.roll = Math.cos(seconds * 0.3 + radar.phase) * 0.08;
      }
    }
    primitive.set(radars);
    updateCounter += 1;
    if (now - rateWindowStart >= 500) {
      updateRate.value = Math.round((updateCounter * 1_000) / (now - rateWindowStart));
      updateCounter = 0;
      rateWindowStart = now;
    }
  });

  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(108.5, 30, 4_700_000),
    orientation: {
      heading: 0,
      pitch: Cesium.Math.toRadians(-78),
      roll: 0,
    },
  });
});

onUnmounted(() => {
  componentUnmounted = true;
  removePreRender?.();
  removePreRender = undefined;
  if (viewer && primitive && viewer.scene.primitives.contains(primitive)) {
    viewer.scene.primitives.remove(primitive);
  }
  primitive = undefined;
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
