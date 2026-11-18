export interface EllipseQuadMesh {
  corners: Float32Array;
  indices: Uint16Array;
}

/** 所有椭圆实例共享的单位四边形。片元着色器在其中裁出椭圆。 */
export function createEllipseQuadMesh(): EllipseQuadMesh {
  return {
    corners: new Float32Array([
      -0.5, -0.5,
      0.5, -0.5,
      0.5, 0.5,
      -0.5, 0.5,
    ]),
    indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
  };
}
