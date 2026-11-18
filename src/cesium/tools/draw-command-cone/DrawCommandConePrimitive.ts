import * as Cesium from "cesium";
import { createCesiumConeMesh } from "./geometry";
import fragmentShaderSource from "./shader/fragmentShaderSource.fs.glsl?raw";
import vertexShaderSource from "./shader/vertexShaderSource.vs.glsl?raw";
import type {
  ConeMaterialType,
  DrawCommandConeCommonOptions,
  DrawCommandConeFromEndPositionOptions,
  DrawCommandConeFromHeadingPitchRollOptions,
  DrawCommandConeInstance,
  DrawCommandConePrimitiveOptions,
  DrawCommandConeRenderStateOptions,
} from "./types";

const INSTANCE_FLOATS = 20;
const INSTANCE_STRIDE = INSTANCE_FLOATS * Float32Array.BYTES_PER_ELEMENT;
const DEFAULT_CAPACITY = 256;
const DEFAULT_SLICES = 48;
const LOCAL_CONE_AXIS = new Cesium.Cartesian3(0, 0, -1);
const scratchDirection = new Cesium.Cartesian3();
const scratchAxis = new Cesium.Cartesian3();
const scratchOffset = new Cesium.Cartesian3();
const scratchCenter = new Cesium.Cartesian3();
const SNAPSHOT_FLOATS = 16;
const scratchSnapshot = new Float64Array(SNAPSHOT_FLOATS);
const scratchQuaternion = new Cesium.Quaternion();
const scratchFactoryQuaternion = new Cesium.Quaternion();
const scratchFactoryRotation = new Cesium.Matrix3();

interface GpuResource {
  isDestroyed(): boolean;
  destroy(): void;
}

interface GpuBuffer extends GpuResource {
  vertexArrayDestroyable: boolean;
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
  Pass: { OPAQUE: number; TRANSLUCENT: number };
  RenderState: { fromCache(options?: object): object };
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

function materialTypeToNumber(materialType: ConeMaterialType): number {
  if (materialType === "wave") return 1;
  if (materialType === "gradient") return 2;
  return 0;
}

function validateInstance(instance: DrawCommandConeInstance): void {
  if (!Number.isFinite(instance.length) || instance.length <= 0) {
    throw new Error("每个圆锥的 length 必须是有限正数。");
  }
  if (!Number.isFinite(instance.startRadius) || instance.startRadius < 0) {
    throw new Error("每个圆锥的 startRadius 必须是有限非负数。");
  }
  if (
    !Number.isFinite(instance.angle) ||
    instance.angle <= 0 ||
    instance.angle >= Math.PI
  ) {
    throw new Error(
      "每个圆锥的 angle 必须是大于 0 且小于 PI 的有限弧度值。",
    );
  }
  if (
    !Number.isFinite(instance.animationSpeed) ||
    instance.animationSpeed < 0
  ) {
    throw new Error(
      "每个圆锥的 animationSpeed 必须是有限非负数。",
    );
  }
  if (
    !Number.isInteger(instance.materialCount) ||
    instance.materialCount < 1
  ) {
    throw new Error("每个圆锥的 materialCount 必须是正整数。");
  }
  if (
    !Number.isFinite(instance.direction.x) ||
    !Number.isFinite(instance.direction.y) ||
    !Number.isFinite(instance.direction.z) ||
    Cesium.Cartesian3.magnitudeSquared(instance.direction) <=
      Cesium.Math.EPSILON14
  ) {
    throw new Error("每个圆锥的 direction 必须是有限非零向量。");
  }
  if (
    instance.type !== "transparent" &&
    instance.type !== "wave" &&
    instance.type !== "gradient"
  ) {
    throw new Error(`未知的圆锥材质类型：${instance.type}。`);
  }
}

function createFactoryInstance(
  options: DrawCommandConeCommonOptions,
  direction: Cesium.Cartesian3,
  length: number,
): DrawCommandConeInstance {
  const instance: DrawCommandConeInstance = {
    start: Cesium.Cartesian3.clone(options.position),
    length,
    startRadius: options.startRadius,
    angle: options.angle,
    direction: Cesium.Cartesian3.clone(direction),
    type: options.type,
    animationSpeed: options.animationSpeed,
    materialCount: options.materialCount,
    color: Cesium.Color.clone(options.color),
  };
  validateInstance(instance);
  return instance;
}

function quaternionFromDirection(
  direction: Cesium.Cartesian3,
  result: Cesium.Quaternion,
): Cesium.Quaternion {
  Cesium.Cartesian3.normalize(direction, scratchDirection);
  const dot = Cesium.Math.clamp(
    Cesium.Cartesian3.dot(LOCAL_CONE_AXIS, scratchDirection),
    -1,
    1,
  );
  if (dot > 1 - Cesium.Math.EPSILON10) {
    return Cesium.Quaternion.clone(Cesium.Quaternion.IDENTITY, result);
  }
  if (dot < -1 + Cesium.Math.EPSILON10) {
    return Cesium.Quaternion.fromAxisAngle(
      Cesium.Cartesian3.UNIT_X,
      Math.PI,
      result,
    );
  }

  Cesium.Cartesian3.cross(LOCAL_CONE_AXIS, scratchDirection, scratchAxis);
  result.x = scratchAxis.x;
  result.y = scratchAxis.y;
  result.z = scratchAxis.z;
  result.w = 1 + dot;
  return Cesium.Quaternion.normalize(result, result);
}

/**
 * 使用同一个 Cesium.CylinderGeometry 网格进行 GPU 实例化绘制的圆锥 Primitive。
 *
 * RenderState 由 Primitive 构造参数统一控制，所有实例共享同一个 RenderState
 * 和 DrawCommand。三种材质通过逐实例着色器属性进行选择。
 */
export class DrawCommandConePrimitive {
  show = true;

