import * as Cesium from "cesium";
import { createCubeMesh } from "./geometry";
import { Rendering } from "./renderer";
import type {
  DrawCommandLike,
  FrameStateLike,
  GpuBuffer,
  GpuResource,
} from "./renderer";
import type {
  HolographicCubeData,
  InstancedHolographicCubeOptions,
} from "./types";
import instancedVertexShaderSource from "./shader/instancedVertexShaderSource.vs.glsl?raw";
import fragmentShaderSource from "./shader/fragmentShaderSource.fs.glsl?raw";

// 每个顶点 8 float，每个实例 17 float
const FLOATS_PER_VERTEX = 8;
const VERTEX_STRIDE = FLOATS_PER_VERTEX * Float32Array.BYTES_PER_ELEMENT;
// high(3) + low(3) + quaternion(4) + scale(3) + color(4)
const INSTANCE_FLOATS = 17;
const INSTANCE_STRIDE = INSTANCE_FLOATS * Float32Array.BYTES_PER_ELEMENT;
const DEFAULT_CAPACITY = 2_000;
const DEFAULT_COLOR = Cesium.Color.fromCssColorString("#2ac8ff").withAlpha(0.85);
const identityOrientation = new Cesium.HeadingPitchRoll();
const scratchQuaternion = new Cesium.Quaternion();

/**
 * 把大世界坐标拆成 high/low 两段。high 是 65536 的整数倍，low 是余数，
 * 两者相加等于原值；GPU 用 czm_translateRelativeToEye(high, low) 恢复完整
 * 精度，避免 float 在 6371km 量级坐标下丢失低位。
 */
function encodeHigh(value: number): number {
  return value >= 0
    ? Math.floor(value / 65_536) * 65_536
    : -Math.floor(-value / 65_536) * 65_536;
}

/**
 * 实例化批量全息立方体：用【一次 draw call】绘制大量立方体。
 *
 * 网格与着色器完全不变；set() 只重写实例缓冲（位置 / 姿态 / 缩放 / 颜色），
 * 并更新 DrawCommand.instanceCount。这就是「Instancing 批次绘制」的核心：
 * 把成千上万次绘制合并成 1 次 GPU 调用。
 */
export class InstancedHolographicCubePrimitive {
  show = true;

  readonly capacity: number;

  private readonly mesh = createCubeMesh();
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

  constructor(options: InstancedHolographicCubeOptions = {}) {
    this.capacity = Math.max(1, Math.floor(options.capacity ?? DEFAULT_CAPACITY));
    // 预分配实例缓冲所需的 CPU 侧内存，避免运行期反复分配
    this.instanceValues = new Float32Array(this.capacity * INSTANCE_FLOATS);
    this.defaultColor = Cesium.Color.clone(options.color ?? DEFAULT_COLOR);
  }

  /** 一次性替换全部可见实例数据（传入的对象不会被保留引用） */
  set(data: readonly HolographicCubeData[]): void {
    if (this.destroyed) return;
    if (data.length > this.capacity) {
      throw new Error(
        `Holographic cube data length ${data.length} exceeds capacity ${this.capacity}.`,
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
      // 由经纬度姿态得到实例朝向四元数（world 空间）
      Cesium.Transforms.headingPitchRollQuaternion(
        item.position,
        orientation,
        Cesium.Ellipsoid.WGS84,
        undefined,
        scratchQuaternion,
      );
      const scaleX = typeof item.scale === "number" ? item.scale : item.scale.x;
      const scaleY = typeof item.scale === "number" ? item.scale : item.scale.y;
      const scaleZ = typeof item.scale === "number" ? item.scale : item.scale.z;
      const color = item.color ?? this.defaultColor;

      const values = this.instanceValues;
      values[offset + 0] = highX;
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

      // 包围球半径用「中心到最远实例的距离 + 实例自身最大半径」取上界，
      // 略微高估是安全的（只会多画，不会把可见立方体错误裁剪掉）。
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
    // 数据被 set() 标记为脏时，把 CPU 侧实例数组一次性拷到 GPU 实例缓冲
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
    // 1) 共享的单位立方体网格（所有实例复用这一份顶点 / 索引）
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

    // 2) 实例缓冲：每实例 17 float，DYNAMIC_DRAW 表示每帧都可能被覆盖
    this.instanceBuffer = Rendering.Buffer.createVertexBuffer({
      context,
      sizeInBytes: this.instanceValues.byteLength,
      usage: Rendering.BufferUsage.DYNAMIC_DRAW,
    });

    // 3) VertexArray：前 3 个 attribute 是逐顶点数据（instanceDivisor 默认 0），
    //    后 5 个是逐实例数据。instanceDivisor: 1 表示「每个实例取一次，
    //    而不是每个顶点取一次」——这正是 GPU Instancing 的关键设置。
    this.vertexArray = new Rendering.VertexArray({
      context,
      indexBuffer,
      attributes: [
        { index: 0, vertexBuffer, componentsPerAttribute: 3, offsetInBytes: 0, strideInBytes: VERTEX_STRIDE },
        { index: 1, vertexBuffer, componentsPerAttribute: 3, offsetInBytes: 12, strideInBytes: VERTEX_STRIDE },
        { index: 2, vertexBuffer, componentsPerAttribute: 2, offsetInBytes: 24, strideInBytes: VERTEX_STRIDE },
        { index: 3, vertexBuffer: this.instanceBuffer, componentsPerAttribute: 3, offsetInBytes: 0, strideInBytes: INSTANCE_STRIDE, instanceDivisor: 1 },
        { index: 4, vertexBuffer: this.instanceBuffer, componentsPerAttribute: 3, offsetInBytes: 12, strideInBytes: INSTANCE_STRIDE, instanceDivisor: 1 },
        { index: 5, vertexBuffer: this.instanceBuffer, componentsPerAttribute: 4, offsetInBytes: 24, strideInBytes: INSTANCE_STRIDE, instanceDivisor: 1 },
        { index: 6, vertexBuffer: this.instanceBuffer, componentsPerAttribute: 3, offsetInBytes: 40, strideInBytes: INSTANCE_STRIDE, instanceDivisor: 1 },
        { index: 7, vertexBuffer: this.instanceBuffer, componentsPerAttribute: 4, offsetInBytes: 52, strideInBytes: INSTANCE_STRIDE, instanceDivisor: 1 },
      ],
    });

    // 4) ShaderProgram（复用同一份片元着色器，顶点着色器换成实例化版）
    this.shaderProgram = Rendering.ShaderProgram.fromCache({
      context,
      vertexShaderSource: new Rendering.ShaderSource({
        defines: ["CESIUM_RUNTIME"],
        sources: [instancedVertexShaderSource],
      }),
      fragmentShaderSource: new Rendering.ShaderSource({
        defines: ["CESIUM_RUNTIME"],
        sources: [fragmentShaderSource],
      }),
      attributeLocations: {
        position: 0,
        normal: 1,
        st: 2,
        instancePositionHigh: 3,
        instancePositionLow: 4,
        instanceQuaternion: 5,
        instanceScale: 6,
        instanceColor: 7,
      },
    });

    // 5) RenderState：与单个立方体一致
    const renderState = Rendering.RenderState.fromCache({
      depthTest: { enabled: true },
      depthMask: false,
      cull: { enabled: false },
      blending: Cesium.BlendingState.ALPHA_BLEND,
    });

    // 6) DrawCommand：modelMatrix 用单位阵（实例位置已编码进世界坐标），
    //    instanceCount 决定一次画多少个实例。
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
