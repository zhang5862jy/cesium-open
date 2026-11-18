// ============================================================================
// 立方体网格生成器
// ============================================================================
// 与 instanced-hemisphere-radar/geometry.ts 的思路一致：在局部空间生成一份
// 「单位网格」，顶点数据只上传一次 GPU，之后不再改动。单个立方体与实例化
// 批量立方体都复用这同一份网格，只是后者的每个实例用不同的变换矩阵去画它。

export interface CubeMesh {
  vertices: Float32Array;
  indices: Uint16Array;
}

/**
 * 构建以原点为中心、半边长（halfExtent）为 0.5 的单位立方体。
 *
 * 每个顶点携带 8 个 float，布局如下：
 *   [0..2] position —— 局部空间坐标
 *   [3..5] normal   —— 局部空间法线（立方体每个面共享一个恒定法线）
 *   [6..7] st       —— 面内纹理坐标（用于网格 / 边框 / 扫描线效果）
 *
 * 因为立方体每个面的法线不同，无法共享顶点，所以一共有
 * 24 个顶点（6 面 × 4 角）、36 个索引（6 面 × 2 三角形）。
 */
export function createCubeMesh(): CubeMesh {
  const FLOATS_PER_VERTEX = 8;
  const vertices = new Float32Array(6 * 4 * FLOATS_PER_VERTEX);
  const indices = new Uint16Array(6 * 6);

  // 六个面：n 是面法线，u / v 是面内两个正交切向量。
  // 约定 u × v = n（右手系），这样下面按固定顺序生成的两个三角形是逆时针
  // 朝外的，即使将来把渲染状态改成背面剔除（cull: BACK）也不会出错。
  const faces = [
    { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] }, // +X
    { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] }, // -X
    { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] }, // +Y
    { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] }, // -Y
    { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] }, // +Z
    { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] }, // -Z
  ] as const;

  // 一个面四个角的 (s, t) 偏移，顺序保证三角形逆时针朝外
  const corners = [
    [-0.5, -0.5],
    [0.5, -0.5],
    [0.5, 0.5],
    [-0.5, 0.5],
  ] as const;

  let vertexOffset = 0;
  for (let face = 0; face < faces.length; face += 1) {
    const { n, u, v } = faces[face];
    for (let corner = 0; corner < corners.length; corner += 1) {
      const [s, t] = corners[corner];
      // position = n * 0.5 + u * s + v * t，正好落在该面的四个角上
      vertices[vertexOffset + 0] = n[0] * 0.5 + u[0] * s + v[0] * t;
      vertices[vertexOffset + 1] = n[1] * 0.5 + u[1] * s + v[1] * t;
      vertices[vertexOffset + 2] = n[2] * 0.5 + u[2] * s + v[2] * t;
      // 法线：整个面共用同一个
      vertices[vertexOffset + 3] = n[0];
      vertices[vertexOffset + 4] = n[1];
      vertices[vertexOffset + 5] = n[2];
      // st：把角偏移映射到 [0, 1]，让每个面都有一套完整 UV
      vertices[vertexOffset + 6] = s + 0.5;
      vertices[vertexOffset + 7] = t + 0.5;
      vertexOffset += FLOATS_PER_VERTEX;
    }
  }

  let indexOffset = 0;
  for (let face = 0; face < 6; face += 1) {
    const base = face * 4;
    // 两个三角形：(0,1,2) 与 (0,2,3)
    indices[indexOffset + 0] = base + 0;
    indices[indexOffset + 1] = base + 1;
    indices[indexOffset + 2] = base + 2;
    indices[indexOffset + 3] = base + 0;
    indices[indexOffset + 4] = base + 2;
    indices[indexOffset + 5] = base + 3;
    indexOffset += 6;
  }

  return { vertices, indices };
}
