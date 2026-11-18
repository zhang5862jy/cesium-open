import * as C from "cesium";
import { isCalloutInViewport, isTargetVisible } from "./visibility";
import type { GlyphBatch } from "./glyphBatch";
import type { WorkerCalloutHandle, WorkerFrame } from "./workerHandle";
import { VERTEX, FRAGMENT } from "./shaders";
import { Rendering, type GpuResource, type GpuBuffer, type DrawCommandLike, type FrameStateLike } from "./rendering";
import {
  CalloutAvoidanceLayout, DEFAULT_CALLOUT_AVOIDANCE, normalizeAvoidance,
  type AvoidanceItem, type CalloutAvoidanceOptions, type CalloutAvoidanceStats,
} from "./avoidance";
import { validateDisplayMode, type CalloutDisplayMode } from "./display";
import type { CalloutRenderer } from "./rendererInterface";

export interface CalloutTextRenderingOptions {
  /** SDF 边缘平滑范围，越小越锐利。 */
  smoothing: number;
  /** 笔画补偿：正值加粗，负值变细，不改变字形布局。 */
  weight: number;
  pixelSnap: boolean;
}
export const DEFAULT_TEXT_RENDERING: Readonly<CalloutTextRenderingOptions> = Object.freeze({
  smoothing: 0.18, weight: 0.06, pixelSnap: true,
});

interface TextureResource extends GpuResource { copyFrom(options: object): void }
const R = Rendering as typeof Rendering & {
  Texture: new (options: object) => TextureResource;
  Sampler: new (options: object) => object;
};

// Cesium 内部阶段：在不透明物体后、透明合成前按提交顺序绘制。
// 依赖内部 API，升级 Cesium 时需验证深度与透明合成回归。
const ORDERED_CALLOUT_PASS = (R.Pass as typeof R.Pass & { CESIUM_3D_TILE_EDGES_DIRECT: number }).CESIUM_3D_TILE_EDGES_DIRECT;
function createAvoidanceGroup() {
  return {
    options: { ...DEFAULT_CALLOUT_AVOIDANCE }, layout: new CalloutAvoidanceLayout(),
    items: [] as AvoidanceItem[], stats: { unresolved: 0, moved: 0, candidateChecks: 0 } as CalloutAvoidanceStats,
  };
}

