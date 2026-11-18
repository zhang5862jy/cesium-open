import * as Cesium from "cesium";
import type { ProjectedGridLine } from "./gridGeometry.js";
/** 标签布局距离使用 CSS 像素；pixelRatio 只影响 Canvas backing store 的清晰度。 */
export interface ScreenGridLabelOverlayOptions {
    minimumSpacing: number;
    pixelRatio: number;
}
/**
 * 覆盖在 Cesium Canvas 上方的 HiDPI 二维标签层，自身不参与 WebGL 后处理采样。
 *
 * 所有布局先按 CSS 像素计算，最终由 2D context 的缩放变换画到更高分辨率的像素
 * 缓冲，保证文字清晰。标签按真实屏幕边缘间距抽稀，并锚定到投影坐标的整数索引，
 * 尽量避免相机平移时标签集合无规律变化。图层不接收鼠标事件，不干扰 Cesium 交互。
 */
export declare class ScreenGridLabelOverlay {
    private readonly scene;
    private readonly options;
    private readonly canvas;
    private readonly context;
    private readonly projectedPoints;
    private readonly textWidths;
    private axisBorders;
    private visible;
    private destroyed;
    /** 创建自有 Canvas 并挂到 Cesium Canvas 的父容器；位置和大小会在 update 中对齐。 */
    constructor(scene: Cesium.Scene, options: ScreenGridLabelOverlayOptions);
    /** 返回标签层自身的显示开关，不代表本次一定存在可绘制标签。 */
    get show(): boolean;
    /** 只切换 DOM 可见性；隐藏期间保留 Canvas 与文本缓存，便于快速恢复。 */
    set show(value: boolean);
    /**
     * 重绘一帧标签，返回最终通过抽稀的数量。
     * 调用方负责刷新频率；本方法每次都按当前相机重新投屏、判断轴方向和收集交点。
     */
    update(lines: readonly ProjectedGridLine[]): number;
    /** 移除自有 DOM 节点并清空缓存；幂等操作，不改变 Cesium Canvas 本身。 */
    destroy(): void;
}
/**
 * 导出便于面板/日志使用的完整坐标文本，采用国内测绘约定：X 为北坐标，Y 为东坐标。
 * 北坐标：X=N/1000 km；东坐标：Y=(带号×1000000+带内东坐标 E)/1000 km。
 * 带号前缀仅用于显示，不参与投影正反算。例如 20 带 E=500000 m → Y 20500 km。
 */
export declare function formatGridCoordinate(line: Pick<ProjectedGridLine, "axis" | "coordinate" | "zoneNumber">): string;
//# sourceMappingURL=screenLabels.d.ts.map