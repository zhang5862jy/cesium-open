import * as Cesium from "cesium";
import { onMounted, onUnmounted, reactive, ref, watch, type Ref } from "vue";
import { LodManager, asLodView } from "../../../cesium/tools/lod/LodManager";
import {
  completeLocalWorldBaseLayer,
  createLocalWorldBaseLayers,
} from "../../../cesium/tools/localWorldImagery";
import { applyDefaultViewerConfig } from "../../../cesium/tools/viewerConfig";

type Metric = "distance" | "cameraHeight";

interface MovingTarget {
  id: string;
  index: number;
  // position 是地心世界坐标；local 是以演示中心为原点的东、北、天坐标。
  // 每个目标复用这些向量和矩阵，避免在逐帧更新中反复分配对象。
  position: Cesium.Cartesian3;
  local: Cesium.Cartesian3;
  orientation: Cesium.HeadingPitchRoll;
  matrix: Cesium.Matrix4;
  model: Cesium.Model;
  billboard: Cesium.Billboard;
  // 0：模型，1：图标，-1：隐藏；-2 仅用于演示统计，忽略首次选择。
  level: number;
}

const TARGET_COUNT = 300;
// LOD 使用米；面板展示时才换算为千米。滞回允许当前层级越过边界 400 米。
const NEAR_LIMIT = 12_000;
const FAR_LIMIT = 24_000;
const HYSTERESIS = 400;
const LONGITUDE = 116.4;
const LATITUDE = 39.9;
const modelColor = Cesium.Color.fromCssColorString("#71e6e3");
const markerColor = Cesium.Color.fromCssColorString("#ffca78");

// 所有 Billboard 共用这一个图像，交给同一个集合维护纹理图集。
function createMarkerImage(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("无法创建目标图标。");
  context.beginPath();
  context.moveTo(32, 7);
  context.lineTo(55, 47);
  context.lineTo(32, 40);
  context.lineTo(9, 47);
  context.closePath();
  context.fillStyle = "#ffca78";
  context.fill();
  context.lineWidth = 3;
  context.strokeStyle = "#fff2d6";
  context.stroke();
  return canvas;
}

/**
 * 将示例的生命周期和逐帧更新放在这里，Vue 组件只负责控件与统计展示。
 * 接入真实业务时，可用实时数据替换 updatePosition 中的模拟轨迹。
 */
