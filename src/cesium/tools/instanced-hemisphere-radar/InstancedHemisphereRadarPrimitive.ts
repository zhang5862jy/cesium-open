import * as Cesium from "cesium";
import { createHemisphereMesh } from "./geometry";
import fragmentShaderSource from "./shader/fragmentShaderSource.fs.glsl?raw";
import vertexShaderSource from "./shader/vertexShaderSource.vs.glsl?raw";
import type {
  HemisphereRadarData,
  InstancedHemisphereRadarOptions,
} from "./types";

const INSTANCE_FLOATS = 17;
const INSTANCE_STRIDE = INSTANCE_FLOATS * Float32Array.BYTES_PER_ELEMENT;
const DEFAULT_CAPACITY = 2_000;
const DEFAULT_COLOR =
  Cesium.Color.fromCssColorString("#2ac8ff").withAlpha(0.22);
const identityOrientation = new Cesium.HeadingPitchRoll();
const scratchQuaternion = new Cesium.Quaternion();

interface GpuResource {
  isDestroyed(): boolean;
  destroy(): void;
}

interface GpuBuffer extends GpuResource {
  copyFromArrayView(value: ArrayBufferView, offsetInBytes?: number): void;
}

interface DrawCommandLike {
  instanceCount: number;
  boundingVolume: Cesium.BoundingSphere;
}

interface FrameStateLike {
  context: object;
  commandList: DrawCommandLike[];
  passes: { render: boolean };
}

interface CesiumRenderingInternals {
  Buffer: {
    createVertexBuffer(options: object): GpuBuffer;
    createIndexBuffer(options: object): GpuBuffer;
  };
  BufferUsage: { STATIC_DRAW: number; DYNAMIC_DRAW: number };
  DrawCommand: new (options: object) => DrawCommandLike;
  Pass: { TRANSLUCENT: number };
  RenderState: { fromCache(options: object): object };
  ShaderProgram: { fromCache(options: object): GpuResource };
  ShaderSource: new (options: object) => object;
  VertexArray: new (options: object) => GpuResource;
}

const Rendering = Cesium as typeof Cesium & CesiumRenderingInternals;

function encodeHigh(value: number): number {
  return value >= 0
    ? Math.floor(value / 65_536) * 65_536
    : -Math.floor(-value / 65_536) * 65_536;
}

/**
 * A one-draw-call pipeline for frequently moving hemisphere radars.
 *
 * The unit mesh and shader are immutable. set() only repacks the per-instance
 * position/orientation/scale/color buffer and changes DrawCommand.instanceCount.
 */
export class InstancedHemisphereRadarPrimitive {
  show = true;

  readonly capacity: number;

  private readonly mesh: ReturnType<typeof createHemisphereMesh>;
  private readonly instanceValues: Float32Array;
  private readonly boundingVolume = new Cesium.BoundingSphere();
  private readonly defaultColor: Cesium.Color;
  private instanceCount = 0;
  private instanceBuffer?: GpuBuffer;
  private vertexArray?: GpuResource;
  private shaderProgram?: GpuResource;
  private command?: DrawCommandLike;
  private dataDirty = true;
  private destroyed = false;

  constructor(options: InstancedHemisphereRadarOptions = {}) {
    this.capacity = Math.max(
      1,
      Math.floor(options.capacity ?? DEFAULT_CAPACITY),
    );
    const sliceCount = Math.max(8, Math.floor(options.sliceCount ?? 32));
    const stackCount = Math.max(3, Math.floor(options.stackCount ?? 12));
    if ((sliceCount + 1) * (stackCount + 1) > 65_535) {
      throw new Error("Hemisphere topology exceeds Uint16 index capacity.");
    }
    this.mesh = createHemisphereMesh(sliceCount, stackCount);
    this.instanceValues = new Float32Array(this.capacity * INSTANCE_FLOATS);
    this.defaultColor = Cesium.Color.clone(options.color ?? DEFAULT_COLOR);
  }

  /** Replace the full visible data set. The supplied objects are not retained. */
  set(data: readonly HemisphereRadarData[]): void {
    if (this.destroyed) return;
    if (data.length > this.capacity) {
      throw new Error(
        `Hemisphere radar data length ${data.length} exceeds capacity ${this.capacity}.`,
      );
    }

    this.instanceCount = data.length;
    let maximumRadius = 0;
    if (data.length > 0) {
      Cesium.Cartesian3.clone(data[0].position, this.boundingVolume.center);
    }

    for (let index = 0; index < data.length; index += 1) {
      const item = data[index];
      const offset = index * INSTANCE_FLOATS;
      const highX = encodeHigh(item.position.x);
      const highY = encodeHigh(item.position.y);
      const highZ = encodeHigh(item.position.z);
      const orientation = item.orientation ?? identityOrientation;
      Cesium.Transforms.headingPitchRollQuaternion(
        item.position,
        orientation,
        Cesium.Ellipsoid.default,
        undefined,
        scratchQuaternion,
      );
      const scaleX = typeof item.scale === "number" ? item.scale : item.scale.x;
      const scaleY = typeof item.scale === "number" ? item.scale : item.scale.y;
      const scaleZ = typeof item.scale === "number" ? item.scale : item.scale.z;
      const color = item.color ?? this.defaultColor;

      const values = this.instanceValues;
      values[offset] = highX;
      values[offset + 1] = highY;
      values[offset + 2] = highZ;
      values[offset + 3] = item.position.x - highX;
      values[offset + 4] = item.position.y - highY;
      values[offset + 5] = item.position.z - highZ;
      values[offset + 6] = scratchQuaternion.x;
      values[offset + 7] = scratchQuaternion.y;
      values[offset + 8] = scratchQuaternion.z;
      values[offset + 9] = scratchQuaternion.w;
      values[offset + 10] = scaleX;
      values[offset + 11] = scaleY;
      values[offset + 12] = scaleZ;
      values[offset + 13] = color.red;
      values[offset + 14] = color.green;
      values[offset + 15] = color.blue;
      values[offset + 16] = color.alpha;
      maximumRadius = Math.max(
        maximumRadius,
        Cesium.Cartesian3.distance(this.boundingVolume.center, item.position) +
          Math.max(scaleX, scaleY, scaleZ),
      );
    }
    this.boundingVolume.radius = maximumRadius;
    this.dataDirty = true;
    if (this.command) {
      this.command.instanceCount = this.instanceCount;
      this.command.boundingVolume = this.boundingVolume;
    }
  }

