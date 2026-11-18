import * as Cesium from "cesium";
import type { ProjectedGridLine } from "./gridGeometry.js";
import fragmentShaderSource from "./shader/gridLineFragmentShaderSource.fs.glsl?raw";
import vertexShaderSource from "./shader/gridLineVertexShaderSource.vs.glsl?raw";

// 一条实例是折线中“两个相邻采样点之间的线段”，不是整条等东/等北坐标线。
// 每条实例 13 个 Float32，共 52 字节；布局必须与 writeSegment 和属性偏移一致：
// 字节  0..11：起点 high.xyz；12..23：起点 low.xyz；
// 字节 24..35：终点 high.xyz；36..47：终点 low.xyz；48..51：CSS 像素半线宽。
const INSTANCE_FLOATS = 13;
const INSTANCE_STRIDE = INSTANCE_FLOATS * Float32Array.BYTES_PER_ELEMENT;
const VERTICES_PER_SEGMENT = 6;
// 所有实例共用两个三角形。corner.x 取 0/1 选择起点/终点，corner.y 取 -1/+1
// 选择线段两侧；这里不是世界坐标，顶点着色器会把模板展开为屏幕空间四边形。
const SEGMENT_CORNERS = new Float32Array([
  0, -1,
  1, -1,
  1, 1,
  0, -1,
  1, 1,
  0, 1,
]);

// 这里只声明实际使用的 Cesium 渲染内部接口。公开 cesium 类型未完整导出这些
// 低层接口，因此包的 Cesium 版本兼容性需要同时检查运行时和类型层，不能只靠 tsc。
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
  mode: Cesium.SceneMode;
  commandList: DrawCommandLike[];
  passes: { render: boolean };
}

interface CesiumRenderingInternals {
  Buffer: {
    createVertexBuffer(options: object): GpuBuffer;
  };
  BufferUsage: { STATIC_DRAW: number; DYNAMIC_DRAW: number };
  DrawCommand: new (options: object) => DrawCommandLike;
  Pass: { TRANSLUCENT: number };
  RenderState: {
    fromCache(options: object): object;
    removeFromCache(options: object): void;
  };
  ShaderProgram: { fromCache(options: object): GpuResource };
  ShaderSource: new (options: object) => object;
  VertexArray: new (options: object) => GpuResource;
}

/** 绘制参数；颜色为 0..1 RGBA，线宽为完整的 CSS 像素宽度。 */
export interface DrawCommandGaussKrugerGridPrimitiveOptions {
  lineColor: Cesium.Color;
  lineWidth: number;
  majorLineWidth: number;
  /** 初始可容纳的采样线段数；容量不足时按倍增扩展。 */
  initialCapacity?: number;
}

const Rendering = Cesium as typeof Cesium & CesiumRenderingInternals;
// 接受地球/模型深度遮挡，但不向深度缓冲写入透明格网；四边形两面均可绘制。
// 使用普通 alpha 混合，片元颜色保持非预乘形式，透明度由颜色 alpha × 边缘覆盖率组成。
const RENDER_STATE_OPTIONS = {
  depthTest: { enabled: true },
  depthMask: false,
  cull: { enabled: false },
  blending: Cesium.BlendingState.ALPHA_BLEND,
};

/**
 * 将米制 ECEF 分量拆成 65536 的整倍数 high，剩余量由 low = value - high 保存。
 * 原始 ECEF 的量级约为数百万米，直接转 Float32 会丢失局部细节；high/low 配合
 * Cesium 的相机高低位做相对相机变换，避免先在单精度中拼回巨大世界坐标。
 */
function encodeHigh(value: number): number {
  return value >= 0
    ? Math.floor(value / 65_536) * 65_536
    : -Math.floor(-value / 65_536) * 65_536;
}

