<template>
  <div ref="container" class="cesium-container" />
  <div class="effect-panel">
    <span class="effect-dot" :class="`is-${activityPhase}`"></span>
    <div>
      <strong>动态极光</strong>
      <span>{{ activityLabel }} · 高空极光帘幕</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import * as Cesium from "cesium";
import { onMounted, onUnmounted, ref } from "vue";
import {
  AuroraPrimitive,
  type AuroraActivityPhase,
} from "../../../cesium/tools/aurora/AuroraPrimitive";
import {
  completeLocalWorldBaseLayer,
  createLocalWorldBaseLayers,
} from "../../../cesium/tools/localWorldImagery";
import { applyDefaultViewerConfig } from "../../../cesium/tools/viewerConfig";

const container = ref<HTMLDivElement>();
const activityPhase = ref<AuroraActivityPhase>("active");
const activityLabel = ref("活跃");
let viewer: Cesium.Viewer | undefined;
let aurora: AuroraPrimitive | undefined;
let removePreRenderListener: (() => void) | undefined;
let componentUnmounted = false;

const activityLabels: Record<AuroraActivityPhase, string> = {
  growing: "增强",
  active: "活跃",
  fading: "消退",
  quiet: "平静",
};

onMounted(async () => {
  const baseLayers = await createLocalWorldBaseLayers();
  if (componentUnmounted || !container.value) return;

  viewer = new Cesium.Viewer(container.value, {
    animation: false,
    timeline: false,
    baseLayer: baseLayers.west,
    baseLayerPicker: false,
    sceneModePicker: false,
    fullscreenButton: false,
    geocoder: false,
    homeButton: false,
    infoBox: false,
    navigationHelpButton: false,
    skyBox: false,
    scene3DOnly: true,
    selectionIndicator: false,
    contextOptions: {
      requestWebgl1: false,
    },
  });
  applyDefaultViewerConfig(viewer);
  completeLocalWorldBaseLayer(viewer, baseLayers);

  viewer.scene.backgroundColor = Cesium.Color.fromCssColorString("#020711");
  viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString("#071421");
  viewer.scene.globe.enableLighting = true;
  viewer.scene.globe.showGroundAtmosphere = true;
  viewer.scene.globe.dynamicAtmosphereLighting = true;
  viewer.scene.globe.dynamicAtmosphereLightingFromSun = true;
  viewer.scene.globe.showWaterEffect = false;
  viewer.scene.highDynamicRange = true;
  if (viewer.scene.skyAtmosphere) {
    viewer.scene.skyAtmosphere.show = true;
    viewer.scene.skyAtmosphere.perFragmentAtmosphere = true;
  }
  viewer.clock.currentTime = Cesium.JulianDate.fromIso8601(
    "2026-01-15T00:00:00Z",
  );
  viewer.clock.shouldAnimate = false;

  aurora = new AuroraPrimitive(viewer.scene, {
    minimumHeight: 100_000,
    maximumHeight: 300_000,
    hemispheres: "both",
    cycleDuration: 60,
    brightness: 1.15,
  });

  const startedAt = performance.now();
  removePreRenderListener = viewer.scene.preRender.addEventListener(() => {
    const elapsed = (performance.now() - startedAt) / 1000;
    const activity = aurora?.setTime(elapsed);
    if (activity && activity.phase !== activityPhase.value) {
      activityPhase.value = activity.phase;
      activityLabel.value = activityLabels[activity.phase];
    }
  });

  const target = Cesium.Cartesian3.fromDegrees(15, 70, 170_000);
  viewer.camera.lookAt(
    target,
    new Cesium.HeadingPitchRange(
      Cesium.Math.toRadians(195),
      Cesium.Math.toRadians(-18),
      3_650_000,
    ),
  );
  viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
});

onUnmounted(() => {
  componentUnmounted = true;
  removePreRenderListener?.();
  removePreRenderListener = undefined;
  aurora?.destroy();
  aurora = undefined;

  if (viewer && !viewer.isDestroyed()) {
    viewer.destroy();
  }
  viewer = undefined;
});
</script>

<style scoped>
.cesium-container {
  width: 100%;
  height: 100%;
}

.effect-panel {
  position: absolute;
  top: 18px;
  right: 18px;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 13px;
  color: #dbeaf7;
  background: rgb(6 16 27 / 76%);
  border: 1px solid rgb(124 209 197 / 30%);
  border-radius: 8px;
  box-shadow: 0 8px 28px rgb(0 0 0 / 22%);
  backdrop-filter: blur(10px);
}

.effect-panel div {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.effect-panel strong {
  font-size: 13px;
}

.effect-panel div span {
  color: #91a9ba;
  font-size: 10px;
}

.effect-dot {
  width: 8px;
  height: 8px;
  background: #58e7af;
  border-radius: 50%;
  box-shadow: 0 0 12px #58e7af;
  transition:
    opacity 500ms ease,
    background-color 500ms ease,
    box-shadow 500ms ease;
}

.effect-dot.is-growing {
  background: #7cebbf;
}

.effect-dot.is-fading {
  opacity: 0.45;
}

.effect-dot.is-quiet {
  background: #536673;
  box-shadow: none;
  opacity: 0.35;
}
</style>
