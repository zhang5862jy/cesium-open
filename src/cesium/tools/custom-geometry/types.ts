import type * as Cesium from "cesium";

/** Names of the geometry programs compiled by the shared primitive. */
export type ShaderGeometryKind =
  | "cube"
  | "triangular-pyramid"
  | "hemisphere-radar"
  | "sphere-radar"
  | "phased-array-radar"
  | "torus-knot";

/** Options shared by every parametric geometry shape. */
interface CommonShaderGeometryOptions {
  /** World-space anchor used to build the local ENU model matrix. */
  position: Cesium.Cartesian3;
  /** Base surface color. */
  color?: Cesium.Color;
  /** Procedural grid and scan color. */
  gridColor?: Cesium.Color;
  /** Surface opacity in the inclusive range [0, 1]. */
  opacity?: number;
  /** Whether the fragment shader should draw the procedural grid. */
  gridEnabled?: boolean;
  /** Multiplier applied to the animation clock in the shader. */
  animationSpeed?: number;
}

/** Dimensions for a GPU-constructed cube. */
export interface CubeGeometryOptions extends CommonShaderGeometryOptions {
  kind: "cube";
  /** Edge length in meters. */
  size: number;
}

/** Dimensions for a four-face triangular pyramid (tetrahedron). */
export interface TriangularPyramidGeometryOptions
  extends CommonShaderGeometryOptions {
  kind: "triangular-pyramid";
  /** Circumradius of the triangular base in meters. */
  baseRadius: number;
  /** Height from the base plane to the apex in meters. */
  height: number;
}

/** Radius of an upper-half spherical radar coverage surface. */
export interface HemisphereRadarGeometryOptions
  extends CommonShaderGeometryOptions {
  kind: "hemisphere-radar";
  /** Coverage radius in meters. */
  radius: number;
}

/** Radius of a complete spherical radar coverage surface. */
export interface SphereRadarGeometryOptions
  extends CommonShaderGeometryOptions {
  kind: "sphere-radar";
  /** Coverage radius in meters. */
  radius: number;
}

/** Angular and distance parameters for a phased-array radar cone. */
export interface PhasedArrayRadarGeometryOptions
  extends CommonShaderGeometryOptions {
  kind: "phased-array-radar";
  /** Detection distance in meters. */
  range: number;
  /** Horizontal angular width in degrees. */
  azimuthSpan: number;
  /** Vertical angular width in degrees. */
  elevationSpan: number;
  /** Heading of the cone in degrees. */
  heading: number;
  /** Pitch of the cone in degrees. */
  pitch: number;
}

/** Parametric p/q torus-knot dimensions. */
export interface TorusKnotGeometryOptions extends CommonShaderGeometryOptions {
  kind: "torus-knot";
  /** Major radius of the knot's centerline in meters. */
  majorRadius: number;
  /** Radius of the tube around the centerline in meters. */
  tubeRadius: number;
  /** Number of major revolutions. */
  p: number;
  /** Number of radial waves. */
  q: number;
}

/** Discriminated union used by the geometry and shader factories. */
export type ShaderGeometryOptions =
  | CubeGeometryOptions
  | TriangularPyramidGeometryOptions
  | HemisphereRadarGeometryOptions
  | SphereRadarGeometryOptions
  | PhasedArrayRadarGeometryOptions
  | TorusKnotGeometryOptions;

/** Runtime façade for one GPU-backed custom geometry primitive. */
export interface ShaderGeometryController {
  /** The underlying Cesium primitive, exposed for advanced integrations. */
  readonly primitive: Cesium.Primitive;
  /** Update uniforms/instance attributes without rebuilding topology. */
  update(options: ShaderGeometryOptions): void;
  /** Set the animation time consumed by the vertex and fragment shaders. */
  setTime(seconds: number): void;
  /** Whether destroy has already released the primitive and material. */
  isDestroyed(): boolean;
  /** Idempotently remove the primitive and release GPU material resources. */
  destroy(): void;
}
