<template>
  <div ref="container" class="cesium-container"></div>

  <aside class="panel">
    <div class="eyebrow">CESIUM DRAWCOMMAND</div>
    <h2>批量方向圆锥</h2>
    <p>
      position 是起始截面中心；圆锥末端会穿入地表，所有实例统一开启深度测试。
    </p>

    <div class="legend">
      <span><i class="transparent-dot"></i>透明圆锥</span>
      <span><i class="wave-dot"></i>流动波纹</span>
      <span><i class="gradient-dot"></i>分段渐变</span>
    </div>

    <label>
      <span
        >实例数量 <output>{{ state.count }}</output></span
      >
      <input
        v-model.number="state.count"
        type="range"
        min="2"
        max="48"
        step="2"
      />
    </label>
    <label>
      <span
        >圆锥长度
        <output>{{ Math.round(state.length / 1000) }} km</output></span
      >
      <input
        v-model.number="state.length"
        type="range"
        min="25000"
        max="90000"
        step="5000"
      />
    </label>
    <label>
      <span
        >起点高度
        <output>{{ (state.startHeight / 1000).toFixed(0) }} km</output></span
      >
      <input
        v-model.number="state.startHeight"
        type="range"
        min="6000"
        max="30000"
        step="1000"
      />
    </label>
    <label>
      <span
        >起点半径
        <output>{{ (state.startRadius / 1000).toFixed(1) }} km</output></span
      >
      <input
        v-model.number="state.startRadius"
        type="range"
        min="0"
        max="12000"
        step="500"
      />
    </label>
    <label>
      <span
        >圆锥张角 <output>{{ state.angle }}°</output></span
      >
      <input
        v-model.number="state.angle"
        type="range"
        min="12"
        max="80"
        step="2"
      />
    </label>
    <label>
      <span
        >材质速度 <output>{{ state.animationSpeed.toFixed(1) }}×</output></span
      >
      <input
        v-model.number="state.animationSpeed"
        type="range"
        min="0"
        max="3"
        step="0.1"
      />
    </label>
    <label>
      <span
        >圆环 / 分段数量 <output>{{ state.materialCount }}</output></span
      >
      <input
        v-model.number="state.materialCount"
        type="range"
        min="2"
        max="24"
        step="1"
      />
    </label>
    <label>
      <span>材质组合</span>
      <select v-model="state.materialMode">
        <option value="mixed">三种材质交错</option>
        <option value="transparent">全部透明</option>
        <option value="wave">全部波纹</option>
        <option value="gradient">全部分段渐变</option>
      </select>
    </label>
    <div class="api">
      <code>new DrawCommandConePrimitive({ renderState })</code>
      <code>createFromEndPosition(options)</code>
      <code>createFromHeadingPitchRoll(options)</code>
      <code>primitive.setInstances(instances)</code>
      <span>1 个 DrawCommand：共享 renderState，优先于标准透明 Pass 绘制</span>
    </div>
  </aside>
</template>

<script setup lang="ts">
import * as Cesium from "cesium";
import { onMounted, onUnmounted, reactive, ref, watch } from "vue";
import {
  DrawCommandConePrimitive,
  type ConeMaterialType,
  type DrawCommandConeInstance,
} from "../../../cesium/tools/draw-command-cone";
import {
  completeLocalWorldBaseLayer,
  createLocalWorldBaseLayers,
} from "../../../cesium/tools/localWorldImagery";
import { applyDefaultViewerConfig } from "../../../cesium/tools/viewerConfig";

type MaterialMode = ConeMaterialType | "mixed";

const container = ref<HTMLDivElement>();
const state = reactive({
  count: 12,
  length: 55_000,
  startHeight: 16_000,
  startRadius: 3_000,
  angle: 40,
  animationSpeed: 1,
  materialCount: 9,
  materialMode: "mixed" as MaterialMode,
});
const palette = ["#36d9ff", "#79f2c0", "#ffd166", "#a891ff"].map((value) =>
  Cesium.Color.fromCssColorString(value),
);

let viewer: Cesium.Viewer | undefined;
let primitive: DrawCommandConePrimitive | undefined;
let componentUnmounted = false;
let instances: DrawCommandConeInstance[] = [];

function localToFixedDirection(
  start: Cesium.Cartesian3,
  localDirection: Cesium.Cartesian3,
): Cesium.Cartesian3 {
  const frame = Cesium.Transforms.eastNorthUpToFixedFrame(start);
  const direction = Cesium.Matrix4.multiplyByPointAsVector(
    frame,
    localDirection,
    new Cesium.Cartesian3(),
  );
  return Cesium.Cartesian3.normalize(direction, direction);
}

function materialForIndex(index: number): ConeMaterialType {
  if (state.materialMode !== "mixed") return state.materialMode;
  return (["transparent", "wave", "gradient"] as const)[index % 3];
}

function createInstances(): DrawCommandConeInstance[] {
  const columns = Math.ceil(Math.sqrt(state.count * 1.5));
  return Array.from({ length: state.count }, (_, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const longitude = 115.25 + column * 0.52;
    const latitude = 38.65 + row * 0.42;
    const start = Cesium.Cartesian3.fromDegrees(
      longitude,
      latitude,
      state.startHeight + (index % 3) * 1_500,
    );
    const azimuth = index * 2.39996;
    const length = state.length * (0.82 + (index % 4) * 0.06);
    const type = materialForIndex(index);
    const color = Cesium.Color.clone(palette[index % palette.length]);
    color.alpha =
      type === "transparent" ? 0.32 : type === "wave" ? 0.78 : 0.64;
    const common = {
      color,
      position: start,
      startRadius: state.startRadius,
      type,
      animationSpeed: state.animationSpeed,
      materialCount: state.materialCount,
      angle: Cesium.Math.toRadians(state.angle),
    };

    if (index % 2 === 0) {
      const worldDirection = localToFixedDirection(
        start,
        new Cesium.Cartesian3(
          Math.cos(azimuth) * 0.78,
          Math.sin(azimuth) * 0.78,
          -0.46,
        ),
      );
      const endOffset = Cesium.Cartesian3.multiplyByScalar(
        worldDirection,
        length,
        new Cesium.Cartesian3(),
      );
      const endPosition = Cesium.Cartesian3.add(
        start,
        endOffset,
        new Cesium.Cartesian3(),
      );
      return DrawCommandConePrimitive.createFromEndPosition({
        ...common,
        endPosition,
      });
    }

    return DrawCommandConePrimitive.createFromHeadingPitchRoll({
      ...common,
      direction: new Cesium.HeadingPitchRoll(
        azimuth,
        Cesium.Math.toRadians(58),
        0,
      ),
      length,
    });
  });
}

