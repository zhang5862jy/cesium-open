// 片元阶段：根据到线中心的屏幕距离计算边缘覆盖率，输出带平滑边缘的线颜色。
// u_color 为非预乘 RGBA；宿主使用普通 alpha 混合并保留深度测试。
uniform vec4 u_color;
// 顶点阶段传来的 (distance*w, w) 已经过默认透视插值，这里的商恢复屏幕线性距离。
in vec2 v_lineDistanceAndW;
in float v_halfWidth;

void main() {
  // 过渡带约为一个 CSS 像素，最少使用一个 drawing-buffer 像素，避免边缘过硬。
  float feather = max(czm_pixelRatio, 1.0);
  float lineDistance = v_lineDistanceAndW.x / v_lineDistanceAndW.y;
  // abs 使线两侧对称；几何边界 d=halfWidth 处覆盖率为 0.5。
  // 向内/向外各半个 feather 线性过渡到 1/0，外侧扩展区域自然变为透明。
  float coverage = clamp((v_halfWidth - abs(lineDistance)) / feather + 0.5, 0.0, 1.0);
  // 保留原始 RGB，只让 alpha 随覆盖率衰减；最终与底图颜色的混合由渲染状态完成。
  out_FragColor = vec4(u_color.rgb, u_color.a * coverage);
}
