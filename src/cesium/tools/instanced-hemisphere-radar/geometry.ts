export interface HemisphereMesh {
  vertices: Float32Array;
  indices: Uint16Array;
}

/** Build one unit upper-hemisphere mesh shared by every GPU instance. */
export function createHemisphereMesh(
  sliceCount: number,
  stackCount: number,
): HemisphereMesh {
  const vertexStride = 5;
  const vertices = new Float32Array(
    (sliceCount + 1) * (stackCount + 1) * vertexStride,
  );
  let vertexOffset = 0;

  for (let stack = 0; stack <= stackCount; stack += 1) {
    const v = stack / stackCount;
    const elevation = v * Math.PI * 0.5;
    const horizontal = Math.cos(elevation);
    for (let slice = 0; slice <= sliceCount; slice += 1) {
      const u = slice / sliceCount;
      const azimuth = u * Math.PI * 2;
      vertices[vertexOffset] = Math.sin(azimuth) * horizontal;
      vertices[vertexOffset + 1] = Math.cos(azimuth) * horizontal;
      vertices[vertexOffset + 2] = Math.sin(elevation);
      vertices[vertexOffset + 3] = u;
      vertices[vertexOffset + 4] = v;
      vertexOffset += vertexStride;
    }
  }

  const indices = new Uint16Array(sliceCount * stackCount * 6);
  let indexOffset = 0;
  const rowLength = sliceCount + 1;
  for (let stack = 0; stack < stackCount; stack += 1) {
    for (let slice = 0; slice < sliceCount; slice += 1) {
      const lowerLeft = stack * rowLength + slice;
      const lowerRight = lowerLeft + 1;
      const upperLeft = lowerLeft + rowLength;
      const upperRight = upperLeft + 1;
      indices[indexOffset] = lowerLeft;
      indices[indexOffset + 1] = lowerRight;
      indices[indexOffset + 2] = upperRight;
      indices[indexOffset + 3] = lowerLeft;
      indices[indexOffset + 4] = upperRight;
      indices[indexOffset + 5] = upperLeft;
      indexOffset += 6;
    }
  }
  return { vertices, indices };
}

