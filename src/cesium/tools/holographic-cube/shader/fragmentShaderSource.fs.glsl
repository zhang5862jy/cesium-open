// ============================================================================
// 片元着色器（全息立方体材质，单个与实例版共用）
// ============================================================================
// 效果：随时间旋转的彩虹渐变 + 面内网格 + 棱边高光 + 循环扫描线 + 呼吸脉冲，
// 最终用 v_color 染色。全部基于局部坐标 / UV / 时间，无需任何纹理贴图。
// ============================================================================

in vec3 v_normalEC;
in vec2 v_st;
in vec3 v_localPosition;
in vec4 v_color;

// 输出片段颜色。Cesium 检测到代码里写了 out_FragColor 后，会在 WebGL2 下
// 自动补上 `layout(location = 0) out vec4 out_FragColor;`，这里直接赋值即可。
// （若运行在 WebGL1 下，它会自动把 out_FragColor 映射回 gl_FragColor。）

// HSV 转 RGB：用于生成随时间旋转的彩虹色相（h 在 [0,1]，s/v 在 [0,1]）
vec3 hsv2rgb(vec3 c) {
  vec3 rgb = clamp(abs(mod(c.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  return c.z * mix(vec3(1.0), rgb, c.y);
}

void main() {
  vec3 normalEC = normalize(v_normalEC);

  // 动画时间：czm_frameNumber 是 Cesium 每帧递增的自动 uniform（float）。
  // 乘以 0.016 把它近似换算成秒（60fps 下约等于 wall-clock 秒）。
  // 想要真正的挂钟时间，可以改用一个每帧更新的 u_time uniform。
  float time = czm_frameNumber * 0.016;

  // 1) 彩虹色相：用局部坐标三个分量的混合作为色相输入，让六个面呈现不同
  //    颜色，并随时间缓慢旋转。
  float hue = fract(v_localPosition.x * 0.08 +
    v_localPosition.y * 0.06 +
    v_localPosition.z * 0.05 +
    time * 0.06);
  vec3 baseColor = hsv2rgb(vec3(hue, 0.72, 0.95));

  // 2) 面内网格：对 UV 取小数部分，用 fwidth 计算抗锯齿线宽，画出细网格线。
  vec2 gridCoord = v_st * 8.0;
  vec2 gridDist = abs(fract(gridCoord - 0.5) - 0.5) / max(fwidth(gridCoord), vec2(0.0001));
  float gridLine = 1.0 - min(min(gridDist.x, gridDist.y), 1.0);

  // 3) 棱边高光：UV 越接近 0 或 1（即越靠近面的边缘）越亮，勾勒立方体棱边。
  float edgeDistance = min(min(v_st.x, 1.0 - v_st.x), min(v_st.y, 1.0 - v_st.y));
  float edge = 1.0 - smoothstep(0.0, 0.14, edgeDistance);

  // 4) 扫描线：一道亮带沿 V 方向循环扫过每个面。
  float scan = 1.0 - smoothstep(0.0, 0.08, abs(fract(v_st.y - time * 0.45) - 0.5));

  // 5) 呼吸脉冲：整体亮度缓慢起伏。
  float pulse = 0.82 + 0.18 * sin(time * 2.2);

  // 6) 组合：基础彩虹按网格提亮，叠加青色棱边光与扫描带，再乘脉冲。
  vec3 color = baseColor * (0.5 + 0.5 * gridLine);
  color += vec3(0.35, 0.9, 1.0) * edge * 0.95; // 青色棱边光
  color += baseColor * scan * 0.55;            // 扫描带提亮
  color *= pulse;

  // 用顶点 / 实例颜色染色（单个立方体 v_color 为白色，等价于不染色）
  color *= v_color.rgb;

  // 半透明：棱边更实、内部更透，营造全息投影感
  float alpha = 0.72 + 0.28 * edge;

  out_FragColor = vec4(color, alpha);
}
