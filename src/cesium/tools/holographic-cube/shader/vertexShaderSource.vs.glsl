// ============================================================================
// 顶点着色器（单个全息立方体）
// ============================================================================
// 这是「原始」GLSL。Cesium 的 ShaderSource 在编译前会替我们做三件事：
//   1. 自动在开头注入 `#version 300 es`（WebGL2 / GLSL ES 3.00）；
//   2. 自动注入 czm_* 自动 uniform（czm_modelViewRelativeToEye 等）的声明
//      以及内置函数实现；
//   3. 根据 TS 里传入的 attributeLocations，把下面的 in 变量名映射到
//      VertexArray 中对应的 attribute 编号。
// 所以这里直接用 in/out 语法，不要自己写 #version，也不要重复声明 czm_*。
// ============================================================================

// 顶点属性（location 由 ShaderProgram 的 attributeLocations 指定）
in vec3 position; // 局部空间坐标（单位立方体，半边长 0.5）
in vec3 normal;   // 局部空间法线
in vec2 st;       // 面内纹理坐标

// 传给片元着色器的 varying（顶点着色器 out，片元着色器 in，类型一致）
out vec3 v_normalEC;      // 眼空间法线（用于光照 / 菲涅尔等）
out vec2 v_st;            // 面内 UV（网格 / 边框 / 扫描线）
out vec3 v_localPosition; // 局部坐标（用于跨面的彩虹渐变）
out vec4 v_color;         // 顶点颜色（单个立方体恒为白色）

void main() {
  // 局部坐标原样传出，片元着色器用它做随位置变化的彩虹渐变
  v_localPosition = position;

  // czm_normal：Cesium 自动注入的「法线矩阵」（modelView 的逆转置 3x3）。
  // 它把局部法线变换到眼空间；即使 modelMatrix 带非均匀缩放也能得到正确方向。
  // normalize 抵消非均匀缩放带来的长度变化。
  v_normalEC = normalize(czm_normal * normal);

  // 面内 UV 原样传出
  v_st = st;

  // 单个立方体没有实例颜色，传白色（片元着色器乘它不会改变色相）
  v_color = vec4(1.0);

  // 关键：用「相对相机位置」的 modelView 矩阵计算眼空间坐标。
  // 地球尺度下坐标绝对值极大，直接 czm_modelView * pos 会因 float 精度不足
  // 而抖动；czm_modelViewRelativeToEye 先平移使坐标靠近原点，从而保持精度。
  vec4 positionEC = czm_modelViewRelativeToEye * vec4(position, 1.0);

  // 眼空间 -> 裁剪空间（gl_Position 是顶点着色器必须写出的内建输出）
  gl_Position = czm_projection * positionEC;
}
