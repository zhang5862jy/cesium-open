import * as C from "cesium";
import {
  createCalloutFont,
  type TargetCalloutFontStyle,
  type TargetCalloutFontWeight,
} from "./font";

export interface TargetCalloutStyle {
  leaderColor: string;
  borderColor: string;
  textColor: string;
  backgroundColor: string;
  /** Square identification badge; used by compact content and the detailed title. */
  badgeColor: string;
  badgeTextColor: string;
  fontSize: number;
  fontFamily: string;
  fontStyle: TargetCalloutFontStyle;
  fontWeight: TargetCalloutFontWeight;
  lineGap: number;
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
  showBorder: boolean;
  showLeader: boolean;
}

export const DEFAULT_CALLOUT_STYLE: Readonly<TargetCalloutStyle> = Object.freeze({
  leaderColor: "#ff0000", borderColor: "#ff0000", textColor: "#ff0000",
  backgroundColor: "rgba(255, 255, 255, 0.1)", fontSize: 14, fontFamily: "sans-serif",
  badgeColor: "#ff0000", badgeTextColor: "#ffffff",
  fontStyle: "normal", fontWeight: 400, showBorder: true, showLeader: true,
  lineGap: 1, paddingTop: 10, paddingRight: 10, paddingBottom: 10, paddingLeft: 5,
});

export interface TargetCalloutOptions {
  /** CSS pixels from target centre to panel bottom-left. Overrides distance. */
  offset?: C.Cartesian2;
  distance?: number;
  /** Maximum target-to-panel-center distance in CSS pixels. Undefined means unlimited. */
  maxOffsetDistance?: number;
  style?: Partial<TargetCalloutStyle>;
  /** Batch owners can supply visibility instead of registering one per-frame callback per label. */
  externalVisibility?: boolean;
}

export type CalloutCorner = "bottom-left" | "top-left" | "top-right" | "bottom-right";

interface SharedCollections {
  backgrounds: C.BillboardCollection;
  labels: C.LabelCollection;
  pixel: HTMLCanvasElement;
  users: number;
}
const pools = new WeakMap<C.Scene, SharedCollections>();
function acquire(scene: C.Scene): SharedCollections {
  let pool = pools.get(scene);
  if (!pool) {
    const pixel = document.createElement("canvas");
    // Avoid stretching a single atlas texel: linear filtering would fade the entire panel.
    pixel.width = pixel.height = 64;
    const context = pixel.getContext("2d");
    if (!context) throw new Error("无法创建标牌纹理");
    context.fillStyle = "white";
    context.fillRect(0, 0, pixel.width, pixel.height);
    pool = {
      backgrounds: scene.primitives.add(new C.BillboardCollection({ scene, blendOption: C.BlendOption.TRANSLUCENT })),
      labels: scene.primitives.add(new C.LabelCollection({ scene, blendOption: C.BlendOption.TRANSLUCENT })),
      pixel, users: 0,
    };
    pools.set(scene, pool);
  }
  pool.users++;
  return pool;
}

/** Pixel annotation. All instances in a scene share one texture and two collections. */
export class TargetCallout {
  private readonly scene: C.Scene;
  private readonly pool: SharedCollections;
  private readonly panel: C.Billboard;
  private readonly line: C.Billboard;
  private readonly borders: C.Billboard[];
  private readonly rows: C.Label[];
  private readonly position = new C.Cartesian3();
  private readonly screen = new C.Cartesian2();
  private readonly direction = new C.Cartesian3();
  private readonly ray = new C.Ray();
  private readonly offset = new C.Cartesian2();
  private readonly leaderEndpoint = new C.Cartesian2();
  private leaderCorner: CalloutCorner = "bottom-left";
  private readonly removeUpdate: () => void;
  private readonly measure = document.createElement("canvas").getContext("2d")!;
  private style: TargetCalloutStyle;
  private width = 260;
  private height = 150;
  private lineCount = 1;
  private enabled = true;
  private visible = false;
  private destroyed = false;
  private readonly externalVisibility: boolean;
  private textDirty = true;
  private measuredWidth = 1;
  private maxOffsetDistance = Number.POSITIVE_INFINITY;

