import * as Cesium from "cesium";
import type { GaussKrugerGridOptions, GaussKrugerGridStatus } from "./types.js";
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
export declare class GaussKrugerGrid {
    /** 每次几何重建后通知订阅者；从有格网变为无格网时参数为 undefined。 */
    readonly changed: Cesium.Event<(...args: any[]) => void>;
    private readonly scene;
    private readonly options;
    private readonly primitive;
    private readonly labelOverlay;
    private readonly removeMoveStartListener;
    private readonly removeMoveEndListener;
    private readonly removePreUpdateListener;
    private readonly removePreRenderListener;
    private readonly lastViewMatrix;
    private readonly lastGridViewMatrix;
    private readonly lastProjectionMatrix;
    private readonly lastGridProjectionMatrix;
    private lastSceneMode;
    private lastPixelRatio;
    private lines;
    private currentStatus;
    private lastCanvasWidth;
    private lastCanvasHeight;
    private lastGridRefresh;
    private lastLabelUpdate;
    private labelsDirty;
    private cameraMoving;
    private visible;
    private destroyed;
    /**
     * 校验 Scene/参数，创建自有资源并订阅 Cesium 生命周期，最后生成首批格网。
     * WGS84 检查针对 Cesium 显示椭球；投影采用的 GRS80 参数由投影模块管理。
     */
    constructor(scene: Cesium.Scene, options?: GaussKrugerGridOptions);
    /** 调用方要求的可见状态；非三维模式或无有效范围时实际图形仍可能隐藏。 */
    get show(): boolean;
    /** 切换显示并请求一帧；恢复显示时重建，以免继续使用隐藏期间过期的视野。 */
    set show(value: boolean);
    /** 最近一次有效几何构建的统计快照，适合用于示例面板或 changed 事件展示。 */
    get status(): GaussKrugerGridStatus | undefined;
    /**
     * 立即按当前相机重新计算可见投影范围，并把三维折线写入 primitive 的 CPU 缓冲。
     * 真正的 GPU 上传发生在 primitive.update；标签在随后 preRender 中更新。
     * 此方法可由调用方主动使用，不受相机运动的节流条件限制。
     */
    refresh(): void;
    /** 允许调用方和 Scene 所属的 PrimitiveCollection 检查资源是否已经释放。 */
    isDestroyed(): boolean;
    /**
     * 幂等销毁：先停止事件回调，再移除图元、释放 GPU 资源及 DOM Canvas。
     * 不销毁外部传入的 Scene/Viewer，调用方仍负责它们的生命周期。
     */
    destroy(): void;
    /** 移动开始只改变调度状态；多带标签暂时隐藏，避免重投影开销和频繁跳动。 */
    private readonly handleMoveStart;
    /** 移动结束不再等节流窗口，立即补上准确的最终几何并允许标签重新显示。 */
    private readonly handleMoveEnd;
    /**
     * 更新阶段负责检测变化和发起渲染请求。
     * Cesium 的 requestRenderMode 可跳过绘制，但 preUpdate 仍执行；把检测放在这里，
     * 才能在没有连续渲染的场景里发现 FOV、DPR 或节流窗口结束后的待刷新内容。
     */
    private readonly handlePreUpdate;
    /**
     * 即将绘制的一帧中重算标签，让 worldToWindowCoordinates 使用该帧的相机状态。
     * labelsDirty 表示数据/像素倍率变化，优先更新；纯相机变化则按标签间隔节流。
     */
    private readonly handlePreRender;
    /** 标签既受相机位姿影响，也受投影矩阵影响；只比较位置会漏掉 FOV 变化。 */
    private hasLabelViewChanged;
    /** 以当前可见投影带数量判断计算负担，而不是简单使用一个固定相机高度。 */
    private isLargeView;
    /** 清空几何、标签和状态，并只在状态确实由“有”变“无”时发出 changed。 */
    private clearGrid;
}
/** @deprecated 兼容旧命名；新代码请使用 GaussKrugerGrid。 */
export { GaussKrugerGrid as GaussKrugerNeighborGrid };
/** @deprecated 兼容旧命名；实现是高斯—克吕格格网，新代码请使用 GaussKrugerGrid。 */
export { GaussKrugerGrid as WebMercatorSquareGrid };
//# sourceMappingURL=GaussKrugerGrid.d.ts.map