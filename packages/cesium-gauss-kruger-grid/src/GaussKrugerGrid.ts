import * as Cesium from "cesium";
import { DrawCommandGaussKrugerGridPrimitive } from "./DrawCommandGaussKrugerGridPrimitive.js";
import {
  buildVisibleGrid,
  resolveGridOptions,
  type ProjectedGridLine,
  type ResolvedGridOptions,
} from "./gridGeometry.js";
import { ScreenGridLabelOverlay } from "./screenLabels.js";
import type {
  GaussKrugerGridOptions,
  GaussKrugerGridStatus,
} from "./types.js";

/**
 * 方里网的生命周期与刷新调度入口：把“几何计算、GPU 绘制、屏幕标签”串起来。
 *
 * buildVisibleGrid 在 CPU 上生成带有投影坐标语义的三维折线；primitive 将相邻
 * 采样点整理成 GPU 线段实例；labelOverlay 把这些折线投到屏幕边框并绘制文字。
 * 固定格距模式与视野自适应模式共用这套流程，区别由 options 决定。
 *
 * 相机运动时不必每帧重做投影：几何和标签各自节流。跨越多个投影带的大视野
 * 使用较慢的几何刷新频率，并在移动中隐藏标签，结束后补做完整刷新。
 * 本对象拥有自己创建的 primitive、标签 Canvas 和监听器，但不拥有 Scene/Viewer。
 */
export class GaussKrugerGrid {
  /** 每次几何重建后通知订阅者；从有格网变为无格网时参数为 undefined。 */
  readonly changed = new Cesium.Event();

  // options 是经校验并补齐默认值的快照，后续计算不直接读取调用方的原始对象。
  private readonly scene: Cesium.Scene;
  private readonly options: ResolvedGridOptions;
  private readonly primitive: DrawCommandGaussKrugerGridPrimitive;
  private readonly labelOverlay: ScreenGridLabelOverlay;
  private readonly removeMoveStartListener: () => void;
  private readonly removeMoveEndListener: () => void;
  private readonly removePreUpdateListener: () => void;
  private readonly removePreRenderListener: () => void;
  // 保存两组相机快照：一组对应“上次标签绘制”，一组对应“上次几何重建”。
  // 二者刷新频率不同，不能共用一组矩阵，否则较快的标签更新会吞掉几何变化。
  // viewMatrix 反映相机姿态/位置；projectionMatrix 反映 FOV、宽高比等投影参数。
  private readonly lastViewMatrix = new Cesium.Matrix4();
  private readonly lastGridViewMatrix = new Cesium.Matrix4();
  private readonly lastProjectionMatrix = new Cesium.Matrix4();
  private readonly lastGridProjectionMatrix = new Cesium.Matrix4();
  private lastSceneMode: Cesium.SceneMode | undefined;
  private lastPixelRatio = 0;
  // 保留有轴类型、米制坐标和投影带号的折线，供标签读取；GPU 只保存拆分后的线段。
  private lines: ProjectedGridLine[] = [];
  private currentStatus: GaussKrugerGridStatus | undefined;
  private lastCanvasWidth = 0;
  private lastCanvasHeight = 0;
  // performance.now() 与各节流间隔均以毫秒为单位；负无穷保证第一次可立即刷新。
  private lastGridRefresh = Number.NEGATIVE_INFINITY;
  private lastLabelUpdate = Number.NEGATIVE_INFINITY;
  private labelsDirty = false;
  private cameraMoving = false;
  private visible = true;
  private destroyed = false;

  /**
   * 校验 Scene/参数，创建自有资源并订阅 Cesium 生命周期，最后生成首批格网。
   * WGS84 检查针对 Cesium 显示椭球；投影采用的 GRS80 参数由投影模块管理。
   */
  constructor(scene: Cesium.Scene, options: GaussKrugerGridOptions = {}) {
    this.scene = scene;
    this.options = resolveGridOptions(options);
    if (scene.isDestroyed()) {
      throw new Error("GaussKrugerGrid requires a Scene that has not been destroyed.");
    }
    if (!scene.ellipsoid.equals(Cesium.Ellipsoid.WGS84)) {
      throw new Error("GaussKrugerGrid requires the WGS84 scene ellipsoid.");
    }
    this.labelOverlay = new ScreenGridLabelOverlay(scene, {
      minimumSpacing: this.options.minimumLabelSpacing,
      pixelRatio: this.options.labelPixelRatio,
    });
    this.primitive = scene.primitives.add(
      new DrawCommandGaussKrugerGridPrimitive({
        lineColor: this.options.lineColor,
        lineWidth: this.options.lineWidth,
        majorLineWidth: this.options.majorLineWidth,
      }),
    );
    this.removeMoveStartListener = scene.camera.moveStart.addEventListener(
      this.handleMoveStart,
    );
    this.removeMoveEndListener = scene.camera.moveEnd.addEventListener(
      this.handleMoveEnd,
    );
    this.removePreUpdateListener = scene.preUpdate.addEventListener(
      this.handlePreUpdate,
    );
    this.removePreRenderListener = scene.preRender.addEventListener(
      this.handlePreRender,
    );
    // 初次几何生成也可能失败；此时撤销已经注册的监听器和创建的资源再抛错。
    try {
      this.refresh();
    } catch (error) {
      this.destroy();
      throw error;
    }
  }