  constructor(scene: C.Scene, position: C.Cartesian3, options: number | TargetCalloutOptions = {}, legacyStyle: Partial<TargetCalloutStyle> = {}) {
    const distance = typeof options === "number" ? options : options.distance ?? 100;
    const style = typeof options === "number" ? legacyStyle : options.style;
    const initialOffset = typeof options === "number" ? undefined : options.offset;
    this.maxOffsetDistance = typeof options === "number"
      ? Number.POSITIVE_INFINITY
      : this.validateMaxOffsetDistance(options.maxOffsetDistance);
    this.validateDistance(distance);
    if (initialOffset && (!Number.isFinite(initialOffset.x) || !Number.isFinite(initialOffset.y))) throw new RangeError("偏移必须是有限数");
    this.style = this.validateStyle({ ...DEFAULT_CALLOUT_STYLE, ...style });
    this.scene = scene;
    this.externalVisibility = typeof options !== "number" && options.externalVisibility === true;
    this.pool = acquire(scene);
    const common = { position, disableDepthTestDistance: Number.POSITIVE_INFINITY, id: this };
    const add = () => this.pool.backgrounds.add({ ...common, image: this.pool.pixel, sizeInMeters: false });
    this.line = add();
    this.panel = add();
    this.panel.horizontalOrigin = C.HorizontalOrigin.LEFT;
    this.panel.verticalOrigin = C.VerticalOrigin.BOTTOM;
    this.borders = Array.from({ length: 4 }, add);
    this.rows = Array.from({ length: 6 }, () => this.pool.labels.add({
      ...common, text: "", horizontalOrigin: C.HorizontalOrigin.LEFT,
      verticalOrigin: C.VerticalOrigin.TOP,
    }));
    this.setPosition(position);
    this.setStyle(this.style);
    if (initialOffset) this.setOffset(initialOffset);
    else this.setDistance(distance);
    this.removeUpdate = this.externalVisibility ? () => {} : scene.preUpdate.addEventListener(() => this.updateVisibility());
  }

  setPosition(position: C.Cartesian3): void {
    C.Cartesian3.clone(position, this.position);
    for (const item of [this.panel, this.line, ...this.borders, ...this.rows]) item.position = position;
  }

  /** At most six rows. Panel grows to accommodate font size and text width. */
  setLines(lines: readonly string[]): void {
    if (lines.length > 6) throw new RangeError("标牌最多支持六行文字");
    if (this.lineCount === Math.max(1, lines.length) && this.rows.every((row, index) => row.text === (lines[index] ?? ""))) return;
    this.lineCount = Math.max(1, lines.length);
    this.rows.forEach((row, index) => { row.text = lines[index] ?? ""; });
    this.textDirty = true;
    this.layout();
    this.applyShow();
  }

  private validateDistance(distance: number): void {
    if (!Number.isFinite(distance) || distance < 0) throw new RangeError("距离必须是非负有限数");
  }

  private validateMaxOffsetDistance(distance?: number): number {
    const value = distance ?? Number.POSITIVE_INFINITY;
    if (value !== Number.POSITIVE_INFINITY && (!Number.isFinite(value) || value < 0)) {
      throw new RangeError("最大偏移距离必须是非负有限数或 Infinity");
    }
    return value;
  }

  private validateStyle(style: TargetCalloutStyle): TargetCalloutStyle {
    for (const value of [style.leaderColor, style.borderColor, style.textColor, style.backgroundColor]) {
      if (!C.Color.fromCssColorString(value)) throw new RangeError("无效颜色：" + value);
    }
    if (!Number.isFinite(style.fontSize) || style.fontSize < 8 || style.fontSize > 48) throw new RangeError("文字大小须为 8–48px");
    for (const spacing of [style.lineGap, style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft]) {
      if (!Number.isFinite(spacing) || spacing < 0 || spacing > 200) throw new RangeError("行间距和内边距须为 0–200px");
    }
    if (!["normal", "bold", "italic", "bold italic"].includes(style.fontStyle) || !style.fontFamily.trim()) throw new RangeError("无效文字样式");
    if (![100, 200, 300, 400, 500, 600, 700, 800, 900].includes(style.fontWeight)) throw new RangeError("文字粗细须为 100–900 的整百数");
    return style;
  }

