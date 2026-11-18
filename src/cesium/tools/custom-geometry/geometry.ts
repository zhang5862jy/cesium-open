import * as Cesium from "cesium";
import type { ShaderGeometryKind } from "./types";

/** CPU-side attribute buffers used to assemble one immutable Cesium Geometry. */
interface AttributeArrays {
  /** Placeholder positions; the vertex shader replaces these values. */
  position: number[];
  /** Shape-local coordinates consumed by each shape's vertex shader. */
  parametric: number[];
  /** Normalized surface coordinates used for grids and scan bands. */
  surface: number[];
  /** Per-triangle coordinates used to draw cube/pyramid edges. */
  barycentric: number[];
  /** Indexed triangle topology shared by the geometry. */
  indices: number[];
}

// Runtime dimensions can grow beyond the initial UI values. Keeping a generous
// local bound prevents Cesium's culling pass from discarding a deformed shape.
const MAX_BOUNDING_RADIUS = 1_250_000;

/** Allocate the five parallel arrays required by the custom vertex format. */
function createArrays(): AttributeArrays {
  return {
    position: [],
    parametric: [],
    surface: [],
    barycentric: [],
    indices: [],
  };
}

function appendTriangle(
  arrays: AttributeArrays,
  points: ReadonlyArray<readonly [number, number, number]>,
  surfaceCoordinates: ReadonlyArray<readonly [number, number]>,
): void {
  // Each triangle owns its three vertices. This intentionally avoids sharing
  // corners so barycentric coordinates remain valid for analytic edge lines.
  const start = arrays.position.length / 3;
  const barycentrics = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];

  for (let index = 0; index < 3; index++) {
    arrays.position.push(0, 0, 0);
    arrays.parametric.push(...points[index]!);
    arrays.surface.push(...surfaceCoordinates[index]!);
    arrays.barycentric.push(...barycentrics[index]!);
    arrays.indices.push(start + index);
  }
}

function createCubeArrays(): AttributeArrays {
  // A cube is represented by six independent faces. The shader maps the
  // normalized face coordinates to the requested size and applies rotation.
  const arrays = createArrays();
  const faces = [
    [[-1, -1, 0], [1, -1, 0], [1, 1, 0], [-1, 1, 0]],
    [[-1, 1, 1], [1, 1, 1], [1, -1, 1], [-1, -1, 1]],
    [[-1, -1, 0], [-1, 1, 0], [-1, 1, 1], [-1, -1, 1]],
    [[1, -1, 0], [1, -1, 1], [1, 1, 1], [1, 1, 0]],
    [[-1, -1, 0], [-1, -1, 1], [1, -1, 1], [1, -1, 0]],
    [[-1, 1, 0], [1, 1, 0], [1, 1, 1], [-1, 1, 1]],
  ] as const;
  const uv = [[0, 0], [1, 0], [1, 1], [0, 1]] as const;

  for (const face of faces) {
    appendTriangle(arrays, [face[0], face[1], face[2]], [uv[0], uv[1], uv[2]]);
    appendTriangle(arrays, [face[0], face[2], face[3]], [uv[0], uv[2], uv[3]]);
  }
  return arrays;
}

function createPyramidArrays(): AttributeArrays {
  // The four triangles form a tetrahedron: one reversed-winding base and three
  // side faces that meet at the apex. Base radius/height are shader uniforms.
  const arrays = createArrays();
  const rootThreeOverTwo = Math.sqrt(3) / 2;
  const base = [
    [0, 1, 0],
    [-rootThreeOverTwo, -0.5, 0],
    [rootThreeOverTwo, -0.5, 0],
  ] as const;
  const apex = [0, 0, 1] as const;
  const uv = [[0.5, 1], [0, 0], [1, 0]] as const;

  appendTriangle(arrays, [base[0], base[2], base[1]], uv);
  appendTriangle(arrays, [base[0], base[1], apex], uv);
  appendTriangle(arrays, [base[1], base[2], apex], uv);
  appendTriangle(arrays, [base[2], base[0], apex], uv);
  return arrays;
}

