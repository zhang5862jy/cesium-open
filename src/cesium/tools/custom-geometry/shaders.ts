import type { ShaderGeometryKind } from "./types";

/**
 * Shared GLSL declarations for all six shape programs.
 *
 * The CPU geometry supplies semantic attributes (`parametric`, `surface`, and
 * `barycentric`) rather than final positions. Cesium injects the batch-table
 * accessors used below from GeometryInstance attributes.
 */
// Cesium prepends `#version 300 es` and owns the `out_FragColor` declaration.
// Neither may be redeclared inside an Appearance shader source because the
// translucent/OIT pipeline can rewrite the output to `czm_out_FragColor`.
const vertexHeader = `
in vec3 parametric;
in vec2 surface;
in vec3 barycentric;
in float batchId;

out vec3 v_positionEC;
out vec2 v_surface;
out vec3 v_barycentric;
flat out vec4 v_style;
flat out vec2 v_gridScale;
flat out vec4 v_baseColor;
flat out vec4 v_gridColor;

#define APPLY_INSTANCE_STYLE() \
  v_style = czm_batchTable_style(batchId); \
  v_gridScale = czm_batchTable_gridScale(batchId); \
  v_baseColor = czm_batchTable_baseColor(batchId); \
  v_gridColor = czm_batchTable_gridColor(batchId);

vec3 rotateAroundZ(vec3 value, float angle) {
  float cosine = cos(angle);
  float sine = sin(angle);
  return vec3(
    cosine * value.x - sine * value.y,
    sine * value.x + cosine * value.y,
    value.z
  );
}

void finishVertex(vec3 localPosition) {
  // All shape formulas are local ENU coordinates. Cesium's model-view matrix
  // applies the geographic anchor and transforms the result into eye space.
  vec4 positionEC = czm_modelView * vec4(localPosition, 1.0);
  v_positionEC = positionEC.xyz;
  v_surface = surface;
  v_barycentric = barycentric;
  gl_Position = czm_projection * positionEC;
}
`;

const cubeBody = `
void main() {
  vec4 dimensions = czm_batchTable_shapeDimensions(batchId);
  vec4 style = czm_batchTable_style(batchId);
  float breathing = 1.0 + sin(style.x * 1.7) * 0.035;
  // Each face is normalized to a unit rectangle on the CPU. Expand it here so
  // the same topology supports any edge length and can breathe over time.
  vec3 position = vec3(
    parametric.x * dimensions.x * 0.5,
    parametric.y * dimensions.x * 0.5,
    parametric.z * dimensions.x
  ) * breathing;
  position = rotateAroundZ(position, style.x * 0.28);
  finishVertex(position);
  APPLY_INSTANCE_STYLE()
}
`;

const pyramidBody = `
void main() {
  vec4 dimensions = czm_batchTable_shapeDimensions(batchId);
  vec4 style = czm_batchTable_style(batchId);
  float breathing = 1.0 + sin(style.x * 1.5) * 0.03;
  // The CPU provides a triangular base and apex in parametric coordinates;
  // dimensions turn that unit tetrahedron into the requested physical shape.
  vec3 position = vec3(
    parametric.xy * dimensions.x,
    parametric.z * dimensions.y
  ) * breathing;
  position = rotateAroundZ(position, style.x * 0.32);
  finishVertex(position);
  APPLY_INSTANCE_STYLE()
}
`;

const hemisphereBody = `
void main() {
  vec4 dimensions = czm_batchTable_shapeDimensions(batchId);
  // U wraps longitude around the horizon; V sweeps elevation from 0 to 90°.
  float azimuth = surface.x * czm_twoPi - czm_pi;
  float elevation = surface.y * czm_piOverTwo;
  float horizontalRadius = cos(elevation) * dimensions.z;
  vec3 position = vec3(
    sin(azimuth) * horizontalRadius,
    cos(azimuth) * horizontalRadius,
    sin(elevation) * dimensions.z
  );
  finishVertex(position);
  APPLY_INSTANCE_STYLE()
}
`;

const sphereBody = `
void main() {
  vec4 dimensions = czm_batchTable_shapeDimensions(batchId);
  // Latitude is centered at zero, so the same rectangular parameter grid
  // closes at both poles (the seam is handled by duplicated U endpoints).
  float azimuth = surface.x * czm_twoPi - czm_pi;
  float latitude = (surface.y - 0.5) * czm_pi;
  float horizontalRadius = cos(latitude) * dimensions.z;
  vec3 position = vec3(
    sin(azimuth) * horizontalRadius,
    cos(azimuth) * horizontalRadius,
    sin(latitude) * dimensions.z + dimensions.z
  );
  finishVertex(position);
  APPLY_INSTANCE_STYLE()
}
`;

const phasedArrayBody = `
// Four side grids plus one cap grid form a directional radar coverage volume.
// Side faces reuse U as distance and V as the varying angular coordinate.
vec3 radarDirection(float azimuth, float elevation) {
  float horizontal = cos(elevation);
  return vec3(
    sin(azimuth) * horizontal,
    cos(azimuth) * horizontal,
    sin(elevation)
  );
}

void main() {
  vec4 dimensions = czm_batchTable_shapeDimensions(batchId);
  vec4 shapeParameters = czm_batchTable_shapeParameters(batchId);
  vec2 orientation = czm_batchTable_orientation(batchId);
  float face = parametric.z;
  float u = parametric.x;
  float v = parametric.y;
  float halfAzimuth = shapeParameters.z * 0.5;
  float halfElevation = shapeParameters.w * 0.5;
  float azimuth = (u - 0.5) * shapeParameters.z;
  float elevation = (v - 0.5) * shapeParameters.w;
  float distanceFromRadar = dimensions.z;

  // face=0 is the end cap; faces 1..4 are the fixed azimuth/elevation walls.
  if (face > 0.5 && face < 1.5) {
    azimuth = -halfAzimuth;
    distanceFromRadar = u * dimensions.z;
  } else if (face > 1.5 && face < 2.5) {
    azimuth = halfAzimuth;
    distanceFromRadar = u * dimensions.z;
  } else if (face > 2.5 && face < 3.5) {
    azimuth = (v - 0.5) * shapeParameters.z;
    elevation = -halfElevation;
    distanceFromRadar = u * dimensions.z;
  } else if (face > 3.5) {
    azimuth = (v - 0.5) * shapeParameters.z;
    elevation = halfElevation;
    distanceFromRadar = u * dimensions.z;
  }

  vec3 position = radarDirection(
    azimuth + orientation.x,
    elevation + orientation.y
  ) * distanceFromRadar;
  finishVertex(position);
  APPLY_INSTANCE_STYLE()
}
`;