/**
 * 负责把 CPU 三维折线转换为实例数据，并通过一个持久的实例化 DrawCommand 提交。
 *
 * 每条采样线段使用共享的六顶点模板，由着色器在屏幕上扩宽为两个三角形。因此
 * 线宽不受 WebGL 原生线宽范围限制，也不需要为每条折线创建 PolylineGeometry。
 * 这里的“一条命令”是本 primitive 的逻辑提交数量，不保证整个场景只有一次 GPU
 * draw call；Cesium 的透明渲染、多视锥等流程可能重复执行或派生相关命令。
 *
 * set 负责 CPU 数据，update 负责首次创建/按需上传 GPU 数据，destroy 统一释放资源。
 */
export class DrawCommandGaussKrugerGridPrimitive {
  /** 控制是否向帧命令队列提交，不会因此清空已准备的缓冲数据。 */
  show = true;

  private readonly lineColor: Cesium.Color;
  private readonly lineWidth: number;
  private readonly majorLineWidth: number;
  // 包围球使用 ECEF 米制坐标，供 Cesium 裁剪本命令；modelMatrix 始终为单位矩阵。
  private readonly boundingVolume = new Cesium.BoundingSphere();
  // CPU 数组容量可大于当前线段数；只上传 [0, segmentCount * 13) 的有效部分。
  private segmentValues: Float32Array;
  private capacity: number;
  private segmentCount = 0;
  private cornerBuffer?: GpuBuffer;
  private instanceBuffer?: GpuBuffer;
  private vertexArray?: GpuResource;
  private shaderProgram?: GpuResource;
  private renderState?: object;
  private command?: DrawCommandLike;
  // 几何没变时重用 GPU 内容与 DrawCommand；相机变化由 Cesium 自动 uniform 处理。
  private dataDirty = true;
  private destroyed = false;

  /** 校验参数并分配 CPU 容量；WebGL 资源延迟到首次 update 获得 context 后创建。 */
  constructor(options: DrawCommandGaussKrugerGridPrimitiveOptions) {
    const capacity = options.initialCapacity ?? 256;
    if (!Number.isSafeInteger(capacity) || capacity < 1) {
      throw new RangeError("initialCapacity must be a positive safe integer.");
    }
    for (const name of ["lineWidth", "majorLineWidth"] as const) {
      if (!Number.isFinite(options[name]) || options[name] <= 0) {
        throw new RangeError(`${name} must be a positive finite number.`);
      }
    }
    const color = options.lineColor;
    if (!color || [color.red, color.green, color.blue, color.alpha].some(
      component => !Number.isFinite(component) || component < 0 || component > 1,
    )) {
      throw new RangeError("lineColor components must be finite values from 0 through 1.");
    }
    this.lineColor = Cesium.Color.clone(options.lineColor);
    this.lineWidth = options.lineWidth;
    this.majorLineWidth = options.majorLineWidth;
    this.capacity = capacity;
    this.segmentValues = new Float32Array(this.capacity * INSTANCE_FLOATS);
  }

  /**
   * 用新折线集替换实例内容，不保留调用方的 positions 数组。
   * n 个采样点形成 n-1 个独立线段，每段写入起终点与主/次线半宽；同时收集位置
   * 计算包围球。此处仅标记 dataDirty，实际显存上传留给下一次 update。
   */
  set(lines: readonly ProjectedGridLine[]): void {
    if (this.destroyed) return;
    let requiredSegments = 0;
    for (const line of lines) {
      requiredSegments += Math.max(0, line.positions.length - 1);
    }
    this.ensureCapacity(requiredSegments);
    this.segmentCount = requiredSegments;

    const boundingPositions: Cesium.Cartesian3[] = [];
    let segmentIndex = 0;
    for (const line of lines) {
      const halfWidth = (line.isMajor ? this.majorLineWidth : this.lineWidth) *
        0.5;
      for (let index = 1; index < line.positions.length; index += 1) {
        const start = line.positions[index - 1];
        const end = line.positions[index];
        this.writeSegment(segmentIndex, start, end, halfWidth);
        if (index === 1) boundingPositions.push(start);
        boundingPositions.push(end);
        segmentIndex += 1;
      }
    }

    if (boundingPositions.length > 0) {
      Cesium.BoundingSphere.fromPoints(
        boundingPositions,
        this.boundingVolume,
      );
    } else {
      Cesium.Cartesian3.clone(Cesium.Cartesian3.ZERO, this.boundingVolume.center);
      this.boundingVolume.radius = 0;
    }
    this.dataDirty = true;
    if (this.command) {
      // 数据量变少也要更新实例数，否则旧缓冲尾部会继续作为有效线段参与绘制。
      this.command.instanceCount = this.segmentCount;
      this.command.boundingVolume = this.boundingVolume;
    }
  }

