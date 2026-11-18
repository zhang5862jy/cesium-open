<template>
  <!-- Viewer 拥有底层 WebGL 画布；右上角面板只展示状态，坐标文字由包内独立 Canvas 绘制。 -->
  <div class="example-shell">
    <div id="cesiumContainer" class="cesium-container"></div>
    <aside class="grid-legend">
      <h2>CGCS2000 高斯-克吕格方里网</h2>
      <div class="mode-switch" role="group" aria-label="方里网计算方式">
        <button
          type="button"
          :class="{ active: calculationMode === 'bounded' }"
          :aria-pressed="calculationMode === 'bounded'"
          @click="setCalculationMode('bounded')"
        >
          固定 1 km
        </button>
        <button
          type="button"
          :class="{ active: calculationMode === 'lod' }"
          :aria-pressed="calculationMode === 'lod'"
          @click="setCalculationMode('lod')"
        >
          自适应间距
        </button>
      </div>
      <div class="mode-switch" role="group" aria-label="示例视角">
        <button type="button" @click="setCameraView(1_000, -10)">
          低空倾斜
        </button>
        <button type="button" @click="setCameraView(10_000, -90)">
          恢复俯视
        </button>
      </div>
      <p v-if="calculationMode === 'bounded'">
        投影平面中每格 1 km × 1
        km；地表距离含投影变形。低空大视域显示附近格网，高空超出范围时隐藏。
      </p>
      <p v-else>
        按视距抽稀投影坐标线；粗层级不再是一公里一格。全球浏览属于数学外推，不代表境外
        CGCS2000 测绘成果。
      </p>
      <p v-if="gridStatus?.rangeLimited" class="visibility-note">
        当前仅显示相机附近的格网，间距仍为 1 km；远处暂不绘制。
      </p>
      <p
        v-if="calculationMode === 'bounded' && !gridStatus"
        class="visibility-note"
      >
        当前视域没有可绘制的 1 km
        格网。请放大并查看支持纬度内的地球表面；恢复时仍使用原间距。
      </p>
      <dl>
        <div>
          <dt>坐标参考系</dt>
          <dd>CGCS2000 / 自动分带</dd>
        </div>
        <div>
          <dt>计算方式</dt>
          <dd>
            {{ calculationMode === "bounded" ? "固定 1 km" : "自适应 LOD" }}
          </dd>
        </div>
        <div>
          <dt>投影分带</dt>
          <dd>{{ gridStatus?.zoneWidthDegrees ?? 6 }}° 带</dd>
        </div>
        <div>
          <dt>当前带号</dt>
          <dd>{{ formatZones(gridStatus?.zoneNumbers) }}</dd>
        </div>
        <div>
          <dt>中央经线</dt>
          <dd>{{ formatMeridians(gridStatus?.centralMeridians) }}</dd>
        </div>
        <div>
          <dt>相机高度</dt>
          <dd>{{ formatKilometers(gridStatus?.cameraHeight) }}</dd>
        </div>
        <div>
          <dt>东坐标线间隔</dt>
          <dd>
            <i class="swatch minor"></i>
            {{ formatKilometers(gridStatus?.eastingGridSpacing) }}
          </dd>
        </div>
        <div>
          <dt>北坐标线间隔</dt>
          <dd>
            <i class="swatch minor"></i>
            {{ formatKilometers(gridStatus?.northingGridSpacing) }}
          </dd>
        </div>
        <div>
          <dt>坐标轴</dt>
          <dd>X=北坐标 / Y=含带号东坐标；单位 km</dd>
        </div>
        <div>
          <dt>格网线</dt>
          <dd>
            纵 {{ gridStatus?.verticalLineCount ?? 0 }} / 横
            {{ gridStatus?.horizontalLineCount ?? 0 }}
          </dd>
        </div>
        <div>
          <dt>格网线段</dt>
          <dd>{{ gridStatus?.segmentCount ?? 0 }}</dd>
        </div>
        <div>
          <dt>文字策略</dt>
          <dd>高位小字 / 公里末两位大字</dd>
        </div>
        <div>
          <dt>显示纬度</dt>
          <dd>80°S～84°N；境外为数学外推</dd>
        </div>
      </dl>
    </aside>
  </div>
