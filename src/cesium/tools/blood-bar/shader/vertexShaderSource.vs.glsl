// ============================================================================
// 血条顶点着色器（广告牌式：始终面向屏幕）
// ============================================================================
// Cesium 的 ShaderSource 在编译前会替我们：注入 #version 300 es、注入 czm_*
// 自动 uniform 与内置函数、把 in 变量名映射到 VertexArray 的 attribute 编号。
// 所以这里直接用 in/out 语法，不要自己写 #version，也不要重复声明 czm_*。
//
// 「始终面向屏幕」的实现思路：不旋转网格，而是把网格放到【眼空间】里摆放。
// 在眼空间中，相机右方向恒为 +X、上方向恒为 +Y，因此只要把四个角沿 X/Y
// 偏移，矩形就天然始终正对相机——这正是 Cesium Billboard 的做法。
// ============================================================================

// 逐顶点属性：单位四边形的角坐标，范围 [-0.5, 0.5]
in vec2 corner;

// 逐实例属性（instanceDivisor = 1，每个实例取一次）
in vec3 instancePositionHigh; // 实例世界坐标高位（大坐标拆分，保证精度）
in vec3 instancePositionLow;  // 实例世界坐标低位
in vec3 instanceScale;        // 实例三轴缩放（x->宽，y->高，z 暂不使用）
in vec2 instanceOffset;       // 实例自身 xy 偏移（屏幕平面内，米）
in float instancePercent;     // 血量百分比 [0, 1]
in float instanceShowHeight;  // 显隐高度（相机眼高度超过则隐藏）

// 传给片元着色器的 varying
out vec2 v_uv;     // 血条内部 UV（x: 0 左 -> 1 右，y: 0 下 -> 1 上）
out float v_percent; // 血量百分比

// 整条血条共享的默认宽高（构造时传入，逐实例 scale 再乘到上面）
uniform float u_width;
uniform float u_height;

void main() {
  // 1) 实例锚点的眼空间坐标（相对相机，避免大世界坐标的 float 精度丢失）。
  //    czm_translateRelativeToEye(high, low)：把拆分的高低两段合并，并相对
  //    相机平移，得到一个「以相机为原点、世界轴向」的小向量；
  //    czm_modelViewRelativeToEye：再把它旋转到眼空间（相机轴向）。
  vec3 anchorEC = (
    czm_modelViewRelativeToEye *
    czm_translateRelativeToEye(instancePositionHigh, instancePositionLow)
  ).xyz;

  // 2) 沿眼空间的 +X（右）/ +Y（上）摆放四个角，实现广告牌效果。
  //    corner.x * u_width * scale.x 把角坐标从 [-0.5,0.5] 映射到实际半宽；
  //    instanceOffset 在屏幕平面内整体平移血条自身。
  vec3 offsetEC = vec3(
    corner.x * u_width * instanceScale.x + instanceOffset.x,
    corner.y * u_height * instanceScale.y + instanceOffset.y,
    0.0
  );

  // 3) UV 与百分比交给片元着色器。corner + 0.5 把 [-0.5,0.5] 映射到 [0,1]。
  v_uv = corner + 0.5;
  v_percent = clamp(instancePercent, 0.0, 1.0);

  // 4) 眼空间 -> 裁剪空间。
  vec4 clipPosition = czm_projection * vec4(anchorEC + offsetEC, 1.0);

  // 5) 显隐：czm_eyeHeight 是相机相对椭球面的高度。超过该实例的显隐高度时，
  //    把整条血条的四个角都推到裁剪体之外（四个角落于同一点，三角形退化为
  //    零面积），从而不产生任何像素——这是 GPU Instancing 里隐藏单个实例的
  //    常用技巧（无法在一条 draw call 里跳过某个实例，只能让它退化）。
  if (czm_eyeHeight > instanceShowHeight) {
    clipPosition = vec4(2.0, 2.0, 2.0, 1.0);
  }

  gl_Position = clipPosition;
}