  readonly capacity: number;

  private readonly mesh: ReturnType<typeof createCesiumConeMesh>;
  private readonly renderStateOptions?: DrawCommandConeRenderStateOptions;
  private readonly boundingVolume = new Cesium.BoundingSphere();
  private readonly values: Float32Array;
  private instanceCount = 0;
  private positionBuffer?: GpuBuffer;
  private normalBuffer?: GpuBuffer;
  private indexBuffer?: GpuBuffer;
  private instanceBuffer?: GpuBuffer;
  private vertexArray?: GpuResource;
  private shaderProgram?: GpuResource;
  private command?: DrawCommandLike;
  private readonly snapshots: Float64Array;
  private readonly instanceBounds: Float64Array;
  private readonly dirtyIndices = new Set<number>();
  private boundsDirty = false;
  private destroyed = false;

  constructor(options: DrawCommandConePrimitiveOptions = {}) {
    this.capacity = Math.max(1, Math.floor(options.capacity ?? DEFAULT_CAPACITY));
    this.renderStateOptions = options.renderState;
    const slices = Math.max(3, Math.floor(options.slices ?? DEFAULT_SLICES));
    this.mesh = createCesiumConeMesh(slices);
    this.values = new Float32Array(this.capacity * INSTANCE_FLOATS);
    this.snapshots = new Float64Array(this.capacity * SNAPSHOT_FLOATS);
    this.instanceBounds = new Float64Array(this.capacity * 4);
  }

  /**
   * 根据起点和终点自动计算方向与长度，并创建一个圆锥实例参数。
   */
  static createFromEndPosition(
    options: DrawCommandConeFromEndPositionOptions,
  ): DrawCommandConeInstance {
    const direction = Cesium.Cartesian3.subtract(
      options.endPosition,
      options.position,
      new Cesium.Cartesian3(),
    );
    const length = Cesium.Cartesian3.magnitude(direction);
    if (!Number.isFinite(length) || length <= Cesium.Math.EPSILON7) {
      throw new Error("圆锥的 position 和 endPosition 不能是同一个点。");
    }
    Cesium.Cartesian3.normalize(direction, direction);
    return createFactoryInstance(options, direction, length);
  }

  /**
   * 根据 ENU 坐标系下的 HeadingPitchRoll 姿态和长度创建圆锥实例参数。
   * 该姿态会在 `position` 处旋转圆锥本地的 -Z 前进轴。
   */
  static createFromHeadingPitchRoll(
    options: DrawCommandConeFromHeadingPitchRollOptions,
  ): DrawCommandConeInstance {
    Cesium.Transforms.headingPitchRollQuaternion(
      options.position,
      options.direction,
      Cesium.Ellipsoid.default,
      undefined,
      scratchFactoryQuaternion,
    );
    Cesium.Matrix3.fromQuaternion(
      scratchFactoryQuaternion,
      scratchFactoryRotation,
    );
    const direction = Cesium.Matrix3.multiplyByVector(
      scratchFactoryRotation,
      LOCAL_CONE_AXIS,
      new Cesium.Cartesian3(),
    );
    Cesium.Cartesian3.normalize(direction, direction);
    return createFactoryInstance(options, direction, options.length);
  }