  /** 调用方要求的可见状态；非三维模式或无有效范围时实际图形仍可能隐藏。 */
  get show(): boolean {
    return this.visible;
  }

  /** 切换显示并请求一帧；恢复显示时重建，以免继续使用隐藏期间过期的视野。 */
  set show(value: boolean) {
    if (this.destroyed || this.scene.isDestroyed() || this.visible === value) return;
    this.visible = value;
    this.primitive.show = value && this.scene.mode === Cesium.SceneMode.SCENE3D;
    this.labelOverlay.show =
      this.primitive.show && !(this.cameraMoving && this.isLargeView());
    this.scene.requestRender();
    if (value) this.refresh();
  }

  /** 最近一次有效几何构建的统计快照，适合用于示例面板或 changed 事件展示。 */
  get status(): GaussKrugerGridStatus | undefined {
    return this.currentStatus;
  }

  /**
   * 立即按当前相机重新计算可见投影范围，并把三维折线写入 primitive 的 CPU 缓冲。
   * 真正的 GPU 上传发生在 primitive.update；标签在随后 preRender 中更新。
   * 此方法可由调用方主动使用，不受相机运动的节流条件限制。
   */
  refresh(): void {
    if (this.destroyed || this.scene.isDestroyed() || !this.visible) return;
    Cesium.Matrix4.clone(this.scene.camera.viewMatrix, this.lastGridViewMatrix);
    Cesium.Matrix4.clone(
      this.scene.camera.frustum.projectionMatrix,
      this.lastGridProjectionMatrix,
    );
    this.lastSceneMode = this.scene.mode;
    this.lastGridRefresh = performance.now();
    this.lastCanvasWidth = this.scene.canvas.clientWidth;
    this.lastCanvasHeight = this.scene.canvas.clientHeight;
    // ECEF 是以地心为原点、单位为米的地球固定坐标。当前实例位置与地平线裁切
    // 都按三维椭球定义；二维、哥伦布视图和模式过渡期间先清空，回到三维后重建。
    if (this.scene.mode !== Cesium.SceneMode.SCENE3D ||
      this.lastCanvasWidth <= 0 || this.lastCanvasHeight <= 0) {
      this.clearGrid();
      return;
    }
    const builtGrid = buildVisibleGrid(this.scene, this.options);
    if (!builtGrid) {
      // 视野不支持、格距/预算限制等情况由几何层返回空结果，不能残留旧视野格网。
      this.clearGrid();
      return;
    }

    this.lines = builtGrid.lines;
    this.primitive.set(this.lines);
    this.primitive.show = this.visible;
    this.currentStatus = builtGrid.status;
    // 即使相机矩阵没变，LOD 或几何内容变化也要求标签重画。
    this.labelsDirty = true;
    if (this.cameraMoving && this.isLargeView()) {
      this.labelOverlay.show = false;
    }
    this.scene.requestRender();
    this.changed.raiseEvent(builtGrid.status);
  }

  /** 允许调用方和 Scene 所属的 PrimitiveCollection 检查资源是否已经释放。 */
  isDestroyed(): boolean {
    return this.destroyed;
  }