</template>

<script setup lang="ts">
// 示例负责 Viewer、交互面板和 Vue 生命周期；坐标计算与绘制全部来自独立包。
import * as Cesium from "cesium";
import { onMounted, onUnmounted, ref, shallowRef } from "vue";
import {
  GaussKrugerGrid,
  type GaussKrugerGridCalculationMode,
  type GaussKrugerGridOptions,
  type GaussKrugerGridStatus,
} from "cesium-gauss-kruger-grid";
import {
  completeLocalWorldBaseLayer,
  createLocalWorldBaseLayers,
} from "../../../cesium/tools/localWorldImagery";
import { applyDefaultViewerConfig } from "../../../cesium/tools/viewerConfig";

// 初始位置位于 6° 第 20 带的中央经线附近，便于观察规则的 1 km 投影坐标网。
const GRID_CENTER = {
  longitude: 117,
  latitude: 39.907,
};

// 这是示例自定义层级：最细为 1 km。包内默认还包含 100/250/500 m 层级。
// 高度只给出初选层级，视域过宽时构建器会继续增大格距以控制线密度。
const LOD_SPACING_LEVELS = [
  { maximumCameraHeight: 25_000, gridSpacing: 1_000 },
  { maximumCameraHeight: 60_000, gridSpacing: 2_000 },
  { maximumCameraHeight: 150_000, gridSpacing: 5_000 },
  { maximumCameraHeight: 400_000, gridSpacing: 10_000 },
  { maximumCameraHeight: 800_000, gridSpacing: 20_000 },
  { maximumCameraHeight: 1_500_000, gridSpacing: 50_000 },
  { maximumCameraHeight: 3_000_000, gridSpacing: 100_000 },
  { maximumCameraHeight: 6_000_000, gridSpacing: 200_000 },
  { maximumCameraHeight: 12_000_000, gridSpacing: 500_000 },
  { maximumCameraHeight: 25_000_000, gridSpacing: 1_000_000 },
  { maximumCameraHeight: Number.POSITIVE_INFINITY, gridSpacing: 2_000_000 },
] as const;

// Cesium 对象保存在普通变量中，避免 Vue 将复杂引擎对象深度响应式代理。
let viewer: Cesium.Viewer | undefined;
let squareGrid: GaussKrugerGrid | undefined;
let removeGridChangedListener: (() => void) | undefined;
let componentUnmounted = false;
// 状态以整份快照替换，浅响应式足以驱动面板，也避免追踪数组中的每一项。
const gridStatus = shallowRef<GaussKrugerGridStatus>();
const calculationMode = ref<GaussKrugerGridCalculationMode>("bounded");

onMounted(async () => {
  // 本地底图异步加载期间，用户可能已跳转页面；完成后先确认组件仍挂载。
  const baseLayers = await createLocalWorldBaseLayers();
  if (componentUnmounted) {
    // 这两个图层还未交给 Viewer，当前分支必须自行释放其所有权。
    baseLayers.west.destroy();
    baseLayers.east.destroy();
    return;
  }

  // 使用两张本地半球图像作为底图，不启动网络瓦片金字塔或在线地形服务。
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
    scene3DOnly: true,
  });
  // 创建后立即应用仓库共享操作方式，再设置本示例的合理缩放范围。
  applyDefaultViewerConfig(viewer);
  viewer.scene.screenSpaceCameraController.minimumZoomDistance = 100;
  viewer.scene.screenSpaceCameraController.maximumZoomDistance = 50_000_000;
  completeLocalWorldBaseLayer(viewer, baseLayers);

  // setView 中的位置使用经纬度“度”和高度“米”，姿态 pitch 使用弧度。
  // 10 km 高度、垂直向下观察，初次进入即可看到固定 1 km 网格及边缘标签。
  setCameraView(10_000, -90);

  createGrid();
});