  getStyle(): TargetCalloutStyle { return { ...this.style }; }

  setStyle(patch: Partial<TargetCalloutStyle>): void {
    this.style = this.validateStyle({ ...this.style, ...patch });
    this.line.color = C.Color.fromCssColorString(this.style.leaderColor);
    this.panel.color = C.Color.fromCssColorString(this.style.backgroundColor);
    for (const border of this.borders) border.color = C.Color.fromCssColorString(this.style.borderColor);
    for (const row of this.rows) {
      row.font = createCalloutFont(this.style);
      row.fillColor = C.Color.fromCssColorString(this.style.textColor);
    }
    this.textDirty = true;
    this.layout();
    this.applyShow();
  }

  /** Resets direction to upper-right 45 degrees. */
  setDistance(distance: number): void {
    this.validateDistance(distance);
    this.setOffset(new C.Cartesian2(distance / Math.SQRT2, -distance / Math.SQRT2));
  }

  getOffset(result = new C.Cartesian2()): C.Cartesian2 { return C.Cartesian2.clone(this.offset, result); }
  getMaxOffsetDistance(): number { return this.maxOffsetDistance; }
  setMaxOffsetDistance(distance = Number.POSITIVE_INFINITY): void {
    const value = this.validateMaxOffsetDistance(distance);
    if (value === this.maxOffsetDistance) return;
    this.maxOffsetDistance = value;
    this.setOffset(C.Cartesian2.clone(this.offset));
  }
  getLeaderEndpoint(result = new C.Cartesian2()): C.Cartesian2 { return C.Cartesian2.clone(this.leaderEndpoint, result); }
  getLeaderCorner(): CalloutCorner { return this.leaderCorner; }

  /** Offset from target centre to bottom-left, in CSS pixels. */
  setOffset(offset: C.Cartesian2): void {
    if (!Number.isFinite(offset.x) || !Number.isFinite(offset.y)) throw new RangeError("偏移必须是有限数");
    C.Cartesian2.clone(offset, this.offset);
    this.clampOffsetToMaxDistance();
    this.layout();
    this.applyShow();
  }

  private clampOffsetToMaxDistance(): void {
    const centerX = this.offset.x + this.width / 2;
    const centerY = this.offset.y - this.height / 2;
    const magnitude = Math.hypot(centerX, centerY);
    if (magnitude > this.maxOffsetDistance && magnitude > 0) {
      const scale = this.maxOffsetDistance / magnitude;
      this.offset.x = centerX * scale - this.width / 2;
      this.offset.y = centerY * scale + this.height / 2;
    }
  }

