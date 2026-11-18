import * as Cesium from "cesium";
import { createParametricGeometry } from "./geometry";
import { fragmentShader, getVertexShader } from "./shaders";
import type {
  ShaderGeometryController,
  ShaderGeometryKind,
  ShaderGeometryOptions,
} from "./types";

/** CPU mirrors of the per-instance attributes consumed by the GLSL programs. */
interface AttributeState {
  /** Normalized RGBA surface color. */
  baseColor: Uint8Array;
  /** Normalized RGBA grid/scan color. */
  gridColor: Uint8Array;
  /** time, radar-scan flag, grid flag, and grid-mode discriminator. */
  style: Float32Array;
  /** Number of procedural grid cells in U/V. */
  gridScale: Float32Array;
  /** Shape dimensions packed as size/height/radius/ring-tube values. */
  shapeDimensions: Float32Array;
  /** Shape-specific parameters such as p/q and angular spans. */
  shapeParameters: Float32Array;
  /** Heading and pitch in radians for directional radar coverage. */
  orientation: Float32Array;
}

const INSTANCE_ID = "parametric-geometry-instance";
const DEFAULT_COLOR = Cesium.Color.fromCssColorString("#25aee8");
const DEFAULT_GRID_COLOR = Cesium.Color.fromCssColorString("#b8f4ff");

/** Radar variants receive a fragment-shader scan band. */
function isRadar(kind: ShaderGeometryKind): boolean {
  return kind.includes("radar");
}

/** Create and initialize the packed attributes for a new primitive instance. */
function createAttributeState(options: ShaderGeometryOptions): AttributeState {
  const state: AttributeState = {
    baseColor: new Uint8Array(4),
    gridColor: new Uint8Array(4),
    // time, scanEnabled, gridEnabled, gridMode
    style: new Float32Array([
      0,
      isRadar(options.kind) ? 1 : 0,
      options.gridEnabled === false ? 0 : 1,
      options.kind === "cube" || options.kind === "triangular-pyramid" ? 0 : 1,
    ]),
    gridScale: new Float32Array(
      options.kind === "torus-knot" ? [24, 8] : [16, 8],
    ),
    // size, height, radius/range, secondaryRadius
    shapeDimensions: new Float32Array([1, 1, 1, 1]),
    // p, q, azimuthSpan, elevationSpan
    shapeParameters: new Float32Array([
      2,
      3,
      Cesium.Math.toRadians(50),
      Cesium.Math.toRadians(30),
    ]),
    // heading, pitch
    orientation: new Float32Array([0, Cesium.Math.toRadians(18)]),
  };
  updateAttributeState(state, options);
  return state;
}

/**
 * Convert the public discriminated options into the compact GPU layout.
 *
 * This is deliberately kept separate from geometry creation: all values here
 * can change at runtime without changing the primitive's vertex/index buffers.
 */
function updateAttributeState(
  state: AttributeState,
  options: ShaderGeometryOptions,
): void {
  const baseColor = Cesium.Color.clone(options.color ?? DEFAULT_COLOR);
  baseColor.alpha = Cesium.Math.clamp(options.opacity ?? 0.28, 0, 1);
  Cesium.ColorGeometryInstanceAttribute.toValue(baseColor, state.baseColor);
  Cesium.ColorGeometryInstanceAttribute.toValue(
    options.gridColor ?? DEFAULT_GRID_COLOR,
    state.gridColor,
  );
  state.style[1] = isRadar(options.kind) ? 1 : 0;
  state.style[2] = options.gridEnabled === false ? 0 : 1;

  switch (options.kind) {
    case "cube":
      state.shapeDimensions[0] = options.size;
      break;
    case "triangular-pyramid":
      state.shapeDimensions[0] = options.baseRadius;
      state.shapeDimensions[1] = options.height;
      break;
    case "hemisphere-radar":
    case "sphere-radar":
      state.shapeDimensions[2] = options.radius;
      break;
    case "phased-array-radar":
      state.shapeDimensions[2] = options.range;
      state.shapeParameters[2] = Cesium.Math.toRadians(options.azimuthSpan);
      state.shapeParameters[3] = Cesium.Math.toRadians(options.elevationSpan);
      state.orientation[0] = Cesium.Math.toRadians(options.heading);
      state.orientation[1] = Cesium.Math.toRadians(options.pitch);
      break;
    case "torus-knot":
      state.shapeDimensions[0] = options.majorRadius;
      state.shapeDimensions[3] = options.tubeRadius;
      state.shapeParameters[0] = options.p;
      state.shapeParameters[1] = options.q;
      break;
  }
}

function floatAttribute(
  componentsPerAttribute: number,
  value: Float32Array,
): Cesium.GeometryInstanceAttribute {
  // GeometryInstanceAttribute accepts ordinary arrays, so copy typed arrays at
  // the API boundary while retaining typed storage for subsequent updates.
  return new Cesium.GeometryInstanceAttribute({
    componentDatatype: Cesium.ComponentDatatype.FLOAT,
    componentsPerAttribute,
    value: Array.from(value),
  });
}

