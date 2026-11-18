<template>
  <div ref="container" class="cesium-container"></div>

  <aside class="control-panel">
    <span class="eyebrow">DEFENSE FIELD / ONLINE</span>
    <h2>六边形能量罩</h2>
    <p>GPU 程序化六边形罩面，持续模拟弹丸命中后沿球面扩散的能量涟漪。</p>

    <div class="status-row">
      <span class="status-dot"></span>
      <strong>{{ autoImpact ? "自动防御中" : "手动模式" }}</strong>
      <output>{{ impactCount.toString().padStart(3, "0") }} HITS</output>
    </div>

    <label>
      <span>自动命中间隔 <output>{{ impactInterval.toFixed(2) }} s</output></span>
      <input
        v-model.number="impactInterval"
        type="range"
        min="0.25"
        max="1.6"
        step="0.05"
      />
    </label>

    <div class="actions">
      <button type="button" class="primary" @click="triggerImpact">
        模拟一次命中
      </button>
      <button type="button" @click="autoImpact = !autoImpact">
        {{ autoImpact ? "停止自动命中" : "开启自动命中" }}
      </button>
    </div>

    <div class="legend">
      <span><i class="hexagon"></i> 深浅六边形甲片</span>
      <span><i class="wave"></i> 球面冲击波</span>
    </div>
  </aside>
</template>

<script setup lang="ts">
import * as Cesium from "cesium";
import { onMounted, onUnmounted, ref, watch } from "vue";
import { EnergyShieldPrimitive } from "../../../cesium/tools/energy-shield";
import {
  completeLocalWorldBaseLayer,
  createLocalWorldBaseLayers,
} from "../../../cesium/tools/localWorldImagery";
import { applyDefaultViewerConfig } from "../../../cesium/tools/viewerConfig";

const container = ref<HTMLDivElement>();
const autoImpact = ref(true);
const impactInterval = ref(0.72);
const impactCount = ref(4);

let viewer: Cesium.Viewer | undefined;
let shield: EnergyShieldPrimitive | undefined;
let componentUnmounted = false;
let countTimer: number | undefined;

function triggerImpact(): void {
  shield?.addRandomImpact();
  impactCount.value += 1;
}

watch(autoImpact, (enabled) => shield?.setAutoImpact(enabled));
watch(impactInterval, (seconds) => shield?.setImpactInterval(seconds));

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
  });
  applyDefaultViewerConfig(viewer);
  completeLocalWorldBaseLayer(viewer, baseLayers);

  const scene = viewer.scene;
  scene.backgroundColor = Cesium.Color.fromCssColorString("#010812");
  scene.globe.baseColor = Cesium.Color.fromCssColorString("#071a2a");
  scene.globe.enableLighting = false;
  scene.globe.showWaterEffect = false;
  scene.postProcessStages.bloom.enabled = true;
  scene.postProcessStages.bloom.uniforms.contrast = 118;
  scene.postProcessStages.bloom.uniforms.brightness = -0.46;
  scene.postProcessStages.bloom.uniforms.glowOnly = false;

  const radius = 360_000;
  const shieldCenter = Cesium.Cartesian3.fromDegrees(
    112.5,
    31.2,
    radius * 0.78,
  );
  shield = new EnergyShieldPrimitive(scene, {
    position: shieldCenter,
    radius,
    color: Cesium.Color.fromCssColorString("#087de8"),
    glowColor: Cesium.Color.fromCssColorString("#62e9ff"),
    opacity: 0.1,
    hexScale: 20,
    impactInterval: impactInterval.value,
    impactDuration: 3.8,
  });

  viewer.camera.lookAt(
    shieldCenter,
    new Cesium.HeadingPitchRange(
      Cesium.Math.toRadians(20),
      Cesium.Math.toRadians(-12),
      radius * 4.2,
    ),
  );
  viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);

  countTimer = window.setInterval(() => {
    if (autoImpact.value) impactCount.value += 1;
  }, impactInterval.value * 1_000);
});

watch(impactInterval, (seconds) => {
  if (countTimer !== undefined) window.clearInterval(countTimer);
  countTimer = window.setInterval(() => {
    if (autoImpact.value) impactCount.value += 1;
  }, seconds * 1_000);
});

onUnmounted(() => {
  componentUnmounted = true;
  if (countTimer !== undefined) window.clearInterval(countTimer);
  countTimer = undefined;
  shield?.destroy();
  shield = undefined;
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
  top: 20px;
  right: 20px;
  z-index: 2;
  width: min(350px, calc(100% - 40px));
  padding: 20px;
  color: #dffaff;
  background: linear-gradient(145deg, rgb(3 20 38 / 92%), rgb(1 10 24 / 86%));
  border: 1px solid rgb(74 221 255 / 32%);
  border-radius: 3px 18px 3px 18px;
  box-shadow: 0 22px 65px rgb(0 3 12 / 62%), inset 0 0 30px rgb(30 181 255 / 5%);
  backdrop-filter: blur(16px);
}

.control-panel::before,
.control-panel::after {
  position: absolute;
  width: 42px;
  height: 2px;
  content: "";
  background: #55dcff;
  box-shadow: 0 0 12px #2bcaff;
}

.control-panel::before { top: -1px; left: 16px; }
.control-panel::after { right: 16px; bottom: -1px; }

.eyebrow {
  color: #4fdcff;
  font: 600 10px/1.2 ui-monospace, monospace;
  letter-spacing: 0.18em;
}

h2 { margin: 8px 0 6px; font-size: 21px; letter-spacing: 0.04em; }
p { margin: 0 0 18px; color: #8dafbd; font-size: 12px; line-height: 1.65; }

.status-row {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 9px;
  align-items: center;
  padding: 11px 12px;
  background: rgb(30 190 255 / 8%);
  border: 1px solid rgb(64 214 255 / 16%);
}

.status-dot {
  width: 7px;
  height: 7px;
  background: #54edff;
  border-radius: 50%;
  box-shadow: 0 0 12px #39dfff;
  animation: pulse 1.2s ease-in-out infinite;
}

.status-row strong { color: #bfefff; font-size: 11px; font-weight: 500; }
.status-row output { color: #59dfff; font: 600 10px/1 ui-monospace, monospace; }
label { display: grid; gap: 7px; margin: 17px 0; }
label span { display: flex; justify-content: space-between; color: #a9c6d0; font-size: 11px; }
label output { color: #58dfff; font-family: ui-monospace, monospace; }
input { width: 100%; accent-color: #43d6ff; }
.actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }

button {
  padding: 9px 8px;
  color: #92d9e9;
  background: rgb(32 148 190 / 10%);
  border: 1px solid rgb(61 211 255 / 25%);
  border-radius: 3px;
  cursor: pointer;
}

button:hover { color: #e7fbff; border-color: rgb(93 226 255 / 65%); }
button.primary { color: #02101c; font-weight: 600; background: #5bdfff; }

.legend {
  display: flex;
  gap: 18px;
  margin-top: 16px;
  padding-top: 13px;
  color: #638b99;
  font-size: 9px;
  border-top: 1px solid rgb(71 208 244 / 12%);
}

.legend span { display: flex; gap: 6px; align-items: center; }
.legend i { display: inline-block; width: 11px; height: 8px; }
.hexagon { border: 1px solid #48dfff; transform: skewX(-24deg); }
.wave { border-top: 1px solid #48dfff; border-radius: 50%; }

@keyframes pulse {
  50% { opacity: 0.42; transform: scale(0.72); }
}

@media (max-width: 640px) {
  .control-panel { top: 12px; right: 12px; width: calc(100% - 24px); padding: 16px; }
}
</style>
