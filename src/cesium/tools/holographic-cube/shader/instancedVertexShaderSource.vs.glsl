// ============================================================================
// 实例化顶点着色器（批量全息立方体）
// ============================================================================
// 与单个立方体的差异：额外接收 5 组「逐实例」属性（instanceDivisor=1），
// 把同一份单位立方体网格，按每个实例的位置 / 姿态 / 缩放 / 颜色，
// 分别变换到各自的世界坐标，从而在【一次 draw call】里画出成千上万个立方体。
// ============================================================================

in vec3 position;
in vec3 normal;
in vec2 st;

// 逐实例属性（每个实例取一次，而非每个顶点取一次）
in vec3 instancePositionHigh; // 实例世界坐标的高位部分（大坐标拆分，保证精度）
in vec3 instancePositionLow;  // 实例世界坐标的低位部分
in vec4 instanceQuaternion;   // 实例姿态四元数
in vec3 instanceScale;        // 实例三轴缩放
in vec4 instanceColor;        // 实例颜色

out vec3 v_normalEC;
out vec2 v_st;
out vec3 v_localPosition;
out vec4 v_color;

// 用四元数旋转一个向量（GLSL 无内建，手动展开旋转公式）
vec3 rotateByQuaternion(vec3 value, vec4 quaternion) {
  return value + 2.0 * cross(quaternion.xyz, cross(quaternion.xyz, value) + quaternion.w * value);
}

void main() {
  // 1) 缩放局部坐标，得到实例尺度下的局部位置
  vec3 localPosition = position * instanceScale;

  // 2) 四元数旋转到世界方向
  vec3 worldOffset = rotateByQuaternion(localPosition, instanceQuaternion);

  // 3) 相对眼位置平移：instancePositionHigh/Low 是同一个大坐标拆成的两段，
  //    czm_translateRelativeToEye 把它们合并起来并相对相机平移，避免精度丢失。
  vec4 positionRTE = czm_translateRelativeToEye(
    instancePositionHigh,
    instancePositionLow + worldOffset
  );

  // 4) 法线：局部法线除以缩放（近似抵消非均匀缩放），归一化后旋转到世界方向，
  //    再用 czm_viewRotation（世界 -> 眼空间的旋转矩阵）转到眼空间。
  vec3 localNormal = normalize(normal / max(instanceScale, vec3(0.0001)));
  vec3 worldNormal = rotateByQuaternion(localNormal, instanceQuaternion);
  v_normalEC = normalize(czm_viewRotation * worldNormal);

  // 5) 其余 varying：UV 原样；局部坐标用未缩放的单位立方体坐标（保证颜色
  //    渐变尺度一致）；颜色用实例颜色染色。
  v_st = st;
  v_localPosition = position;
  v_color = instanceColor;

  // 6) 投影：相对眼 modelViewProjection，一步到位。
  gl_Position = czm_modelViewProjectionRelativeToEye * positionRTE;
}
