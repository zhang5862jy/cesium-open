import * as Cesium from "cesium";
import { CircleTextData } from "./CircleTextData";
import { createEllipseQuadMesh } from "./geometry";
import {
  cloneOffset,
  resolveLayerOptions,
  validateItemOptions,
} from "./options";
import {
  Rendering,
  type DrawCommandLike,
  type FrameStateLike,
  type GpuBuffer,
  type GpuResource,
  type GpuTexture,
  type NativeLabelCollection,
} from "./renderer";
import fragmentShaderSource from "./shader/fragmentShaderSource.fs.glsl?raw";
import vertexShaderSource from "./shader/vertexShaderSource.vs.glsl?raw";
import type {
  CircleTextPrimitiveEditOptions,
  CircleTextPrimitiveLayerOptions,
  CircleTextPrimitiveOptions,
  EllipseImageSource,
  PlaneAnchor,
  ResolvedLayerOptions,
} from "./types";

const INSTANCE_FLOATS = 20;
const INSTANCE_STRIDE = INSTANCE_FLOATS * Float32Array.BYTES_PER_ELEMENT;
const ANCHOR_FACTORS: Record<PlaneAnchor, readonly [number, number]> = {
  0: [-0.5, 0.5],
  1: [0, 0.5],
  2: [0.5, 0.5],
  3: [-0.5, 0],
  4: [0, 0],
  5: [0.5, 0],
  6: [-0.5, -0.5],
  7: [0, -0.5],
  8: [0.5, -0.5],
};

type TextureSource = CanvasImageSource | ImageBitmap;

interface TextureBucket {
  source: EllipseImageSource;
  image?: TextureSource;
  texture?: GpuTexture;
  loading?: Promise<void>;
  loadError?: unknown;
  values: Float32Array;
  instanceCount: number;
  visibleCount: number;
  dirtyIndices: Set<number>;
  bounds: Cesium.BoundingSphere[];
  boundsExpired: boolean;
  boundingVolume: Cesium.BoundingSphere;
  instanceBuffer?: GpuBuffer;
  vertexArray?: GpuResource;
  command?: DrawCommandLike;
}

const scratchFrame = new Cesium.Matrix4();
const scratchEast = new Cesium.Cartesian4();
const scratchNorth = new Cesium.Cartesian4();
const scratchPosition = new Cesium.Cartesian3();
const scratchPixelOffset = new Cesium.Cartesian2();
const ELLIPSE_DIRTY = 1;
const LABEL_DIRTY = 2;
const VISIBILITY_DIRTY = 4;
const ALL_DIRTY = 7;
const labelProperties = new Set<PropertyKey>([
  "label", "text", "font", "fillColor", "outlineColor", "textAnchor", "textOffset",
]);

function encodeHigh(value: number): number {
  return value >= 0
    ? Math.floor(value / 65_536) * 65_536
    : -Math.floor(-value / 65_536) * 65_536;
}

function getHorizontalOrigin(anchor: PlaneAnchor): Cesium.HorizontalOrigin {
  const column = anchor % 3;
  if (column === 0) return Cesium.HorizontalOrigin.LEFT;
  if (column === 2) return Cesium.HorizontalOrigin.RIGHT;
  return Cesium.HorizontalOrigin.CENTER;
}

function getVerticalOrigin(anchor: PlaneAnchor): Cesium.VerticalOrigin {
  const row = Math.floor(anchor / 3);
  if (row === 0) return Cesium.VerticalOrigin.TOP;
  if (row === 2) return Cesium.VerticalOrigin.BOTTOM;
  return Cesium.VerticalOrigin.CENTER;
}

/**
 * 自定义 DrawCommand 椭圆批次 + Cesium 原生 LabelCollection 文字批次。
 *
 * 此类本身就是一个 Cesium Primitive：加入 `scene.primitives` 后，`update()`
 * 消费 Data 变更队列。业务代码只需获取 Data 并直接赋值，不需要主动调用
 * GPU 更新方法。
 */
export class CircleTextDrawCommand {
  /** 整批渲染开关；单个目标仍由 Data.show 控制。 */
  visible = true;
  readonly capacity: number;

