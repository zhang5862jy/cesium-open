import * as Cesium from "cesium";
import type { GridAxis, ProjectedGridLine } from "./gridGeometry.js";

// 本模块仅负责屏幕文字，不修改格网几何：ECEF 点 → CSS 像素点 → 屏幕边框交点
// → 坐标格式化 → 候选标签抽稀 → Canvas2D 绘制。屏幕原点在左上，y 向下增大。
type ScreenBorder = "top" | "right" | "bottom" | "left";
type AxisBorderAssignment = Record<GridAxis, "bottom" | "left">;

interface BorderIntersection {
  border: ScreenBorder;
  position: Cesium.Cartesian2;
}

interface CoordinateLabelParts {
  prefix: string;
  value: string;
}

interface LabelSegment {
  text: string;
  font: string;
  width: number;
  baselineOffset: number;
}

interface LabelCandidate {
  line: ProjectedGridLine;
  intersection: BorderIntersection;
  // 沿当前边框的一维 CSS 像素位置：底边用 x，左边用 y，便于排序和距离判断。
  borderPosition: number;
}

/** 标签布局距离使用 CSS 像素；pixelRatio 只影响 Canvas backing store 的清晰度。 */
export interface ScreenGridLabelOverlayOptions {
  minimumSpacing: number;
  pixelRatio: number;
}

const SMALL_FONT = '11px Arial, sans-serif';
const LARGE_FONT = 'bold 16px Arial, sans-serif';
const DEFAULT_AXIS_BORDERS: AxisBorderAssignment = {
  easting: "bottom",
  northing: "left",
};
// 两组线的竖直度差值小于阈值时沿用旧分配，避免相机旋转到约 45° 附近反复换边。
const AXIS_SWAP_HYSTERESIS = 0.12;

/**
 * 覆盖在 Cesium Canvas 上方的 HiDPI 二维标签层，自身不参与 WebGL 后处理采样。
 *
 * 所有布局先按 CSS 像素计算，最终由 2D context 的缩放变换画到更高分辨率的像素
 * 缓冲，保证文字清晰。标签按真实屏幕边缘间距抽稀，并锚定到投影坐标的整数索引，
 * 尽量避免相机平移时标签集合无规律变化。图层不接收鼠标事件，不干扰 Cesium 交互。
 */
export class ScreenGridLabelOverlay {
  private readonly scene: Cesium.Scene;
  private readonly options: ScreenGridLabelOverlayOptions;
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  // 同一个三维点可能被轴方向判断和边框求交多次使用；该缓存仅在一次 update 内有效。
  private readonly projectedPoints = new Map<Cesium.Cartesian3, Cesium.Cartesian2 | undefined>();
  // 字体与文本决定量测宽度，可跨帧复用；达到上限后清空，防止浏览过程无限积累。
  private readonly textWidths = new Map<string, number>();
  // 保留上帧轴/边框对应关系，为轴方向切换提供滞后状态。
  private axisBorders = { ...DEFAULT_AXIS_BORDERS };
  private visible = true;
  private destroyed = false;

  /** 创建自有 Canvas 并挂到 Cesium Canvas 的父容器；位置和大小会在 update 中对齐。 */
  constructor(
    scene: Cesium.Scene,
    options: ScreenGridLabelOverlayOptions,
  ) {
    this.scene = scene;
    this.options = options;
    const parent = scene.canvas.parentElement;
    if (!parent) {
      throw new Error("Cesium canvas must have a parent element.");
    }

    this.canvas = document.createElement("canvas");
    this.canvas.className = "gauss-kruger-grid-labels";
    this.canvas.setAttribute("aria-hidden", "true");
    Object.assign(this.canvas.style, {
      position: "absolute",
      left: "0",
      top: "0",
      zIndex: "2",
      pointerEvents: "none",
    });
    const context = this.canvas.getContext("2d");
    if (!context) {
      throw new Error("A 2D canvas context is required for grid labels.");
    }
    this.context = context;
    parent.appendChild(this.canvas);
  }

  /** 返回标签层自身的显示开关，不代表本次一定存在可绘制标签。 */
  get show(): boolean {
    return this.visible;
  }

