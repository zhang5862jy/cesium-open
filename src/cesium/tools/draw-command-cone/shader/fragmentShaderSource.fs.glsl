in vec3 v_normalEC;
flat in vec4 v_color;
in float v_axisProgress;
flat in float v_sideSurface;
flat in float v_materialType;
flat in float v_animationSpeed;
flat in float v_materialCount;

float computeLighting(vec3 normalEC) {
  return 0.42 + 0.58 * abs(dot(normalEC, normalize(czm_lightDirectionEC)));
}

void main() {
  // 动态材质的端盖完全透明，在相位和光照计算前丢弃。
  if (v_materialType >= 0.5 && v_sideSurface < 0.01) discard;

  if (v_materialType < 0.5) {
    vec3 normalEC = normalize(v_normalEC);
    float lighting = computeLighting(normalEC);
    float edge = pow(1.0 - abs(dot(normalEC, vec3(0.0, 0.0, 1.0))), 1.6);
    vec3 diffuse = v_color.rgb * (0.65 + lighting * 0.35);
    diffuse += v_color.rgb * edge * 0.35;
    float alpha = v_color.a * (0.38 + edge * 0.62);
    out_FragColor = vec4(diffuse, alpha);
    return;
  }

  // 波纹和分段渐变共用相位，均从起始截面持续移动到结束截面。
  float phase = v_axisProgress * max(v_materialCount, 1.0) -
    czm_frameNumber * 0.018 * v_animationSpeed;

  if (v_materialType < 1.5) {
    float ringDistance = abs(fract(phase) - 0.5);
    float antialiasWidth = max(fwidth(phase) * 0.65, 0.025);
    float ring = 1.0 - smoothstep(
      0.075,
      0.075 + antialiasWidth,
      ringDistance
    );
    float wave = ring * v_sideSurface;
    if (wave < 0.01) {
      discard;
    }
    float lighting = computeLighting(normalize(v_normalEC));
    vec3 glow = mix(v_color.rgb, vec3(1.0), 0.62) *
      (0.72 + lighting * 0.28);
    out_FragColor = vec4(glow, v_color.a * wave);
    return;
  }

  // 沿起点到终点的正方向由透明变为不透明，段与段之间留出透明分隔线。
  float segmentProgress = fract(phase);
  float separatorWidth = max(fwidth(phase) * 0.8, 0.035);
  float segmentMask = smoothstep(0.0, separatorWidth, segmentProgress) *
    (1.0 - smoothstep(
      1.0 - separatorWidth,
      1.0,
      segmentProgress
    ));
  float gradient = pow(segmentProgress, 0.75);
  float opacity = segmentMask * v_sideSurface * (0.18 + gradient * 0.82);
  if (opacity < 0.01) {
    discard;
  }
  float lighting = computeLighting(normalize(v_normalEC));
  vec3 gradientColor = mix(
    v_color.rgb * 0.58,
    mix(v_color.rgb, vec3(1.0), 0.32),
    gradient
  ) * (0.74 + lighting * 0.26);
  out_FragColor = vec4(gradientColor, v_color.a * opacity);
}