  private readonly scene: Cesium.Scene;
  private readonly defaults: ResolvedLayerOptions;
  private readonly items = new Map<string, CircleTextData>();
  private readonly labels = new Map<string, Cesium.Label>();
  private readonly labelCollection: NativeLabelCollection;
  private readonly textureBuckets = new Map<EllipseImageSource, TextureBucket>();
  private readonly mesh = createEllipseQuadMesh();
  private positionBuffer?: GpuBuffer;
  private indexBuffer?: GpuBuffer;
  private shaderProgram?: GpuResource;
  private structureExpired = true;
  private readonly dirtyItems = new Map<CircleTextData, number>();
  private readonly slots = new Map<CircleTextData, { bucket: TextureBucket; index: number }>();
  private cameraHeight = Number.NaN;
  private nextId = 1;
  private destroyed = false;

  constructor(
    scene: Cesium.Scene,
    options: CircleTextPrimitiveLayerOptions = {},
  ) {
    this.scene = scene;
    this.defaults = resolveLayerOptions(options);
    this.capacity = this.defaults.capacity;
    this.labelCollection = new Cesium.LabelCollection({
      scene,
      blendOption: Cesium.BlendOption.OPAQUE_AND_TRANSLUCENT,
    }) as NativeLabelCollection;
  }

  /** 添加并返回可直接修改属性的 Data 实例。 */
  add(options: CircleTextPrimitiveOptions): CircleTextData {
    this.assertAlive();
    if (this.items.size >= this.capacity) {
      throw new Error(`椭圆文字数量已达到容量上限 ${this.capacity}`);
    }
    const id = options.id ?? this.createId();
    if (this.items.has(id)) {
      throw new Error(`已存在 id 为 "${id}" 的椭圆文字 Data`);
    }

    const data = new CircleTextData({
      id,
      longitude: options.longitude,
      latitude: options.latitude,
      height: options.height ?? this.defaults.height,
      ellipseWidth: options.ellipseWidth ?? this.defaults.ellipseWidth,
      ellipseHeight: options.ellipseHeight ?? this.defaults.ellipseHeight,
      ellipseRotation:
        options.ellipseRotation ?? this.defaults.ellipseRotation,
      ellipseImage: options.ellipseImage ?? this.defaults.ellipseImage,
      ellipseAnchor: options.ellipseAnchor ?? this.defaults.ellipseAnchor,
      ellipseOffset: cloneOffset(
        options.ellipseOffset ?? this.defaults.ellipseOffset,
      ),
      textHeight: options.textHeight ?? this.defaults.textHeight,
      label: {
        ...this.defaults.label,
        ...options.label,
        text: options.label?.text ?? id,
      },
      textAnchor: options.textAnchor ?? this.defaults.textAnchor,
      textOffset: cloneOffset(options.textOffset ?? this.defaults.textOffset),
      show: options.show ?? true,
      ellipseShow: options.ellipseShow ?? true,
      textShow: options.textShow ?? true,
      maximumVisibleHeight:
        options.maximumVisibleHeight ?? Number.POSITIVE_INFINITY,
      ellipseMode:
        options.ellipseMode ??
        options.mode ??
        this.defaults.defaultEllipseMode,
      // 原生 LabelCollection 固定采用 billboard；保留字段只兼容旧数据。
      textMode: 0,
    });
    this.items.set(id, data);
    this.dirtyItems.set(data, ALL_DIRTY);
    data.setChangeListener((property) => {
      let flags = ALL_DIRTY;
      if (property !== undefined) {
        if (property === "ellipseImage") this.structureExpired = true;
        if (labelProperties.has(property)) flags = LABEL_DIRTY;
        else if (property === "textShow") flags = VISIBILITY_DIRTY;
        else if (property === "show" || property === "maximumVisibleHeight") {
          flags = ELLIPSE_DIRTY | VISIBILITY_DIRTY;
        } else if (property !== "longitude" && property !== "latitude" && property !== "height") {
          flags = ELLIPSE_DIRTY;
        }
      } else {
        const slot = this.slots.get(data);
        if (slot && slot.bucket.source !== data.ellipseImage) this.structureExpired = true;
      }
      const wasEmpty = this.dirtyItems.size === 0;
      this.dirtyItems.set(data, (this.dirtyItems.get(data) ?? 0) | flags);
      if (wasEmpty) this.scene.requestRender();
    });
    this.structureExpired = true;
    this.scene.requestRender();
    return data;
  }

