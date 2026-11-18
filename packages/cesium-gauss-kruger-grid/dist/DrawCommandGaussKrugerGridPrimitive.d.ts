import * as Cesium from "cesium";
import type { ProjectedGridLine } from "./gridGeometry.js";
interface DrawCommandLike {
    instanceCount: number;
    boundingVolume: Cesium.BoundingSphere;
}
interface FrameStateLike {
    context: object;
    mode: Cesium.SceneMode;
    commandList: DrawCommandLike[];
    passes: {
        render: boolean;
    };
}
/** 绘制参数；颜色为 0..1 RGBA，线宽为完整的 CSS 像素宽度。 */
export interface DrawCommandGaussKrugerGridPrimitiveOptions {
    lineColor: Cesium.Color;
    lineWidth: number;
    majorLineWidth: number;
    /** 初始可容纳的采样线段数；容量不足时按倍增扩展。 */
    initialCapacity?: number;
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
export declare class DrawCommandGaussKrugerGridPrimitive {
    /** 控制是否向帧命令队列提交，不会因此清空已准备的缓冲数据。 */
    show: boolean;
    private readonly lineColor;
    private readonly lineWidth;
    private readonly majorLineWidth;
    private readonly boundingVolume;
    private segmentValues;
    private capacity;
    private segmentCount;
    private cornerBuffer?;
    private instanceBuffer?;
    private vertexArray?;
    private shaderProgram?;
    private renderState?;
    private command?;
    private dataDirty;
    private destroyed;
    /** 校验参数并分配 CPU 容量；WebGL 资源延迟到首次 update 获得 context 后创建。 */
    constructor(options: DrawCommandGaussKrugerGridPrimitiveOptions);
    /**
     * 用新折线集替换实例内容，不保留调用方的 positions 数组。
     * n 个采样点形成 n-1 个独立线段，每段写入起终点与主/次线半宽；同时收集位置
     * 计算包围球。此处仅标记 dataDirty，实际显存上传留给下一次 update。
     */
    set(lines: readonly ProjectedGridLine[]): void;
    /**
     * Cesium 每帧调用的 primitive 接口：仅在有效三维渲染 pass 中提交。
     * 惰性创建资源，必要时上传有效实例区间，之后把同一个命令加入本帧 commandList。
     */
    update(frameState: FrameStateLike): void;
    /** Cesium 资源约定：避免集合移除后再次销毁同一资源。 */
    isDestroyed(): boolean;
    /** 幂等释放自有 GPU 资源，同时清空 CPU 实例数组；不能继续用于绘制。 */
    destroy(): void;
    /**
     * 容量翻倍降低频繁重分配的成本。set 会重写全部有效线段，故无需复制旧数组。
     * GPU 缓冲的字节容量在创建时固定；扩容后释放旧资源，在下一帧按新容量重建。
     */
    private ensureCapacity;
    /** 统一释放正常绘制、扩容以及初始化失败路径中的全部已创建资源。 */
    private releaseResources;
    /** 按 52 字节固定布局编码一个 ECEF 线段；halfWidth 仍为 CSS 像素，留给 shader 换算。 */
    private writeSegment;
    /** 保证创建任何一步失败都不会泄漏此前已经成功创建的资源。 */
    private createResources;
    /**
     * 一次性连接模板缓冲、实例缓冲、顶点属性、shader、渲染状态及绘制命令。
     * 模板是 STATIC_DRAW；经常因相机视野重建而更新的实例数据使用 DYNAMIC_DRAW。
     */
    private initializeResources;
}
export {};
//# sourceMappingURL=DrawCommandGaussKrugerGridPrimitive.d.ts.map