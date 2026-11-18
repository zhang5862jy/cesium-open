import * as Cesium from "cesium";

export interface ConeMesh {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint16Array | Uint32Array;
}

/** 直接使用 Cesium.CylinderGeometry 创建所有实例共享的径向拓扑。 */
export function createCesiumConeMesh(
  slices: number,
): ConeMesh {
  const geometry = Cesium.CylinderGeometry.createGeometry(
    new Cesium.CylinderGeometry({
      length: 1,
      topRadius: 1,
      bottomRadius: 1,
      slices,
      vertexFormat: Cesium.VertexFormat.POSITION_AND_NORMAL,
    }),
  );
  const positionValues = geometry?.attributes.position?.values;
  const normalValues = geometry?.attributes.normal?.values;
  const sourceIndices = geometry?.indices;
  if (!positionValues || !normalValues || !sourceIndices) {
    throw new Error("Cesium.CylinderGeometry 未能创建圆锥缓冲数据。");
  }

  return {
    positions: Float32Array.from(positionValues),
    normals: Float32Array.from(normalValues),
    indices:
      sourceIndices instanceof Uint32Array
        ? new Uint32Array(sourceIndices)
        : new Uint16Array(sourceIndices),
  };
}
