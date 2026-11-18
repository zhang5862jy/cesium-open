// ============================================================================
// 血条片元着色器：背景色 + 按百分比填充的血量颜色 + 细边框
// ============================================================================
// Cesium 检测到代码里写了 out_FragColor 后，会在 WebGL2 下自动补上
// `layout(location = 0) out vec4 out_FragColor;`，这里直接赋值即可。

in vec2 v_uv;      // 血条内部 UV（x: 0 左 -> 1 右）
in float v_percent; // 血量百分比 [0, 1]

// 整条血条共享的颜色（构造时传入）
uniform vec4 u_backgroundColor; // 背景颜色（未填充部分）
uniform vec4 u_color;           // 血量颜色（填充部分）
uniform float u_width;
uniform float u_height;

void main() {
  // 1) 血量从左向右填充。小于 percent 的左侧区域为血量色，其余为背景色。
  //    fwidth(v_uv.x) 给出当前像素覆盖的 UV 宽度，用于软化填充边界。
  float aa = fwidth(v_uv.x);
  float fill = 1.0 - smoothstep(v_percent - aa, v_percent + aa, v_uv.x);
  vec3 rgb = mix(u_backgroundColor.rgb, u_color.rgb, fill);
  float alpha = mix(u_backgroundColor.a, u_color.a, fill);

  // 2) 在血条实际宽高的局部空间中构造圆角矩形 SDF。直接按米计算可保持
  //    圆角为圆形，不会因为血条宽高比很大而在 UV 空间里被拉成椭圆。
  vec2 size = vec2(u_width, u_height);
  vec2 halfSize = size * 0.5;
  float radius = min(size.x, size.y) * 0.5;
  vec2 point = (v_uv - 0.5) * size;
  vec2 rounded = abs(point) - (halfSize - vec2(radius));
  float distanceToEdge =
    length(max(rounded, vec2(0.0))) +
    min(max(rounded.x, rounded.y), 0.0) -
    radius;

  // 3) 仅对圆角外轮廓做导数抗锯齿，不额外绘制或压暗边框。
  float edgeAA = max(fwidth(distanceToEdge), 0.0001);
  float shapeMask = 1.0 - smoothstep(-edgeAA, edgeAA, distanceToEdge);

  out_FragColor = vec4(rgb, alpha * shapeMask);
}
