<template>
  <div ref="container" class="cesium-container"></div>

  <aside class="panel">
    <div class="eyebrow">WEBGL2 · CUSTOM DRAWCOMMAND</div>
    <h2>批量血条</h2>
    <p>用自定义 DrawCommand + GPU Instancing 绘制始终面向屏幕的广告牌式血条，逐实例控制位置、缩放、偏移、血量百分比与显隐高度。</p>

    <div class="metrics">
      <div><strong>{{ state.count }}</strong><span>血条实例</span></div>
      <div><strong>1</strong><span>DrawCommand</span></div>
      <div><strong>1</strong><span>共享四边形网格</span></div>
    </div>

    <label>
      <span>默认宽度 <output>{{ Math.round(state.width) }} m</output></span>
      <input v-model.number="state.width" type="range" min="1000" max="16000" step="500" />
    </label>
    <label>
      <span>默认高度 <output>{{ Math.round(state.height) }} m</output></span>
      <input v-model.number="state.height" type="range" min="200" max="2400" step="100" />
    </label>
    <label>
      <span>血条数量 <output>{{ state.count }}</output></span>
      <input v-model.number="state.count" type="range" min="0" max="800" step="20" />
    </label>
    <label>
      <span>显隐高度 <output>{{ state.showHeight >= 1e7 ? "∞" : state.showHeight + " m" }}</output></span>
      <input v-model.number="state.showHeight" type="range" min="50000" max="10000000" step="50000" />
    </label>
    <button type="button" @click="state.animate = !state.animate">
      {{ state.animate ? "暂停动画" : "播放动画" }}
    </button>

    <div class="api">
      <code>new BloodBarPrimitive({ width, height, backgroundColor, color })</code>
      <span>构造时传入默认宽高与两种颜色，走 uniformMap 注入着色器</span>
    </div>
    <div class="api">
      <code>bloodBars.set(BloodBarData[])</code>
      <span>position / scale(xyz) / offset(xy) / percent / showHeight</span>
    </div>
  </aside>
</template>

<script setup lang="ts">
import * as Cesium from "cesium";
import { onMounted, onUnmounted, reactive, ref, watch } from "vue";
import {
  BloodBarPrimitive,
  type BloodBarData,
} from "../../../cesium/tools/blood-bar";
import {
  completeLocalWorldBaseLayer,
  createLocalWorldBaseLayers,
} from "../../../cesium/tools/localWorldImagery";
import { applyDefaultViewerConfig } from "../../../cesium/tools/viewerConfig";

const container = ref<HTMLDivElement>();
const state = reactive({
  width: 8_000,
  height: 1_200,
  count: 200,
  showHeight: 300_000,
  animate: true,
});

let viewer: Cesium.Viewer | undefined;
let bloodBars: BloodBarPrimitive | undefined;
let barData: BloodBarData[] = [];
let removePreRender: (() => void) | undefined;
let componentUnmounted = false;

// 血量颜色（绿色），背景为深色半透明
const healthyColor = Cesium.Color.fromCssColorString("#3dff6b");

// 生成一个矩形网格区域内的血条，位置、血量、缩放、显隐高度都有变化
function buildBarData(count: number): BloodBarData[] {
  const result: BloodBarData[] = [];
  const columns = Math.ceil(Math.sqrt(count * 1.7));
  const rows = Math.ceil(count / columns);
  for (let index = 0; index < count; index += 1) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const longitude = 108 + (column / Math.max(columns - 1, 1)) * 2.6;
    const latitude = 29 + (row / Math.max(rows - 1, 1)) * 2.4;
    // 血量在 0.15~1.0 之间随机分布，让画面有满血也有残血
    const percent = 0.15 + ((index * 37) % 85) / 100;
    const scale = 0.8 + ((index * 13) % 7) * 0.1;
    result.push({
      id: `bar-${index}`,
      position: Cesium.Cartesian3.fromDegrees(longitude, latitude, 1_200 + (index % 5) * 260),
      scale: new Cesium.Cartesian3(scale, scale, 1),
      // 自身 xy 偏移：让血条略高于锚点（向上浮起一点）
      offset: new Cesium.Cartesian2(0, 1_500),
      percent,
      showHeight: 150_000 + ((index * 29) % 4) * 200_000,
    });
  }
  return result;
}

watch(
  () => state.count,
  (count) => {
    barData = buildBarData(count);
    bloodBars?.set(barData);
  },
);
watch(
  () => [state.width, state.height] as const,
  ([width, height]) => {
    if (!bloodBars) return;
    bloodBars.setSize(width, height);
    // 尺寸会影响包围体半径，重新 set 一次以保持视锥裁剪范围正确。
    bloodBars.set(barData);
  },
);
watch(
  () => state.showHeight,
  (showHeight) => {
    for (const bar of barData) bar.showHeight = showHeight;
    bloodBars?.set(barData);
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

  // 血条 Primitive：构造时传入默认宽高与两种颜色
  bloodBars = viewer.scene.primitives.add(
    new BloodBarPrimitive({
      capacity: 1_000,
      width: state.width,
      height: state.height,
      backgroundColor: Cesium.Color.fromCssColorString("#14202b").withAlpha(0.9),
      color: healthyColor,
    }),
  );
  barData = buildBarData(state.count);
  bloodBars?.set(barData);

  // 每帧把每条血条的血量在 [0.15, 1.0] 内振荡，演示「只更新实例缓冲、不重建网格」
  const startTime = performance.now();
  removePreRender = viewer.scene.preRender.addEventListener(() => {
    if (!state.animate) return;
    const seconds = (performance.now() - startTime) * 0.001;
    for (let index = 0; index < barData.length; index += 1) {
      const phase = index * 0.37;
      barData[index].percent =
        0.15 + 0.85 * (0.5 + 0.5 * Math.sin(seconds * 0.9 + phase));
    }
    bloodBars?.set(barData);
  });

  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(109.3, 30.2, 240_000),
    orientation: { heading: 0, pitch: Cesium.Math.toRadians(-62), roll: 0 },
  });
});

onUnmounted(() => {
  componentUnmounted = true;
  removePreRender?.();
  removePreRender = undefined;
  if (viewer && bloodBars && viewer.scene.primitives.contains(bloodBars)) {
    viewer.scene.primitives.remove(bloodBars);
  }
  bloodBars = undefined;
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
