import type * as Cesium from "cesium";

/**
 * 公共配置与状态契约。除字段另有说明外，距离单位为米、时间单位为毫秒。
 * 米制格距、曲线采样步长和屏幕像素线宽分别作用于不同阶段，不应混用。
 */
/** bounded：固定格距；lod：随视距与视域选择格距。 */
export type GaussKrugerGridCalculationMode = "bounded" | "lod";

/** 一个候选 LOD 层级；视域过大时，即使高度满足条件也可能选更粗层级。 */
export interface GaussKrugerGridSpacingLevel {
  /** 相机椭球高度上限，单位米；最后一项可用 Infinity 覆盖更远视角。 */
  maximumCameraHeight: number;
  /** 该层级的投影平面格距，单位米；不表示地表处处精确等长。 */
  gridSpacing: number;
}

/**
 * GaussKrugerGrid 的构造选项。构造时补齐默认值并校验，层级和颜色会复制，
 * 因而调用方后续修改原始数组或颜色不会暗中改变已创建格网。
 * 这些选项不是响应式属性；示例切换计算方式时销毁旧实例，再用新配置创建。
 */
export interface GaussKrugerGridOptions {
  /**
   * bounded 始终使用 gridSpacing；低空视域超预算时限制到相机附近，高空超预算时隐藏。
   * lod 根据高度和视域选取 spacingLevels，不应用固定模式的视域阈值，
   * 但仍受候选线/采样点预算约束。省略时：传 gridSpacing 则 bounded，否则 lod。
   */
  calculationMode?: GaussKrugerGridCalculationMode;
  /** 分带宽度，默认 6°；3° 与 6° 使用不同带号公式。 */
  zoneWidthDegrees?: 3 | 6;
  /**
   * 固定投影带；省略时按视域选择多个带，并分别裁切到各自带界。
   * 全球周期编号：6° 为 1..60；3° 为 0..119（Greenwich 为 0 带）。
   * 中国境外编号是数学扩展，不代表注册的 CGCS2000 EPSG 坐标参考系。
   */
  zoneNumber?: number;
  /**
   * 固定模式的投影格距，默认 1000 m，即投影平面上一公里一格。
   * LOD 的格距取自 spacingLevels；这里不是折线采样间距。
   */
  gridSpacing?: number;
  /** 高度上限须非负且严格递增，格距须为正且不递减；默认层级覆盖 100 m～2000 km。 */
  spacingLevels?: readonly GaussKrugerGridSpacingLevel[];
  /** 经纬度视域外扩比例，默认 0.12；预留移动余量，降低画面边缘暂时缺线的机会。 */
  viewPadding?: number;
  /**
   * 投影轴线数预算/目标，默认 28。bounded 据此限制低空范围或隐藏高空格网，lod 用它选层；
   * 多带、裁切片段和东向格距上限会影响最终线数，不是最终片段数的硬上限。
   */
  maximumLinesPerAxis?: number;
  /**
   * LOD 东坐标格距上限，默认 500000 m。远景北向格距可继续加大；
   * 东向封顶为 500 km 时，E=500000 m 的中央经线仍属于整格距候选线。
   * 该线仍需经过视域、纬度和地平线裁切，不保证始终可见。
   */
  maximumEastingSpacing?: number;
  /** 每条坐标线的反投影采样步长上限，单位米；省略时结合曲率、视距和高度估算。 */
  sampleSpacing?: number;
  /** 距 WGS84 椭球面的正高度，默认 100 m；未采样地形，不等于地面以上高度。 */
  altitude?: number;
  /** 全部线共享的颜色 uniform，默认白色且 alpha=0.82；各 RGBA 分量须在 0..1。 */
  lineColor?: Cesium.Color;
  /** 普通线宽，默认 1.25 CSS px；shader 再按画布像素倍率换算。 */
  lineWidth?: number;
  /** 每多少格强调一条主线，默认 10；按真实坐标索引取模，相机移动不改变对齐原点。 */
  majorLineEvery?: number;
  /** 主线宽，默认 2.5 CSS px；只改变显示宽度，不改变主线坐标。 */
  majorLineWidth?: number;
  /** 标签屏幕间距目标，默认 72 CSS px；结合字宽和抽稀策略，不保证每条线有标签。 */
  minimumLabelSpacing?: number;
  /** 标签 backing-store 最小倍率，默认 2；同时参考 devicePixelRatio，最终倍率上限 4。 */
  labelPixelRatio?: number;
  /** 相机变化时几何重建的节流间隔，默认 80 ms；移动结束会主动刷新。 */
  refreshInterval?: number;
  /** 相机变化时标签屏幕投影的节流间隔，默认 32 ms；几何重建后脏标签可立即刷新。 */
  labelUpdateInterval?: number;
  /** 多带视域的几何节流间隔，默认 250 ms；实际取其与 refreshInterval 的较大值。 */
  largeViewRefreshInterval?: number;
  /** 达到多少带视为大范围，默认 4；移动中放缓重建并暂时隐藏标签。 */
  largeViewZoneThreshold?: number;
}