const torusKnotBody = `
// Evaluate the p/q centerline first, then build a local Frenet-like frame for
// the tube. The finite-difference tangent keeps the formula compact and stable.
vec3 knotCenter(float angle, vec4 dimensions, vec4 shapeParameters) {
  float radialWave = dimensions.x * (1.0 + 0.32 * cos(shapeParameters.y * angle));
  return vec3(
    radialWave * cos(shapeParameters.x * angle),
    radialWave * sin(shapeParameters.x * angle),
    dimensions.x * 0.32 * sin(shapeParameters.y * angle)
  );
}

void main() {
  vec4 dimensions = czm_batchTable_shapeDimensions(batchId);
  vec4 shapeParameters = czm_batchTable_shapeParameters(batchId);
  vec4 style = czm_batchTable_style(batchId);
  float angle = surface.x * czm_twoPi;
  float tubeAngle = surface.y * czm_twoPi;
  float epsilon = 0.002;
  vec3 center = knotCenter(angle, dimensions, shapeParameters);
  vec3 tangent = normalize(
    knotCenter(angle + epsilon, dimensions, shapeParameters) -
    knotCenter(angle - epsilon, dimensions, shapeParameters)
  );
  // Avoid a nearly parallel reference vector before taking the cross product.
  vec3 reference = abs(tangent.z) < 0.9
    ? vec3(0.0, 0.0, 1.0)
    : vec3(1.0, 0.0, 0.0);
  vec3 normal = normalize(cross(tangent, reference));
  vec3 bitangent = normalize(cross(tangent, normal));
  vec3 tubeDirection = cos(tubeAngle) * normal + sin(tubeAngle) * bitangent;
  vec3 position = center + tubeDirection * dimensions.w;
  position.z += dimensions.x * 1.5 + dimensions.w;
  position = rotateAroundZ(position, style.x * 0.18);
  finishVertex(position);
  APPLY_INSTANCE_STYLE()
}
`;

/** Select the vertex formula that corresponds to a discriminated shape kind. */
export function getVertexShader(kind: ShaderGeometryKind): string {
  const body = {
    cube: cubeBody,
    "triangular-pyramid": pyramidBody,
    "hemisphere-radar": hemisphereBody,
    "sphere-radar": sphereBody,
    "phased-array-radar": phasedArrayBody,
    "torus-knot": torusKnotBody,
  }[kind];
  return `${vertexHeader}\n${body}`;
}

export const fragmentShader = `
in vec3 v_positionEC;
in vec2 v_surface;
in vec3 v_barycentric;
flat in vec4 v_style;
flat in vec2 v_gridScale;
flat in vec4 v_baseColor;
flat in vec4 v_gridColor;

float parametricGrid(vec2 coordinates) {
  vec2 scaled = coordinates * v_gridScale;
  vec2 derivative = max(fwidth(scaled), vec2(0.0001));
  vec2 distanceToLine = abs(fract(scaled - 0.5) - 0.5) / derivative;
  return 1.0 - min(min(distanceToLine.x, distanceToLine.y), 1.0);
}

float triangleEdges(vec3 coordinates) {
  vec3 derivative = max(fwidth(coordinates), vec3(0.0001));
  vec3 smoothed = smoothstep(vec3(0.0), derivative * 1.4, coordinates);
  return 1.0 - min(min(smoothed.x, smoothed.y), smoothed.z);
}

void main() {
  // Derive a screen-space normal from the displaced eye-space position. This
  // works for every parametric surface without sending normals from the CPU.
  vec3 normalEC = normalize(cross(dFdx(v_positionEC), dFdy(v_positionEC)));
  if (!gl_FrontFacing) normalEC = -normalEC;
  float light = 0.45 + 0.55 * abs(dot(normalEC, normalize(czm_lightDirectionEC)));
  // Cubes/pyramids use barycentric edge distance; smooth surfaces use UV lines.
  float grid = v_style.w < 0.5
    ? triangleEdges(v_barycentric)
    : parametricGrid(v_surface);
  grid *= v_style.z;

  // Radar scan phase advances with time and wraps without discontinuities.
  float scanPhase = fract(v_style.x * 0.09);
  float scanDistance = abs(fract(v_surface.x - scanPhase + 0.5) - 0.5);
  float scan = (1.0 - smoothstep(0.012, 0.055, scanDistance)) * v_style.y;

  vec3 surfaceColor = v_baseColor.rgb * light;
  vec3 color = mix(surfaceColor, v_gridColor.rgb, grid * 0.92);
  color += v_gridColor.rgb * scan * 0.85;
  float alpha = v_baseColor.a + grid * 0.28 + scan * 0.2;
  out_FragColor = vec4(color, clamp(alpha, 0.0, 0.96));
}
`;