  /**
   * 幂等销毁：先停止事件回调，再移除图元、释放 GPU 资源及 DOM Canvas。
   * 不销毁外部传入的 Scene/Viewer，调用方仍负责它们的生命周期。
   */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.removeMoveStartListener();
    this.removeMoveEndListener();
    this.removePreUpdateListener();
    this.removePreRenderListener();
    if (!this.scene.isDestroyed()) {
      this.scene.primitives.remove(this.primitive);
      this.scene.requestRender();
    }
    // 集合可能设置 destroyPrimitives: false；移除不一定等于销毁，所以再兜底一次。
    if (!this.primitive.isDestroyed()) this.primitive.destroy();
    this.lines = [];
    this.currentStatus = undefined;
    this.labelOverlay.destroy();
  }

  /** 移动开始只改变调度状态；多带标签暂时隐藏，避免重投影开销和频繁跳动。 */
  private readonly handleMoveStart = (): void => {
    this.cameraMoving = true;
    if (this.isLargeView()) {
      this.labelOverlay.show = false;
    }
  };

  /** 移动结束不再等节流窗口，立即补上准确的最终几何并允许标签重新显示。 */
  private readonly handleMoveEnd = (): void => {
    this.cameraMoving = false;
    this.refresh();
  };

  /**
   * 更新阶段负责检测变化和发起渲染请求。
   * Cesium 的 requestRenderMode 可跳过绘制，但 preUpdate 仍执行；把检测放在这里，
   * 才能在没有连续渲染的场景里发现 FOV、DPR 或节流窗口结束后的待刷新内容。
   */
  private readonly handlePreUpdate = (): void => {
    if (this.destroyed || this.scene.isDestroyed() || !this.visible) return;
    const now = performance.now();
    const canvasWidth = this.scene.canvas.clientWidth;
    const canvasHeight = this.scene.canvas.clientHeight;
    if (
      this.scene.mode !== this.lastSceneMode ||
      canvasWidth !== this.lastCanvasWidth ||
      canvasHeight !== this.lastCanvasHeight
    ) {
      // 模式/尺寸变化会改变可见范围或有效性，优先立即刷新，避免等待相机事件。
      this.refresh();
      return;
    }
    if (this.scene.mode !== Cesium.SceneMode.SCENE3D ||
      canvasWidth <= 0 || canvasHeight <= 0) return;
    const gridCameraChanged = !Cesium.Matrix4.equals(
      this.scene.camera.viewMatrix,
      this.lastGridViewMatrix,
    ) || !Cesium.Matrix4.equals(
      this.scene.camera.frustum.projectionMatrix,
      this.lastGridProjectionMatrix,
    );
    const pixelRatio = window.devicePixelRatio || 1;
    // 从普通屏幕移到高分屏时相机可以完全不动，但标签 backing store 需要重建。
    if (pixelRatio !== this.lastPixelRatio) this.labelsDirty = true;
    const refreshInterval = this.isLargeView()
      ? Math.max(
          this.options.refreshInterval,
          this.options.largeViewRefreshInterval,
        )
      : this.options.refreshInterval;
    if (
      gridCameraChanged &&
      now - this.lastGridRefresh >= refreshInterval
    ) {
      this.refresh();
      return;
    }
    // 标签可以比几何更频繁地跟随相机，但只在到达标签节流间隔后请求真正的一帧。
    // 这样运动最后一次变化即使曾被节流，也不会因按需渲染已停而永久留在旧画面。
    if (!(this.cameraMoving && this.isLargeView()) &&
      (this.labelsDirty || this.hasLabelViewChanged()) &&
      now - this.lastLabelUpdate >= this.options.labelUpdateInterval) {
      this.scene.requestRender();
    }
  };

  /**
   * 即将绘制的一帧中重算标签，让 worldToWindowCoordinates 使用该帧的相机状态。
   * labelsDirty 表示数据/像素倍率变化，优先更新；纯相机变化则按标签间隔节流。
   */
  private readonly handlePreRender = (): void => {
    if (this.destroyed || !this.visible ||
      this.scene.mode !== Cesium.SceneMode.SCENE3D) return;
    const now = performance.now();
    if (this.cameraMoving && this.isLargeView()) {
      this.labelOverlay.show = false;
      return;
    }
    if (
      !this.labelsDirty &&
      (!this.hasLabelViewChanged() ||
        now - this.lastLabelUpdate < this.options.labelUpdateInterval)
    ) {
      return;
    }

    Cesium.Matrix4.clone(this.scene.camera.viewMatrix, this.lastViewMatrix);
    Cesium.Matrix4.clone(
      this.scene.camera.frustum.projectionMatrix,
      this.lastProjectionMatrix,
    );
    this.lastLabelUpdate = now;
    this.lastPixelRatio = window.devicePixelRatio || 1;
    this.labelsDirty = false;
    this.labelOverlay.update(this.lines);
    this.labelOverlay.show = this.visible;
  };

  /** 标签既受相机位姿影响，也受投影矩阵影响；只比较位置会漏掉 FOV 变化。 */
  private hasLabelViewChanged(): boolean {
    return !Cesium.Matrix4.equals(this.scene.camera.viewMatrix, this.lastViewMatrix) ||
      !Cesium.Matrix4.equals(
        this.scene.camera.frustum.projectionMatrix,
        this.lastProjectionMatrix,
      );
  }

  /** 以当前可见投影带数量判断计算负担，而不是简单使用一个固定相机高度。 */
  private isLargeView(): boolean {
    return (
      (this.currentStatus?.zoneNumbers.length ?? 0) >=
      this.options.largeViewZoneThreshold
    );
  }

  /** 清空几何、标签和状态，并只在状态确实由“有”变“无”时发出 changed。 */
  private clearGrid(): void {
    const hadStatus = this.currentStatus !== undefined;
    this.lines = [];
    this.primitive.set([]);
    this.primitive.show = false;
    this.currentStatus = undefined;
    this.labelsDirty = false;
    this.labelOverlay.update([]);
    this.labelOverlay.show = false;
    this.scene.requestRender();
    if (hadStatus) this.changed.raiseEvent(undefined);
  }
}

/** @deprecated 兼容旧命名；新代码请使用 GaussKrugerGrid。 */
export { GaussKrugerGrid as GaussKrugerNeighborGrid };
/** @deprecated 兼容旧命名；实现是高斯—克吕格格网，新代码请使用 GaussKrugerGrid。 */
export { GaussKrugerGrid as WebMercatorSquareGrid };