/** 持有 GPU 资源，在共享场景中依次提交牵引线和标牌两个绘制命令。 */
export class ScreenBatchRenderer implements CalloutRenderer {
  private context: object;
  private program: GpuResource;
  private leaderCommand: (DrawCommandLike & { cull: boolean }) | undefined;
  private buffer: GpuBuffer | undefined;
  private vao: GpuResource | undefined;
  private panelVao: GpuResource | undefined;
  private panelStart = -1;
  private corners: GpuBuffer;
  private atlas: TextureResource;
  private targets: TextureResource;
  private targetData: Float32Array;
  private capacity = 0;
  private count = 0;
  private targetCount: number;
  private vp = new C.Matrix4();
  private matrix: number[] = new Array(16);
  private camera = [0, 0, 0];
  private offset = new C.Cartesian2();
  private previousOffset = new C.Cartesian2();
  private previousPreference = new C.Cartesian2();
  private viewport = new C.Cartesian2();
  private textRendering = new C.Cartesian3(DEFAULT_TEXT_RENDERING.smoothing, DEFAULT_TEXT_RENDERING.weight, 1);
  private sizes: Float32Array = new Float32Array(0);
  private enabled: Uint8Array = new Uint8Array(0);
  private pendingPresentation: { displayModes?: Uint8Array; actionRects?: Float32Array } | undefined;
  private boundsDirty = true;
  private positionsVersion: number | undefined;
  private avoidanceGroups = { detailed: createAvoidanceGroup(), compact: createAvoidanceGroup() };
  private avoidanceItems: AvoidanceItem[] = [];
  private command: (DrawCommandLike & { vertexArray: GpuResource; cull: boolean }) | undefined;
  private destroyed = false;
  private scene: C.Scene;
  private primitive: { update: (state: FrameStateLike) => void; isDestroyed: () => boolean; destroy: () => void };
  visibleCount = 0;
  setAvoidance(options: boolean | Partial<CalloutAvoidanceOptions>, mode?: CalloutDisplayMode): void {
    if (mode !== undefined) validateDisplayMode(mode);
    const modes: CalloutDisplayMode[] = mode ? [mode] : ["detailed", "compact"];
    const updates = modes.map(name => ({ group: this.avoidanceGroups[name], next: normalizeAvoidance(options, this.avoidanceGroups[name].options) }));
    for (const { group, next } of updates) {
      if ((Object.keys(next) as (keyof CalloutAvoidanceOptions)[]).every(key => next[key] === group.options[key])) continue;
      if (next.enabled !== group.options.enabled) group.layout.clear();
      group.options = next;
      group.stats = { unresolved: 0, moved: 0, candidateChecks: 0 };
      this.scene.requestRender();
    }
  }
  getAvoidance(mode: CalloutDisplayMode = "detailed"): CalloutAvoidanceOptions {
    validateDisplayMode(mode);
    return { ...this.avoidanceGroups[mode].options };
  }
  getAvoidanceStats(mode?: CalloutDisplayMode): CalloutAvoidanceStats {
    if (mode !== undefined) { validateDisplayMode(mode); return { ...this.avoidanceGroups[mode].stats }; }
    const a = this.avoidanceGroups.detailed.stats, b = this.avoidanceGroups.compact.stats;
    return { unresolved: a.unresolved + b.unresolved, moved: a.moved + b.moved, candidateChecks: a.candidateChecks + b.candidateChecks };
  }
  /** Global batch setting; uniforms update immediately without rebuilding glyphs. */
  setTextRendering(options: Partial<CalloutTextRenderingOptions>): void {
    if(options.smoothing !== undefined && Number.isFinite(options.smoothing)) this.textRendering.x = C.Math.clamp(options.smoothing, 0, 1.5);
    if(options.weight !== undefined && Number.isFinite(options.weight)) this.textRendering.y = C.Math.clamp(options.weight, -0.5, 0.5);
    if(options.pixelSnap !== undefined) this.textRendering.z = options.pixelSnap ? 1 : 0;
  }
  getTextRendering(): CalloutTextRenderingOptions {
    return { smoothing: this.textRendering.x, weight: this.textRendering.y, pixelSnap: this.textRendering.z === 1 };
  }
  constructor(scene: C.Scene, targetCount: number, getFrame: () => WorkerFrame, getHandles: () => readonly WorkerCalloutHandle[]) {
    if(ORDERED_CALLOUT_PASS === undefined) throw new Error("当前 Cesium 缺少标牌需要的有序绘制阶段");
    const gl = (scene as unknown as { context: { _gl: WebGL2RenderingContext; webgl2: boolean } }).context;
    if (!gl.webgl2) throw new Error("批量标牌需要 WebGL2");
    if (!Number.isInteger(targetCount) || targetCount < 1 || targetCount > gl._gl.getParameter(gl._gl.MAX_TEXTURE_SIZE)) {
      throw new RangeError("目标数量必须在 1 与当前 GPU 最大纹理宽度之间");
    }
    this.scene = scene;
    this.context = (scene as unknown as { context: object }).context;
    this.targetCount = targetCount;
    this.targetData = new Float32Array(targetCount * 8);
    try {
      this.corners = R.Buffer.createVertexBuffer({ context: this.context, typedArray: new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), usage: R.BufferUsage.STATIC_DRAW });
      // The vertex array references this buffer but the renderer owns its lifetime.
      (this.corners as GpuBuffer & { vertexArrayDestroyable: boolean }).vertexArrayDestroyable = false;
      this.program = R.ShaderProgram.fromCache({
        context: this.context, vertexShaderSource: new R.ShaderSource({ sources: [VERTEX] }), fragmentShaderSource: new R.ShaderSource({ sources: [FRAGMENT] }),
        attributeLocations: { aTargetKind: 1, aOffset: 2, aAxisX: 3, aAxisY: 4, aUV: 5, aColor: 6, aCorner: 0 }
      });
      this.atlas = new R.Texture({ context: this.context, flipY: false, source: { width: 1, height: 1, arrayBufferView: new Uint8Array([255, 255, 255, 255]) } });
      this.targets = new R.Texture({
        context: this.context, pixelFormat: C.PixelFormat.RGBA, pixelDatatype: C.PixelDatatype.FLOAT, flipY: false,
        sampler: new R.Sampler({ minificationFilter: C.TextureMinificationFilter.NEAREST, magnificationFilter: C.TextureMagnificationFilter.NEAREST }),
        source: { width: targetCount, height: 2, arrayBufferView: this.targetData }
      });
      this.primitive = {
        update: state => {
          if(!state.passes.render || this.destroyed || !this.sizes.length) return;
          this.visibleCount = this.draw(scene, getFrame(), getHandles());
          if(this.visibleCount && this.count && this.command && this.leaderCommand) {
            if (this.leaderCommand.instanceCount) state.commandList.push(this.leaderCommand);
            if (this.command.instanceCount) state.commandList.push(this.command);
          }
        },
        isDestroyed: () => this.destroyed,
        destroy: () => this.release(),
      };
      scene.primitives.add(this.primitive);
    } catch (cause) {
      this.release();
      throw cause;
    }
  }
  update(batch: GlyphBatch, enabled: Uint8Array, displayModes?: Uint8Array): void {
    this.boundsDirty = true;
    if(batch.unchanged) {
      this.enabled = enabled;
      return;
    }
    const used = batch.count * 64;
    // Legacy batches interleave leaders and panels; preserve their two-pass behavior.
    const leaderCount = batch.leaderCount ?? batch.count;
    const panelCount = batch.leaderCount === undefined ? batch.count : batch.count - leaderCount;
    const panelStart = panelCount && batch.leaderCount !== undefined ? leaderCount : 0;
    if(used > this.capacity) {
      this.vao?.destroy();
      this.vao = undefined;
      this.panelVao?.destroy();
      this.panelVao = undefined;
      this.buffer?.destroy();
      this.buffer = undefined;
      this.panelStart = -1;
      this.capacity = 2 ** Math.ceil(Math.log2(Math.max(64, used)));
      this.buffer = R.Buffer.createVertexBuffer({ context: this.context, sizeInBytes: this.capacity, usage: R.BufferUsage.DYNAMIC_DRAW });
      (this.buffer as GpuBuffer & { vertexArrayDestroyable: boolean }).vertexArrayDestroyable = false;
      this.vao = this.createVertexArray(0);
      this.command = new R.DrawCommand({
        owner: this, vertexArray: this.vao, shaderProgram: this.program,
        renderState: R.RenderState.fromCache({ depthTest: { enabled: true }, depthMask: false, cull: { enabled: false }, blending: C.BlendingState.ALPHA_BLEND }),
        primitiveType: C.PrimitiveType.TRIANGLE_STRIP, pass: ORDERED_CALLOUT_PASS, count: 4, instanceCount: batch.count,
        boundingVolume: new C.BoundingSphere(), modelMatrix: C.Matrix4.IDENTITY,
        uniformMap: { uAtlas: () => this.atlas, uTargets: () => this.targets, uViewport: () => this.viewport, uTextRendering: () => this.textRendering, uLeaderPass: () => 0 },
      }) as typeof this.command;
      this.command!.cull = false;
      // Cesium 1.143 executes this slot in insertion order after opaque surfaces,
      // before OIT. Alpha blending preserves the complete leader underneath panels.
      this.leaderCommand = new R.DrawCommand({
        owner: this, vertexArray: this.vao, shaderProgram: this.program,
        renderState: R.RenderState.fromCache({ depthTest: { enabled: true }, depthMask: false, cull: { enabled: false }, blending: C.BlendingState.ALPHA_BLEND }),
        primitiveType: C.PrimitiveType.TRIANGLE_STRIP, pass: ORDERED_CALLOUT_PASS, count: 4, instanceCount: batch.count,
        boundingVolume: this.command!.boundingVolume, modelMatrix: C.Matrix4.IDENTITY,
        uniformMap: { uAtlas: () => this.atlas, uTargets: () => this.targets, uViewport: () => this.viewport, uTextRendering: () => this.textRendering, uLeaderPass: () => 1 },
      }) as typeof this.leaderCommand;
      this.leaderCommand!.cull = false;
    }
    if (this.command && panelStart !== this.panelStart) {
      this.panelVao?.destroy();
      this.panelVao = undefined;
      this.panelVao = this.createVertexArray(panelStart);
      this.panelStart = panelStart;
      this.command.vertexArray = this.panelVao;
    }
    if(used) this.buffer!.copyFromArrayView(batch.instances.subarray(0, batch.count * 16));
    if(batch.atlas) {
      try {
        const texture = new R.Texture({ context: this.context, flipY: false, source: batch.atlas });
        this.atlas.destroy(); this.atlas = texture;
      } finally { batch.atlas.close(); }
    }
    this.count = batch.count; this.sizes = batch.sizes; this.enabled = enabled;
    // Hit testing must retain the previous complete frame until these sizes are
    // projected. Position-only updates must not discard an upload awaiting draw.
    this.pendingPresentation = { displayModes, actionRects: batch.actionRects };
    if(this.command) this.command.instanceCount = panelCount;
    if(this.leaderCommand) this.leaderCommand.instanceCount = leaderCount;
  }
  private createVertexArray(firstInstance: number): GpuResource {
    let offset = firstInstance * 16;
    const attributes = [2, 2, 2, 2, 4, 4].map((size, index) => {
      const attribute = { index: index + 1, vertexBuffer: this.buffer!, componentsPerAttribute: size, componentDatatype: C.ComponentDatatype.FLOAT, offsetInBytes: offset * 4, strideInBytes: 64, instanceDivisor: 1 };
      offset += size;
      return attribute;
    });
    return new R.VertexArray({ context: this.context, attributes: [...attributes, { index: 0, vertexBuffer: this.corners, componentsPerAttribute: 2, componentDatatype: C.ComponentDatatype.FLOAT }] });
  }
  /** Prepare screen parameters inside primitive.update, before Cesium executes scene commands. */
  draw(scene: C.Scene, frame: WorkerFrame, handles: readonly WorkerCalloutHandle[]): number {
    const width = scene.canvas.clientWidth, height = scene.canvas.clientHeight;
    this.viewport.x = width; this.viewport.y = height;
    if(!this.sizes.length || !width || !height) return 0;
    if (this.pendingPresentation) {
      frame.displayModes = this.pendingPresentation.displayModes;
      frame.actionRects = this.pendingPresentation.actionRects;
      this.pendingPresentation = undefined;
    }
    C.Matrix4.multiply(scene.camera.frustum.projectionMatrix, scene.camera.viewMatrix, this.vp); C.Matrix4.toArray(this.vp, this.matrix);
    const cam = scene.camera.positionWC; this.camera[0] = cam.x; this.camera[1] = cam.y; this.camera[2] = cam.z;
    const m = this.matrix, p = frame.positions, b = frame.bounds, t = this.targetData, view = scene.camera.viewMatrix;
    const groups = this.avoidanceGroups ? Object.values(this.avoidanceGroups) : [];
    for (const group of groups) group.items.length = 0;
    const deferred = handles.some(handle => handle.isDragging());
    let visible = 0;
    for(let i = 0;i < this.targetCount;i++) {
      const x = p[i * 3]!, y = p[i * 3 + 1]!, z = p[i * 3 + 2]!, j = i * 4, k = i * 5;
      const w = m[3]! * x + m[7]! * y + m[11]! * z + m[15]!;
      const ax = w === 0 ? 0 : ((m[0]! * x + m[4]! * y + m[8]! * z + m[12]!) / w + 1) * width / 2;
      const ay = w === 0 ? 0 : (1 - (m[1]! * x + m[5]! * y + m[9]! * z + m[13]!) / w) * height / 2;
      const projectable = handles[i]!.getShow() && !!this.enabled[i] && scene.mode === C.SceneMode.SCENE3D
        && Number.isFinite(ax) && Number.isFinite(ay) && isTargetVisible(x, y, z, m, this.camera, false);
      t[j] = ax; t[j + 1] = ay; t[j + 2] = Number(projectable); t[j + 3] = -(view[2] * x + view[6] * y + view[10] * z + view[14]);
      b[k] = ax; b[k + 1] = ay; b[k + 2] = this.sizes[i * 2]!; b[k + 3] = this.sizes[i * 2 + 1]!;
      handles[i]!.getOffset(this.previousOffset);
      handles[i]!.getPreferredOffset(this.previousPreference);
      const automaticX = this.previousOffset.x - this.previousPreference.x, automaticY = this.previousOffset.y - this.previousPreference.y;
      handles[i]!.resolveScreenOffset(ax, ay, this.offset);
      const show = projectable && (isCalloutInViewport(ax, ay,
        ax + this.offset.x + automaticX, ay + this.offset.y + automaticY - b[k + 3]!, b[k + 2]!, b[k + 3]!, width, height)
        || isCalloutInViewport(ax, ay, ax + this.offset.x, ay + this.offset.y - b[k + 3]!, b[k + 2]!, b[k + 3]!, width, height));
      b[k + 4] = Number(show);
      const q = this.targetCount * 4 + j; t[q] = this.offset.x; t[q + 1] = this.offset.y; t[q + 2] = b[k + 2]!; t[q + 3] = b[k + 3]!;
      const group = this.avoidanceGroups?.[handles[i]!.getRenderedDisplayMode()];
      if (group?.options.enabled) {
        const item = this.avoidanceItems[i] ??= {} as AvoidanceItem;
        item.index = i; item.visible = show;
        item.anchorX = ax; item.anchorY = ay;
        item.width = b[k + 2]!; item.height = b[k + 3]!;
        item.preferredLeft = ax + this.offset.x;
        item.preferredTop = ay + this.offset.y - item.height;
        item.maxDistance = handles[i]!.getMaxOffsetDistance();
        item.dragging = handles[i]!.isDragging();
        item.priority = handles[i]!.getAvoidancePriority();
        group.items.push(item);
      }
    }
    for (const group of groups) if (group.options.enabled) {
      group.stats = group.layout.layout(group.items, width, height, group.options, deferred);
      for (const item of group.items) {
        const x = item.left - item.anchorX, y = item.top + item.height - item.anchorY;
        handles[item.index]!.applyAvoidanceOffset(x, y);
        const q = this.targetCount * 4 + item.index * 4;
        t[q] = x; t[q + 1] = y;
      }
    }
    for (let i = 0; i < this.targetCount; i++) {
      const j = i * 4, k = i * 5, q = this.targetCount * 4 + j;
      const show = !!t[j + 2] && isCalloutInViewport(t[j]!, t[j + 1]!,
        t[j]! + t[q]!, t[j + 1]! + t[q + 1]! - t[q + 3]!, t[q + 2]!, t[q + 3]!, width, height);
      t[j + 2] = b[k + 4] = Number(show);
      if (show) visible++;
    }
    if(this.command && (this.boundsDirty || frame.positionsVersion === undefined || frame.positionsVersion !== this.positionsVersion)) {
      C.BoundingSphere.fromVertices(p, C.Cartesian3.ZERO, 3, this.command.boundingVolume);
      this.boundsDirty = false;
      this.positionsVersion = frame.positionsVersion;
    }
    this.targets.copyFrom({ source: { width: this.targetCount, height: 2, arrayBufferView: t } });
    return visible;
  }
  isDestroyed(): boolean { return this.destroyed; }
  destroy(): void {
    if(this.destroyed) return;
    if(this.scene.primitives.contains(this.primitive)) this.scene.primitives.remove(this.primitive);
    this.release();
  }
  private release(): void {
    if(this.destroyed) return;
    this.destroyed = true;
    this.vao?.destroy();
    this.panelVao?.destroy();
    if (this.buffer && !this.buffer.isDestroyed()) this.buffer.destroy();
    this.corners?.destroy(); this.atlas?.destroy(); this.targets?.destroy(); this.program?.destroy();
    this.targetData = new Float32Array(0); this.sizes = new Float32Array(0); this.enabled = new Uint8Array(0); this.count = 0;
    this.pendingPresentation = undefined;
    this.visibleCount = 0;
    for (const group of Object.values(this.avoidanceGroups)) { group.layout.clear(); group.items.length = 0; }
    this.avoidanceItems.length = 0;
  }
}
