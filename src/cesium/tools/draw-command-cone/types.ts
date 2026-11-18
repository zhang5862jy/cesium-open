import type * as Cesium from "cesium";

/** 单个圆锥实例使用的表面材质类型。 */
export type ConeMaterialType = "transparent" | "wave" | "gradient";

/**
 * 提交给 {@link DrawCommandConePrimitive} 的单个圆锥实例数据。
 *
 * `start` 是起始截面中心；`direction` 是从起始截面指向结束截面的 ECEF
 * 方向向量。距离单位均为米，方向向量不要求预先归一化。
 */
export interface DrawCommandConeInstance {
  start: Cesium.Cartesian3;
  length: number;
  /** 起始截面半径，单位为米；设置为 0 时形成圆锥尖端。 */
  startRadius: number;
  /** 圆锥完整张角，单位为弧度；必须大于 0 且小于 PI。 */
  angle: number;
  direction: Cesium.Cartesian3;
  type: ConeMaterialType;
  /** 波纹或分段渐变的动画速度倍数；设置为 0 时暂停动画。 */
  animationSpeed: number;
  /** 波纹材质的圆环数量，或分段渐变材质的渐变段数量。 */
  materialCount: number;
  color: Cesium.Color;
}

/** 所有圆锥实例工厂方法共用的参数。 */
export interface DrawCommandConeCommonOptions {
  color: Cesium.Color;
  position: Cesium.Cartesian3;
  startRadius: number;
  type: ConeMaterialType;
  animationSpeed: number;
  /** 波纹材质的圆环数量，或分段渐变材质的渐变段数量。 */
  materialCount: number;
  /** 圆锥完整张角，单位为弧度。 */
  angle: number;
}

/** 根据起点和终点自动计算方向与长度的圆锥参数。 */
export interface DrawCommandConeFromEndPositionOptions
  extends DrawCommandConeCommonOptions {
  endPosition: Cesium.Cartesian3;
}

/** 根据 ENU 坐标系下的 HeadingPitchRoll 姿态和长度创建圆锥参数。 */
export interface DrawCommandConeFromHeadingPitchRollOptions
  extends DrawCommandConeCommonOptions {
  /** 在 `position` 处旋转圆锥本地的 -Z 前进轴。 */
  direction: Cesium.HeadingPitchRoll;
  length: number;
}

/** RenderState 中使用的矩形参数。 */
export interface DrawCommandConeRenderStateRectangle {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

/** RenderState 中使用的模板操作参数。 */
export interface DrawCommandConeStencilOperation {
  fail?: number;
  zFail?: number;
  zPass?: number;
}

/**
 * 传递给 Cesium RenderState.fromCache 的渲染状态。
 *
 * 所有字段均为可选项；未传字段直接使用 Cesium RenderState 的默认值。
 * 枚举字段可传入 Cesium 对应的 WindingOrder、CullFace、DepthFunction、
 * BlendEquation、BlendFunction、StencilFunction 和 StencilOperation 值。
 */
export interface DrawCommandConeRenderStateOptions {
  frontFace?: number;
  cull?: {
    enabled?: boolean;
    face?: number;
  };
  lineWidth?: number;
  polygonOffset?: {
    enabled?: boolean;
    factor?: number;
    units?: number;
  };
  scissorTest?: {
    enabled?: boolean;
    rectangle?: DrawCommandConeRenderStateRectangle;
  };
  depthRange?: {
    near?: number;
    far?: number;
  };
  depthTest?: {
    enabled?: boolean;
    func?: number;
  };
  colorMask?: {
    red?: boolean;
    green?: boolean;
    blue?: boolean;
    alpha?: boolean;
  };
  depthMask?: boolean;
  stencilMask?: number;
  blending?: {
    enabled?: boolean;
    color?: Cesium.Color;
    equationRgb?: number;
    equationAlpha?: number;
    functionSourceRgb?: number;
    functionSourceAlpha?: number;
    functionDestinationRgb?: number;
    functionDestinationAlpha?: number;
  };
  stencilTest?: {
    enabled?: boolean;
    frontFunction?: number;
    backFunction?: number;
    reference?: number;
    mask?: number;
    frontOperation?: DrawCommandConeStencilOperation;
    backOperation?: DrawCommandConeStencilOperation;
  };
  sampleCoverage?: {
    enabled?: boolean;
    value?: number;
    invert?: boolean;
  };
  viewport?: DrawCommandConeRenderStateRectangle;
}

export interface DrawCommandConePrimitiveOptions {
  /** setInstances() 可接收的最大实例数量。 */
  capacity?: number;
  /** Cesium.CylinderGeometry 使用的径向分段数量。 */
  slices?: number;
  /** 所有实例共享的 RenderState；未传字段使用 Cesium 默认值。 */
  renderState?: DrawCommandConeRenderStateOptions;
}
