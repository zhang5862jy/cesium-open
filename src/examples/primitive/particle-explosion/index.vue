<template>
  <div ref="container" class="cesium-container"></div>

  <aside class="control-panel">
    <span class="eyebrow">PARTICLE EMITTER / SPHERE</span>
    <h2>爆炸烟雾与火焰</h2>
    <p>三个 <code>ParticleSystem</code> 共用同一爆炸中心，以 <code>SphereEmitter</code> 向外抛射粒子并循环引爆，分别模拟核心火球、扩散烟雾与高速火花。</p>

    <div class="status-row">
      <span class="status-dot"></span>
      <strong>自动循环引爆中</strong>
      <output>{{ cycle.toFixed(2) }} s / 次</output>
    </div>

    <label>
      <span>引爆周期 <output>{{ cycle.toFixed(2) }} s</output></span>
      <input v-model.number="cycle" type="range" min="1.5" max="6" step="0.1" />
    </label>

    <div class="legend">
      <span><i class="swatch flame"></i> 核心火焰</span>
      <span><i class="swatch smoke"></i> 扩散烟雾</span>
      <span><i class="swatch sparks"></i> 高速火花</span>
    </div>
  </aside>
</template>

<script setup lang="ts">
import * as Cesium from "cesium";
import { onMounted, onUnmounted, ref, watch } from "vue";
import {
  completeLocalWorldBaseLayer,
  createLocalWorldBaseLayers,
} from "../../../cesium/tools/localWorldImagery";
import { applyDefaultViewerConfig } from "../../../cesium/tools/viewerConfig";

const container = ref<HTMLDivElement>();
// 两次引爆之间的间隔，也是每个 ParticleSystem 的 lifetime 循环周期
const cycle = ref(3.6);

let viewer: Cesium.Viewer | undefined;
const particleSystems: Cesium.ParticleSystem[] = [];
let componentUnmounted = false;

// 爆炸中心：近地空爆，约 60m 高度
const EXPLOSION_CENTER = Cesium.Cartesian3.fromDegrees(110.0, 30.0, 60);

/**
 * 生成一张柔边径向渐变粒子贴图。
 * 粒子本身的颜色由各 ParticleSystem 的 startColor / endColor 叠加，贴图只提供 alpha 衰减。
 */
function createGlowImage(size = 64): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const context = canvas.getContext("2d")!;
  const half = size / 2;
  const gradient = context.createRadialGradient(
    half,
    half,
    0,
    half,
    half,
    half,
  );
  gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
  gradient.addColorStop(0.35, "rgba(255, 255, 255, 0.85)");
  gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  return canvas;
}

// 火焰：轻微上浮，让火球向上翻卷
function updateFlame(particle: Cesium.Particle, dt: number): void {
  particle.velocity.z += 4.0 * dt;
}

// 烟雾：浮力上飘 + 空气阻力减速
function updateSmoke(particle: Cesium.Particle, dt: number): void {
  const drag = 1.0 - 0.9 * dt;
  Cesium.Cartesian3.multiplyByScalar(particle.velocity, drag, particle.velocity);
  particle.velocity.z += 7.0 * dt;
}

// 火花：重力下坠，划出抛物线轨迹
function updateSparks(particle: Cesium.Particle, dt: number): void {
  particle.velocity.z -= 28.0 * dt;
}

/**
 * 构建三层粒子系统。每层都只用一次 time=0 的 burst + loop，
 * 让整套系统每隔 `lifetime` 秒自动重新引爆一次。
 */
function buildExplosion(modelMatrix: Cesium.Matrix4): Cesium.ParticleSystem[] {
  const glow = createGlowImage();

  const flame = new Cesium.ParticleSystem({
    image: glow,
    startColor: Cesium.Color.fromCssColorString("#fff7d6"),
    endColor: Cesium.Color.fromCssColorString("#ff3b00").withAlpha(0.0),
    startScale: 1.0,
    endScale: 3.0,
    minimumSpeed: 15,
    maximumSpeed: 40,
    minimumParticleLife: 0.4,
    maximumParticleLife: 0.9,
    emissionRate: 0,
    bursts: [
      new Cesium.ParticleBurst({ time: 0.0, minimum: 140, maximum: 200 }),
    ],
    lifetime: cycle.value,
    loop: true,
    imageSize: new Cesium.Cartesian2(36, 36),
    emitter: new Cesium.SphereEmitter(10),
    modelMatrix,
    updateCallback: updateFlame,
  });

  const smoke = new Cesium.ParticleSystem({
    image: glow,
    startColor: Cesium.Color.fromCssColorString("#c9ccd1").withAlpha(0.6),
    endColor: Cesium.Color.fromCssColorString("#e8ebef").withAlpha(0.0),
    startScale: 1.0,
    endScale: 4.5,
    minimumSpeed: 6,
    maximumSpeed: 18,
    minimumParticleLife: 2.0,
    maximumParticleLife: 3.2,
    emissionRate: 0,
    bursts: [
      new Cesium.ParticleBurst({ time: 0.0, minimum: 60, maximum: 100 }),
    ],
    lifetime: cycle.value,
    loop: true,
    imageSize: new Cesium.Cartesian2(48, 48),
    emitter: new Cesium.SphereEmitter(16),
    modelMatrix,
    updateCallback: updateSmoke,
  });

  const sparks = new Cesium.ParticleSystem({
    image: glow,
    startColor: Cesium.Color.fromCssColorString("#fff3b0"),
    endColor: Cesium.Color.fromCssColorString("#d62800").withAlpha(0.0),
    startScale: 1.0,
    endScale: 0.5,
    minimumSpeed: 40,
    maximumSpeed: 90,
    minimumParticleLife: 0.7,
    maximumParticleLife: 1.5,
    emissionRate: 0,
    bursts: [
      new Cesium.ParticleBurst({ time: 0.0, minimum: 90, maximum: 140 }),
    ],
    lifetime: cycle.value,
    loop: true,
    imageSize: new Cesium.Cartesian2(12, 12),
    emitter: new Cesium.SphereEmitter(6),
    modelMatrix,
    updateCallback: updateSparks,
  });

  return [flame, smoke, sparks];
}

