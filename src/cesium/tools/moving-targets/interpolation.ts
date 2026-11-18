import * as Cesium from "cesium";

const SLERP_LINEAR_THRESHOLD = 0.9995;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * 根据前后两个数据点的时间计算当前时刻所处比例。
 * 该函数及本文件中的插值均为本地实现，不调用 Cesium 的插值属性或算法。
 */
export function getInterpolationAmount(
  time: number,
  startTime: number,
  endTime: number,
): number {
  if (endTime <= startTime) return 0;
  return clamp01((time - startTime) / (endTime - startTime));
}

export function interpolateNumber(
  start: number,
  end: number,
  amount: number,
): number {
  return start + (end - start) * amount;
}

/** 沿最短角度方向插值，避免 359° 到 1° 绕行 358°。 */
export function interpolateAngle(
  start: number,
  end: number,
  amount: number,
): number {
  const twoPi = Math.PI * 2;
  const difference =
    ((((end - start + Math.PI) % twoPi) + twoPi) % twoPi) - Math.PI;
  return start + difference * amount;
}

/**
 * 自写单位四元数球面线性插值。
 *
 * - dot < 0 时反转终点四元数，选择同一旋转的最短球面路径。
 * - 两个姿态非常接近时退化为归一化线性插值，避免 sin(theta) 接近 0。
 * - 其余情况使用标准 SLERP 权重。
 */
export function slerpQuaternion(
  start: Cesium.Quaternion,
  end: Cesium.Quaternion,
  amount: number,
  result: Cesium.Quaternion,
): Cesium.Quaternion {
  const t = clamp01(amount);
  let endX = end.x;
  let endY = end.y;
  let endZ = end.z;
  let endW = end.w;
  let dot =
    start.x * endX +
    start.y * endY +
    start.z * endZ +
    start.w * endW;

  if (dot < 0) {
    dot = -dot;
    endX = -endX;
    endY = -endY;
    endZ = -endZ;
    endW = -endW;
  }
  dot = Math.max(-1, Math.min(1, dot));

  let startWeight: number;
  let endWeight: number;
  if (dot > SLERP_LINEAR_THRESHOLD) {
    startWeight = 1 - t;
    endWeight = t;
  } else {
    const theta = Math.acos(dot);
    const inverseSinTheta = 1 / Math.sin(theta);
    startWeight = Math.sin((1 - t) * theta) * inverseSinTheta;
    endWeight = Math.sin(t * theta) * inverseSinTheta;
  }

  result.x = start.x * startWeight + endX * endWeight;
  result.y = start.y * startWeight + endY * endWeight;
  result.z = start.z * startWeight + endZ * endWeight;
  result.w = start.w * startWeight + endW * endWeight;

  const magnitude = Math.hypot(result.x, result.y, result.z, result.w);
  if (magnitude > 0) {
    result.x /= magnitude;
    result.y /= magnitude;
    result.z /= magnitude;
    result.w /= magnitude;
  } else {
    result.x = 0;
    result.y = 0;
    result.z = 0;
    result.w = 1;
  }
  return result;
}