function appendGrid(
  arrays: AttributeArrays,
  uSegments: number,
  vSegments: number,
  face = 0,
): void {
  // Surface grids use shared vertices because they need continuous parametric
  // coordinates. `face` selects one of the phased-array cone walls.
  const start = arrays.position.length / 3;
  for (let row = 0; row <= vSegments; row++) {
    const v = row / vSegments;
    for (let column = 0; column <= uSegments; column++) {
      const u = column / uSegments;
      arrays.position.push(0, 0, 0);
      arrays.parametric.push(u, v, face);
      arrays.surface.push(u, v);
      arrays.barycentric.push(1, 1, 1);
    }
  }

  const rowLength = uSegments + 1;
  // Convert each quad into two counter-clockwise triangles for rasterization.
  for (let row = 0; row < vSegments; row++) {
    for (let column = 0; column < uSegments; column++) {
      const lowerLeft = start + row * rowLength + column;
      const lowerRight = lowerLeft + 1;
      const upperLeft = lowerLeft + rowLength;
      const upperRight = upperLeft + 1;
      arrays.indices.push(
        lowerLeft,
        lowerRight,
        upperRight,
        lowerLeft,
        upperRight,
        upperLeft,
      );
    }
  }
}

function createSurfaceArrays(kind: ShaderGeometryKind): AttributeArrays {
  // Segment counts are topology decisions. Shape dimensions remain uniforms,
  // so changing a slider updates attributes instead of rebuilding this mesh.
  const arrays = createArrays();
  if (kind === "phased-array-radar") {
    appendGrid(arrays, 32, 18, 0);
    for (let face = 1; face <= 4; face++) appendGrid(arrays, 24, 10, face);
    return arrays;
  }
  if (kind === "torus-knot") {
    appendGrid(arrays, 192, 24);
    return arrays;
  }
  appendGrid(arrays, 96, kind === "sphere-radar" ? 48 : 28);
  return arrays;
}

function createGeometryFromArrays(arrays: AttributeArrays): Cesium.Geometry {
  // Position is a double attribute for Cesium's high/low precision pipeline;
  // the other attributes are compact floats because they are normalized data.
  return new Cesium.Geometry({
    attributes: {
      position: new Cesium.GeometryAttribute({
        componentDatatype: Cesium.ComponentDatatype.DOUBLE,
        componentsPerAttribute: 3,
        values: new Float64Array(arrays.position),
      }),
      parametric: new Cesium.GeometryAttribute({
        componentDatatype: Cesium.ComponentDatatype.FLOAT,
        componentsPerAttribute: 3,
        values: new Float32Array(arrays.parametric),
      }),
      surface: new Cesium.GeometryAttribute({
        componentDatatype: Cesium.ComponentDatatype.FLOAT,
        componentsPerAttribute: 2,
        values: new Float32Array(arrays.surface),
      }),
      barycentric: new Cesium.GeometryAttribute({
        componentDatatype: Cesium.ComponentDatatype.FLOAT,
        componentsPerAttribute: 3,
        values: new Float32Array(arrays.barycentric),
      }),
    } as unknown as Cesium.GeometryAttributes,
    // The current segment counts stay below 65,535 vertices, so 16-bit indices
    // reduce the index-buffer footprint without losing addressable vertices.
    indices: new Uint16Array(arrays.indices),
    primitiveType: Cesium.PrimitiveType.TRIANGLES,
    boundingSphere: new Cesium.BoundingSphere(
      Cesium.Cartesian3.ZERO,
      MAX_BOUNDING_RADIUS,
    ),
  });
}

/**
 * Build the immutable topology shared by one parametric geometry primitive.
 *
 * The returned geometry contains placeholder positions and semantic attributes;
 * actual coordinates are generated later in the vertex shader from uniforms.
 */
export function createParametricGeometry(
  kind: ShaderGeometryKind,
): Cesium.Geometry {
  if (kind === "cube") return createGeometryFromArrays(createCubeArrays());
  if (kind === "triangular-pyramid") {
    return createGeometryFromArrays(createPyramidArrays());
  }
  return createGeometryFromArrays(createSurfaceArrays(kind));
}
