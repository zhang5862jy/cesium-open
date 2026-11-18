import * as Cesium from "cesium";
import { createCubeMesh } from "./geometry";
import { Rendering } from "./renderer";
import type { DrawCommandLike, FrameStateLike, GpuResource } from "./renderer";
import type { HolographicCubeOptions } from "./types";
import vertexShaderSource from "./shader/vertexShaderSource.vs.glsl?raw";
import fragmentShaderSource from "./shader/fragmentShaderSource.fs.glsl?raw";

// 每个顶点 8 个 float：position(3) + normal(3) + st(2)
const FLOATS_PER_VERTEX = 8;
const VERTEX_STRIDE = FLOATS_PER_VERTEX * Float32Array.BYTES_PER_ELEMENT;

/**
 * 单个全息立方体：用一条 DrawCommand 完整封装 Cesium 的底层渲染管线。
 *
 * 与高层 Primitive API（Primitive + Appearance + Material）不同，这里完全
 * 手工完成：几何 → Buffer → VertexArray → ShaderProgram → RenderState →
 * DrawCommand，从而拿到对 shader 与渲染状态的完全控制权（这正是自定义材质
 * 与 WebGL2 高级效果需要的入口）。
 */
export class HolographicCubePrimitive {
  show = true;

  private readonly mesh = createCubeMesh();
  private readonly boundingVolume = new Cesium.BoundingSphere();
  private modelMatrix: Cesium.Matrix4;
  private vertexArray?: GpuResource;
  private shaderProgram?: GpuResource;
  private command?: DrawCommandLike;
  private destroyed = false;

  constructor(options: HolographicCubeOptions) {
    // 包围球：中心 = 立方体中心，半径 = 半对角线长（用于视锥体裁剪，决定
    // 这个立方体是否在相机视野内、要不要画）。
    Cesium.Cartesian3.clone(options.position, this.boundingVolume.center);
    this.boundingVolume.radius =
      Cesium.Cartesian3.magnitude(options.dimensions) * 0.5;

    // 构建 modelMatrix：ENU 局部框架（含姿态）× 缩放矩阵。
    this.modelMatrix = buildModelMatrix(
      options.position,
      options.dimensions,
      options.orientation,
    );
  }

  /** 运行时更新位置 / 尺寸 / 姿态，不重建任何 GPU 资源 */
  setTransform(
    position: Cesium.Cartesian3,
    dimensions: Cesium.Cartesian3,
    orientation?: Cesium.HeadingPitchRoll,
  ): void {
    if (this.destroyed) return;
    Cesium.Cartesian3.clone(position, this.boundingVolume.center);
    this.boundingVolume.radius =
      Cesium.Cartesian3.magnitude(dimensions) * 0.5;
    this.modelMatrix = buildModelMatrix(position, dimensions, orientation);
    if (this.command) {
      // DrawCommand 的 modelMatrix / boundingVolume 在绘制时会被 Cesium 读取，
      // 直接改这两个字段即可让下一帧生效。
      this.command.modelMatrix = this.modelMatrix;
      this.command.boundingVolume = this.boundingVolume;
    }
  }

  /**
   * 每帧由 scene.primitives（PrimitiveCollection）调用。
   * 首次调用时懒创建 GPU 资源（此时 frameState.context 才可用）；之后只把
   * 命令推进渲染命令列表。
   */
  update(frameState: FrameStateLike): void {
    if (this.destroyed || !this.show) return;
    if (!this.command) this.createResources(frameState.context);
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
    this.command = undefined;
  }

  private createResources(context: object): void {
    // 1) 顶点缓冲 + 索引缓冲（静态，只需上传一次）
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

    // 2) VertexArray：把 attribute 编号与缓冲数据绑定。offsetInBytes /
    //    strideInBytes 描述顶点内部交错布局（position/normal/st 连续存放）。
    this.vertexArray = new Rendering.VertexArray({
      context,
      indexBuffer,
      attributes: [
        { index: 0, vertexBuffer, componentsPerAttribute: 3, offsetInBytes: 0, strideInBytes: VERTEX_STRIDE },
        { index: 1, vertexBuffer, componentsPerAttribute: 3, offsetInBytes: 12, strideInBytes: VERTEX_STRIDE },
        { index: 2, vertexBuffer, componentsPerAttribute: 2, offsetInBytes: 24, strideInBytes: VERTEX_STRIDE },
      ],
    });

    // 3) ShaderProgram：编译链接着色器。CESIUM_RUNTIME 让 czm_* 自动 uniform
    //    以运行时方式注入。attributeLocations 与上面 VertexArray 的 index 对应。
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
        position: 0,
        normal: 1,
        st: 2,
      },
    });

    // 4) RenderState：深度测试开启、不写深度（半透明）、关闭背面剔除（全息
    //    感，能看到被遮挡的另一面）、Alpha 混合。
    const renderState = Rendering.RenderState.fromCache({
      depthTest: { enabled: true },
      depthMask: false,
      cull: { enabled: false },
      blending: Cesium.BlendingState.ALPHA_BLEND,
    });

    // 5) DrawCommand：把上面所有资源串成一条绘制命令。
    this.command = new Rendering.DrawCommand({
      owner: this,
      vertexArray: this.vertexArray,
      shaderProgram: this.shaderProgram,
      renderState,
      primitiveType: Cesium.PrimitiveType.TRIANGLES,
      pass: Rendering.Pass.TRANSLUCENT,
      count: this.mesh.indices.length,
      boundingVolume: this.boundingVolume,
      modelMatrix: this.modelMatrix,
    });
  }
}

/** 由位置 + 尺寸 + 姿态构建 modelMatrix（局部 ENU 框架 × 缩放） */
function buildModelMatrix(
  position: Cesium.Cartesian3,
  dimensions: Cesium.Cartesian3,
  orientation?: Cesium.HeadingPitchRoll,
): Cesium.Matrix4 {
  const hpr = orientation ?? new Cesium.HeadingPitchRoll();
  // 以 position 为原点建立 ENU 局部坐标系，并把 heading/pitch/roll 姿态叠加上去
  const frame = Cesium.Transforms.headingPitchRollToFixedFrame(
    position,
    hpr,
    Cesium.Ellipsoid.WGS84,
    undefined,
    new Cesium.Matrix4(),
  );
  // 单位立方体（半边长 0.5）缩放到目标尺寸
  const scale = Cesium.Matrix4.fromScale(dimensions, new Cesium.Matrix4());
  return Cesium.Matrix4.multiply(frame, scale, new Cesium.Matrix4());
}