  /** 只切换 DOM 可见性；隐藏期间保留 Canvas 与文本缓存，便于快速恢复。 */
  set show(value: boolean) {
    if (this.destroyed) return;
    this.visible = value;
    this.canvas.style.display = value ? "block" : "none";
  }

  /**
   * 重绘一帧标签，返回最终通过抽稀的数量。
   * 调用方负责刷新频率；本方法每次都按当前相机重新投屏、判断轴方向和收集交点。
   */
  update(lines: readonly ProjectedGridLine[]): number {
    if (this.destroyed || this.scene.isDestroyed()) return 0;
    const width = this.scene.canvas.clientWidth;
    const height = this.scene.canvas.clientHeight;
    // 直接用 Scene 时 Cesium Canvas 未必铺满父容器，所以使用它的实际偏移和尺寸。
    Object.assign(this.canvas.style, {
      left: `${this.scene.canvas.offsetLeft}px`,
      top: `${this.scene.canvas.offsetTop}px`,
      width: `${width}px`,
      height: `${height}px`,
    });
    if (width <= 0 || height <= 0 || this.scene.mode !== Cesium.SceneMode.SCENE3D) {
      this.context.setTransform(1, 0, 0, 1, 0, 0);
      this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.projectedPoints.clear();
      return 0;
    }

    // 采用设备 DPR 和用户清晰度下限中的较大值，并限制为 4，平衡清晰度与显存/内存。
    // CSS 尺寸保持 width×height，物理像素缓冲为 width×DPR、height×DPR。
    const pixelRatio = Math.min(
      4,
      Math.max(window.devicePixelRatio || 1, this.options.pixelRatio),
    );
    const drawingWidth = Math.round(width * pixelRatio);
    const drawingHeight = Math.round(height * pixelRatio);
    if (
      this.canvas.width !== drawingWidth ||
      this.canvas.height !== drawingHeight
    ) {
      this.canvas.width = drawingWidth;
      this.canvas.height = drawingHeight;
    }
    this.projectedPoints.clear();
    // 后续所有字体大小、边框位置和间距仍以 CSS 像素书写，由 transform 统一放大。
    this.context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    this.context.clearRect(0, 0, width, height);
    configureTextStyle(this.context);
    this.axisBorders = resolveAxisBorders(
      this.scene,
      lines,
      width,
      height,
      this.axisBorders,
      this.projectedPoints,
    );

    let visibleLabelCount = 0;
    for (const axis of ["easting", "northing"] as const) {
      const candidates = collectCandidates(
        this.scene,
        lines,
        axis,
        this.axisBorders[axis],
        width,
        height,
        this.projectedPoints,
      );
      const labelWidth = candidates.reduce((maximum, candidate) => Math.max(maximum,
        createLabelSegments(this.context, formatKilometerLabel(candidate.line), this.textWidths)
          .reduce((sum, segment) => sum + segment.width, 0)), 0);
      // 底边按最长文字宽度预留空间，同时避让左下角、底部控件；左边按纵向距离抽稀。
      // 不同轴分别处理，坐标值及其对应的几何线始终保持原值，不会为布局重新编号。
      const selected = thinCandidates(candidates.filter(candidate =>
        candidate.intersection.border === "bottom"
          ? candidate.borderPosition >= labelWidth + 12 && candidate.borderPosition < width - labelWidth / 2 - 6
          : candidate.borderPosition < height - 48),
        this.axisBorders[axis] === "bottom" ? Math.max(this.options.minimumSpacing, labelWidth + 12) : this.options.minimumSpacing);
      for (const candidate of selected) {
        drawLabel(
          this.context,
          formatKilometerLabel(candidate.line),
          candidate.intersection,
          width,
          height,
          this.textWidths,
        );
      }
      visibleLabelCount += selected.length;
    }
    return visibleLabelCount;
  }

  /** 移除自有 DOM 节点并清空缓存；幂等操作，不改变 Cesium Canvas 本身。 */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.canvas.remove();
    this.projectedPoints.clear();
    this.textWidths.clear();
  }
}

/**
 * 对指定坐标轴的每个可见折线片段寻找目标边框交点，形成待布局候选项。
 * 一条原始坐标线可能因裁切变成多个 ProjectedGridLine 片段；这里读取的是片段几何。
 */
