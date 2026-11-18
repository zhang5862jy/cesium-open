import * as Cesium from "cesium";
import { createQuadMesh } from "./geometry";
import { Rendering } from "./renderer";
import type {
  DrawCommandLike,
  FrameStateLike,
  GpuBuffer,
  GpuResource,
} from "./renderer";
import type { BloodBarData, BloodBarOptions } from "./types";
import vertexShaderSource from "./shader/vertexShaderSource.vs.glsl?raw";
import fragmentShaderSource from "./shader/fragmentShaderSource.fs.glsl?raw";

// 逐顶点：corner（vec2）= 2 float；逐实例见下方 INSTANCE_FLOATS
const FLOATS_PER_VERTEX = 2;
const VERTEX_STRIDE = FLOATS_PER_VERTEX * Float32Array.BYTES_PER_ELEMENT;
// 每实例 13 float：
//   positionHigh(3) + positionLow(3) + scale(3) + offset(2) + percent(1) + showHeight(1)
const INSTANCE_FLOATS = 13;
const INSTANCE_STRIDE = INSTANCE_FLOATS * Float32Array.BYTES_PER_ELEMENT;
const DEFAULT_CAPACITY = 2_000;
const DEFAULT_WIDTH = 80;
const DEFAULT_HEIGHT = 10;
const DEFAULT_BACKGROUND_COLOR = Cesium.Color.fromCssColorString("#14202b").withAlpha(0.9);
const DEFAULT_COLOR = Cesium.Color.fromCssColorString("#3dff6b").withAlpha(0.95);

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
 * 批量血条：用【一次 draw call】绘制大量始终面向屏幕的血条。
 *
 * 与 InstancedHolographicCubePrimitive / InstancedHemisphereRadarPrimitive 同一
 * 套路：单位网格与着色器不变，set() 只重写逐实例缓冲（位置 / 缩放 / 偏移 /
 * 百分比 / 显隐高度），并更新 DrawCommand.instanceCount。
 *
 * 默认宽高与颜色是整条血条共享的，通过 DrawCommand.uniformMap 以 uniform
 * 形式提供（u_width / u_height / u_backgroundColor / u_color）。
 */
export class BloodBarPrimitive {
  show = true;

  readonly capacity: number;
  /** 默认血条宽度（米），逐实例 scale.x 会乘到上面 */
  width: number;
  /** 默认血条高度（米），逐实例 scale.y 会乘到上面 */
  height: number;
  /** 血条背景颜色 */
  readonly backgroundColor: Cesium.Color;
  /** 血条（血量）颜色 */
  readonly color: Cesium.Color;

  private readonly mesh = createQuadMesh();
  private readonly instanceValues: Float32Array;
  private readonly boundingVolume = new Cesium.BoundingSphere();
  private instanceCount = 0;
  private instanceBuffer?: GpuBuffer;
  private vertexArray?: GpuResource;
  private shaderProgram?: GpuResource;
  private command?: DrawCommandLike;
  private dataDirty = true;
  private destroyed = false;

  constructor(options: BloodBarOptions = {}) {
    this.capacity = Math.max(1, Math.floor(options.capacity ?? DEFAULT_CAPACITY));
    this.width = options.width ?? DEFAULT_WIDTH;
    this.height = options.height ?? DEFAULT_HEIGHT;
    this.backgroundColor = Cesium.Color.clone(
      options.backgroundColor ?? DEFAULT_BACKGROUND_COLOR,
    );
    this.color = Cesium.Color.clone(options.color ?? DEFAULT_COLOR);
    // 预分配实例缓冲所需的 CPU 侧内存，避免运行期反复分配
    this.instanceValues = new Float32Array(this.capacity * INSTANCE_FLOATS);
  }

  /** 更新整批血条共享的世界空间宽高；下一帧直接通过 uniform 生效。 */
  setSize(width: number, height: number): void {
    if (this.destroyed) return;
    this.width = Math.max(0, width);
    this.height = Math.max(0, height);
  }