  /** 获取原始 Data；修改其属性会由 Proxy.set 自动标记过期。 */
  get(id: string): CircleTextData | undefined {
    this.assertAlive();
    return this.items.get(id);
  }

  /** 兼容旧调用；内部最终仍通过 Data 的 Proxy.set 写入。 */
  edit(id: string, changes: CircleTextPrimitiveEditOptions): boolean {
    this.assertAlive();
    const data = this.items.get(id);
    if (!data) return false;
    data.edit(changes);
    this.scene.requestRender();
    return true;
  }

  /** 指定目标总显隐。 */
  setVisible(id: string, visible: boolean): boolean {
    const data = this.get(id);
    if (!data) return false;
    data.show = visible;
    this.scene.requestRender();
    return true;
  }

  /** 兼容旧管理器 API；只控制指定 Data。 */
  show(id: string, visible: boolean): boolean {
    return this.setVisible(id, visible);
  }

  delete(id: string): boolean {
    this.assertAlive();
    const data = this.items.get(id);
    if (!data) return false;
    const label = this.labels.get(id);
    if (label) this.labelCollection.remove(label);
    this.labels.delete(id);
    data.setChangeListener();
    this.dirtyItems.delete(data);
    this.slots.delete(data);
    this.items.delete(id);
    this.structureExpired = true;
    this.scene.requestRender();
    return true;
  }

  clear(): void {
    this.assertAlive();
    for (const data of this.items.values()) data.setChangeListener();
    this.dirtyItems.clear();
    this.slots.clear();
    this.items.clear();
    this.labels.clear();
    this.labelCollection.removeAll();
    this.structureExpired = true;
    this.scene.requestRender();
  }

  getOptions(id: string): CircleTextPrimitiveOptions | undefined {
    return this.get(id)?.getOptions();
  }

  getAllOptions(): CircleTextPrimitiveOptions[] {
    this.assertAlive();
    return Array.from(this.items.values(), (data) => data.getOptions());
  }

  /** Cesium PrimitiveCollection 每帧调用。 */
  update(frameState: FrameStateLike): void {
    if (this.destroyed) return;

    const height = this.scene.camera.positionCartographic.height / 1_000;
    const cameraChanged = height !== this.cameraHeight;
    this.cameraHeight = height;
    for (const [data, flags] of this.dirtyItems) {
      if (!data.expired) continue;
      validateItemOptions(data);
      if (flags & LABEL_DIRTY) this.updateNativeLabel(data);
      if (!cameraChanged && flags & (VISIBILITY_DIRTY | LABEL_DIRTY)) {
        this.updateRuntimeLabelVisibility(data);
      }
      if (!this.structureExpired && flags & ELLIPSE_DIRTY) {
        const slot = this.slots.get(data);
        if (slot) this.packInstance(slot.bucket, slot.index, data);
      }
      data.expired = false;
    }
    this.dirtyItems.clear();
    if (cameraChanged) {
      for (const data of this.items.values()) this.updateRuntimeLabelVisibility(data);
    }
    if (this.structureExpired) {
      this.repackEllipseBuckets();
      this.structureExpired = false;
    }

    this.labelCollection.show = this.visible;
    if (this.visible) {
      this.updateEllipseCommands(frameState);
      // 文字纹理由 Cesium 原生 LabelCollection 创建、缓存与绘制。
      this.labelCollection.update(frameState);
    }
  }