function updateInstances(): void {
  instances = createInstances();
  primitive?.setInstances(instances);
}

watch(
  () => [
    state.count,
    state.length,
    state.startHeight,
    state.startRadius,
    state.angle,
  ],
  updateInstances,
);

// 材质调整复用已有 ECEF 坐标和方向，避免重复创建位置、矩阵和四元数。
watch(
  () => [state.animationSpeed, state.materialCount, state.materialMode],
  () => {
    instances.forEach((instance, index) => {
      instance.type = materialForIndex(index);
      instance.animationSpeed = state.animationSpeed;
      instance.materialCount = state.materialCount;
      instance.color.alpha = instance.type === "transparent" ? 0.32 : instance.type === "wave" ? 0.78 : 0.64;
    });
    primitive?.setInstances(instances);
  },
);

onMounted(async () => {
  const baseLayers = await createLocalWorldBaseLayers();
  if (componentUnmounted || !container.value) return;

  viewer = new Cesium.Viewer(container.value, {
    animation: false,
    timeline: false,
    baseLayer: baseLayers.west,
    terrainProvider: new Cesium.EllipsoidTerrainProvider(),
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
  viewer.scene.backgroundColor = Cesium.Color.fromCssColorString("#030a14");
  viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString("#0a2430");
  viewer.scene.globe.showWaterEffect = false;
  viewer.scene.globe.enableLighting = false;
  viewer.scene.globe.depthTestAgainstTerrain = true;

  primitive = viewer.scene.primitives.add(
    new DrawCommandConePrimitive({
      // capacity: 48,
      slices: 64,
      renderState: {
        depthTest: { enabled: true },
        // 透明圆锥读取地表深度，但不写入深度以免阻挡后续绘制。
        depthMask: false,
        // 保留当前示例的 GPU 背面剔除设置。
        // cull: { enabled: true },
        blending: Cesium.BlendingState.ALPHA_BLEND,
      },
    }),
  );
  updateInstances();

  viewer.camera.lookAt(
    Cesium.Cartesian3.fromDegrees(116.55, 39.15, 18_000),
    new Cesium.HeadingPitchRange(
      Cesium.Math.toRadians(12),
      Cesium.Math.toRadians(-47),
      430_000,
    ),
  );
  viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
});

onUnmounted(() => {
  componentUnmounted = true;
  if (viewer && primitive && viewer.scene.primitives.contains(primitive)) {
    viewer.scene.primitives.remove(primitive);
  }
  primitive = undefined;
  instances = [];
  if (viewer && !viewer.isDestroyed()) viewer.destroy();
  viewer = undefined;
});
</script>

<style scoped>
.cesium-container {
  width: 100%;
  height: 100%;
}
.panel {
  position: absolute;
  top: 18px;
  right: 18px;
  z-index: 2;
  width: min(330px, calc(100% - 36px));
  padding: 18px;
  color: #e0f7ff;
  background: rgb(3 13 25 / 88%);
  border: 1px solid rgb(71 210 255 / 30%);
  border-radius: 14px;
  box-shadow: 0 18px 48px rgb(0 4 12 / 48%);
  backdrop-filter: blur(14px);
}
.eyebrow {
  color: #58dfff;
  font:
    600 10px/1.2 ui-monospace,
    monospace;
  letter-spacing: 0.16em;
}
h2 {
  margin: 7px 0 5px;
  font-size: 19px;
}
p {
  margin: 0 0 14px;
  color: #91afbc;
  font-size: 12px;
  line-height: 1.55;
}
.legend {
  display: flex;
  gap: 14px;
  margin-bottom: 14px;
  color: #b8d1dc;
  font-size: 10px;
}
.legend span {
  display: flex;
  align-items: center;
  gap: 6px;
}
.legend i {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  box-shadow: 0 0 10px currentColor;
}
.transparent-dot {
  color: #43d9ff;
  background: #43d9ff;
}
.wave-dot {
  color: #8fffcf;
  background: #8fffcf;
}
.gradient-dot {
  color: #b69cff;
  background: #b69cff;
}
label {
  display: grid;
  gap: 6px;
  margin: 12px 0;
}
label span {
  display: flex;
  justify-content: space-between;
  color: #bed2da;
  font-size: 11px;
}
output {
  color: #63e2ff;
  font-family: ui-monospace, monospace;
}
input[type="range"],
select {
  width: 100%;
}
input {
  accent-color: #49d8ff;
}
select {
  padding: 7px 8px;
  color: #dff8ff;
  background: #0b2232;
  border: 1px solid rgb(83 217 255 / 24%);
  border-radius: 6px;
}
.api {
  display: grid;
  gap: 5px;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid rgb(83 217 255 / 16%);
}
.api code {
  color: #75e6ff;
  font-size: 11px;
}
.api span {
  color: #78939e;
  font-size: 10px;
}
</style>
