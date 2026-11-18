import * as Cesium from "cesium";

// ============================================================================
// Cesium 内部渲染类的最小类型声明
// ============================================================================
// 说明：`cesium` 包在【运行时】会把 @cesium/engine 里的内部类（Buffer、
// VertexArray、ShaderProgram、ShaderSource、RenderState、DrawCommand、
// BufferUsage、Pass 等）一并导出到 Cesium 命名空间上（见 node_modules/cesium/
// Source/Cesium.js 的 export { ... } from '@cesium/engine'），但它的公共
// TypeScript 类型文件（Source/Cesium.d.ts）里【没有】这些内部类的类型声明。
//
// 因此这里用手写的「最小接口」描述我们用到的那部分 API，再通过一次类型断言
// （as typeof Cesium & RendererInternals）得到带类型的 `Rendering`。
// 运行时用的还是真实的 Cesium 对象，断言只给 TypeScript 提供形状信息，
// 不改变任何行为。
// ============================================================================

/** 具备销毁能力的 GPU 资源（Buffer / VertexArray / ShaderProgram 等） */
export interface GpuResource {
  isDestroyed(): boolean;
  destroy(): void;
}

/** 顶点 / 索引缓冲，额外支持用 CPU 侧数组覆盖其内容 */
export interface GpuBuffer extends GpuResource {
  copyFromArrayView(value: ArrayBufferView, offsetInBytes?: number): void;
}

/** 我们真正需要读写的 DrawCommand 字段子集 */
export interface DrawCommandLike {
  instanceCount: number;
  boundingVolume: Cesium.BoundingSphere;
  modelMatrix: Cesium.Matrix4;
}

/** Cesium 每帧传入 primitive.update() 的 FrameState 的子集 */
export interface FrameStateLike {
  context: object;
  commandList: DrawCommandLike[];
  passes: { render: boolean };
}

/** 顶点缓冲区创建参数 */
interface VertexBufferOptions {
  context: object;
  typedArray?: ArrayBufferView;
  sizeInBytes?: number;
  usage: number;
}

/** 索引缓冲区创建参数 */
interface IndexBufferOptions extends VertexBufferOptions {
  indexDatatype: number;
}

/** VertexArray 中单个 attribute 的绑定参数 */
interface VertexAttributeOptions {
  index: number;
  vertexBuffer?: GpuBuffer;
  componentsPerAttribute: number;
  offsetInBytes?: number;
  strideInBytes?: number;
  instanceDivisor?: number;
  componentDatatype?: number;
}

/** VertexArray 构造参数 */
interface VertexArrayOptions {
  context: object;
  indexBuffer?: GpuBuffer;
  attributes: VertexAttributeOptions[];
}

/** ShaderProgram.fromCache 参数 */
interface ShaderProgramOptions {
  context: object;
  vertexShaderSource: object;
  fragmentShaderSource: object;
  attributeLocations: Record<string, number>;
}

/** RenderState.fromCache 参数 */
interface RenderStateOptions {
  depthTest?: { enabled: boolean };
  depthMask?: boolean;
  cull?: { enabled: boolean; face?: number };
  blending?: object;
}

/** DrawCommand 构造参数 */
interface DrawCommandOptions {
  owner: object;
  vertexArray: GpuResource;
  shaderProgram: GpuResource;
  renderState: object;
  primitiveType: number;
  pass: number;
  instanceCount?: number;
  count: number;
  boundingVolume: Cesium.BoundingSphere;
  modelMatrix: Cesium.Matrix4;
  /** 自定义 uniform：键是 GLSL 里的 uniform 名，值是一个返回其值的函数 */
  uniformMap?: Record<string, () => unknown>;
}

/** 我们实际用到的 Cesium 内部渲染类 */
interface RendererInternals {
  Buffer: {
    createVertexBuffer(options: VertexBufferOptions): GpuBuffer;
    createIndexBuffer(options: IndexBufferOptions): GpuBuffer;
  };
  BufferUsage: { STATIC_DRAW: number; DYNAMIC_DRAW: number };
  DrawCommand: new (options: DrawCommandOptions) => DrawCommandLike;
  Pass: { OPAQUE: number; TRANSLUCENT: number };
  RenderState: { fromCache(options: RenderStateOptions): object };
  ShaderProgram: { fromCache(options: ShaderProgramOptions): GpuResource };
  ShaderSource: new (options: {
    defines?: string[];
    sources: string[];
  }) => object;
  VertexArray: new (options: VertexArrayOptions) => GpuResource;
}

/** 补充了内部类型后的 Cesium 命名空间，供底层渲染管线使用 */
export const Rendering = Cesium as typeof Cesium & RendererInternals;