  isDestroyed(): boolean {
    return this.destroyed;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const bucket of this.textureBuckets.values()) {
      bucket.vertexArray?.destroy();
      bucket.texture?.destroy();
    }
    this.textureBuckets.clear();
    this.positionBuffer?.destroy();
    this.indexBuffer?.destroy();
    this.shaderProgram?.destroy();
    this.positionBuffer = undefined;
    this.indexBuffer = undefined;
    this.shaderProgram = undefined;
    this.labelCollection.destroy();
    this.labels.clear();
    for (const data of this.items.values()) data.setChangeListener();
    this.dirtyItems.clear();
    this.slots.clear();
    this.items.clear();
  }

  private updateNativeLabel(data: CircleTextData): void {
    const options = data.label;
    let label = this.labels.get(data.id);
    const position = Cesium.Cartesian3.fromDegrees(
      data.longitude,
      data.latitude,
      data.height,
      Cesium.Ellipsoid.default,
      scratchPosition,
    );
    if (!label) {
      label = this.labelCollection.add({ id: data.id, position });
      this.labels.set(data.id, label);
    }

    label.position = position;
    label.text = options.text;
    label.font = options.font;
    label.style = options.style;
    label.scale = options.scale;
    label.showBackground = options.showBackground;
    label.backgroundColor = options.backgroundColor;
    label.backgroundPadding = options.backgroundPadding;
    label.fillColor = options.fillColor;
    label.outlineColor = options.outlineColor;
    label.outlineWidth = options.outlineWidth;
    label.horizontalOrigin = getHorizontalOrigin(data.textAnchor);
    label.verticalOrigin = getVerticalOrigin(data.textAnchor);
    label.pixelOffset = Cesium.Cartesian2.fromElements(
      data.textOffset.x,
      data.textOffset.y,
      scratchPixelOffset,
    );
  }

  private updateRuntimeLabelVisibility(data: CircleTextData): void {
    const label = this.labels.get(data.id);
    if (!label) return;
    label.show =
      data.show &&
      data.textShow &&
      this.cameraHeight < data.maximumVisibleHeight;
  }

  private repackEllipseBuckets(): void {
    const groups = new Map<EllipseImageSource, CircleTextData[]>();
    for (const data of this.items.values()) {
      const group = groups.get(data.ellipseImage);
      if (group) group.push(data);
      else groups.set(data.ellipseImage, [data]);
    }

    this.slots.clear();
    for (const [source, bucket] of this.textureBuckets) {
      if (!groups.has(source)) {
        bucket.vertexArray?.destroy();
        bucket.texture?.destroy();
        this.textureBuckets.delete(source);
      }
    }
    for (const [source, data] of groups) {
      const bucket = this.getTextureBucket(source);
      if (bucket.values.length < data.length * INSTANCE_FLOATS) {
        const capacity = Math.min(this.capacity, Math.max(data.length, bucket.values.length / INSTANCE_FLOATS * 2, 16));
        bucket.values = new Float32Array(capacity * INSTANCE_FLOATS);
        bucket.vertexArray?.destroy();
        bucket.vertexArray = undefined;
        bucket.instanceBuffer = undefined;
        bucket.command = undefined;
      }
      bucket.instanceCount = data.length;
      bucket.visibleCount = 0;
      bucket.bounds.length = data.length;
      bucket.boundsExpired = true;
      bucket.dirtyIndices.clear();
      for (let index = 0; index < data.length; index += 1) {
        bucket.values[index * INSTANCE_FLOATS + 18] = 0;
        this.slots.set(data[index], { bucket, index });
        this.packInstance(bucket, index, data[index]);
      }
    }
  }

  private getTextureBucket(source: EllipseImageSource): TextureBucket {
    let bucket = this.textureBuckets.get(source);
    if (bucket) {
      if (
        typeof source === "string" &&
        !bucket.image &&
        !bucket.loading &&
        !bucket.loadError
      ) {
        this.loadBucketImage(bucket, source);
      }
      return bucket;
    }
    bucket = {
      source,
      image: typeof source === "string" ? undefined : source,
      values: new Float32Array(0),
      instanceCount: 0,
      visibleCount: 0,
      dirtyIndices: new Set(),
      bounds: [],
      boundsExpired: true,
      boundingVolume: new Cesium.BoundingSphere(),
    };
    this.textureBuckets.set(source, bucket);
    if (typeof source === "string") this.loadBucketImage(bucket, source);
    return bucket;
  }

  private loadBucketImage(bucket: TextureBucket, url: string): void {
    const imagePromise = new Cesium.Resource({ url }).fetchImage({
      // SVG 在部分 Chromium/ImageBitmap 实现中无法解码；HTMLImageElement
      // 能稳定交给 Cesium.Texture，同时与原生 Label 字形纹理路径无关。
      preferImageBitmap: false,
    });
    if (!imagePromise) {
      // RequestScheduler 暂时拒绝请求时留待后续帧重试。
      bucket.loading = undefined;
      this.scene.requestRender();
      return;
    }
    bucket.loading = imagePromise
      .then((image) => {
        if (this.destroyed || this.textureBuckets.get(bucket.source) !== bucket) return;
        bucket.image = image as TextureSource;
        bucket.loading = undefined;
        this.scene.requestRender();
      })
      .catch((error: unknown) => {
        if (this.destroyed || this.textureBuckets.get(bucket.source) !== bucket) return;
        bucket.loading = undefined;
        bucket.loadError = error;
        console.error(`椭圆纹理加载失败：${url}`, error);
      });
  }

  private packInstance(bucket: TextureBucket, index: number, data: CircleTextData): void {
    bucket.dirtyIndices.add(index);
    const bounds = bucket.bounds[index] ??= new Cesium.BoundingSphere();
    const position = Cesium.Cartesian3.fromDegrees(
      data.longitude, data.latitude, data.height, Cesium.Ellipsoid.default, scratchPosition,
    );
    const highX = encodeHigh(position.x);
    const highY = encodeHigh(position.y);
    const highZ = encodeHigh(position.z);
    const enu = Cesium.Transforms.eastNorthUpToFixedFrame(
      position,
      Cesium.Ellipsoid.default,
      scratchFrame,
    );
    Cesium.Matrix4.getColumn(enu, 0, scratchEast);
    Cesium.Matrix4.getColumn(enu, 1, scratchNorth);
    const [anchorX, anchorY] = ANCHOR_FACTORS[data.ellipseAnchor];
    const centerX = data.ellipseOffset.x - anchorX * data.ellipseWidth;
    const centerY = data.ellipseOffset.y - anchorY * data.ellipseHeight;
    const offset = index * INSTANCE_FLOATS;
    const values = bucket.values;
    values[offset] = highX;
    values[offset + 1] = highY;
    values[offset + 2] = highZ;
    values[offset + 3] = position.x - highX;
    values[offset + 4] = position.y - highY;
    values[offset + 5] = position.z - highZ;
    values[offset + 6] = scratchEast.x;
    values[offset + 7] = scratchEast.y;
    values[offset + 8] = scratchEast.z;
    values[offset + 9] = scratchNorth.x;
    values[offset + 10] = scratchNorth.y;
    values[offset + 11] = scratchNorth.z;
    values[offset + 12] = data.ellipseWidth;
    values[offset + 13] = data.ellipseHeight;
    values[offset + 14] = centerX;
    values[offset + 15] = centerY;
    values[offset + 16] = Cesium.Math.toRadians(data.ellipseRotation);
    values[offset + 17] = data.ellipseMode;
    const visible = data.show && data.ellipseShow ? 1 : 0;
    bucket.visibleCount += visible - values[offset + 18];
    values[offset + 18] = visible;
    values[offset + 19] = data.maximumVisibleHeight * 1_000;
    const maximumScale = Math.max(this.defaults.nearScale, this.defaults.farScale);
    // 锚点偏移会移动四边形中心，必须计入包围球以避免视野边缘错误剔除。
    const radius = (Math.hypot(data.ellipseWidth, data.ellipseHeight) / 2 +
      Math.hypot(centerX, centerY)) * maximumScale;
    if (!Cesium.Cartesian3.equals(bounds.center, position) || bounds.radius !== radius) {
      Cesium.Cartesian3.clone(position, bounds.center);
      bounds.radius = radius;
      bucket.boundsExpired = true;
    }
  }

  private updateEllipseCommands(frameState: FrameStateLike): void {
    for (const bucket of this.textureBuckets.values()) {
      if (!bucket.image && typeof bucket.source === "string" && !bucket.loading && !bucket.loadError) {
        this.loadBucketImage(bucket, bucket.source);
      }
      if (bucket.visibleCount === 0 || bucket.loadError || !bucket.image) {
        continue;
      }
      if (!bucket.command) this.createBucketResources(bucket, frameState.context);
      if (!bucket.command || !bucket.instanceBuffer) continue;
      if (bucket.boundsExpired) {
        Cesium.BoundingSphere.fromBoundingSpheres(bucket.bounds, bucket.boundingVolume);
        bucket.boundsExpired = false;
      }
      if (bucket.dirtyIndices.size > 0) {
        // 密集更新合并为一次上传；稀疏更新只上传连续的脏槽位。
        if (bucket.dirtyIndices.size > bucket.instanceCount / 2 || bucket.dirtyIndices.size > 64) {
          bucket.instanceBuffer.copyFromArrayView(bucket.values.subarray(0, bucket.instanceCount * INSTANCE_FLOATS));
        } else {
          const indices = Array.from(bucket.dirtyIndices).sort((a, b) => a - b);
          for (let i = 0; i < indices.length; i += 1) {
            const start = indices[i];
            let end = start + 1;
            while (indices[i + 1] === end) { i += 1; end += 1; }
            bucket.instanceBuffer.copyFromArrayView(
              bucket.values.subarray(start * INSTANCE_FLOATS, end * INSTANCE_FLOATS),
              start * INSTANCE_STRIDE,
            );
          }
        }
        bucket.dirtyIndices.clear();
      }
      bucket.command.instanceCount = bucket.instanceCount;
      bucket.command.boundingVolume = bucket.boundingVolume;
      if (frameState.passes.render) frameState.commandList.push(bucket.command);
    }
  }

  private createSharedResources(context: object): void {
    if (this.shaderProgram) return;
    this.positionBuffer = Rendering.Buffer.createVertexBuffer({
      context,
      typedArray: this.mesh.corners,
      usage: Rendering.BufferUsage.STATIC_DRAW,
    });
    this.indexBuffer = Rendering.Buffer.createIndexBuffer({
      context,
      typedArray: this.mesh.indices,
      usage: Rendering.BufferUsage.STATIC_DRAW,
      indexDatatype: Cesium.IndexDatatype.UNSIGNED_SHORT,
    });
    this.positionBuffer.vertexArrayDestroyable = false;
    this.indexBuffer.vertexArrayDestroyable = false;
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
        instanceEast: 3,
        instanceNorth: 4,
        instanceSizeCenter: 5,
        instanceDisplay: 6,
      },
    });
  }

  private createBucketResources(bucket: TextureBucket, context: object): void {
    this.createSharedResources(context);
    bucket.texture ??= new Rendering.Texture({
      context,
      source: bucket.image,
      flipY: true,
    });
    bucket.instanceBuffer = Rendering.Buffer.createVertexBuffer({
      context,
      sizeInBytes: bucket.values.byteLength,
      usage: Rendering.BufferUsage.DYNAMIC_DRAW,
    });
    bucket.vertexArray = new Rendering.VertexArray({
      context,
      indexBuffer: this.indexBuffer,
      attributes: [
        {
          index: 0,
          vertexBuffer: this.positionBuffer,
          componentsPerAttribute: 2,
        },
        ...[
          [1, 3, 0],
          [2, 3, 12],
          [3, 3, 24],
          [4, 3, 36],
          [5, 4, 48],
          [6, 4, 64],
        ].map(([index, componentsPerAttribute, offsetInBytes]) => ({
          index,
          vertexBuffer: bucket.instanceBuffer,
          componentsPerAttribute,
          componentDatatype: Cesium.ComponentDatatype.FLOAT,
          offsetInBytes,
          strideInBytes: INSTANCE_STRIDE,
          instanceDivisor: 1,
        })),
      ],
    });
    const renderState = Rendering.RenderState.fromCache({
      depthTest: { enabled: true },
      depthMask: false,
      cull: { enabled: false },
      blending: Cesium.BlendingState.ALPHA_BLEND,
    });
    bucket.command = new Rendering.DrawCommand({
      owner: this,
      vertexArray: bucket.vertexArray,
      shaderProgram: this.shaderProgram,
      renderState,
      primitiveType: Cesium.PrimitiveType.TRIANGLES,
      pass: Rendering.Pass.TRANSLUCENT,
      instanceCount: bucket.instanceCount,
      count: this.mesh.indices.length,
      boundingVolume: bucket.boundingVolume,
      modelMatrix: Cesium.Matrix4.IDENTITY,
      uniformMap: {
        u_image: () => bucket.texture,
        u_nearDistance: () => this.defaults.nearDistance,
        u_farDistance: () => this.defaults.farDistance,
        u_nearScale: () => this.defaults.nearScale,
        u_farScale: () => this.defaults.farScale,
      },
    });
  }

  private createId(): string {
    let id: string;
    do id = `circle-text-${this.nextId++}`;
    while (this.items.has(id));
    return id;
  }

  private assertAlive(): void {
    if (this.destroyed) {
      throw new Error("CircleTextDrawCommand 已被销毁");
    }
  }
}