function collectCandidates(
  scene: Cesium.Scene,
  lines: readonly ProjectedGridLine[],
  axis: GridAxis,
  border: "bottom" | "left",
  width: number,
  height: number,
  projectedPoints: Map<Cesium.Cartesian3, Cesium.Cartesian2 | undefined>,
): LabelCandidate[] {
  const candidates: LabelCandidate[] = [];
  for (const line of lines) {
    if (line.axis !== axis) continue;
    const intersection = findPreferredBorderIntersection(
      scene,
      line.positions,
      width,
      height,
      [border],
      projectedPoints,
    );
    if (!intersection) continue;
    candidates.push({
      line,
      intersection,
      borderPosition:
        border === "bottom" ? intersection.position.x : intersection.position.y,
    });
  }
  return candidates;
}

/**
 * 两阶段抽稀：先按投影坐标整数索引取模得到稳定子集，再按屏幕距离排除挤在一起的项。
 * 仅按当前屏幕数组“每隔 n 项选一项”会在新线进入视野时整体换号，因此以坐标为锚。
 */
function thinCandidates(
  candidates: readonly LabelCandidate[],
  minimumSpacing: number,
): LabelCandidate[] {
  if (candidates.length <= 1) return [...candidates];
  const screenSorted = [...candidates].sort(
    (left, right) => left.borderPosition - right.borderPosition,
  );
  // 中位屏幕间距比最小间距更不易受局部透视压缩、重合片段影响。
  const screenGaps: number[] = [];
  for (let index = 1; index < screenSorted.length; index += 1) {
    const gap = screenSorted[index].borderPosition -
      screenSorted[index - 1].borderPosition;
    if (gap > 0.5) screenGaps.push(gap);
  }
  screenGaps.sort((left, right) => left - right);
  const medianGap = screenGaps[Math.floor(screenGaps.length * 0.5)] ??
    minimumSpacing;
  const stride = Math.max(1, Math.ceil(minimumSpacing / medianGap));

  // 从正的坐标差推断本批候选的基础投影步长，coordinate 与 projectedStep 单位为米。
  const coordinateSorted = [...candidates].sort(
    (left, right) => left.line.coordinate - right.line.coordinate,
  );
  let projectedStep = Number.POSITIVE_INFINITY;
  for (let index = 1; index < coordinateSorted.length; index += 1) {
    const difference = Math.abs(
      coordinateSorted[index].line.coordinate -
        coordinateSorted[index - 1].line.coordinate,
    );
    if (difference > 0) projectedStep = Math.min(projectedStep, difference);
  }

  const stable = Number.isFinite(projectedStep)
    ? screenSorted.filter((candidate) => {
        const gridIndex = Math.round(candidate.line.coordinate / projectedStep);
        return Math.abs(gridIndex) % stride === 0;
      })
    : screenSorted;
  // 稳定子集为空时至少保留一个候选，再用 0.85 倍最小间距处理实际屏幕碰撞。
  const source = stable.length > 0 ? stable : [screenSorted[0]];
  const selected: LabelCandidate[] = [];
  let lastPosition = Number.NEGATIVE_INFINITY;
  for (const candidate of source) {
    if (candidate.borderPosition - lastPosition < minimumSpacing * 0.85) {
      continue;
    }
    selected.push(candidate);
    lastPosition = candidate.borderPosition;
  }
  return selected;
}

/** 黑色字形配白色描边，使文字在亮、暗底图上都保有对比度。 */
function configureTextStyle(context: CanvasRenderingContext2D): void {
  context.lineJoin = "round";
  context.miterLimit = 2;
  context.lineWidth = 2.5;
  context.strokeStyle = "rgba(255, 255, 255, 0.95)";
  context.fillStyle = "#161616";
}

/**
 * 较竖直的那组线优先标在底边，另一组标在左边；旋转相机后两轴可以交换边框。
 * 没有足够有效线段或竖直度差不足时沿用 previous，给方向选择加入滞后以抑制闪烁。
 */
