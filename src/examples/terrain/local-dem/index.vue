<template>
  <div
    class="dem-example"
    :class="{ 'is-dragging': isDragging }"
    @dragenter.prevent="isDragging = true"
    @dragover.prevent="isDragging = true"
    @dragleave.prevent="handleDragLeave"
    @drop.prevent="handleDrop"
  >
    <div ref="container" class="cesium-container" />

    <aside class="control-panel">
      <div class="panel-heading">
        <div>
          <span class="eyebrow">LOCAL RASTER PIPELINE</span>
          <h1>DEM 色阶瓦片</h1>
        </div>
        <span class="status-dot" :class="{ busy: isLoading }"></span>
      </div>

      <p class="intro">
        GeoTIFF / Esri ASCII Grid 在浏览器内解析，Cesium 按当前视野请求
        256 × 256 瓦片。
      </p>

      <div class="file-actions">
        <label class="primary-button">
          <input
            type="file"
            accept=".tif,.tiff,.asc"
            @change="handleFileInput"
          />
          选择本地 DEM
        </label>
        <button type="button" class="secondary-button" @click="loadSample">
          加载示例
        </button>
      </div>

      <div v-if="errorMessage" class="message error-message">
        {{ errorMessage }}
      </div>
      <div v-else-if="isLoading" class="message loading-message">
        正在解析 {{ pendingFileName }}…
      </div>

      <template v-if="raster">
        <section class="source-card">
          <div class="source-title">
            <strong :title="raster.name">{{ raster.name }}</strong>
            <span>{{ raster.projectionLabel }}</span>
          </div>
          <dl>
            <div>
              <dt>栅格</dt>
              <dd>{{ raster.width }} × {{ raster.height }}</dd>
            </div>
            <div>
              <dt>高程范围</dt>
              <dd>
                {{ formatHeight(raster.minimum) }} –
                {{ formatHeight(raster.maximum) }} m
              </dd>
            </div>
            <div>
              <dt>瓦片层级</dt>
              <dd>0 – {{ maximumLevel }} · 256 px</dd>
            </div>
            <div>
              <dt>当前缓存</dt>
              <dd>
                {{ tileCacheSize }} 张 · {{ dataTileCount }} 张含 DEM
              </dd>
            </div>
          </dl>
        </section>

        <section class="settings">
          <label>
            <span>色阶</span>
            <select v-model="style.rampId">
              <option
                v-for="ramp in COLOR_RAMPS"
                :key="ramp.id"
                :value="ramp.id"
              >
                {{ ramp.name }}
              </option>
            </select>
          </label>

          <div class="legend">
            <div
              class="legend-gradient"
              :style="{ background: selectedRamp.css }"
            ></div>
            <div>
              <span>{{ formatHeight(style.minimum) }} m</span>
              <span>{{ formatHeight(style.maximum) }} m</span>
            </div>
          </div>

          <div class="range-row">
            <label>
              <span>最低值</span>
              <input v-model.number="style.minimum" type="number" step="10" />
            </label>
            <label>
              <span>最高值</span>
              <input v-model.number="style.maximum" type="number" step="10" />
            </label>
          </div>

          <label class="slider-row">
            <span>山体阴影 <b>{{ Math.round(style.hillshade * 100) }}%</b></span>
            <input
              v-model.number="style.hillshade"
              type="range"
              min="0"
              max="1"
              step="0.05"
            />
          </label>

          <label class="slider-row">
            <span>不透明度 <b>{{ Math.round(style.opacity * 100) }}%</b></span>
            <input
              v-model.number="style.opacity"
              type="range"
              min="0.1"
              max="1"
              step="0.05"
            />
          </label>
        </section>
      </template>

      <footer>
        <span>Canvas 2D 色阶计算</span>
        <span>·</span>
        <span>视野驱动瓦片缓存</span>
      </footer>
    </aside>

    <div v-if="hoverSample" class="sample-readout">
      <span>{{ hoverSample.longitude.toFixed(5) }}° E</span>
      <span>{{ hoverSample.latitude.toFixed(5) }}° N</span>
      <strong>{{ formatHeight(hoverSample.height) }} m</strong>
    </div>

    <div v-if="isDragging" class="drop-overlay">
      <div>
        <strong>释放以加载 DEM</strong>
        <span>支持 .tif / .tiff / .asc</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import * as Cesium from "cesium";
