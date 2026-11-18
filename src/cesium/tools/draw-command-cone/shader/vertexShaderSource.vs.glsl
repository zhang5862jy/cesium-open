in vec3 position;
in vec3 normal;
in vec3 instancePositionHigh;
in vec3 instancePositionLow;
in vec4 instanceQuaternion;
in vec3 instanceShape;
in vec4 instanceColor;
in vec3 instanceMaterial;

out vec3 v_normalEC;
flat out vec4 v_color;
out float v_axisProgress;
flat out float v_sideSurface;
flat out float v_materialType;
flat out float v_animationSpeed;
flat out float v_materialCount;

vec3 rotateByQuaternion(vec3 value, vec4 quaternion) {
  return value + 2.0 * cross(
    quaternion.xyz,
    cross(quaternion.xyz, value) + quaternion.w * value
  );
}

void main() {
  // CylinderGeometry 以 Z 轴为中心，将顶部截面移动到局部坐标原点；
  // 随后沿局部 -Z 方向从起始截面延伸到结束截面。
  float axisProgress = clamp(0.5 - position.z, 0.0, 1.0);
  float radius = instanceShape.y +
    axisProgress * instanceShape.x * instanceShape.z;
  vec3 localPosition = vec3(
    position.xy * radius,
    (position.z - 0.5) * instanceShape.x
  );
  vec3 worldOffset = rotateByQuaternion(localPosition, instanceQuaternion);
  vec4 positionRTE = czm_translateRelativeToEye(
    instancePositionHigh,
    instancePositionLow + worldOffset
  );

  float sideSurface = 1.0 - step(0.95, abs(normal.z));
  vec3 scaledNormal = normalize(mix(
    normal,
    vec3(normal.xy, instanceShape.z),
    sideSurface
  ));
  vec3 worldNormal = rotateByQuaternion(scaledNormal, instanceQuaternion);
  v_normalEC = normalize(czm_viewRotation * worldNormal);
  v_color = instanceColor;
  v_axisProgress = axisProgress;
  v_sideSurface = sideSurface;
  v_materialType = instanceMaterial.x;
  v_animationSpeed = instanceMaterial.y;
  v_materialCount = instanceMaterial.z;
  gl_Position = czm_modelViewProjectionRelativeToEye * positionRTE;
}
