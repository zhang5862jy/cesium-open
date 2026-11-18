import * as Cesium from "cesium";
import type { GaussKrugerGridCalculationMode, GaussKrugerGridSpacingLevel, GaussKrugerGridStatus, GaussKrugerGridOptions } from "./types.js";
/**
 * CPU 几何流水线：相机视野 → 分带交集 → 投影米制范围 → 格距/采样决策
 * → 等东/北坐标线 → 反投影、裁切 → ECEF 三维折线。
 * 此模块不创建 GPU 资源；渲染器和标签模块共同消费这里输出的折线数据。
 */
/** 标识一条线保持不变的坐标轴；easting 线固定 E、沿 N 延伸，反之亦然。 */
export type GridAxis = "easting" | "northing";
/** 一条裁切后的连续折线片段；同一原始坐标线可能输出多个片段。 */
export interface ProjectedGridLine {
    /** 固定的坐标轴，不代表该线在旋转后的屏幕上一定竖直或水平。 */
    axis: GridAxis;
    /** 固定坐标的米制值；easting 不含百万位带号。 */
    coordinate: number;
    /** 所属投影带，用于标签显示与调试。 */
    zoneNumber: number;
    /** 是否满足“每 majorLineEvery 个格距一条主线”的索引规则。 */
    isMajor: boolean;
    /** WGS84 显示椭球上的 ECEF 坐标（米），相邻点组成 GPU 线段实例。 */
    positions: Cesium.Cartesian3[];
}
/** 一次几何生成的结果；状态中的线数按裁切后的片段计数。 */
export interface BuiltVisibleGrid {
    lines: ProjectedGridLine[];
    status: GaussKrugerGridStatus;
}
/**
 * 已填入默认值并校验的内部配置。所有空间长度使用米；线宽/标签间隔用 CSS 像素；
 * 刷新间隔用毫秒。保留 undefined 的字段表示自动选择，而不是零值。
 */
export interface ResolvedGridOptions {
    /** bounded 保持固定格距；lod 随视距和投影范围选择层级。 */
    calculationMode: GaussKrugerGridCalculationMode;
    /** 投影分带宽度（度）。 */
    zoneWidthDegrees: 3 | 6;
    /** 指定带号则只生成该带；undefined 则处理当前视野涉及的全部带。 */
    zoneNumber: number | undefined;
    /** bounded 模式下相邻坐标线的投影间距（米）。 */
    gridSpacing: number;
    /** lod 的高度阈值与对应格距表，已复制以避免外部修改影响内部状态。 */
    spacingLevels: readonly GaussKrugerGridSpacingLevel[];
    /** lod 东坐标格距上限（米），可使远景 E/N 两方向格距不同。 */
    maximumEastingSpacing: number;
    /** 在视野经纬度包围框外增加的比例余量，例如 0.12 表示各侧扩展跨度的 12%。 */
    viewPadding: number;
    /** bounded 的显示预算，以及 lod 选层时使用的目标密度；不是最终片段数硬上限。 */
    maximumLinesPerAxis: number;
    /** 调用方指定的折线采样步长上限（米）；与相邻格线之间的间距不同。 */
    sampleSpacing: number | undefined;
    /** 所有点相对显示椭球的高度（米），不贴地形。 */
    altitude: number;
    /** 已复制的线颜色，含透明度。 */
    lineColor: Cesium.Color;
    /** 普通线全宽（CSS 像素）。 */
    lineWidth: number;
    /** 主线周期，以格距索引而非数组位置判定。 */
    majorLineEvery: number;
    /** 主线全宽（CSS 像素）。 */
    majorLineWidth: number;
    /** 标签布局的最小屏幕间隔（CSS 像素）。 */
    minimumLabelSpacing: number;
    /** 标签 Canvas 的分辨率倍率，无量纲。 */
    labelPixelRatio: number;
    /** 普通视野几何刷新节流间隔（毫秒）。 */
    refreshInterval: number;
    /** 标签屏幕位置刷新节流间隔（毫秒）。 */
    labelUpdateInterval: number;
    /** 大视野下几何刷新节流间隔（毫秒）。 */
    largeViewRefreshInterval: number;
    /** 触发大视野刷新策略所需的可见带数阈值。 */
    largeViewZoneThreshold: number;
}
/**
 * 将公共可选参数整理为完整配置并集中校验；不保留调用方颜色和层级对象的引用。
 * 兼容“直接传 gridSpacing 表示固定格距”的用法，显式 calculationMode 优先。
 */
export declare function resolveGridOptions(options: GaussKrugerGridOptions): ResolvedGridOptions;
/**
 * 根据当前相机生成本次可显示的格网。输入是 Cesium 场景和已校验的配置，
 * 输出是连续三维片段及统计；无可见地表、无有效投影带或超预算时返回 undefined。
 * 整个过程只生成 CPU 数据，后续由 primitive 上传，标签层再投影到屏幕。
 */
export declare function buildVisibleGrid(scene: Cesium.Scene, options: ResolvedGridOptions): BuiltVisibleGrid | undefined;
//# sourceMappingURL=gridGeometry.d.ts.map