import {
  computed,
  onMounted,
  onUnmounted,
  reactive,
  ref,
  watch,
} from "vue";
import {
  DemImageryProvider,
  type DemRenderStyle,
} from "../../../cesium/dem/DemImageryProvider";
import type { DemRaster } from "../../../cesium/dem/DemRaster";
import {
  COLOR_RAMPS,
  findColorRamp,
} from "../../../cesium/dem/colorRamps";
import { parseDemFile } from "../../../cesium/dem/parseDemFile";
import {
  completeLocalWorldBaseLayer,
  createLocalWorldBaseLayers,
} from "../../../cesium/tools/localWorldImagery";
import { applyDefaultViewerConfig } from "../../../cesium/tools/viewerConfig";

interface HoverSample {
  longitude: number;
  latitude: number;
  height: number;
}

const container = ref<HTMLDivElement>();
const raster = ref<DemRaster>();
const isLoading = ref(false);
const isDragging = ref(false);
const errorMessage = ref("");
const pendingFileName = ref("");
const maximumLevel = ref(0);
const tileCacheSize = ref(0);
const dataTileCount = ref(0);
const hoverSample = ref<HoverSample>();
const style = reactive<DemRenderStyle>({
  rampId: "terrain",
  minimum: 0,
  maximum: 1,
  opacity: 0.96,
  hillshade: 0.75,
});
const selectedRamp = computed(() => findColorRamp(style.rampId));

let viewer: Cesium.Viewer | undefined;
let imageryLayer: Cesium.ImageryLayer | undefined;
let imageryProvider: DemImageryProvider | undefined;
let screenSpaceHandler: Cesium.ScreenSpaceEventHandler | undefined;
let rebuildTimer: ReturnType<typeof setTimeout> | undefined;
let loadSequence = 0;
let componentUnmounted = false;

watch(
  () => [
    style.rampId,
    style.minimum,
    style.maximum,
    style.opacity,
    style.hillshade,
  ],
  () => {
    if (!raster.value || style.maximum <= style.minimum) return;
    window.clearTimeout(rebuildTimer);
    rebuildTimer = window.setTimeout(rebuildLayer, 100);
  },
);

onMounted(async () => {
  const baseLayers = await createLocalWorldBaseLayers();
  if (componentUnmounted) return;
  if (!container.value) return;

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
    selectionIndicator: false,
    skyBox: false,
  });
  applyDefaultViewerConfig(viewer);
  completeLocalWorldBaseLayer(viewer, baseLayers);
  viewer.scene.backgroundColor =
    Cesium.Color.fromCssColorString("#09131b");
  viewer.scene.globe.baseColor =
    Cesium.Color.fromCssColorString("#18252d");
  viewer.scene.globe.showWaterEffect = false;
  viewer.scene.fog.enabled = false;
  viewer.scene.screenSpaceCameraController.minimumZoomDistance = 20;

  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(104, 31, 4_000_000),
    orientation: {
      heading: 0,
      pitch: Cesium.Math.toRadians(-90),
      roll: 0,
    },
  });

  screenSpaceHandler = new Cesium.ScreenSpaceEventHandler(
    viewer.scene.canvas,
  );
  screenSpaceHandler.setInputAction(
    (movement: { endPosition: Cesium.Cartesian2 }) => {
      updateHoverSample(movement.endPosition);
    },
    Cesium.ScreenSpaceEventType.MOUSE_MOVE,
  );

  void loadSample();
});

onUnmounted(() => {
  componentUnmounted = true;
  loadSequence += 1;
  window.clearTimeout(rebuildTimer);
  screenSpaceHandler?.destroy();
  screenSpaceHandler = undefined;
  imageryLayer = undefined;
  imageryProvider = undefined;

  if (viewer && !viewer.isDestroyed()) viewer.destroy();
  viewer = undefined;
});

async function loadSample(): Promise<void> {
  try {
    const response = await fetch(
      `${import.meta.env.BASE_URL}dem/alpine-sample.asc`,
    );
    if (!response.ok) throw new Error("内置 DEM 样例读取失败。");
    const file = new File([await response.blob()], "alpine-sample.asc", {
      type: "text/plain",
    });
    await loadFile(file);
  } catch (error) {
    if (!componentUnmounted) {
      errorMessage.value = getErrorMessage(error);
    }
  }
}

async function loadFile(file: File): Promise<void> {
  const currentSequence = ++loadSequence;
  pendingFileName.value = file.name;
  errorMessage.value = "";
  isLoading.value = true;

  try {
    const nextRaster = await parseDemFile(file);
    if (componentUnmounted || currentSequence !== loadSequence) return;

    raster.value = nextRaster;
    style.minimum = roundRangeValue(nextRaster.minimum);
    style.maximum = roundRangeValue(nextRaster.maximum);
    if (style.maximum <= style.minimum) style.maximum = style.minimum + 1;
    rebuildLayer();
    flyToRaster(nextRaster);
  } catch (error) {
    if (currentSequence === loadSequence) {
      errorMessage.value = getErrorMessage(error);
    }
  } finally {
    if (currentSequence === loadSequence) isLoading.value = false;
  }
}