function resolveAxisBorders(
  scene: Cesium.Scene,
  lines: readonly ProjectedGridLine[],
  width: number,
  height: number,
  previous: AxisBorderAssignment,
  projectedPoints: Map<Cesium.Cartesian3, Cesium.Cartesian2 | undefined>,
): AxisBorderAssignment {
  const eastingVerticality = measureAxisVerticality(
    scene,
    lines,
    "easting",
    width,
    height,
    projectedPoints,
  );
  const northingVerticality = measureAxisVerticality(
    scene,
    lines,
    "northing",
    width,
    height,
    projectedPoints,
  );
  if (eastingVerticality === undefined || northingVerticality === undefined) {
    return previous;
  }
  const difference = eastingVerticality - northingVerticality;
  if (Math.abs(difference) < AXIS_SWAP_HYSTERESIS) return previous;
  return difference > 0
    ? { easting: "bottom", northing: "left" }
    : { easting: "left", northing: "bottom" };
}

/**
 * 用可见附近线段的 |dy| 总和 / (|dx|+|dy|) 总和估计轴竖直度，结果为 0..1。
 * 过长投屏线段和远离视口的线段通常不能代表屏幕内方向，排除后再累计。
 */
function measureAxisVerticality(
  scene: Cesium.Scene,
  lines: readonly ProjectedGridLine[],
  axis: GridAxis,
  width: number,
  height: number,
  projectedPoints: Map<Cesium.Cartesian3, Cesium.Cartesian2 | undefined>,
): number | undefined {
  let horizontalTravel = 0;
  let verticalTravel = 0;
  const maximumSegmentLength = Math.hypot(width, height) * 0.5;
  for (const line of lines) {
    if (line.axis !== axis) continue;
    let previous: Cesium.Cartesian2 | undefined;
    for (const position of line.positions) {
      const current = projectPoint(scene, position, projectedPoints);
      if (!current) { previous = undefined; continue; }
      if (previous) {
        const deltaX = Math.abs(current.x - previous.x);
        const deltaY = Math.abs(current.y - previous.y);
        const segmentLength = Math.hypot(deltaX, deltaY);
        const midpointX = (current.x + previous.x) * 0.5;
        const midpointY = (current.y + previous.y) * 0.5;
        if (
          segmentLength <= maximumSegmentLength &&
          midpointX >= -width * 0.25 && midpointX <= width * 1.25 &&
          midpointY >= -height * 0.25 && midpointY <= height * 1.25
        ) {
          horizontalTravel += deltaX;
          verticalTravel += deltaY;
        }
      }
      previous = current;
    }
  }
  const totalTravel = horizontalTravel + verticalTravel;
  return totalTravel > 0 ? verticalTravel / totalTravel : undefined;
}

/**
 * 用椭球表面法线与“点到相机”向量的点积剔除背面点。
 * 这是椭球朝向判断，不是包含地形、建筑物等遮挡物的深度可见性检测。
 */
function isFrontFacing(
  scene: Cesium.Scene,
  position: Cesium.Cartesian3,
): boolean {
  const normal = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(
    position,
    scratchSurfaceNormal,
  );
  Cesium.Cartesian3.subtract(scene.camera.positionWC, position, scratchToCamera);
  return Cesium.Cartesian3.dot(normal, scratchToCamera) > 0;
}

const scratchSurfaceNormal = new Cesium.Cartesian3();
const scratchToCamera = new Cesium.Cartesian3();

/**
 * 导出便于面板/日志使用的完整坐标文本，采用国内测绘约定：X 为北坐标，Y 为东坐标。
 * 北坐标：X=N/1000 km；东坐标：Y=(带号×1000000+带内东坐标 E)/1000 km。
 * 带号前缀仅用于显示，不参与投影正反算。例如 20 带 E=500000 m → Y 20500 km。
 */
export function formatGridCoordinate(line: Pick<ProjectedGridLine, "axis" | "coordinate" | "zoneNumber">): string {
  const parts = formatKilometerLabel(line);
  return `${parts.prefix} ${parts.value} km`;
}

/**
 * 将米制坐标转换为公里字符串；保留至多六位小数，Number 去除无意义尾零。
 * 返回的 prefix 供完整文本格式化使用；Canvas 边框标签只绘制数值部分以节省空间。
 */
function formatKilometerLabel(line: Pick<ProjectedGridLine, "axis" | "coordinate" | "zoneNumber">): CoordinateLabelParts {
  const coordinate = line.axis === "easting"
    ? line.zoneNumber * 1_000_000 + line.coordinate : line.coordinate;
  return {
    prefix: line.axis === "easting" ? "Y" : "X",
    value: String(Number((coordinate / 1000).toFixed(6))),
  };
}

