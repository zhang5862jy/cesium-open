<template>
  <div class="example-shell">
    <div id="cesiumContainer" class="cesiumContainer"></div>
    <CircleTextEditor
      :targets="editorTargets"
      @select="focusTarget"
      @preview="previewTarget"
      @save="saveTarget"
      @cancel="restoreTarget"
    />
    <section class="data-demo">
      <strong>Data / Proxy.set</strong>
      <span>{{ dataState }}</span>
      <button type="button" @click="mutateDataDirectly">
        直接修改实例属性
      </button>
    </section>
  </div>
</template>

<script setup lang="ts">
import * as Cesium from "cesium";
import { onMounted, onUnmounted, ref, shallowRef } from "vue";
import CircleTextEditor from "./CircleTextEditor.vue";
import {
  CircleTextDrawCommand,
  type CircleTextPrimitiveEditOptions,
  type CircleTextPrimitiveOptions,
} from "../../../cesium/tools/circle-text";
import {
  completeLocalWorldBaseLayer,
  createLocalWorldBaseLayers,
} from "../../../cesium/tools/localWorldImagery";
import { applyDefaultViewerConfig } from "../../../cesium/tools/viewerConfig";

let viewer: Cesium.Viewer | undefined;
let circleTextLayer: CircleTextDrawCommand | undefined;
let componentUnmounted = false;
const editorTargets = shallowRef<CircleTextPrimitiveOptions[]>([]);
const dataState = ref("等待直接修改");
let mutationCount = 0;

onMounted(async () => {
  const baseLayers = await createLocalWorldBaseLayers();
  if (componentUnmounted) {
    return;
  }

  viewer = new Cesium.Viewer("cesiumContainer", {
    animation: false,
    timeline: false,
    baseLayer: baseLayers.west,
    baseLayerPicker: false,
    sceneModePicker: false,
    geocoder: false,
    homeButton: false,
    navigationHelpButton: false,
    skyAtmosphere: false,
    skyBox: false,
  });
  applyDefaultViewerConfig(viewer);
  completeLocalWorldBaseLayer(viewer, baseLayers);
  viewer.scene.debugShowFramesPerSecond = true;

  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(105, 35, 7_500_000),
    orientation: {
      heading: 0,
      pitch: Cesium.Math.toRadians(-90),
      roll: 0,
    },
  });

  const renderer = viewer.scene.primitives.add(
    new CircleTextDrawCommand(viewer.scene, {
      capacity: 256,
      defaultEllipseMode: 0,
      height: 200,
      ellipseWidth: 24_000,
      ellipseHeight: 16_000,
      ellipseRotation: 0,
      ellipseImage: "/textures/circle.svg",
      ellipseAnchor: 4,
      ellipseOffset: { x: 0, y: 0 },
      textAnchor: 7,
      textOffset: { x: 0, y: -52 },
      label: {
        font: 'bold 32px "Microsoft YaHei", sans-serif',
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 4,
      },
      nearDistance: 0,
      farDistance: 20_000_000,
      nearScale: 0,
      farScale: 40,
    }),
  );
  circleTextLayer = renderer;

  renderer.add({
    id: "china-point-1",
    longitude: 116.4074,
    latitude: 39.9042,
    ellipseWidth: 24_000,
    ellipseHeight: 16_000,
    ellipseRotation: 20,
    label: {
      text: "点 001",
    },
    textOffset: {
      x: 0,
      // 原生 Label 直接使用 CSS 像素偏移。
      y: -52,
    },
    show: true,
    ellipseShow: true,
    textShow: true,
    // 使用有限值，确保编辑器的数字输入和保存校验可正常工作。
    maximumVisibleHeight: 20_000,
    ellipseMode: 1,
  });
  editorTargets.value = renderer.getAllOptions();
});

/** 保存单个目标，并用标准化后的参数刷新编辑器数据。 */
function saveTarget(id: string, changes: CircleTextPrimitiveEditOptions): void {
  const data = circleTextLayer?.get(id);
  if (!data) {
    return;
  }
  data.edit(changes);
  const savedOptions = data.getOptions();
  editorTargets.value = editorTargets.value.map((target) =>
    target.id === id ? savedOptions : target,
  );
}

/** 表单变化时只更新 Cesium 对象，不改写编辑器的已保存数据。 */
function previewTarget(
  id: string,
  changes: CircleTextPrimitiveEditOptions,
): void {
  circleTextLayer?.get(id)?.edit(changes);
}

/** 关闭未保存的编辑时，将 Cesium 对象恢复到进入编辑时的基线。 */
function restoreTarget(
  id: string,
  changes: CircleTextPrimitiveEditOptions,
): void {
  circleTextLayer?.get(id)?.edit(changes);
}

/** 演示无需 edit()/setData()：直接赋值会被 Data 的 Proxy.set 捕获。 */
function mutateDataDirectly(): void {
  const data = circleTextLayer?.get("china-point-1");
  if (!data || !viewer) return;
  mutationCount += 1;
  data.ellipseRotation = (data.ellipseRotation + 20) % 360;
  data.text = `原生纹理 ${mutationCount}`;
  dataState.value = `set 后 expired = ${String(data.expired)}`;
  editorTargets.value = [data.getOptions()];
  viewer.scene.requestRender();

  let removePostRender = () => {};
  removePostRender = viewer.scene.postRender.addEventListener(() => {
    dataState.value = `本帧同步后 expired = ${String(data.expired)}`;
    removePostRender();
  });
}

/** 选中目标后立即飞到目标上方，保持接近俯视以便观察编辑结果。 */
function focusTarget(id: string): void {
  const target = editorTargets.value.find((item) => item.id === id);
  if (!viewer || !target) {
    return;
  }
  const markerSize = Math.max(
    target.ellipseWidth ?? 0,
    target.ellipseHeight ?? 0,
  );
  const cameraHeight = Cesium.Math.clamp(markerSize * 12, 250_000, 600_000);
  viewer.camera.cancelFlight();
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(
      target.longitude,
      target.latitude,
      (target.height ?? 0) + cameraHeight,
    ),
    orientation: {
      heading: 0,
      pitch: -(Cesium.Math.PI_OVER_TWO - 0.0001),
      roll: 0,
    },
    duration: 0.8,
  });
}

onUnmounted(() => {
  componentUnmounted = true;
  circleTextLayer?.destroy();
  circleTextLayer = undefined;
  editorTargets.value = [];

  if (viewer && !viewer.isDestroyed()) {
    viewer.destroy();
  }
  viewer = undefined;
});
</script>

<style scoped>
.example-shell,
.cesiumContainer {
  width: 100%;
  height: 100%;
}

.example-shell {
  position: relative;
  overflow: hidden;
}

.data-demo {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 10;
  display: grid;
  gap: 8px;
  min-width: 220px;
  padding: 12px;
  color: #eaf7ff;
  background: rgb(8 18 30 / 90%);
  border: 1px solid rgb(114 202 255 / 30%);
  border-radius: 10px;
}

.data-demo span {
  color: #76d6ff;
  font-size: 12px;
}

.data-demo button {
  padding: 8px 10px;
  color: #fff;
  background: #157fb9;
  border: 0;
  border-radius: 7px;
  cursor: pointer;
}
</style>