/** 提供可重复的近地倾斜/俯视场景，便于观察范围限制和固定格距的区别。 */
function setCameraView(height: number, pitchDegrees: number): void {
  if (!viewer || viewer.isDestroyed()) return;
  viewer.camera.cancelFlight();
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(
      GRID_CENTER.longitude,
      GRID_CENTER.latitude,
      height,
    ),
    orientation: {
      heading: 0,
      pitch: Cesium.Math.toRadians(pitchDegrees),
      roll: 0,
    },
  });

  viewer.scene.requestRender();
}

/** 按当前面板模式创建完整图层，并将包内状态事件接到 Vue 面板。 */
function createGrid(): void {
  if (!viewer || viewer.isDestroyed()) {
    return;
  }
  // 切换模式采用重建实例：先解除旧面板订阅，再销毁旧几何、Canvas 和引擎监听器。
  removeGridChangedListener?.();
  removeGridChangedListener = undefined;
  squareGrid?.destroy();

  // 省略 zoneNumber 表示随视域自动选带；仅指定带宽不会将整个地球强塞进一个 CRS。
  const options: GaussKrugerGridOptions = {
    calculationMode: calculationMode.value,
    zoneWidthDegrees: 6,
    altitude: 20,
    lineColor: Cesium.Color.WHITE.withAlpha(0.82),
    lineWidth: 1.25,
    majorLineEvery: 10,
    majorLineWidth: 1.75,
    labelPixelRatio: 2,
    refreshInterval: 80,
    labelUpdateInterval: 32,
    largeViewRefreshInterval: 250,
    largeViewZoneThreshold: 4,
  };
  if (calculationMode.value === "bounded") {
    // 固定模式始终是一公里投影格距；低空超预算时仅生成附近范围，高空超预算时隐藏。
    options.gridSpacing = 1_000;
    options.maximumLinesPerAxis = 64;
    options.minimumLabelSpacing = 72;
  } else {
    options.spacingLevels = LOD_SPACING_LEVELS;
    // 远景北向格距可达到上千公里；东向封顶 500 km，使每带仍有中央线候选。
    options.maximumEastingSpacing = 500_000;
    // 12 是投影轴线数目标，多带与裁切会影响最终总数；标签还会按屏幕距离抽稀。
    options.maximumLinesPerAxis = 12;
    options.minimumLabelSpacing = 48;
  }

  squareGrid = new GaussKrugerGrid(viewer.scene, options);
  // 构造函数已同步执行首次构建，因此先读 status，再订阅后续重建事件。
  gridStatus.value = squareGrid.status;
  removeGridChangedListener = squareGrid.changed.addEventListener(
    (status: GaussKrugerGridStatus | undefined) => {
      gridStatus.value = status;
    },
  );
}

/** 重复点击当前模式不重建，避免无意义的资源分配和画面闪动。 */
function setCalculationMode(mode: GaussKrugerGridCalculationMode): void {
  if (calculationMode.value === mode) {
    return;
  }
  calculationMode.value = mode;
  createGrid();
}

/** 面板距离格式：输入为米；无状态显示占位，不能误报为 0 或默认 1 km。 */
function formatKilometers(value: number | undefined): string {
  if (value === undefined) {
    return "--";
  }
  if (value < 1_000) {
    return `${Math.round(value)} m`;
  }
  return `${(value / 1_000).toFixed(value < 10_000 ? 1 : 0)} km`;
}