  /** 替换完整的圆锥列表；输入对象会被校验，但不会被内部持有。 */
  setInstances(instances: readonly DrawCommandConeInstance[]): void {
    if (this.destroyed) return;
    if (instances.length > this.capacity) {
      throw new Error(
        `圆锥实例数量 ${instances.length} 超出了容量限制 ${this.capacity}。`,
      );
    }

    for (const instance of instances) validateInstance(instance);

    const previousCount = this.instanceCount;
    for (let index = 0; index < instances.length; index += 1) {
      this.packInstance(index, instances[index], index >= previousCount);
    }
    this.instanceCount = instances.length;
    if (previousCount !== this.instanceCount) this.boundsDirty = true;
    for (const index of this.dirtyIndices) {
      if (index >= this.instanceCount) this.dirtyIndices.delete(index);
    }
    if (this.command) this.command.instanceCount = this.instanceCount;
  }

  /** 更新现有列表中的连续区间；索引保持不变，不增加或删除实例。 */
  updateInstances(startIndex: number, instances: readonly DrawCommandConeInstance[]): void {
    if (this.destroyed) return;
    if (!Number.isInteger(startIndex) || startIndex < 0 ||
        startIndex + instances.length > this.instanceCount) {
      throw new Error("圆锥更新区间超出了现有实例范围。");
    }
    // 先完整校验，避免无效输入只提交了一半。
    for (const instance of instances) validateInstance(instance);
    for (let index = 0; index < instances.length; index += 1) {
      this.packInstance(startIndex + index, instances[index], false);
    }
  }

  private packInstance(index: number, instance: DrawCommandConeInstance, force: boolean): void {
    const next = scratchSnapshot;
    next[0] = instance.start.x;
    next[1] = instance.start.y;
    next[2] = instance.start.z;
    next[3] = instance.direction.x;
    next[4] = instance.direction.y;
    next[5] = instance.direction.z;
    next[6] = instance.length;
    next[7] = instance.startRadius;
    next[8] = instance.angle;
    next[9] = instance.color.red;
    next[10] = instance.color.green;
    next[11] = instance.color.blue;
    next[12] = instance.color.alpha;
    next[13] = materialTypeToNumber(instance.type);
    next[14] = instance.animationSpeed;
    next[15] = instance.materialCount;
    const snapshotOffset = index * SNAPSHOT_FLOATS;
    let shapeChanged = force;
    let materialChanged = force;
    for (let i = 0; i < SNAPSHOT_FLOATS; i += 1) {
      if (this.snapshots[snapshotOffset + i] !== next[i]) {
        if (i < 9) shapeChanged = true;
        else materialChanged = true;
        this.snapshots[snapshotOffset + i] = next[i];
      }
    }
    if (!shapeChanged && !materialChanged) return;
    this.dirtyIndices.add(index);
    const offset = index * INSTANCE_FLOATS;
    const values = this.values;
    if (shapeChanged) {
      const highX = encodeHigh(instance.start.x);
      const highY = encodeHigh(instance.start.y);
      const highZ = encodeHigh(instance.start.z);
      // 此函数同时将 direction 归一化到 scratchDirection，供包围球复用。
      const quaternion = quaternionFromDirection(instance.direction, scratchQuaternion);
      const slope = Math.tan(instance.angle * 0.5);
      values[offset] = highX;
      values[offset + 1] = highY;
      values[offset + 2] = highZ;
      values[offset + 3] = instance.start.x - highX;
      values[offset + 4] = instance.start.y - highY;
      values[offset + 5] = instance.start.z - highZ;
      values[offset + 6] = quaternion.x;
      values[offset + 7] = quaternion.y;
      values[offset + 8] = quaternion.z;
      values[offset + 9] = quaternion.w;
      values[offset + 10] = instance.length;
      values[offset + 11] = instance.startRadius;
      values[offset + 12] = slope;
      Cesium.Cartesian3.multiplyByScalar(scratchDirection, instance.length * 0.5, scratchOffset);
      Cesium.Cartesian3.add(instance.start, scratchOffset, scratchCenter);
      const boundsOffset = index * 4;
      this.instanceBounds[boundsOffset] = scratchCenter.x;
      this.instanceBounds[boundsOffset + 1] = scratchCenter.y;
      this.instanceBounds[boundsOffset + 2] = scratchCenter.z;
      this.instanceBounds[boundsOffset + 3] = Math.hypot(
        instance.length * 0.5, instance.startRadius + instance.length * slope,
      );
      this.boundsDirty = true;
    }
    if (materialChanged) {
      for (let i = 9; i < SNAPSHOT_FLOATS; i += 1) values[offset + i + 4] = next[i];
    }
  }