function colorAttribute(value: Uint8Array): Cesium.GeometryInstanceAttribute {
  return new Cesium.GeometryInstanceAttribute({
    componentDatatype: Cesium.ComponentDatatype.UNSIGNED_BYTE,
    componentsPerAttribute: 4,
    normalize: true,
    value: Array.from(value),
  });
}

function createInstanceAttributes(state: AttributeState) {
  // Attribute names become `czm_batchTable_*` accessors in Appearance shaders.
  // Keep this map in sync with the declarations in shaders.ts.
  return {
    baseColor: colorAttribute(state.baseColor),
    gridColor: colorAttribute(state.gridColor),
    style: floatAttribute(4, state.style),
    gridScale: floatAttribute(2, state.gridScale),
    shapeDimensions: floatAttribute(4, state.shapeDimensions),
    shapeParameters: floatAttribute(4, state.shapeParameters),
    orientation: floatAttribute(2, state.orientation),
  };
}

export class ParametricGeometryPrimitive
  implements ShaderGeometryController
{
  readonly primitive: Cesium.Primitive;

  private readonly scene: Cesium.Scene;
  private readonly kind: ShaderGeometryKind;
  private readonly material: Cesium.Material;
  private readonly attributes: AttributeState;
  private destroyed = false;
  private pendingFullAttributeUpdate = false;

  /**
   * Create a custom Appearance + Primitive pair for one shape kind.
   *
   * Construction performs the expensive, immutable work once: CPU topology
   * generation, shader selection, render-state setup, and ENU placement.
   * Later calls to update() only modify GeometryInstance attributes.
   */
  constructor(scene: Cesium.Scene, options: ShaderGeometryOptions) {
    this.scene = scene;
    this.kind = options.kind;
    this.attributes = createAttributeState(options);
    this.material = Cesium.Material.fromType(Cesium.Material.ColorType);

    // The Appearance owns the custom GLSL. Transparency keeps the radar
    // volumes readable while depth testing still hides geometry behind Earth.
    const appearance = new Cesium.Appearance({
      material: this.material,
      vertexShaderSource: getVertexShader(options.kind),
      fragmentShaderSource: fragmentShader,
      translucent: true,
      closed: false,
      renderState: {
        depthTest: { enabled: true },
        depthMask: false,
        cull: { enabled: false },
        blending: Cesium.BlendingState.ALPHA_BLEND,
      },
    });

    // Geometry is synchronous here so the controller can be updated immediately
    // after construction; the application still uses a single draw primitive.
    this.primitive = scene.primitives.add(
      new Cesium.Primitive({
        geometryInstances: new Cesium.GeometryInstance({
          id: INSTANCE_ID,
          geometry: createParametricGeometry(options.kind),
          attributes: createInstanceAttributes(this.attributes),
        }),
        appearance,
        modelMatrix: Cesium.Transforms.eastNorthUpToFixedFrame(options.position),
        asynchronous: false,
        allowPicking: false,
      }),
    );
  }

  /**
   * Update position, dimensions, colors, and flags without rebuilding geometry.
   * A different discriminant would require a different topology and is rejected.
   */
  update(options: ShaderGeometryOptions): void {
    if (this.destroyed) return;
    if (options.kind !== this.kind) {
      throw new Error("Cannot change a parametric primitive's geometry kind.");
    }

    Cesium.Transforms.eastNorthUpToFixedFrame(
      options.position,
      Cesium.Ellipsoid.default,
      this.primitive.modelMatrix,
    );
    updateAttributeState(this.attributes, options);
    this.pendingFullAttributeUpdate = true;
    this.applyRuntimeAttributes();
  }

  /** Update only the animation clock, waiting for async instance readiness. */
  setTime(seconds: number): void {
    if (this.destroyed) return;
    this.attributes.style[0] = seconds;
    if (!this.primitive.ready) return;

    if (this.pendingFullAttributeUpdate) {
      this.applyRuntimeAttributes();
      return;
    }
    const runtimeAttributes = this.primitive.getGeometryInstanceAttributes(
      INSTANCE_ID,
    );
    runtimeAttributes.style = this.attributes.style;
  }

  isDestroyed(): boolean {
    return this.destroyed;
  }

  /** Idempotently detach the primitive and release its material resources. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (!this.primitive.isDestroyed()) {
      this.scene.primitives.remove(this.primitive);
    }
    if (!this.material.isDestroyed()) this.material.destroy();
  }

  private applyRuntimeAttributes(): void {
    // Cesium exposes instance attributes only after the primitive is ready. A
    // pending flag lets the next update/tick flush all values exactly once.
    if (!this.primitive.ready) return;
    const runtimeAttributes = this.primitive.getGeometryInstanceAttributes(
      INSTANCE_ID,
    );
    runtimeAttributes.baseColor = this.attributes.baseColor;
    runtimeAttributes.gridColor = this.attributes.gridColor;
    runtimeAttributes.style = this.attributes.style;
    runtimeAttributes.gridScale = this.attributes.gridScale;
    runtimeAttributes.shapeDimensions = this.attributes.shapeDimensions;
    runtimeAttributes.shapeParameters = this.attributes.shapeParameters;
    runtimeAttributes.orientation = this.attributes.orientation;
    this.pendingFullAttributeUpdate = false;
  }
}