  /** 一次性替换全部可见血条实例数据（传入的对象不会被保留引用） */
  set(data: readonly BloodBarData[]): void {
    if (this.destroyed) return;
    if (data.length > this.capacity) {
      throw new Error(
        `Blood bar data length ${data.length} exceeds capacity ${this.capacity}.`,
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
      const scaleX = typeof item.scale === "number" ? item.scale : item.scale.x;
      const scaleY = typeof item.scale === "number" ? item.scale : item.scale.y;
      const scaleZ = typeof item.scale === "number" ? item.scale : item.scale.z;

      const values = this.instanceValues;
      // positionHigh
      values[offset + 0] = highX;
      values[offset + 1] = highY;
      values[offset + 2] = highZ;
      // positionLow
      values[offset + 3] = item.position.x - highX;
      values[offset + 4] = item.position.y - highY;
      values[offset + 5] = item.position.z - highZ;
      // scale
      values[offset + 6] = scaleX;
      values[offset + 7] = scaleY;
      values[offset + 8] = scaleZ;
      // offset
      values[offset + 9] = item.offset.x;
      values[offset + 10] = item.offset.y;
      // percent / showHeight
      values[offset + 11] = item.percent;
      values[offset + 12] = item.showHeight;

      // 包围球半径用「中心到最远实例的距离 + 实例自身最大半径 + 偏移长度」
      // 取上界。血条是广告牌，最坏方向上的半径取 max(宽, 高)，再叠加 offset。
      // 略微高估是安全的（只会多画，不会把可见血条错误裁剪掉）。
      const barExtent = Math.max(this.width * scaleX, this.height * scaleY);
      const offsetLength = Math.hypot(item.offset.x, item.offset.y);
      maximumRadius = Math.max(
        maximumRadius,
        Cesium.Cartesian3.distance(this.boundingVolume.center, item.position) +
          barExtent +
          offsetLength,
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
    // 1) 共享的单位四边形网格（所有血条实例复用这一份顶点 / 索引）
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

    // 2) 实例缓冲：每实例 13 float，DYNAMIC_DRAW 表示每帧都可能被覆盖
    this.instanceBuffer = Rendering.Buffer.createVertexBuffer({
      context,
      sizeInBytes: this.instanceValues.byteLength,
      usage: Rendering.BufferUsage.DYNAMIC_DRAW,
    });

    // 3) VertexArray：第 0 个 attribute 是逐顶点 corner（instanceDivisor 默认 0），
    //    后 6 个是逐实例数据。instanceDivisor: 1 表示「每个实例取一次」——
    //    这是 GPU Instancing 的关键设置。
    this.vertexArray = new Rendering.VertexArray({
      context,
      indexBuffer,
      attributes: [
        { index: 0, vertexBuffer, componentsPerAttribute: 2, offsetInBytes: 0, strideInBytes: VERTEX_STRIDE },
        { index: 1, vertexBuffer: this.instanceBuffer, componentsPerAttribute: 3, offsetInBytes: 0, strideInBytes: INSTANCE_STRIDE, instanceDivisor: 1 },
        { index: 2, vertexBuffer: this.instanceBuffer, componentsPerAttribute: 3, offsetInBytes: 12, strideInBytes: INSTANCE_STRIDE, instanceDivisor: 1 },
        { index: 3, vertexBuffer: this.instanceBuffer, componentsPerAttribute: 3, offsetInBytes: 24, strideInBytes: INSTANCE_STRIDE, instanceDivisor: 1 },
        { index: 4, vertexBuffer: this.instanceBuffer, componentsPerAttribute: 2, offsetInBytes: 36, strideInBytes: INSTANCE_STRIDE, instanceDivisor: 1 },
        { index: 5, vertexBuffer: this.instanceBuffer, componentsPerAttribute: 1, offsetInBytes: 44, strideInBytes: INSTANCE_STRIDE, instanceDivisor: 1 },
        { index: 6, vertexBuffer: this.instanceBuffer, componentsPerAttribute: 1, offsetInBytes: 48, strideInBytes: INSTANCE_STRIDE, instanceDivisor: 1 },
      ],
    });

    // 4) ShaderProgram
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
      attributeLocations: {
        corner: 0,
        instancePositionHigh: 1,
        instancePositionLow: 2,
        instanceScale: 3,
        instanceOffset: 4,
        instancePercent: 5,
        instanceShowHeight: 6,
      },
    });

    // 5) RenderState：深度测试开（可被更近的地形/物体遮挡）、不写深度
    //    （半透明叠加）、双面渲染（广告牌面向屏幕，无需背面剔除）、alpha 混合。
    const renderState = Rendering.RenderState.fromCache({
      depthTest: { enabled: true },
      depthMask: false,
      cull: { enabled: false },
      blending: Cesium.BlendingState.ALPHA_BLEND,
    });

    // 6) DrawCommand：modelMatrix 用单位阵（实例位置已编码进世界坐标）。
    //    uniformMap 提供整条血条共享的默认宽高与颜色。
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
      uniformMap: {
        u_width: () => this.width,
        u_height: () => this.height,
        u_backgroundColor: () => this.backgroundColor,
        u_color: () => this.color,
      },
    });
  }
}
