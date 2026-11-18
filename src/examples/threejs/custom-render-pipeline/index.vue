<template>
  <main class="pipeline-example">
    <canvas ref="canvas" class="webgl-canvas"></canvas>
    <div class="scene-grid" aria-hidden="true"></div>

    <aside class="pipeline-panel">
      <div class="eyebrow">THREE.JS / RAW PIPELINE</div>
      <h1>Custom Cube Command</h1>
      <p>
        不使用 <code>BoxGeometry</code> 或内置材质，显式提交缓冲、GLSL 与渲染状态。
      </p>

      <div class="stats" aria-label="实时渲染统计">
        <div><strong>{{ stats.drawCalls }}</strong><span>draw call</span></div>
        <div><strong>{{ stats.triangles }}</strong><span>triangles</span></div>
        <div><strong>{{ stats.programs }}</strong><span>program</span></div>
      </div>

      <section class="pipeline-map">
        <div><span>Geometry</span><code>24 vertices / 36 indices</code></div>
        <div><span>Program</span><code>RawShaderMaterial · GLSL 3</code></div>
        <div><span>Primitive</span><code>TRIANGLES</code></div>
        <div><span>Submit</span><code>renderer.render(scene, camera)</code></div>
      </section>

      <label>
        <span>旋转速度 <output>{{ state.rotationSpeed.toFixed(1) }}×</output></span>
        <input
          v-model.number="state.rotationSpeed"
          type="range"
          min="0"
          max="2.5"
          step="0.1"
        />
      </label>

      <label>
        <span>强调色 <output>{{ state.accentColor }}</output></span>
        <input v-model="state.accentColor" type="color" />
      </label>

      <label>
        <span>面剔除</span>
        <select v-model="state.cullMode">
          <option value="back">BACK</option>
          <option value="front">FRONT</option>
          <option value="none">NONE</option>
        </select>
      </label>

      <label class="switch-row">
        <span>深度测试 / 写入</span>
        <input v-model="state.depthTest" type="checkbox" />
      </label>

      <button type="button" @click="state.paused = !state.paused">
        {{ state.paused ? "继续执行" : "暂停执行" }}
      </button>

      <p v-if="errorMessage" class="error-message">{{ errorMessage }}</p>
    </aside>

    <div class="hint">拖拽旋转视角 · 滚轮缩放</div>
  </main>
</template>

<script setup lang="ts">
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { onMounted, onUnmounted, reactive, ref, watch } from "vue";
import {
  CustomCubeDrawCommand,
  type CullMode,
} from "./CustomCubeDrawCommand";

const canvas = ref<HTMLCanvasElement>();
const errorMessage = ref("");
const state = reactive({
  paused: false,
  rotationSpeed: 0.8,
  accentColor: "#44e6ff",
  cullMode: "back" as CullMode,
  depthTest: true,
});
const stats = reactive({ drawCalls: 0, triangles: 0, programs: 0 });

let renderer: THREE.WebGLRenderer | undefined;
let controls: OrbitControls | undefined;
let command: CustomCubeDrawCommand | undefined;
let resizeObserver: ResizeObserver | undefined;
let elapsedSeconds = 0;
let lastFrameTime = 0;
let lastStatsTime = 0;

function applyPipelineState(): void {
  command?.setPipelineState({
    cullMode: state.cullMode,
    depthTest: state.depthTest,
  });
}

watch(() => state.accentColor, (color) => command?.setAccentColor(color));
watch(() => [state.cullMode, state.depthTest] as const, applyPipelineState);

onMounted(() => {
  if (!canvas.value) return;

  try {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#030914");

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(4.3, 3.1, 5.2);

    renderer = new THREE.WebGLRenderer({
      canvas: canvas.value,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    controls = new OrbitControls(camera, canvas.value);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = 3.3;
    controls.maxDistance = 11;
    controls.target.set(0, 0, 0);
    controls.update();

    command = new CustomCubeDrawCommand(scene, {
      baseColor: "#123963",
      accentColor: state.accentColor,
      pipelineState: {
        cullMode: state.cullMode,
        depthTest: state.depthTest,
      },
    });

    const resize = (): void => {
      if (!renderer || !canvas.value) return;
      const width = canvas.value.clientWidth;
      const height = canvas.value.clientHeight;
      if (width === 0 || height === 0) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas.value);
    resize();

    renderer.setAnimationLoop((frameTime) => {
      if (!renderer || !command) return;
      const deltaSeconds = lastFrameTime === 0
        ? 0
        : Math.min((frameTime - lastFrameTime) * 0.001, 0.05);
      lastFrameTime = frameTime;

      if (!state.paused) {
        elapsedSeconds += deltaSeconds;
        command.update(elapsedSeconds, deltaSeconds, state.rotationSpeed);
      }
      controls?.update();
      renderer.render(scene, camera);

      if (frameTime - lastStatsTime >= 250) {
        stats.drawCalls = renderer.info.render.calls;
        stats.triangles = renderer.info.render.triangles;
        stats.programs = renderer.info.programs?.length ?? 0;
        lastStatsTime = frameTime;
      }
    });
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  }
});

onUnmounted(() => {
  resizeObserver?.disconnect();
  resizeObserver = undefined;
  controls?.dispose();
  controls = undefined;
  renderer?.setAnimationLoop(null);
  command?.destroy();
  command = undefined;
  renderer?.dispose();
  renderer?.forceContextLoss();
  renderer = undefined;
});
</script>

<style scoped>
.pipeline-example {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  color: #dffaff;
  font-family: Inter, "Segoe UI", sans-serif;
  background: #030914;
}

.webgl-canvas {
  display: block;
  width: 100%;
  height: 100%;
  outline: none;
}

.scene-grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgb(65 210 255 / 4%) 1px, transparent 1px),
    linear-gradient(90deg, rgb(65 210 255 / 4%) 1px, transparent 1px);
  background-size: 42px 42px;
  mask-image: radial-gradient(circle at 50% 50%, black, transparent 72%);
  pointer-events: none;
}