  /**
   * Cesium 每帧调用的 primitive 接口：仅在有效三维渲染 pass 中提交。
   * 惰性创建资源，必要时上传有效实例区间，之后把同一个命令加入本帧 commandList。
   */
  update(frameState: FrameStateLike): void {
    if (this.destroyed || !this.show || this.segmentCount === 0 ||
      frameState.mode !== Cesium.SceneMode.SCENE3D || !frameState.passes.render) return;
    if (!this.command) this.createResources(frameState.context);
    if (this.dataDirty && this.instanceBuffer) {
      this.instanceBuffer.copyFromArrayView(
        this.segmentValues.subarray(0, this.segmentCount * INSTANCE_FLOATS),
      );
      this.dataDirty = false;
    }
    if (frameState.passes.render && this.command) {
      frameState.commandList.push(this.command);
    }
  }

  /** Cesium 资源约定：避免集合移除后再次销毁同一资源。 */
  isDestroyed(): boolean {
    return this.destroyed;
  }

  /** 幂等释放自有 GPU 资源，同时清空 CPU 实例数组；不能继续用于绘制。 */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.releaseResources();
    this.segmentValues = new Float32Array(0);
    this.segmentCount = 0;
  }

  /**
   * 容量翻倍降低频繁重分配的成本。set 会重写全部有效线段，故无需复制旧数组。
   * GPU 缓冲的字节容量在创建时固定；扩容后释放旧资源，在下一帧按新容量重建。
   */
  private ensureCapacity(required: number): void {
    if (required <= this.capacity) return;
    while (this.capacity < required) this.capacity *= 2;
    this.segmentValues = new Float32Array(this.capacity * INSTANCE_FLOATS);
    this.releaseResources();
  }

  /** 统一释放正常绘制、扩容以及初始化失败路径中的全部已创建资源。 */
  private releaseResources(): void {
    // VertexArray 默认拥有挂接的缓冲，先销毁它再用 isDestroyed 检查缓冲可避免重复
    // 释放；显式检查缓冲还能处理“缓冲已创建但 VertexArray 构造失败”的中途状态。
    for (const resource of [
      this.vertexArray, this.cornerBuffer, this.instanceBuffer, this.shaderProgram,
    ]) {
      if (resource && !resource.isDestroyed()) resource.destroy();
    }
    if (this.renderState) Rendering.RenderState.removeFromCache(RENDER_STATE_OPTIONS);
    this.vertexArray = undefined;
    this.cornerBuffer = undefined;
    this.shaderProgram = undefined;
    this.instanceBuffer = undefined;
    this.renderState = undefined;
    this.command = undefined;
  }

  /** 按 52 字节固定布局编码一个 ECEF 线段；halfWidth 仍为 CSS 像素，留给 shader 换算。 */
  private writeSegment(
    segmentIndex: number,
    start: Cesium.Cartesian3,
    end: Cesium.Cartesian3,
    halfWidth: number,
  ): void {
    const offset = segmentIndex * INSTANCE_FLOATS;
    const startHighX = encodeHigh(start.x);
    const startHighY = encodeHigh(start.y);
    const startHighZ = encodeHigh(start.z);
    const endHighX = encodeHigh(end.x);
    const endHighY = encodeHigh(end.y);
    const endHighZ = encodeHigh(end.z);
    const values = this.segmentValues;
    values[offset] = startHighX;
    values[offset + 1] = startHighY;
    values[offset + 2] = startHighZ;
    values[offset + 3] = start.x - startHighX;
    values[offset + 4] = start.y - startHighY;
    values[offset + 5] = start.z - startHighZ;
    values[offset + 6] = endHighX;
    values[offset + 7] = endHighY;
    values[offset + 8] = endHighZ;
    values[offset + 9] = end.x - endHighX;
    values[offset + 10] = end.y - endHighY;
    values[offset + 11] = end.z - endHighZ;
    values[offset + 12] = halfWidth;
  }

  /** 保证创建任何一步失败都不会泄漏此前已经成功创建的资源。 */
  private createResources(context: object): void {
    try {
      this.initializeResources(context);
    } catch (error) {
      this.releaseResources();
      throw error;
    }
  }

  /**
   * 一次性连接模板缓冲、实例缓冲、顶点属性、shader、渲染状态及绘制命令。
   * 模板是 STATIC_DRAW；经常因相机视野重建而更新的实例数据使用 DYNAMIC_DRAW。
   */
  private initializeResources(context: object): void {
    this.cornerBuffer = Rendering.Buffer.createVertexBuffer({
      context,
      typedArray: SEGMENT_CORNERS,
      usage: Rendering.BufferUsage.STATIC_DRAW,
    });
    this.instanceBuffer = Rendering.Buffer.createVertexBuffer({
      context,
      sizeInBytes: this.segmentValues.byteLength,
      usage: Rendering.BufferUsage.DYNAMIC_DRAW,
    });
    this.vertexArray = new Rendering.VertexArray({
      context,
      attributes: [
        {
          // corner 按顶点前进：一个线段的六个顶点依次读取六组模板坐标。
          index: 0,
          vertexBuffer: this.cornerBuffer,
          componentsPerAttribute: 2,
        },
        ...createInstanceAttributes(this.instanceBuffer),
      ],
    });
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
        instanceStartHigh: 1,
        instanceStartLow: 2,
        instanceEndHigh: 3,
        instanceEndLow: 4,
        instanceHalfWidth: 5,
      },
    });
    this.renderState = Rendering.RenderState.fromCache(RENDER_STATE_OPTIONS);
    this.command = new Rendering.DrawCommand({
      owner: this,
      vertexArray: this.vertexArray,
      shaderProgram: this.shaderProgram,
      renderState: this.renderState,
      primitiveType: Cesium.PrimitiveType.TRIANGLES,
      pass: Rendering.Pass.TRANSLUCENT,
      instanceCount: this.segmentCount,
      // count 是每个实例的模板顶点数，instanceCount 才是采样线段总数。
      count: VERTICES_PER_SEGMENT,
      boundingVolume: this.boundingVolume,
      modelMatrix: Cesium.Matrix4.IDENTITY,
      uniformMap: { u_color: () => this.lineColor },
    });
  }
}

/** shader 的 location 1..5 分别读取起点高/低位、终点高/低位和半线宽。 */
function createInstanceAttributes(instanceBuffer: GpuBuffer): object[] {
  return [
    createInstanceAttribute(1, instanceBuffer, 3, 0),
    createInstanceAttribute(2, instanceBuffer, 3, 12),
    createInstanceAttribute(3, instanceBuffer, 3, 24),
    createInstanceAttribute(4, instanceBuffer, 3, 36),
    createInstanceAttribute(5, instanceBuffer, 1, 48),
  ];
}

/**
 * 描述交错实例缓冲中的一个属性：offset 是字节偏移，stride=52 是相邻实例间距。
 * instanceDivisor=1 表示每完成一个线段实例才前进一项，六个模板顶点共享这些值。
 */
function createInstanceAttribute(
  index: number,
  vertexBuffer: GpuBuffer,
  componentsPerAttribute: number,
  offsetInBytes: number,
): object {
  return {
    index,
    vertexBuffer,
    componentsPerAttribute,
    offsetInBytes,
    strideInBytes: INSTANCE_STRIDE,
    instanceDivisor: 1,
  };
}