/**
 * ECEF 米制点投影为 Canvas 内 CSS 像素点，并缓存本帧结果（包括失败的 undefined）。
 * 先拒绝背面点，再检查投屏结果有效性；相邻点投影失败时，上层会断开屏幕线段。
 */
function projectPoint(scene: Cesium.Scene, position: Cesium.Cartesian3,
  cache: Map<Cesium.Cartesian3, Cesium.Cartesian2 | undefined>): Cesium.Cartesian2 | undefined {
  if (cache.has(position)) return cache.get(position);
  const point = isFrontFacing(scene, position)
    ? Cesium.SceneTransforms.worldToWindowCoordinates(scene, position) : undefined;
  const result = point && Number.isFinite(point.x) && Number.isFinite(point.y) ? point : undefined;
  cache.set(position, result);
  return result;
}

/** 按边框选择锚点、约束文字留在 Canvas 内，再分两遍绘制白色描边和黑色字形。 */
function drawLabel(
  context: CanvasRenderingContext2D,
  parts: CoordinateLabelParts,
  intersection: BorderIntersection,
  width: number,
  height: number,
  textWidths: Map<string, number>,
): void {
  const segments = createLabelSegments(context, parts, textWidths);
  const totalWidth = segments.reduce((sum, segment) => sum + segment.width, 0);
  const x = Cesium.Math.clamp(intersection.position.x, 3, width - 3);
  const y = Cesium.Math.clamp(intersection.position.y, 3, height - 3);
  let startX: number;
  let baselineY: number;
  switch (intersection.border) {
    case "top":
      startX = Cesium.Math.clamp(x - totalWidth * 0.5, 3, width - totalWidth - 3);
      baselineY = 18;
      break;
    case "right":
      startX = width - totalWidth - 5;
      baselineY = Cesium.Math.clamp(y + 5, 18, height - 5);
      break;
    case "bottom":
      startX = Cesium.Math.clamp(x - totalWidth * 0.5, 3, width - totalWidth - 3);
      // 底边文字抬高，避开 Cesium 的来源署名和全屏等底部控件。
      baselineY = height - 25;
      break;
    case "left":
      startX = 5;
      baselineY = Cesium.Math.clamp(y + 5, 18, height - 5);
      break;
  }

  context.save();
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  // 先统一画所有分段的白色描边，再统一填色；否则后一个分段的描边会盖住前一字形。
  let cursorX = startX;
  for (const segment of segments) {
    context.font = segment.font;
    context.strokeText(segment.text, cursorX, baselineY + segment.baselineOffset);
    cursorX += segment.width;
  }
  cursorX = startX;
  for (const segment of segments) {
    context.font = segment.font;
    context.fillText(segment.text, cursorX, baselineY + segment.baselineOffset);
    cursorX += segment.width;
  }
  context.restore();
}

/**
 * 将公里坐标拆成小号高位数字、加粗末两位整数和小号小数，并量测每段实际宽度。
 * 这只是显示层级，完整数字仍保留；符号与小数不能被整数拆分逻辑丢弃。
 */
function createLabelSegments(
  context: CanvasRenderingContext2D,
  parts: CoordinateLabelParts,
  textWidths: Map<string, number>,
): LabelSegment[] {
  // 采用常见测量格网标注样式：高位数字抬高，公里整数的最后两位作为视觉主体。
  // 先单独提取负号，再拆整数和小数；例如 -123.5 仍能完整显示为 −1 / 23 / .5。
  const negative = parts.value.startsWith("-");
  const [integer, fraction] = (negative ? parts.value.slice(1) : parts.value).split(".");
  const leading = integer.slice(0, -2);
  const principal = integer.slice(-2);
  const sign = negative ? "−" : "";
  return [
    { text: leading ? sign + leading : "", font: SMALL_FONT, baselineOffset: -5 },
    { text: (leading ? "" : sign) + principal, font: LARGE_FONT, baselineOffset: 0 },
    { text: fraction ? `.${fraction}` : "", font: SMALL_FONT, baselineOffset: 0 },
  ]
    .filter((definition) => definition.text.length > 0)
    .map((definition) => {
      const key = `${definition.font}:${definition.text}`;
      let width = textWidths.get(key);
      if (width === undefined) {
        context.font = definition.font;
        width = context.measureText(definition.text).width;
        if (textWidths.size >= 1024) textWidths.clear();
        textWidths.set(key, width);
      }
      return { ...definition, width };
    });
}

