import * as Cesium from "cesium";

/** 0：面向屏幕；1：平躺在当地 ENU 地面平面。 */
export type CircleTextDisplayMode = 0 | 1;

/**
 * 九宫格锚点。
 *
 * ```text
 * 0 左上   1 上中   2 右上
 * 3 左中   4 中心   5 右中
 * 6 左下   7 下中   8 右下
 * ```
 */
export type PlaneAnchor = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/** 基于目标点当地 ENU 坐标系的米制 XY 偏移。 */
export interface LocalOffset {
  /** X 轴：向东；billboard 模式下为屏幕右方，单位：米。 */
  x: number;
  /** Y 轴：向北；billboard 模式下为屏幕上方，单位：米。 */
  y: number;
}

/**
 * 文字相对目标原点的 CSS 像素偏移。
 * 平躺模式会先换算为当前视距对应的地球平面距离，再沿 ENU 平移。
 */
export interface ScreenOffset {
  /** 面向屏幕：向右为正；平躺：换算后沿 ENU X 轴向东，单位：CSS 像素。 */
  x: number;
  /** 面向屏幕：向下为正；平躺：换算后沿 ENU Y 轴向北，单位：CSS 像素。 */
  y: number;
}

/**
 * 与 Cesium.Label.ConstructorOptions 同名的文字绘制参数子集。
 * Plane 的位置、锚点和偏移由外层参数控制。
 */
export interface CircleTextLabelOptions {
  text?: string;
  font?: string;
  style?: Cesium.LabelStyle;
  scale?: number;
  showBackground?: boolean;
  backgroundColor?: Cesium.Color;
  backgroundPadding?: Cesium.Cartesian2;
  fillColor?: Cesium.Color;
  outlineColor?: Cesium.Color;
  outlineWidth?: number;
  /**
   * @deprecated 原生 LabelCollection 自行管理 SDF 字形纹理，不再使用此参数。
   */
  resolutionScale?: number;
}

export type EllipseImageSource = string | CanvasImageSource;

/** 创建或重建单个椭圆文字目标的参数。 */
export interface CircleTextPrimitiveOptions {
  id?: string;
  longitude: number;
  latitude: number;
  height?: number;
  /** 椭圆沿局部 X 轴的完整宽度，单位：米。 */
  ellipseWidth?: number;
  /** 椭圆沿局部 Y 轴的完整高度，单位：米。 */
  ellipseHeight?: number;
  /** 图片纹理顺时针旋转角度，椭圆几何和锚点保持不动，单位：度。 */
  ellipseRotation?: number;
  ellipseImage?: EllipseImageSource;
  ellipseAnchor?: PlaneAnchor;
  ellipseOffset?: LocalOffset;
  /** @deprecated 原生 Label 使用字体像素尺寸，不再创建文字 Plane。 */
  textHeight?: number;
  label?: CircleTextLabelOptions;
  textAnchor?: PlaneAnchor;
  /** 文字像素偏移；平躺模式会换算为 ENU 地球平面位移。 */
  textOffset?: ScreenOffset;
  /** 整个目标的总显隐开关。 */
  show?: boolean;
  /** 椭圆独立显隐开关，需与 show 同时为 true。 */
  ellipseShow?: boolean;
  /** 文字独立显隐开关，需与 show 同时为 true。 */
  textShow?: boolean;
  /** 相机达到此高度后隐藏当前目标，单位：km。 */
  maximumVisibleHeight?: number;
  /** 椭圆显示模式：0 面向屏幕，1 平躺。 */
  ellipseMode?: CircleTextDisplayMode;
  /**
   * @deprecated 原生 LabelCollection 的文字始终面向屏幕；该字段仅为兼容旧数据。
   */
  textMode?: CircleTextDisplayMode;
  /**
   * 同时设置椭圆和文字模式的兼容参数。
   * @deprecated 请分别使用 ellipseMode 和 textMode。
   */
  mode?: CircleTextDisplayMode;
}

export type CircleTextPrimitiveEditOptions = Partial<
  Omit<CircleTextPrimitiveOptions, "id">
>;

/** 由管理层内所有目标共享的距离缩放参数。 */
export interface CircleTextSharedDisplayOptions {
  nearDistance: number;
  farDistance: number;
  nearScale: number;
  farScale: number;
}

/** 管理层构造参数；几何和文字配置作为 add() 的默认值。 */
export interface CircleTextPrimitiveLayerOptions {
  /** 可容纳的 Data 实例总数。 */
  capacity?: number;
  /** 新增目标默认使用的椭圆显示模式。 */
  defaultEllipseMode?: CircleTextDisplayMode;
  /** 新增目标默认使用的文字显示模式。 */
  defaultTextMode?: CircleTextDisplayMode;
  /**
   * 同时设置两者默认模式的兼容参数。
   * @deprecated 请分别使用 defaultEllipseMode 和 defaultTextMode。
   */
  defaultMode?: CircleTextDisplayMode;
  height?: number;
  ellipseWidth?: number;
  ellipseHeight?: number;
  ellipseRotation?: number;
  ellipseImage?: EllipseImageSource;
  ellipseAnchor?: PlaneAnchor;
  ellipseOffset?: LocalOffset;
  textHeight?: number;
  label?: CircleTextLabelOptions;
  textAnchor?: PlaneAnchor;
  textOffset?: ScreenOffset;
  nearDistance?: number;
  farDistance?: number;
  nearScale?: number;
  farScale?: number;
}

/** @internal 标准化后的 Label 参数。 */
export interface NormalizedLabelOptions {
  text: string;
  font: string;
  style: Cesium.LabelStyle;
  scale: number;
  showBackground: boolean;
  backgroundColor: Cesium.Color;
  backgroundPadding: Cesium.Cartesian2;
  fillColor: Cesium.Color;
  outlineColor: Cesium.Color;
  outlineWidth: number;
  resolutionScale: number;
}

/** @internal 标准化后的单体参数。 */
export interface NormalizedCircleTextOptions {
  id: string;
  longitude: number;
  latitude: number;
  height: number;
  ellipseWidth: number;
  ellipseHeight: number;
  ellipseRotation: number;
  ellipseImage: EllipseImageSource;
  ellipseAnchor: PlaneAnchor;
  ellipseOffset: LocalOffset;
  textHeight: number;
  label: NormalizedLabelOptions;
  textAnchor: PlaneAnchor;
  textOffset: ScreenOffset;
  show: boolean;
  ellipseShow: boolean;
  textShow: boolean;
  maximumVisibleHeight: number;
  ellipseMode: CircleTextDisplayMode;
  textMode: CircleTextDisplayMode;
}

/** @internal 管理层解析后的完整默认值。 */
export interface ResolvedLayerOptions
  extends CircleTextSharedDisplayOptions {
  capacity: number;
  defaultEllipseMode: CircleTextDisplayMode;
  defaultTextMode: CircleTextDisplayMode;
  height: number;
  ellipseWidth: number;
  ellipseHeight: number;
  ellipseRotation: number;
  ellipseImage: EllipseImageSource;
  ellipseAnchor: PlaneAnchor;
  ellipseOffset: LocalOffset;
  textHeight: number;
  label: CircleTextLabelOptions;
  textAnchor: PlaneAnchor;
  textOffset: ScreenOffset;
}