.pipeline-panel {
  position: absolute;
  z-index: 2;
  top: 20px;
  right: 20px;
  width: min(360px, calc(100% - 40px));
  padding: 20px;
  background: linear-gradient(145deg, rgb(4 18 34 / 94%), rgb(5 12 25 / 88%));
  border: 1px solid rgb(74 224 255 / 28%);
  border-radius: 14px;
  box-shadow: 0 24px 80px rgb(0 0 0 / 52%);
  backdrop-filter: blur(18px);
}

.pipeline-panel::before {
  position: absolute;
  top: -1px;
  left: 22px;
  width: 82px;
  height: 2px;
  background: #4de5ff;
  box-shadow: 0 0 18px #35cfff;
  content: "";
}

.eyebrow {
  color: #52dfff;
  font: 650 10px/1.2 ui-monospace, "Cascadia Code", monospace;
  letter-spacing: 0.16em;
}

h1 {
  margin: 8px 0 6px;
  font-size: 21px;
  letter-spacing: -0.02em;
}

p {
  margin: 0 0 16px;
  color: #86a8b8;
  font-size: 12px;
  line-height: 1.6;
}

p code,
.pipeline-map code {
  color: #77e8ff;
  font-family: ui-monospace, "Cascadia Code", monospace;
}

.stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 7px;
  margin-bottom: 14px;
}

.stats div {
  display: grid;
  gap: 4px;
  padding: 10px 5px;
  text-align: center;
  background: rgb(42 203 255 / 7%);
  border: 1px solid rgb(69 217 255 / 14%);
  border-radius: 8px;
}

.stats strong {
  color: #63e4ff;
  font: 650 18px/1 ui-monospace, "Cascadia Code", monospace;
}

.stats span {
  color: #6f8e9d;
  font-size: 9px;
  text-transform: uppercase;
}

.pipeline-map {
  display: grid;
  gap: 6px;
  margin-bottom: 15px;
  padding: 11px;
  background: rgb(0 0 0 / 22%);
  border-left: 2px solid rgb(73 224 255 / 42%);
}

.pipeline-map div {
  display: grid;
  grid-template-columns: 68px 1fr;
  gap: 8px;
  font-size: 10px;
}

.pipeline-map span { color: #668595; }
.pipeline-map code { overflow: hidden; font-size: 9px; text-overflow: ellipsis; }

label {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px 14px;
  align-items: center;
  margin: 11px 0;
  color: #a9c6d2;
  font-size: 11px;
}

label > span {
  display: flex;
  grid-column: 1 / -1;
  justify-content: space-between;
}

output {
  color: #5ce1ff;
  font-family: ui-monospace, "Cascadia Code", monospace;
}

input[type="range"] {
  grid-column: 1 / -1;
  width: 100%;
  accent-color: #42d8f5;
}

input[type="color"] {
  grid-column: 2;
  grid-row: 1;
  width: 42px;
  height: 25px;
  padding: 2px;
  background: #091827;
  border: 1px solid #21465a;
  border-radius: 5px;
}

select {
  grid-column: 2;
  grid-row: 1;
  min-width: 88px;
  padding: 5px 7px;
  color: #9deeff;
  font: 10px ui-monospace, "Cascadia Code", monospace;
  background: #071521;
  border: 1px solid #21465a;
  border-radius: 5px;
}

.switch-row span { grid-column: 1; }
.switch-row input { grid-column: 2; grid-row: 1; accent-color: #42d8f5; }

button {
  width: 100%;
  margin-top: 5px;
  padding: 9px;
  color: #03121d;
  font-size: 11px;
  font-weight: 700;
  background: #5be1ff;
  border: 0;
  border-radius: 7px;
  cursor: pointer;
}

.error-message {
  margin: 12px 0 0;
  padding: 9px;
  color: #ffb4b4;
  background: rgb(175 27 42 / 18%);
  border: 1px solid rgb(255 96 111 / 26%);
}

.hint {
  position: absolute;
  bottom: 18px;
  left: 50%;
  color: #547383;
  font: 10px/1 ui-monospace, "Cascadia Code", monospace;
  letter-spacing: 0.08em;
  transform: translateX(-50%);
  pointer-events: none;
}

@media (max-width: 640px) {
  .pipeline-panel {
    top: 12px;
    right: 12px;
    width: calc(100% - 24px);
    max-height: calc(100% - 24px);
    padding: 16px;
    overflow-y: auto;
  }

  .hint { display: none; }
}
</style>