/**
 * 最近一次几何构建的结果摘要；高度等信息不是每帧采集的实时仪表值。
 * 无可构建范围/预算超限等情况下 grid.status 为 undefined；
 * 范围有效但恰无坐标线穿过时，也可能存在状态对象且 segmentCount=0。
 */
export interface GaussKrugerGridStatus {
  /** 实际采用的计算模式。 */
  calculationMode: GaussKrugerGridCalculationMode;
  /** 构建时的相机椭球高度（米），负值按 0 统计。 */
  cameraHeight: number;
  /** 是否因低空视域过大而仅生成相机附近格网；格距不变，远处可能没有网格覆盖。 */
  rangeLimited: boolean;
  /** 当前基础 LOD 格距（米），实现中与 northingGridSpacing 相同。 */
  gridSpacing: number;
  /** 相邻等东坐标线的投影坐标差（米），LOD 下可能与北向格距不同。 */
  eastingGridSpacing: number;
  /** 相邻等北坐标线的投影坐标差（米）。 */
  northingGridSpacing: number;
  /** 本次构建的投影带宽（度）。 */
  zoneWidthDegrees: 3 | 6;
  /** 参与构建的带号，已去重；某个带可能裁切后未留下可见线段。 */
  zoneNumbers: readonly number[];
  /** 各参与带的中央经线（度），西经为负，已去重；不是弧度。 */
  centralMeridians: readonly number[];
  /** 等东坐标线裁切后的片段数；旋转视图后不一定在屏幕上呈竖直方向。 */
  verticalLineCount: number;
  /** 等北坐标线裁切后的片段数；同一坐标线可被裁成多个片段。 */
  horizontalLineCount: number;
  /** 所有折线片段的相邻点对数量之和，也是 GPU 实例数量。 */
  segmentCount: number;
  /** 本包的逻辑 DrawCommand 数（0 或 1），不包含标签或 Cesium 衍生渲染 pass。 */
  drawCommandCount: number;
}

/** @deprecated 历史名称兼容；新代码使用 GaussKrugerGridOptions。 */
export type GaussKrugerNeighborGridOptions = GaussKrugerGridOptions;

/** @deprecated 历史名称兼容；实际是高斯投影，使用 GaussKrugerGridSpacingLevel。 */
export type WebMercatorGridSpacingLevel = GaussKrugerGridSpacingLevel;
/** @deprecated 历史名称兼容；新代码使用 GaussKrugerGridOptions。 */
export type WebMercatorSquareGridOptions = GaussKrugerGridOptions;
/** @deprecated 历史名称兼容；新代码使用 GaussKrugerGridStatus。 */
export type WebMercatorGridStatus = GaussKrugerGridStatus;
