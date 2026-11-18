import type * as Cesium from "cesium";

/** 单个全息立方体的构造参数 */
export interface HolographicCubeOptions {
  /** 立方体中心的世界坐标（ECEF，米） */
  position: Cesium.Cartesian3;
  /** 立方体三轴尺寸（局部 ENU 框架下，米） */
  dimensions: Cesium.Cartesian3;
  /** 可选姿态（航向 / 俯仰 / 翻滚），缺省为不旋转 */
  orientation?: Cesium.HeadingPitchRoll;
}

/** 实例化批量立方体原语的构造参数 */
export interface InstancedHolographicCubeOptions {
  /** 最大可容纳的实例数（set() 时校验，超出会抛错） */
  capacity?: number;
  /** 未显式指定 color 的实例使用的默认颜色 */
  color?: Cesium.Color;
}

/** 一个实例立方体的数据（位置 / 姿态 / 缩放 / 颜色） */
export interface HolographicCubeData {
  /** 实例唯一标识（保留，便于后续按 id 定位更新） */
  id: string;
  /** 实例中心的世界坐标（ECEF，米） */
  position: Cesium.Cartesian3;
  /** 可选姿态 */
  orientation?: Cesium.HeadingPitchRoll;
  /** 缩放：传数字表示三轴等比，传 Cartesian3 表示各轴独立 */
  scale: number | Cesium.Cartesian3;
  /** 可选实例颜色（用于给全息效果染色） */
  color?: Cesium.Color;
}