function rebuildLayer(): void {
  if (!viewer || viewer.isDestroyed() || !raster.value) return;
  if (style.maximum <= style.minimum) return;

  if (imageryLayer) {
    viewer.imageryLayers.remove(imageryLayer, true);
    imageryLayer = undefined;
  }

  tileCacheSize.value = 0;
  dataTileCount.value = 0;
  imageryProvider = new DemImageryProvider(
    raster.value,
    { ...style },
    ({ cacheSize, hasData }) => {
      tileCacheSize.value = cacheSize;
      if (hasData) dataTileCount.value += 1;
    },
  );
  maximumLevel.value = imageryProvider.maximumLevel;
  imageryLayer = viewer.imageryLayers.addImageryProvider(
    imageryProvider as unknown as Cesium.ImageryProvider,
  );
  viewer.scene.requestRender();
}

function flyToRaster(nextRaster: DemRaster): void {
  if (!viewer || viewer.isDestroyed()) return;
  const bounds = nextRaster.geographicBounds;
  viewer.camera.flyTo({
    destination: Cesium.Rectangle.fromDegrees(
      bounds.west,
      bounds.south,
      bounds.east,
      bounds.north,
    ),
    duration: 1.2,
  });
}

function updateHoverSample(position: Cesium.Cartesian2): void {
  if (!viewer || !imageryProvider) {
    hoverSample.value = undefined;
    return;
  }

  const cartesian = viewer.camera.pickEllipsoid(
    position,
    viewer.scene.globe.ellipsoid,
  );
  if (!cartesian) {
    hoverSample.value = undefined;
    return;
  }

  const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
  const longitude = Cesium.Math.toDegrees(cartographic.longitude);
  const latitude = Cesium.Math.toDegrees(cartographic.latitude);
  const height = imageryProvider.sampleAt(longitude, latitude);
  hoverSample.value =
    height === undefined ? undefined : { longitude, latitude, height };
}

function handleFileInput(event: Event): void {
  const input = event.currentTarget as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (file) void loadFile(file);
}

function handleDrop(event: DragEvent): void {
  isDragging.value = false;
  const file = event.dataTransfer?.files[0];
  if (file) void loadFile(file);
}

function handleDragLeave(event: DragEvent): void {
  const target = event.currentTarget as HTMLElement;
  const nextTarget = event.relatedTarget;
  if (!(nextTarget instanceof Node) || !target.contains(nextTarget)) {
    isDragging.value = false;
  }
}

function formatHeight(value: number): string {
  return new Intl.NumberFormat("zh-CN", {
    maximumFractionDigits: Math.abs(value) < 100 ? 1 : 0,
  }).format(value);
}

function roundRangeValue(value: number): number {
  if (Math.abs(value) < 10) return Math.round(value * 10) / 10;
  return Math.round(value);
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "DEM 加载失败。";
}
</script>

<style scoped>
.dem-example {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  color: #dce7e8;
  background: #09131b;
}

.cesium-container {
  width: 100%;
  height: 100%;
}

.control-panel {
  position: absolute;
  top: 18px;
  left: 18px;
  z-index: 3;
  width: min(350px, calc(100% - 36px));
  max-height: calc(100% - 36px);
  padding: 18px;
  overflow: auto;
  background: rgb(10 23 30 / 92%);
  border: 1px solid rgb(130 184 184 / 22%);
  border-radius: 12px;
  box-shadow: 0 16px 48px rgb(0 0 0 / 30%);
  backdrop-filter: blur(14px);
}

.panel-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.eyebrow {
  display: block;
  margin-bottom: 4px;
  color: #6aa5a4;
  font-size: 9px;
  font-weight: 750;
  letter-spacing: 0.15em;
}

h1 {
  color: #f0f7f4;
  font-size: 20px;
  font-weight: 680;
  letter-spacing: -0.02em;
}

.status-dot {
  width: 9px;
  height: 9px;
  background: #6ad4a3;
  border-radius: 50%;
  box-shadow: 0 0 14px rgb(106 212 163 / 75%);
}

.status-dot.busy {
  background: #f1bd62;
  animation: pulse 900ms ease-in-out infinite alternate;
}

.intro {
  margin-top: 12px;
  color: #90a4a7;
  font-size: 11px;
  line-height: 1.65;
}

.file-actions {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
  margin-top: 15px;
}

button,
.primary-button,
select,
input {
  font: inherit;
}

button,
.primary-button {
  height: 34px;
  padding: 0 13px;
  color: inherit;
  font-size: 11px;
  font-weight: 650;
  border-radius: 7px;
  cursor: pointer;
}