watch(cycle, (seconds) => {
  for (const system of particleSystems) system.lifetime = seconds;
});

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

  // ParticleSystem 用场景时钟（frameState.time）驱动粒子更新，而非墙钟时间。
  // 关闭动画控件后时钟默认 shouldAnimate = false，dt 恒为 0，粒子不会发射，必须手动开启。
  viewer.clock.shouldAnimate = true;

  const scene = viewer.scene;
  scene.backgroundColor = Cesium.Color.fromCssColorString("#01060d");
  scene.globe.baseColor = Cesium.Color.fromCssColorString("#07131f");
  scene.globe.enableLighting = false;
  scene.globe.showWaterEffect = false;
  // 开启泛光，让火球高亮发光
  scene.postProcessStages.bloom.enabled = true;
  scene.postProcessStages.bloom.uniforms.contrast = 118;
  scene.postProcessStages.bloom.uniforms.brightness = -0.46;
  scene.postProcessStages.bloom.uniforms.glowOnly = false;

  const modelMatrix = Cesium.Transforms.eastNorthUpToFixedFrame(
    EXPLOSION_CENTER,
  );
  for (const system of buildExplosion(modelMatrix)) {
    scene.primitives.add(system);
    particleSystems.push(system);
  }

  viewer.camera.lookAt(
    EXPLOSION_CENTER,
    new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-32), 620),
  );
});

onUnmounted(() => {
  componentUnmounted = true;
  // 粒子系统直接挂在 scene.primitives 上，viewer.destroy() 会一并销毁它们，
  // 无需逐个 remove/destroy，避免重复卸载时触发「对象已被销毁」的二次销毁错误。
  if (viewer && !viewer.isDestroyed()) viewer.destroy();
  viewer = undefined;
  particleSystems.length = 0;
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
  width: min(340px, calc(100% - 40px));
  padding: 20px;
  color: #ffe9d3;
  background: linear-gradient(145deg, rgb(38 18 8 / 92%), rgb(24 8 4 / 86%));
  border: 1px solid rgb(255 138 60 / 32%);
  border-radius: 3px 18px 3px 18px;
  box-shadow: 0 22px 65px rgb(0 3 12 / 62%), inset 0 0 30px rgb(255 110 40 / 5%);
  backdrop-filter: blur(16px);
}

.control-panel::before,
.control-panel::after {
  position: absolute;
  width: 42px;
  height: 2px;
  content: "";
  background: #ff9443;
  box-shadow: 0 0 12px #ff6a2a;
}

.control-panel::before { top: -1px; left: 16px; }
.control-panel::after { right: 16px; bottom: -1px; }

.eyebrow {
  color: #ff9a4f;
  font: 600 10px/1.2 ui-monospace, monospace;
  letter-spacing: 0.18em;
}

h2 { margin: 8px 0 6px; font-size: 21px; letter-spacing: 0.04em; }
p { margin: 0 0 18px; color: #c9a58d; font-size: 12px; line-height: 1.65; }
p code { color: #ffb27a; font-family: ui-monospace, monospace; font-size: 11px; }

.status-row {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 9px;
  align-items: center;
  padding: 11px 12px;
  background: rgb(255 130 50 / 8%);
  border: 1px solid rgb(255 138 60 / 16%);
}

.status-dot {
  width: 7px;
  height: 7px;
  background: #ff8a45;
  border-radius: 50%;
  box-shadow: 0 0 12px #ff6a2a;
  animation: pulse 1.2s ease-in-out infinite;
}

.status-row strong { color: #ffd0a8; font-size: 11px; font-weight: 500; }
.status-row output { color: #ff9a4f; font: 600 10px/1 ui-monospace, monospace; }
label { display: grid; gap: 7px; margin: 17px 0; }
label span { display: flex; justify-content: space-between; color: #d8b49b; font-size: 11px; }
label output { color: #ff9a4f; font-family: ui-monospace, monospace; }
input { width: 100%; accent-color: #ff7a2e; }

.legend {
  display: flex;
  gap: 18px;
  margin-top: 16px;
  padding-top: 13px;
  color: #a8876f;
  font-size: 9px;
  border-top: 1px solid rgb(255 138 60 / 12%);
}

.legend span { display: flex; gap: 6px; align-items: center; }
.swatch { display: inline-block; width: 11px; height: 11px; border-radius: 50%; }
.flame { background: radial-gradient(circle, #fff7d6 20%, #ff3b00 70%); }
.smoke { background: radial-gradient(circle, #c9ccd1 20%, rgb(200 205 212 / 20%) 70%); }
.sparks { background: radial-gradient(circle, #fff3b0 30%, #d62800 75%); }

@keyframes pulse {
  50% { opacity: 0.42; transform: scale(0.72); }
}

@media (max-width: 640px) {
  .control-panel { top: 12px; right: 12px; width: calc(100% - 24px); padding: 16px; }
}
</style>
