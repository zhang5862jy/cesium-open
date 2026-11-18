in vec2 corner;
in vec3 instancePositionHigh;
in vec3 instancePositionLow;
in vec3 instanceEast;
in vec3 instanceNorth;
in vec4 instanceSizeCenter;
in vec4 instanceDisplay;

out vec2 v_uv;
out float v_textureRotation;

uniform float u_nearDistance;
uniform float u_farDistance;
uniform float u_nearScale;
uniform float u_farScale;

void main() {
  vec4 anchorRTE = czm_translateRelativeToEye(
    instancePositionHigh,
    instancePositionLow
  );
  vec3 anchorEC = (czm_modelViewRelativeToEye * anchorRTE).xyz;
  float ratio = clamp(
    (length(anchorEC) - u_nearDistance) /
      max(u_farDistance - u_nearDistance, 0.0001),
    0.0,
    1.0
  );
  float distanceScale = mix(u_nearScale, u_farScale, ratio);
  vec2 localPosition = (
    corner * instanceSizeCenter.xy + instanceSizeCenter.zw
  ) * distanceScale;

  vec3 positionEC;
  if (instanceDisplay.y < 0.5) {
    // billboard：眼空间 X/Y 就是屏幕右/上方向。
    positionEC = anchorEC + vec3(localPosition, 0.0);
  } else {
    // ground：只沿目标点当地 ENU 的 East/North 两轴移动。
    vec3 worldOffset =
      instanceEast * localPosition.x + instanceNorth * localPosition.y;
    positionEC = (
      czm_modelViewRelativeToEye *
      czm_translateRelativeToEye(
        instancePositionHigh,
        instancePositionLow + worldOffset
      )
    ).xyz;
  }

  v_uv = corner + 0.5;
  v_textureRotation = instanceDisplay.x;
  vec4 clipPosition = czm_projection * vec4(positionEC, 1.0);
  if (instanceDisplay.z < 0.5 || czm_eyeHeight > instanceDisplay.w) {
    clipPosition = vec4(2.0, 2.0, 2.0, 1.0);
  }
  gl_Position = clipPosition;
}