  /** 多次修改在实际渲染前合并；纯材质修改无需重算包围球。 */
  private updateBounds(): void {
    const center = this.boundingVolume.center;
    Cesium.Cartesian3.clone(Cesium.Cartesian3.ZERO, center);
    const bounds = this.instanceBounds;
    for (let index = 0; index < this.instanceCount; index += 1) {
      const offset = index * 4;
      center.x += bounds[offset];
      center.y += bounds[offset + 1];
      center.z += bounds[offset + 2];
    }
    if (this.instanceCount > 0) {
      Cesium.Cartesian3.divideByScalar(center, this.instanceCount, center);
    }
    let radius = 0;
    for (let index = 0; index < this.instanceCount; index += 1) {
      const offset = index * 4;
      radius = Math.max(radius, Math.hypot(
        center.x - bounds[offset], center.y - bounds[offset + 1], center.z - bounds[offset + 2],
      ) + bounds[offset + 3]);
    }
    this.boundingVolume.radius = radius;
    this.boundsDirty = false;
  }

  update(frameState: FrameStateLike): void {
    if (this.destroyed || !this.show) return;
    if (this.instanceCount === 0) return;
    if (!this.shaderProgram) this.createResources(frameState.context);

    if (this.boundsDirty) this.updateBounds();
    if (this.dirtyIndices.size > 0 && this.instanceBuffer) {
      if (this.dirtyIndices.size > this.instanceCount / 2 || this.dirtyIndices.size > 64) {
        this.instanceBuffer.copyFromArrayView(
          this.values.subarray(0, this.instanceCount * INSTANCE_FLOATS),
        );
      } else {
        const indices = Array.from(this.dirtyIndices).sort((a, b) => a - b);
        for (let i = 0; i < indices.length; i += 1) {
          const start = indices[i];
          let end = start + 1;
          while (indices[i + 1] === end) { i += 1; end += 1; }
          this.instanceBuffer.copyFromArrayView(
            this.values.subarray(start * INSTANCE_FLOATS, end * INSTANCE_FLOATS),
            start * INSTANCE_STRIDE,
          );
        }
      }
      this.dirtyIndices.clear();
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
    this.dirtyIndices.clear();
    this.vertexArray?.destroy();
    this.vertexArray = undefined;
    this.instanceBuffer = undefined;
    this.command = undefined;
    this.positionBuffer?.destroy();
    this.normalBuffer?.destroy();
    this.indexBuffer?.destroy();
    this.shaderProgram?.destroy();
    this.positionBuffer = undefined;
    this.normalBuffer = undefined;
    this.indexBuffer = undefined;
    this.shaderProgram = undefined;
  }

  private createResources(context: object): void {
    this.positionBuffer = Rendering.Buffer.createVertexBuffer({
      context,
      typedArray: this.mesh.positions,
      usage: Rendering.BufferUsage.STATIC_DRAW,
    });
    this.normalBuffer = Rendering.Buffer.createVertexBuffer({
      context,
      typedArray: this.mesh.normals,
      usage: Rendering.BufferUsage.STATIC_DRAW,
    });
    this.indexBuffer = Rendering.Buffer.createIndexBuffer({
      context,
      typedArray: this.mesh.indices,
      usage: Rendering.BufferUsage.STATIC_DRAW,
      indexDatatype:
        this.mesh.indices instanceof Uint32Array
          ? Cesium.IndexDatatype.UNSIGNED_INT
          : Cesium.IndexDatatype.UNSIGNED_SHORT,
    });
    this.positionBuffer.vertexArrayDestroyable = false;
    this.normalBuffer.vertexArrayDestroyable = false;
    this.indexBuffer.vertexArrayDestroyable = false;

    const attributeLocations = {
      position: 0,
      normal: 1,
      instancePositionHigh: 2,
      instancePositionLow: 3,
      instanceQuaternion: 4,
      instanceShape: 5,
      instanceColor: 6,
      instanceMaterial: 7,
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

    this.instanceBuffer = Rendering.Buffer.createVertexBuffer({
      context,
      sizeInBytes: this.values.byteLength,
      usage: Rendering.BufferUsage.DYNAMIC_DRAW,
    });
    this.vertexArray = new Rendering.VertexArray({
      context,
      indexBuffer: this.indexBuffer,
      attributes: [
        {
          index: 0,
          vertexBuffer: this.positionBuffer,
          componentsPerAttribute: 3,
          componentDatatype: Cesium.ComponentDatatype.FLOAT,
        },
        {
          index: 1,
          vertexBuffer: this.normalBuffer,
          componentsPerAttribute: 3,
          componentDatatype: Cesium.ComponentDatatype.FLOAT,
        },
        {
          index: 2,
          vertexBuffer: this.instanceBuffer,
          componentsPerAttribute: 3,
          componentDatatype: Cesium.ComponentDatatype.FLOAT,
          offsetInBytes: 0,
          strideInBytes: INSTANCE_STRIDE,
          instanceDivisor: 1,
        },
        {
          index: 3,
          vertexBuffer: this.instanceBuffer,
          componentsPerAttribute: 3,
          componentDatatype: Cesium.ComponentDatatype.FLOAT,
          offsetInBytes: 12,
          strideInBytes: INSTANCE_STRIDE,
          instanceDivisor: 1,
        },
        {
          index: 4,
          vertexBuffer: this.instanceBuffer,
          componentsPerAttribute: 4,
          componentDatatype: Cesium.ComponentDatatype.FLOAT,
          offsetInBytes: 24,
          strideInBytes: INSTANCE_STRIDE,
          instanceDivisor: 1,
        },
        {
          index: 5,
          vertexBuffer: this.instanceBuffer,
          componentsPerAttribute: 3,
          componentDatatype: Cesium.ComponentDatatype.FLOAT,
          offsetInBytes: 40,
          strideInBytes: INSTANCE_STRIDE,
          instanceDivisor: 1,
        },
        {
          index: 6,
          vertexBuffer: this.instanceBuffer,
          componentsPerAttribute: 4,
          componentDatatype: Cesium.ComponentDatatype.FLOAT,
          offsetInBytes: 52,
          strideInBytes: INSTANCE_STRIDE,
          instanceDivisor: 1,
        },
        {
          index: 7,
          vertexBuffer: this.instanceBuffer,
          componentsPerAttribute: 3,
          componentDatatype: Cesium.ComponentDatatype.FLOAT,
          offsetInBytes: 68,
          strideInBytes: INSTANCE_STRIDE,
          instanceDivisor: 1,
        },
      ],
    });
    // 外部未传入的字段由 Cesium RenderState.fromCache 补充引擎默认值。
    const renderState = Rendering.RenderState.fromCache(
      this.renderStateOptions,
    );
    this.command = new Rendering.DrawCommand({
      owner: this,
      vertexArray: this.vertexArray,
      shaderProgram: this.shaderProgram,
      renderState,
      primitiveType: Cesium.PrimitiveType.TRIANGLES,
      // Cesium 的透明 Pass 会使用 OIT 或按相机距离排序，无法指定稳定的队首顺序。
      // 将透明混合命令放在 OPAQUE Pass，可保证它先于标准透明 Pass 执行；
      // 配合 depthMask=false，后续半透明对象会正常绘制在圆锥之上。
      pass: Rendering.Pass.OPAQUE,
      instanceCount: this.instanceCount,
      count: this.mesh.indices.length,
      boundingVolume: this.boundingVolume,
      // 整批圆锥离开视锥或被地球遮挡时，跳过该 DrawCommand。
      cull: true,
      occlude: true,
      modelMatrix: Cesium.Matrix4.IDENTITY,
    });
  }
}