.primary-button {
  display: grid;
  place-items: center;
  color: #08251e;
  background: #6ed3ab;
  border: 1px solid #7de0b8;
}

.primary-button:hover {
  background: #80dfba;
}

.primary-button input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
}

.secondary-button {
  background: #172a32;
  border: 1px solid #31464d;
}

.secondary-button:hover {
  background: #20363e;
}

.message {
  margin-top: 10px;
  padding: 9px 10px;
  font-size: 10px;
  line-height: 1.45;
  border-radius: 6px;
}

.error-message {
  color: #ffc4b8;
  background: rgb(154 62 48 / 22%);
  border: 1px solid rgb(239 121 101 / 30%);
}

.loading-message {
  color: #f1dca9;
  background: rgb(168 124 42 / 15%);
  border: 1px solid rgb(222 178 92 / 24%);
}

.source-card {
  margin-top: 14px;
  padding: 12px;
  background: rgb(255 255 255 / 4%);
  border: 1px solid rgb(255 255 255 / 8%);
  border-radius: 8px;
}

.source-title {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid rgb(255 255 255 / 7%);
}

.source-title strong {
  min-width: 0;
  overflow: hidden;
  color: #dcebea;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.source-title span {
  flex: none;
  color: #6f9293;
  font-size: 9px;
}

dl {
  display: grid;
  gap: 7px;
  margin-top: 10px;
}

dl div {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

dt,
dd {
  font-size: 10px;
}

dt {
  color: #728a8d;
}

dd {
  color: #b5c6c6;
}

.settings {
  display: grid;
  gap: 13px;
  margin-top: 16px;
}

.settings > label:first-child,
.range-row label {
  display: grid;
  grid-template-columns: 66px 1fr;
  align-items: center;
  gap: 10px;
}

.settings label > span {
  color: #91a6a8;
  font-size: 10px;
}

select,
input[type="number"] {
  width: 100%;
  height: 30px;
  padding: 0 8px;
  color: #cfdddd;
  font-size: 10px;
  outline: none;
  background: #12232b;
  border: 1px solid #2b4148;
  border-radius: 6px;
}

select:focus,
input[type="number"]:focus {
  border-color: #599b91;
}

.legend-gradient {
  height: 9px;
  border: 1px solid rgb(255 255 255 / 18%);
  border-radius: 3px;
}

.legend > div:last-child {
  display: flex;
  justify-content: space-between;
  margin-top: 5px;
  color: #748d90;
  font-size: 9px;
}

.range-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.range-row label {
  grid-template-columns: 52px 1fr;
}

.slider-row {
  display: grid;
  gap: 7px;
}

.slider-row > span {
  display: flex;
  justify-content: space-between;
}

.slider-row b {
  color: #a7c2bf;
  font-weight: 550;
}

input[type="range"] {
  width: 100%;
  accent-color: #65c9a4;
}

footer {
  display: flex;
  gap: 6px;
  margin-top: 16px;
  padding-top: 12px;
  color: #5f777b;
  font-size: 9px;
  border-top: 1px solid rgb(255 255 255 / 7%);
}

.sample-readout {
  position: absolute;
  right: 18px;
  bottom: 18px;
  z-index: 2;
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 9px 12px;
  color: #8fa8aa;
  font-variant-numeric: tabular-nums;
  background: rgb(10 23 30 / 82%);
  border: 1px solid rgb(130 184 184 / 18%);
  border-radius: 7px;
  backdrop-filter: blur(10px);
}

.sample-readout span {
  font-size: 9px;
}

.sample-readout strong {
  color: #c8e4dc;
  font-size: 11px;
}

.drop-overlay {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: grid;
  place-items: center;
  background: rgb(4 18 23 / 76%);
  border: 3px dashed #68c9a6;
  backdrop-filter: blur(5px);
  pointer-events: none;
}

.drop-overlay div {
  display: flex;
  flex-direction: column;
  gap: 7px;
  align-items: center;
  padding: 28px 42px;
  background: #10262c;
  border: 1px solid #48766f;
  border-radius: 12px;
}

.drop-overlay strong {
  color: #dbf5eb;
  font-size: 17px;
}

.drop-overlay span {
  color: #79a19e;
  font-size: 11px;
}

@keyframes pulse {
  from {
    opacity: 0.45;
  }
  to {
    opacity: 1;
  }
}

@media (max-width: 700px) {
  .control-panel {
    top: 10px;
    left: 10px;
    width: min(330px, calc(100% - 20px));
    max-height: calc(100% - 20px);
  }

  .sample-readout {
    display: none;
  }
}
</style>
