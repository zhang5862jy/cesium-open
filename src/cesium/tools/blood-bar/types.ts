import type * as Cesium from "cesium";

/**
 * 血条 Primitive 的构造参数。
 *
 * 这里的「默认宽高 / 背景颜色 / 血量颜色」是【整个 Primitive 共享】的（所有
 * 实例一致），因此它们在着色器里以 uniform 形式提供，而不是逐实例数据。
 */
export interface BloodBarOptions {
  /** 默认血条宽度（米）。实例的 scale.x 会再乘到它上面。 */
  width?: number;
  /** 默认血条高度（米）。实例的 scale.y 会再乘到它上面。 */
  height?: number;
  /** 血条背景颜色（未填充血量部分的底色）。 */
  backgroundColor?: Cesium.Color;
  /** 血条（血量）颜色，填充部分使用的颜色。 */
  color?: Cesium.Color;
  /** 最大可容纳的实例数（set() 时校验，超出会抛错）。 */
  capacity?: number;
}

/**
 * 一条血条实例的数据。
 *
 * 血条是「广告牌（billboard）式」的：始终面向屏幕。位置由 position 锚定，
 * scale 缩放宽高，offset 在屏幕平面内平移自身，percent 决定填充多少，
 * showHeight 决定相机拉到多高时隐藏这条血条。
 */
export interface BloodBarData {
  /** 实例唯一标识（保留，便于后续按 id 定位更新）。 */
  id: string;
  /** 血条锚点的世界坐标（ECEF，米）。 */
  position: Cesium.Cartesian3;
  /**
   * 三轴缩放。
   * - 传数字表示三轴等比；
   * - 传 Cartesian3 时 x 作用于宽度、y 作用于高度、z 对平面血条无视觉影响
   *   （保留是为与其它工具 API 对齐，方便将来扩展厚度）。
   */
  scale: number | Cesium.Cartesian3;
  /** 自身 xy 偏移（米）。在【屏幕平面】内，x 向右、y 向上平移整条血条。 */
  offset: Cesium.Cartesian2;
  /** 血量百分比，取值 [0, 1]。0 全空、1 满血。 */
  percent: number;
  /**
   * 显隐高度（米）：当相机「眼高度」（czm_eyeHeight，相机相对椭球面的高度）
   * 超过该值时，这条血条被隐藏，避免拉远后成千上万条血条糊成一团。
   */
  showHeight: number;
}
