import * as Cesium from "cesium";

export interface GpuResource {
  isDestroyed(): boolean;
  destroy(): void;
}

export interface GpuBuffer extends GpuResource {
  copyFromArrayView(value: ArrayBufferView, offsetInBytes?: number): void;
}

export interface DrawCommandLike {
  instanceCount: number;
  boundingVolume: Cesium.BoundingSphere;
  modelMatrix: Cesium.Matrix4;
}

export interface FrameStateLike {
  context: object;
  commandList: DrawCommandLike[];
  passes: { render: boolean };
}

interface RendererInternals {
  Buffer: {
    createVertexBuffer(options: {
      context: object;
      typedArray?: ArrayBufferView;
      sizeInBytes?: number;
      usage: number;
    }): GpuBuffer;
  };
  BufferUsage: { STATIC_DRAW: number; DYNAMIC_DRAW: number };
  DrawCommand: new (options: Record<string, unknown>) => DrawCommandLike;
  Pass: { OPAQUE: number; TRANSLUCENT: number };
  RenderState: { fromCache(options: Record<string, unknown>): object };
  ShaderProgram: {
    fromCache(options: {
      context: object;
      vertexShaderSource: object;
      fragmentShaderSource: object;
      attributeLocations: Record<string, number>;
    }): GpuResource;
  };
  ShaderSource: new (options: { defines?: string[]; sources: string[] }) => object;
  VertexArray: new (options: Record<string, unknown>) => GpuResource;
}

export const Rendering = Cesium as typeof Cesium & RendererInternals;