  private layout(): void {
    this.measure.font = this.rows[0]!.font;
    const { fontSize, lineGap, paddingTop, paddingRight, paddingBottom, paddingLeft } = this.style;
    if (this.textDirty) this.measuredWidth = Math.max(1, ...this.rows.map((row) => {
      const metrics = this.measure.measureText(row.text);
      return Math.max(metrics.width, metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight);
    }));
    this.textDirty = false;
    const contentWidth = this.measuredWidth;
    const lineHeight = fontSize + lineGap;
    // 2px border on every side, with padding measured from the border's inner edge.
    this.width = Math.ceil(contentWidth + paddingLeft + paddingRight + 4);
    this.height = Math.ceil(this.lineCount * fontSize + (this.lineCount - 1) * lineGap + paddingTop + paddingBottom + 4);
    this.clampOffsetToMaxDistance();
    const { x, y } = this.offset;
    this.panel.width = this.width;
    this.panel.height = this.height;
    this.panel.pixelOffset = this.offset;
    const corners: [CalloutCorner, number, number][] = [
      ["bottom-left", x, y], ["top-left", x, y - this.height],
      ["top-right", x + this.width, y - this.height], ["bottom-right", x + this.width, y],
    ];
    let nearest = corners[0]!;
    for (const corner of corners.slice(1)) {
      if (corner[1] ** 2 + corner[2] ** 2 < nearest[1] ** 2 + nearest[2] ** 2) nearest = corner;
    }
    this.leaderCorner = nearest[0];
    C.Cartesian2.fromElements(nearest[1], nearest[2], this.leaderEndpoint);
    this.line.pixelOffset = new C.Cartesian2(nearest[1] / 2, nearest[2] / 2);
    this.line.width = C.Cartesian2.magnitude(this.leaderEndpoint);
    this.line.height = 2;
    this.line.rotation = Math.atan2(-nearest[2], nearest[1]);
    const edges = [[x + this.width / 2, y - 1, this.width, 2],
      [x + this.width / 2, y - this.height + 1, this.width, 2],
      [x + 1, y - this.height / 2, 2, this.height],
      [x + this.width - 1, y - this.height / 2, 2, this.height]];
    this.borders.forEach((border, index) => {
      const edge = edges[index]!;
      border.pixelOffset = new C.Cartesian2(edge[0], edge[1]);
      border.width = edge[2];
      border.height = edge[3];
    });
    this.rows.forEach((row, index) => { row.pixelOffset = new C.Cartesian2(x + 2 + paddingLeft, y - this.height + 2 + paddingTop + index * lineHeight); });
  }

  getTargetScreenPosition(result = new C.Cartesian2()): C.Cartesian2 | undefined {
    return C.SceneTransforms.worldToWindowCoordinates(this.scene, this.position, result);
  }

  hitTest(point: C.Cartesian2): boolean {
    if (this.destroyed || !this.visible) return false;
    const anchor = this.getTargetScreenPosition(this.screen);
    if (!anchor) return false;
    const left = anchor.x + this.offset.x;
    const bottom = anchor.y + this.offset.y;
    return point.x >= left && point.x <= left + this.width && point.y >= bottom - this.height && point.y <= bottom;
  }

  setShow(show: boolean): void {
    this.enabled = show;
    if (this.externalVisibility) { this.visible = show; this.applyShow(); }
    else this.updateVisibility();
  }

  private applyShow(): void {
    this.panel.show = this.visible;
    this.line.show = this.visible && this.style.showLeader && C.Cartesian2.magnitudeSquared(this.leaderEndpoint) > 0;
    for (const border of this.borders) border.show = this.visible && this.style.showBorder;
    for (const row of this.rows) row.show = this.visible;
  }

  private updateVisibility(): void {
    const camera = this.scene.camera;
    C.Cartesian3.subtract(this.position, camera.positionWC, this.direction);
    const range = C.Cartesian3.magnitude(this.direction);
    C.Cartesian3.clone(camera.positionWC, this.ray.origin);
    if (range > 0) C.Cartesian3.divideByScalar(this.direction, range, this.ray.direction);
    const intersection = range > 0 ? C.IntersectionTests.rayEllipsoid(this.ray, this.scene.ellipsoid) : undefined;
    const point = this.getTargetScreenPosition(this.screen);
    this.visible = this.enabled && this.scene.mode === C.SceneMode.SCENE3D && !!point
      && C.Cartesian3.dot(this.direction, camera.directionWC) > 0
      && !(intersection && intersection.start < range - 0.1)
      && point.x >= 0 && point.y >= 0
      && point.x <= this.scene.canvas.clientWidth && point.y <= this.scene.canvas.clientHeight;
    this.applyShow();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.visible = false;
    this.removeUpdate();
    if (!this.scene.isDestroyed()) {
      for (const item of [this.panel, this.line, ...this.borders]) this.pool.backgrounds.remove(item);
      for (const row of this.rows) this.pool.labels.remove(row);
      if (--this.pool.users === 0) {
        this.scene.primitives.remove(this.pool.backgrounds);
        this.scene.primitives.remove(this.pool.labels);
        pools.delete(this.scene);
      }
    }
  }
}

export { TargetCalloutDragController } from "./drag";

