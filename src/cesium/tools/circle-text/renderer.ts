import * as Cesium from "cesium";

export interface GpuResource {
  isDestroyed(): boolean;
  destroy(): void;
}

export interface GpuBuffer extends GpuResource {
  vertexArrayDestroyable: boolean;
  copyFromArrayView(value: ArrayBufferView, offsetInBytes?: number): void;
}

export interface GpuTexture extends GpuResource {}

export interface DrawCommandLike {
  instanceCount: number;
  boundingVolume: Cesium.BoundingSphere;
}

export interface FrameStateLike {
  context: object;
  commandList: DrawCommandLike[];
  passes: { render: boolean };
}

interface RendererInternals {
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
  Texture: new (options: object) => GpuTexture;
  VertexArray: new (options: object) => GpuResource;
}

/** Cesium 运行时导出的低层渲染类型的最小声明。 */
export const Rendering = Cesium as typeof Cesium & RendererInternals;

/** LabelCollection.update 是 Primitive 管线方法，但未包含在公共 d.ts 中。 */
export type NativeLabelCollection = Cesium.LabelCollection & {
  update(frameState: FrameStateLike): void;
};