  update(frameState: FrameStateLike): void {
    if (this.destroyed || !this.show || this.instanceCount === 0) return;
    if (!this.command) this.createResources(frameState.context);
    if (this.dataDirty && this.instanceBuffer) {
      this.instanceBuffer.copyFromArrayView(
        this.instanceValues.subarray(0, this.instanceCount * INSTANCE_FLOATS),
      );
      this.dataDirty = false;
    }
    if (frameState.passes.render && this.command) {
      frameState.commandList.push(this.command);
    }
  }

  isDestroyed(): boolean {
    return this.destroyed;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.vertexArray?.destroy();
    this.shaderProgram?.destroy();
    this.vertexArray = undefined;
    this.shaderProgram = undefined;
    this.instanceBuffer = undefined;
    this.command = undefined;
  }

  private createResources(context: object): void {
    const vertexBuffer = Rendering.Buffer.createVertexBuffer({
      context,
      typedArray: this.mesh.vertices,
      usage: Rendering.BufferUsage.STATIC_DRAW,
    });
    const indexBuffer = Rendering.Buffer.createIndexBuffer({
      context,
      typedArray: this.mesh.indices,
      usage: Rendering.BufferUsage.STATIC_DRAW,
      indexDatatype: Cesium.IndexDatatype.UNSIGNED_SHORT,
    });
    this.instanceBuffer = Rendering.Buffer.createVertexBuffer({
      context,
      sizeInBytes: this.instanceValues.byteLength,
      usage: Rendering.BufferUsage.DYNAMIC_DRAW,
    });
    this.vertexArray = new Rendering.VertexArray({
      context,
      indexBuffer,
      attributes: [
        {
          index: 0,
          vertexBuffer,
          componentsPerAttribute: 3,
          offsetInBytes: 0,
          strideInBytes: 20,
        },
        {
          index: 1,
          vertexBuffer,
          componentsPerAttribute: 2,
          offsetInBytes: 12,
          strideInBytes: 20,
        },
        {
          index: 2,
          vertexBuffer: this.instanceBuffer,
          componentsPerAttribute: 3,
          offsetInBytes: 0,
          strideInBytes: INSTANCE_STRIDE,
          instanceDivisor: 1,
        },
        {
          index: 3,
          vertexBuffer: this.instanceBuffer,
          componentsPerAttribute: 3,
          offsetInBytes: 12,
          strideInBytes: INSTANCE_STRIDE,
          instanceDivisor: 1,
        },
        {
          index: 4,
          vertexBuffer: this.instanceBuffer,
          componentsPerAttribute: 4,
          offsetInBytes: 24,
          strideInBytes: INSTANCE_STRIDE,
          instanceDivisor: 1,
        },
        {
          index: 5,
          vertexBuffer: this.instanceBuffer,
          componentsPerAttribute: 3,
          offsetInBytes: 40,
          strideInBytes: INSTANCE_STRIDE,
          instanceDivisor: 1,
        },
        {
          index: 6,
          vertexBuffer: this.instanceBuffer,
          componentsPerAttribute: 4,
          offsetInBytes: 52,
          strideInBytes: INSTANCE_STRIDE,
          instanceDivisor: 1,
        },
      ],
    });
    const attributeLocations = {
      position: 0,
      st: 1,
      instancePositionHigh: 2,
      instancePositionLow: 3,
      instanceQuaternion: 4,
      instanceScale: 5,
      instanceColor: 6,
    };
    this.shaderProgram = Rendering.ShaderProgram.fromCache({
      context,
      vertexShaderSource: new Rendering.ShaderSource({
        defines: ["CESIUM_RUNTIME"],
        sources: [vertexShaderSource],
      }),
      fragmentShaderSource: new Rendering.ShaderSource({
        defines: ["CESIUM_RUNTIME"],
        sources: [fragmentShaderSource],
      }),
      attributeLocations,
    });
    const renderState = Rendering.RenderState.fromCache({
      depthTest: { enabled: true },
      depthMask: false,
      cull: { enabled: false },
      blending: Cesium.BlendingState.ALPHA_BLEND,
    });
    this.command = new Rendering.DrawCommand({
      owner: this,
      vertexArray: this.vertexArray,
      shaderProgram: this.shaderProgram,
      renderState,
      primitiveType: Cesium.PrimitiveType.TRIANGLES,
      pass: Rendering.Pass.TRANSLUCENT,
      instanceCount: this.instanceCount,
      count: this.mesh.indices.length,
      boundingVolume: this.boundingVolume,
      modelMatrix: Cesium.Matrix4.IDENTITY,
    });
  }
}