/** 大视域只展示带号列表首尾与数量，避免面板被几十个带号撑满。 */
function formatZones(zoneNumbers: readonly number[] | undefined): string {
  if (!zoneNumbers || zoneNumbers.length === 0) {
    return "--";
  }
  if (zoneNumbers.length > 6) {
    return `${zoneNumbers[0]}…${zoneNumbers.at(-1)}（可见 ${zoneNumbers.length} 带）`;
  }
  return zoneNumbers.join("、");
}

/** 状态中的中央经线已经是“度”，只需格式化，无需再次从弧度转换。 */
function formatMeridians(values: readonly number[] | undefined): string {
  if (!values || values.length === 0) {
    return "--";
  }
  if (values.length > 6) {
    return `${formatLongitude(values[0])}…${formatLongitude(values.at(-1)!)}`;
  }
  return values.map(formatLongitude).join("、");
}

/** 用 E/W 表达东西经，防止将西经负数写成负数 °E。 */
function formatLongitude(value: number): string {
  const rounded = Number(value.toFixed(6));
  return rounded < 0 ? `${Math.abs(rounded)}°W` : `${rounded}°E`;
}

onUnmounted(() => {
  // 先阻止尚未完成的异步底图初始化，再解除订阅、销毁格网，最后释放 Viewer。
  // 组件拥有 Viewer；包仅拥有自己的图层资源，两者在此按依赖逆序清理。
  componentUnmounted = true;
  removeGridChangedListener?.();
  removeGridChangedListener = undefined;
  squareGrid?.destroy();
  squareGrid = undefined;
  gridStatus.value = undefined;

  if (viewer && !viewer.isDestroyed()) {
    viewer.destroy();
  }
  viewer = undefined;
});
</script>

<style scoped>
/* 给 Viewer 一个明确的布局尺寸，几何和标签都按实际画布尺寸计算。 */
.example-shell,
.cesium-container {
  width: 100%;
  height: 100%;
}

.example-shell {
  position: relative;
  overflow: hidden;
}

.grid-legend {
  position: absolute;
  top: 18px;
  right: 18px;
  width: min(340px, calc(100% - 36px));
  /* 小屏幕允许面板内部滚动，不挤压底层 Cesium 画布。 */
  max-height: calc(100% - 36px);
  overflow-y: auto;
  box-sizing: border-box;
  padding: 16px 18px;
  color: #eaf8ff;
  background: rgba(5, 19, 31, 0.86);
  border: 1px solid rgba(113, 218, 255, 0.38);
  border-radius: 10px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(8px);
  pointer-events: auto;
  z-index: 3;
}

.grid-legend h2 {
  margin: 0 0 6px;
  font-size: 17px;
}

.mode-switch {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  margin: 10px 0 12px;
}

.mode-switch button {
  padding: 7px 8px;
  color: #a9c6d5;
  font: inherit;
  cursor: pointer;
  background: rgba(15, 45, 63, 0.72);
  border: 1px solid rgba(113, 218, 255, 0.24);
  border-radius: 6px;
}

.mode-switch button:hover {
  color: #ffffff;
  border-color: rgba(113, 218, 255, 0.55);
}

.mode-switch button.active {
  color: #041a26;
  background: #71daff;
  border-color: #9fe7ff;
}

.grid-legend p {
  margin: 0 0 13px;
  color: #a9c6d5;
  font-size: 12px;
  line-height: 1.5;
}

.grid-legend .visibility-note {
  color: #ffd36a;
}

.grid-legend dl {
  display: grid;
  gap: 7px;
  margin: 0;
  font-size: 12px;
}

.grid-legend dl > div {
  display: grid;
  grid-template-columns: 72px 1fr;
  gap: 8px;
}

.grid-legend dt {
  color: #7fa4b8;
}

.grid-legend dd {
  margin: 0;
}

.swatch {
  display: inline-block;
  width: 24px;
  margin-right: 7px;
  vertical-align: middle;
  border-top-style: solid;
  border-top-width: 1px;
  border-top-color: rgba(255, 255, 255, 0.82);
}

.swatch.major {
  border-top-width: 3px;
}
</style>