export function useMovingTargetLod(container: Ref<HTMLDivElement | undefined>) {
  const metric = ref<Metric>("distance");
  const paused = ref(false);
  const enabled = ref(true);
  const speed = ref(1);
  const cameraHeight = ref(8);
  const error = ref("");
  const stats = reactive({
    loaded: 0,
    models: 0,
    billboards: 0,
    hidden: 0,
    switches: 0,
    height: 8,
    focusDistance: 0,
    focusLevel: -1,
    milliseconds: 0,
    fps: 0,
  });

  // 管理器只控制已有对象的显隐，GPU 资源由 Viewer 及其集合持有并释放。
  // Cesium 对象保持为普通对象；仅面板数据使用响应式，避免深度代理。
  const lod = new LodManager();
  const targets: MovingTarget[] = [];
  const origin = Cesium.Cartesian3.fromDegrees(LONGITUDE, LATITUDE);
  const localFrame = Cesium.Transforms.eastNorthUpToFixedFrame(origin);
  let viewer: Cesium.Viewer | undefined;
  let removeUpdate: (() => void) | undefined;
  let removeRenderError: (() => void) | undefined;
  let disposed = false;
  let simulationTime = 0;
  let lastTime = 0;
  let lastStatsTime = 0;
  let frameCount = 0;
  let lodTime = 0;
  let nextIndex = 0;
  let switchCount = 0;

  function updatePosition(target: MovingTarget): void {
    const angle = simulationTime * (0.11 + (target.index % 7) * 0.007);
    if (target.index === 0) {
      // 001 的轨迹会穿过两个切换边界，固定相机也能观察完整的 LOD 过程。
      target.local.x = 14_000 * (1 - Math.cos(simulationTime * 0.2));
      target.local.y = 2_000 * Math.sin(simulationTime * 0.2);
      target.orientation.heading = Math.atan2(
        14_000 * Math.sin(simulationTime * 0.2),
        2_000 * Math.cos(simulationTime * 0.2),
      );
    } else {
      const phase = angle + target.index * 2.399963229728653;
      const radius = 3_000 + ((target.index * 73) % 300) * 85;
      target.local.x = Math.cos(phase) * radius;
      target.local.y = Math.sin(phase) * radius * 0.56;
      target.orientation.heading = Math.atan2(
        -Math.sin(phase),
        Math.cos(phase) * 0.56,
      );
    }
    target.local.z = 900 + Math.sin(angle + target.index) * 180;
    Cesium.Matrix4.multiplyByPoint(localFrame, target.local, target.position);
    // 注册只做一次；持续上报位置即可。此调用更新判定数据，不修改模型姿态。
    lod.setPosition(target.id, target.position);
  }

  function syncAppearance(target: MovingTarget): void {
    const level = lod.getLevel(target.id);
    if (level !== target.level) {
      if (target.level !== -2) switchCount += 1;
      target.level = level;
    }
    // 只同步当前层级的姿态，省去隐藏模型的矩阵计算与图标位置更新。
    // 本函数在 preUpdate 内执行，新显示的对象会在同一帧绘制前取得最新位置。
    if (level === 0) {
      Cesium.Transforms.headingPitchRollToFixedFrame(
        target.position,
        target.orientation,
        Cesium.Ellipsoid.WGS84,
        Cesium.Transforms.eastNorthUpToFixedFrame,
        target.matrix,
      );
      target.model.modelMatrix = target.matrix;
    } else if (level === 1) {
      target.billboard.position = target.position;
    }
  }

  function updateFrame(): void {
    if (!viewer) return;
    const now = performance.now();
    // 页面从后台恢复时限制模拟步长，防止目标因时间差过大瞬间跳远。
    const elapsed = Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;
    if (!paused.value) {
      simulationTime += elapsed * speed.value;
      for (const target of targets) updatePosition(target);
    }

    // 一帧内依次执行：更新目标位置 → 统一选择 LOD → 同步可见对象姿态。
    // 暂停只冻结目标运动；相机移动后仍需重新判断 LOD。
    const start = performance.now();
    const changed = lod.update(
      viewer.camera.positionWC,
      viewer.camera.positionCartographic.height,
    );
    lodTime += performance.now() - start;
    for (const target of targets) syncAppearance(target);
    if (changed) viewer.scene.requestRender();
    frameCount += 1;

    // 面板最多每秒刷新四次，避免 300 个运动目标触发逐帧的 Vue 更新。
    if (now - lastStatsTime < 250) return;
    let models = 0;
    let billboards = 0;
    for (const target of targets) {
      if (target.level === 0) models += 1;
      else if (target.level === 1) billboards += 1;
      if (target.index === 0) {
        stats.focusDistance =
          Cesium.Cartesian3.distance(
            viewer.camera.positionWC,
            target.position,
          ) / 1000;
        stats.focusLevel = target.level;
      }
    }
    stats.loaded = targets.length;
    // 数量表示被 LOD 选中的对象，包含视野外目标，不等于实际绘制数量。
    stats.models = models;
    stats.billboards = billboards;
    stats.hidden = targets.length - models - billboards;
    stats.switches = switchCount;
    stats.height = viewer.camera.positionCartographic.height / 1000;
    // 此耗时仅覆盖管理器判断；不包含姿态更新、Cesium 渲染和 GPU 耗时。
    stats.milliseconds = lodTime / frameCount;
    stats.fps = Math.round((frameCount * 1000) / (now - lastStatsTime));
    frameCount = 0;
    lodTime = 0;
    lastStatsTime = now;
  }

  // 输入单位为千米。按俯仰角估算观察距离，实际椭球高度在统计面板中显示。
  function setCameraHeight(height: number): void {
    if (!viewer) return;
    cameraHeight.value = height;
    viewer.camera.cancelFlight();
    const pitch = Cesium.Math.toRadians(-55);
    viewer.camera.lookAt(
      origin,
      new Cesium.HeadingPitchRange(
        0,
        pitch,
        (height * 1000) / -Math.sin(pitch),
      ),
    );
    // 解除 lookAt 的局部参考系，恢复正常的地球平移、旋转等相机操作。
    viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    viewer.scene.requestRender();
  }

  function reset(): void {
    // 重置演示时间与统计即可复用全部对象，无须重新注册或加载模型。
    simulationTime = 0;
    switchCount = 0;
    stats.switches = 0;
    for (const target of targets) {
      updatePosition(target);
      target.level = -2;
    }
    setCameraHeight(8);
  }

  // 修改注册记录的判定方式或启用状态，实际层级切换在下一次 preUpdate 统一处理。
  watch(metric, (value) => {
    for (const target of targets) lod.setMetric(target.id, value);
    viewer?.scene.requestRender();
  });
  watch(enabled, (value) => {
    for (const target of targets) lod.setEnabled(target.id, value);
    viewer?.scene.requestRender();
  });

  function addReferenceLines(scene: Cesium.Scene): void {
    // 地面的椭圆只是运动范围参考线，并非相机到目标的三维距离边界。
    const lines = scene.primitives.add(new Cesium.PolylineCollection());
    for (const radius of [8_000, 18_000, 28_000]) {
      const positions: Cesium.Cartesian3[] = [];
      for (let index = 0; index <= 128; index += 1) {
        const angle = (index / 128) * Cesium.Math.TWO_PI;
        positions.push(
          Cesium.Matrix4.multiplyByPoint(
            localFrame,
            new Cesium.Cartesian3(
              Math.cos(angle) * radius,
              Math.sin(angle) * radius * 0.56,
              20,
            ),
            new Cesium.Cartesian3(),
          ),
        );
      }
      lines.add({
        positions,
        width: 1,
        material: Cesium.Material.fromType("Color", {
          color: modelColor.withAlpha(0.2),
        }),
      });
    }
  }

  async function loadTargets(
    activeViewer: Cesium.Viewer,
    collection: Cesium.BillboardCollection,
    image: HTMLCanvasElement,
  ): Promise<void> {
    while (!disposed && nextIndex < TARGET_COUNT) {
      const index = nextIndex++;
      const id = `target-${String(index + 1).padStart(3, "0")}`;
      const model = await Cesium.Model.fromGltfAsync({
        url: `${import.meta.env.BASE_URL}model/lod-demo-aircraft.glb`,
        show: false,
        scale: index === 0 ? 4 : 2.5,
        forwardAxis: Cesium.Axis.X,
        upAxis: Cesium.Axis.Y,
        color: index === 0 ? Cesium.Color.WHITE : modelColor,
        colorBlendMode: Cesium.ColorBlendMode.MIX,
        colorBlendAmount: 0.7,
        shadows: Cesium.ShadowMode.DISABLED,
        allowPicking: false,
      });
      if (disposed) {
        // 路由离开后，异步加载仍可能完成；尚未交给 Viewer 的模型需自行销毁。
        model.destroy();
        return;
      }
      activeViewer.scene.primitives.add(model);
      const billboard = collection.add({
        id,
        position: origin,
        image,
        show: false,
        width: index === 0 ? 30 : 18,
        height: index === 0 ? 30 : 18,
        color: index === 0 ? Cesium.Color.WHITE : markerColor,
      });
      const target: MovingTarget = {
        id,
        index,
        model,
        billboard,
        position: new Cesium.Cartesian3(),
        local: new Cesium.Cartesian3(),
        orientation: new Cesium.HeadingPitchRoll(),
        matrix: new Cesium.Matrix4(),
        level: -2,
      };

      // 每个目标只 add 一次，适配器统一 Model 与 Billboard 的 show 属性。
      // 区间为左闭右开；未配置的 24 km 以上区间由管理器自动作为隐藏层级。
      lod.add({
        id,
        position: origin,
        metric: metric.value,
        hysteresis: HYSTERESIS,
        levels: [
          { min: 0, max: NEAR_LIMIT, view: asLodView(model) },
          { min: NEAR_LIMIT, max: FAR_LIMIT, view: asLodView(billboard) },
        ],
      });
      lod.setEnabled(id, enabled.value);
      updatePosition(target);
      targets.push(target);
    }
  }

  onMounted(async () => {
    try {
      const layers = await createLocalWorldBaseLayers();
      if (disposed || !container.value) {
        // Viewer 尚未创建，底图资源仍由当前流程负责释放。
        layers.west.destroy();
        layers.east.destroy();
        return;
      }
      viewer = new Cesium.Viewer(container.value, {
        baseLayer: layers.west,
        baseLayerPicker: false,
        animation: false,
        timeline: false,
        geocoder: false,
        homeButton: false,
        navigationHelpButton: false,
        sceneModePicker: false,
        fullscreenButton: false,
        infoBox: false,
        selectionIndicator: false,
        scene3DOnly: true,
        skyBox: false,
        skyAtmosphere: false,
        shadows: false,
      });
      applyDefaultViewerConfig(viewer);
      completeLocalWorldBaseLayer(viewer, layers);
      for (const layer of [layers.west, layers.east]) {
        layer.brightness = 0.3;
        layer.saturation = 0.2;
      }
      viewer.scene.globe.enableLighting = false;
      viewer.scene.globe.showGroundAtmosphere = false;
      viewer.scene.fog.enabled = false;
      viewer.scene.backgroundColor = Cesium.Color.fromCssColorString("#0a1520");
      viewer.scene.light = new Cesium.DirectionalLight({
        direction: new Cesium.Cartesian3(-0.3, 0.4, -0.8),
        intensity: 2,
      });
      removeRenderError = viewer.scene.renderError.addEventListener(
        (_scene: Cesium.Scene, cause: unknown) => {
          error.value = `渲染失败：${String(cause)}`;
        },
      );
      addReferenceLines(viewer.scene);
      const collection = viewer.scene.primitives.add(
        new Cesium.BillboardCollection(),
      );
      setCameraHeight(8);
      lastTime = performance.now();
      lastStatsTime = lastTime;
      // 在 Cesium 更新绘制对象之前完成显隐和姿态同步，避免切换时闪现旧位置。
      removeUpdate = viewer.scene.preUpdate.addEventListener(updateFrame);
      const markerImage = createMarkerImage();
      // 8 个异步任务通过 nextIndex 领取目标，限制模型准备的并发量。
      // 相同 URL 可复用加载缓存，但各 Model 仍是独立对象，LOD 不负责合批。
      await Promise.all(
        Array.from({ length: 8 }, () =>
          loadTargets(viewer!, collection, markerImage),
        ),
      );
    } catch (cause) {
      if (!disposed) error.value = `加载失败：${String(cause)}`;
    }
  });

  onUnmounted(() => {
    // 先标记退出并解绑回调，阻止后续帧和异步加载继续操作场景。
    disposed = true;
    removeUpdate?.();
    removeRenderError?.();
    // 先让管理器隐藏并解除引用，再由 Viewer 销毁其持有的模型和集合资源。
    lod.destroy();
    targets.length = 0;
    if (viewer && !viewer.isDestroyed()) viewer.destroy();
    viewer = undefined;
  });

  return {
    metric,
    paused,
    enabled,
    speed,
    cameraHeight,
    stats,
    error,
    setCameraHeight,
    reset,
    targetCount: TARGET_COUNT,
  };
}