/**
 * 遍历三维折线的相邻采样点，求投屏线段与四条边框的交点，再按调用方优先级选一个。
 * 选中交点还必须位于地球投影之上，防止全球远景时把标签放到地球外的背景天空。
 */
function findPreferredBorderIntersection(
  scene: Cesium.Scene,
  positions: readonly Cesium.Cartesian3[],
  width: number,
  height: number,
  borderPreference: readonly ScreenBorder[],
  projectedPoints: Map<Cesium.Cartesian3, Cesium.Cartesian2 | undefined>,
): BorderIntersection | undefined {
  const intersections: BorderIntersection[] = [];
  let previous: Cesium.Cartesian2 | undefined;
  for (const position of positions) {
    const current = projectPoint(scene, position, projectedPoints);
    if (previous && current) {
      appendSegmentIntersections(previous, current, width, height, intersections);
    }
    previous = current;
  }
  for (const border of borderPreference) {
    const intersection = intersections.find(
      (item) => item.border === border &&
        isBorderOverGlobe(scene, item, width, height),
    );
    if (intersection) return intersection;
  }
  return undefined;
}

/**
 * 从边框向屏幕内缩 2 CSS 像素后发射相机射线，检查是否击中 WGS84 椭球。
 * 内缩避免刚好位于边界的数值误差；这里不读取地形，也不要求地球覆盖整个视口。
 */
function isBorderOverGlobe(
  scene: Cesium.Scene,
  intersection: BorderIntersection,
  width: number,
  height: number,
): boolean {
  const inset = 2;
  const sample = scratchBorderSample;
  sample.x = Cesium.Math.clamp(intersection.position.x, inset, width - inset);
  sample.y = Cesium.Math.clamp(intersection.position.y, inset, height - inset);
  if (intersection.border === "left") sample.x = inset;
  else if (intersection.border === "right") sample.x = width - inset;
  else if (intersection.border === "top") sample.y = inset;
  else sample.y = height - inset;
  return Boolean(scene.camera.pickEllipsoid(sample, Cesium.Ellipsoid.WGS84));
}

const scratchBorderSample = new Cesium.Cartesian2();

/**
 * 屏幕线段写成 P(t)=start+t·(end-start)，分别解 y=0、y=height、x=0、x=width。
 * 与某边平行时分母为零，直接跳过该方向；其余候选参数交给下一层检查 t∈[0,1]。
 */
function appendSegmentIntersections(
  start: Cesium.Cartesian2,
  end: Cesium.Cartesian2,
  width: number,
  height: number,
  intersections: BorderIntersection[],
): void {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  if (deltaY !== 0) {
    appendIntersectionAtParameter(
      start, deltaX, deltaY, -start.y / deltaY, "top", width, height,
      intersections,
    );
    appendIntersectionAtParameter(
      start, deltaX, deltaY, (height - start.y) / deltaY, "bottom", width,
      height, intersections,
    );
  }
  if (deltaX !== 0) {
    appendIntersectionAtParameter(
      start, deltaX, deltaY, -start.x / deltaX, "left", width, height,
      intersections,
    );
    appendIntersectionAtParameter(
      start, deltaX, deltaY, (width - start.x) / deltaX, "right", width,
      height, intersections,
    );
  }
}

/** 验证交点在线段和视口边界内，容许半个 CSS 像素误差后钳制到精确边框坐标。 */
function appendIntersectionAtParameter(
  start: Cesium.Cartesian2,
  deltaX: number,
  deltaY: number,
  parameter: number,
  border: ScreenBorder,
  width: number,
  height: number,
  intersections: BorderIntersection[],
): void {
  if (parameter < 0 || parameter > 1) return;
  const x = start.x + deltaX * parameter;
  const y = start.y + deltaY * parameter;
  if (x < -0.5 || x > width + 0.5 || y < -0.5 || y > height + 0.5) return;
  intersections.push({
    border,
    position: new Cesium.Cartesian2(
      Cesium.Math.clamp(x, 0, width),
      Cesium.Math.clamp(y, 0, height),
    ),
  });
}
