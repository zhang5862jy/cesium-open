import * as Cesium from "cesium";
import {
  GaussKrugerProjection,
  validateZone,
} from "./gaussKrugerProjection.js";
import type {
  GaussKrugerGridCalculationMode,
  GaussKrugerGridSpacingLevel,
  GaussKrugerGridStatus,
  GaussKrugerGridOptions,
} from "./types.js";

/**
 * CPU 几何流水线：相机视野 → 分带交集 → 投影米制范围 → 格距/采样决策
 * → 等东/北坐标线 → 反投影、裁切 → ECEF 三维折线。
 * 此模块不创建 GPU 资源；渲染器和标签模块共同消费这里输出的折线数据。
 */
/** 标识一条线保持不变的坐标轴；easting 线固定 E、沿 N 延伸，反之亦然。 */
export type GridAxis = "easting" | "northing";

/** 一条裁切后的连续折线片段；同一原始坐标线可能输出多个片段。 */
export interface ProjectedGridLine {
  /** 固定的坐标轴，不代表该线在旋转后的屏幕上一定竖直或水平。 */
  axis: GridAxis;
  /** 固定坐标的米制值；easting 不含百万位带号。 */
  coordinate: number;
  /** 所属投影带，用于标签显示与调试。 */
  zoneNumber: number;
  /** 是否满足“每 majorLineEvery 个格距一条主线”的索引规则。 */
  isMajor: boolean;
  /** WGS84 显示椭球上的 ECEF 坐标（米），相邻点组成 GPU 线段实例。 */
  positions: Cesium.Cartesian3[];
}

/** 一次几何生成的结果；状态中的线数按裁切后的片段计数。 */
export interface BuiltVisibleGrid {
  lines: ProjectedGridLine[];
  status: GaussKrugerGridStatus;
}

/**
 * 已填入默认值并校验的内部配置。所有空间长度使用米；线宽/标签间隔用 CSS 像素；
 * 刷新间隔用毫秒。保留 undefined 的字段表示自动选择，而不是零值。
 */
export interface ResolvedGridOptions {
  /** bounded 保持固定格距；lod 随视距和投影范围选择层级。 */
  calculationMode: GaussKrugerGridCalculationMode;
  /** 投影分带宽度（度）。 */
  zoneWidthDegrees: 3 | 6;
  /** 指定带号则只生成该带；undefined 则处理当前视野涉及的全部带。 */
  zoneNumber: number | undefined;
  /** bounded 模式下相邻坐标线的投影间距（米）。 */
  gridSpacing: number;
  /** lod 的高度阈值与对应格距表，已复制以避免外部修改影响内部状态。 */
  spacingLevels: readonly GaussKrugerGridSpacingLevel[];
  /** lod 东坐标格距上限（米），可使远景 E/N 两方向格距不同。 */
  maximumEastingSpacing: number;
  /** 在视野经纬度包围框外增加的比例余量，例如 0.12 表示各侧扩展跨度的 12%。 */
  viewPadding: number;
  /** bounded 的显示预算，以及 lod 选层时使用的目标密度；不是最终片段数硬上限。 */
  maximumLinesPerAxis: number;
  /** 调用方指定的折线采样步长上限（米）；与相邻格线之间的间距不同。 */
  sampleSpacing: number | undefined;
  /** 所有点相对显示椭球的高度（米），不贴地形。 */
  altitude: number;
  /** 已复制的线颜色，含透明度。 */
  lineColor: Cesium.Color;
  /** 普通线全宽（CSS 像素）。 */
  lineWidth: number;
  /** 主线周期，以格距索引而非数组位置判定。 */
  majorLineEvery: number;
  /** 主线全宽（CSS 像素）。 */
  majorLineWidth: number;
  /** 标签布局的最小屏幕间隔（CSS 像素）。 */
  minimumLabelSpacing: number;
  /** 标签 Canvas 的分辨率倍率，无量纲。 */
  labelPixelRatio: number;
  /** 普通视野几何刷新节流间隔（毫秒）。 */
  refreshInterval: number;
  /** 标签屏幕位置刷新节流间隔（毫秒）。 */
  labelUpdateInterval: number;
  /** 大视野下几何刷新节流间隔（毫秒）。 */
  largeViewRefreshInterval: number;
  /** 触发大视野刷新策略所需的可见带数阈值。 */
  largeViewZoneThreshold: number;
}

/** 连续经纬度矩形，单位弧度；周期展开后 west/east 可以超出 [-π, π]。 */
interface GeographicBounds {
  west: number;
  east: number;
  south: number;
  north: number;
}

/** 一个地理矩形经正投影后的轴对齐包围范围，所有字段单位为米。 */
interface ProjectedBounds {
  minimumEasting: number;
  maximumEasting: number;
  minimumNorthing: number;
  maximumNorthing: number;
}

/** 单带计算上下文：投影器、视域与带界交集，以及该交集的平面包围范围。 */
interface ZoneFrame {
  projection: GaussKrugerProjection;
  geographicBounds: GeographicBounds;
  projectedBounds: ProjectedBounds;
}

// 本实现选定的纬度覆盖范围，不代表高斯—克吕格投影本身只能用于这些纬度。
const MAXIMUM_LATITUDE = Cesium.Math.toRadians(84);
const MINIMUM_LATITUDE = Cesium.Math.toRadians(-80);
// 在分配折线数组、执行反投影之前限制工作量，防止合法但极端的有限参数卡住页面。
// 两者分别限制原始候选坐标线数和常规采样点数；裁切边界二分会产生额外求值。
const MAXIMUM_CANDIDATE_LINES = 8_192;
const MAXIMUM_SAMPLE_POINTS = 500_000;

// 从近景到远景的默认 LOD；高度与格距均用米，最后一级覆盖任意更高的相机高度。
const DEFAULT_SPACING_LEVELS: readonly GaussKrugerGridSpacingLevel[] = [
  { maximumCameraHeight: 2_000, gridSpacing: 100 },
  { maximumCameraHeight: 5_000, gridSpacing: 250 },
  { maximumCameraHeight: 10_000, gridSpacing: 500 },
  { maximumCameraHeight: 25_000, gridSpacing: 1_000 },
  { maximumCameraHeight: 60_000, gridSpacing: 2_000 },
  { maximumCameraHeight: 150_000, gridSpacing: 5_000 },
  { maximumCameraHeight: 400_000, gridSpacing: 10_000 },
  { maximumCameraHeight: 800_000, gridSpacing: 20_000 },
  { maximumCameraHeight: 1_500_000, gridSpacing: 50_000 },
  { maximumCameraHeight: 3_000_000, gridSpacing: 100_000 },
  { maximumCameraHeight: 6_000_000, gridSpacing: 200_000 },
  { maximumCameraHeight: 12_000_000, gridSpacing: 500_000 },
  { maximumCameraHeight: 25_000_000, gridSpacing: 1_000_000 },
  { maximumCameraHeight: Number.POSITIVE_INFINITY, gridSpacing: 2_000_000 },
];

// 投影转换器与相机无关，有限缓存避免每次拖动重新解析 CRS。
const projectionCache = new Map<string, GaussKrugerProjection>();
/** 按“带宽:带号”复用投影器；缓存满时淘汰最早插入项，不是按访问频率淘汰。 */
function getProjection(
  zoneNumber: number,
  width: 3 | 6,
): GaussKrugerProjection {
  const key = `${width}:${zoneNumber}`;
  let projection = projectionCache.get(key);
  if (!projection) {
    projection = new GaussKrugerProjection(zoneNumber, width);
    if (projectionCache.size >= 128)
      projectionCache.delete(projectionCache.keys().next().value!);
    projectionCache.set(key, projection);
  }
  return projection;
}

// 地平线测试同步执行，复用三个临时向量，避免为每个采样点产生短命对象。
const horizonSurfacePosition = new Cesium.Cartesian3();
const horizonNormal = new Cesium.Cartesian3();
const horizonToCamera = new Cesium.Cartesian3();

/**
 * 将公共可选参数整理为完整配置并集中校验；不保留调用方颜色和层级对象的引用。
 * 兼容“直接传 gridSpacing 表示固定格距”的用法，显式 calculationMode 优先。
 */
export function resolveGridOptions(
  options: GaussKrugerGridOptions,
): ResolvedGridOptions {
  const resolved: ResolvedGridOptions = {
    calculationMode:
      options.calculationMode ??
      (options.gridSpacing === undefined ? "lod" : "bounded"),
    zoneWidthDegrees: options.zoneWidthDegrees ?? 6,
    zoneNumber: options.zoneNumber,
    gridSpacing: options.gridSpacing ?? 1_000,
    spacingLevels: (options.spacingLevels ?? DEFAULT_SPACING_LEVELS).map(
      (level) => ({ ...level }),
    ),
    maximumEastingSpacing: options.maximumEastingSpacing ?? 500_000,
    viewPadding: options.viewPadding ?? 0.12,
    maximumLinesPerAxis: options.maximumLinesPerAxis ?? 28,
    sampleSpacing: options.sampleSpacing,
    altitude: options.altitude ?? 100,
    lineColor: Cesium.Color.clone(
      options.lineColor ?? Cesium.Color.WHITE.withAlpha(0.82),
    ),
    lineWidth: options.lineWidth ?? 1.25,
    majorLineEvery: options.majorLineEvery ?? 10,
    majorLineWidth: options.majorLineWidth ?? 2.5,
    minimumLabelSpacing: options.minimumLabelSpacing ?? 72,
    labelPixelRatio: options.labelPixelRatio ?? 2,
    refreshInterval: options.refreshInterval ?? 80,
    labelUpdateInterval: options.labelUpdateInterval ?? 32,
    largeViewRefreshInterval: options.largeViewRefreshInterval ?? 250,
    largeViewZoneThreshold: options.largeViewZoneThreshold ?? 4,
  };
  validateOptions(resolved);
  return resolved;
}

/**
 * 根据当前相机生成本次可显示的格网。输入是 Cesium 场景和已校验的配置，
 * 输出是连续三维片段及统计；无可见地表、无有效投影带或超预算时返回 undefined。
 * 整个过程只生成 CPU 数据，后续由 primitive 上传，标签层再投影到屏幕。
 */
export function buildVisibleGrid(
  scene: Cesium.Scene,
  options: ResolvedGridOptions,
): BuiltVisibleGrid | undefined {
  // 第 1 阶段：取带余量的地理视域，并按每个投影带的周期区间裁开。
  const visibleBounds = getVisibleGeographicBounds(scene, options.viewPadding);
  if (visibleBounds.length === 0) {
    return undefined;
  }
  let zoneFrames = visibleBounds.flatMap((bounds) =>
    buildZoneFrames(
      scene,
      bounds,
      options.zoneWidthDegrees,
      options.zoneNumber,
    ),
  );
  if (zoneFrames.length === 0) {
    return undefined;
  }

  // 第 2 阶段：用各带投影宽度之和与最大投影高度估计全视野密度。
  // 这是选格距的近似预算，不是屏幕像素间距，也不要求各带平面坐标能拼成同一 CRS。
  const cameraHeight = Math.max(0, scene.camera.positionCartographic.height);
  let projectedSpan = getProjectedSpan(zoneFrames);
  let rangeLimited = false;
  if (
    options.calculationMode === "bounded" &&
    !fitsFixedGridBudget(projectedSpan, options)
  ) {
    // 低空倾斜时，computeViewRectangle 会被地平线拉大，甚至返回全球矩形。
    // 此时只收紧绘制范围，不改变米制格距；高空仍沿用原来的超预算隐藏规则。
    const localFrames = buildLocalZoneFrames(scene, options, visibleBounds);
    if (!localFrames) return undefined;
    zoneFrames = localFrames;
    projectedSpan = getProjectedSpan(zoneFrames);
    rangeLimited = true;
  }
  const northingGridSpacing =
    options.calculationMode === "bounded"
      ? options.gridSpacing
      : selectGridSpacing(
          cameraHeight,
          projectedSpan.width,
          projectedSpan.height,
          options.spacingLevels,
          options.maximumLinesPerAxis,
        );
  const eastingGridSpacing =
    options.calculationMode === "bounded"
      ? options.gridSpacing
      : Math.min(northingGridSpacing, options.maximumEastingSpacing);
  // 第 3 阶段：单条线的采样密度与相邻线的格距分开决策。
  // 先以相机高度/画布高度近似每像素尺度，再由弦高 δ≈L²/(8R) 反求参考步长。
  // 0.05 像素、8 cm 和高度余量只构成启发式：下方会与半格距取较大值，
  // 此处并没有逐段检验误差，所以它们不是最终曲线误差或测绘精度保证。
  const chordTolerance = Math.max(
    0.001,
    Math.min(
      0.08,
      (cameraHeight / Math.max(1, scene.canvas.clientHeight)) * 0.05,
      options.altitude * 0.25,
    ),
  );
  const minimumSampleSpacing = Math.min(
    2000,
    Math.sqrt(8 * 6_350_000 * chordTolerance),
  );
  // 远景也限制长弦：两端在地表上方，中间仍可能沉入椭球，被深度测试遮挡。
  // 用近似半径 6,350 km、显示高度的四分之一作为弦高余量；用户可再用 sampleSpacing 收紧。
  const maximumSurfaceSampleSpacing = Math.sqrt(
    8 * 6_350_000 * options.altitude * 0.25,
  );
  // 固定 E 的线沿 N 采样，因此参考 northingGridSpacing；固定 N 的线则相反。
  const eastingLineSampleSpacing = Math.min(
    options.sampleSpacing ?? Number.POSITIVE_INFINITY,
    maximumSurfaceSampleSpacing,
    Math.max(minimumSampleSpacing, northingGridSpacing * 0.5),
  );
  const northingLineSampleSpacing = Math.min(
    options.sampleSpacing ?? Number.POSITIVE_INFINITY,
    maximumSurfaceSampleSpacing,
    Math.max(minimumSampleSpacing, eastingGridSpacing * 0.5),
  );
  // 第 4 阶段：先预估常规循环规模，再进入昂贵的反投影。每条线最少 2 段/3 点。
  // 即使参数都是有限正数，极小 sampleSpacing 仍可使点数溢出，需显式检查有限性。
  let candidateLineCount = 0;
  let candidateSampleCount = 0;
  for (const { projectedBounds: bounds } of zoneFrames) {
    const eastingCount = gridLineCount(
      bounds.minimumEasting,
      bounds.maximumEasting,
      eastingGridSpacing,
    );
    const northingCount = gridLineCount(
      bounds.minimumNorthing,
      bounds.maximumNorthing,
      northingGridSpacing,
    );
    candidateLineCount += eastingCount + northingCount;
    candidateSampleCount +=
      eastingCount *
        (Math.max(
          2,
          Math.ceil(
            (bounds.maximumNorthing - bounds.minimumNorthing) /
              eastingLineSampleSpacing,
          ),
        ) +
          1) +
      northingCount *
        (Math.max(
          2,
          Math.ceil(
            (bounds.maximumEasting - bounds.minimumEasting) /
              northingLineSampleSpacing,
          ),
        ) +
          1);
  }
  if (
    candidateLineCount > MAXIMUM_CANDIDATE_LINES ||
    candidateSampleCount > MAXIMUM_SAMPLE_POINTS ||
    !Number.isFinite(candidateSampleCount)
  ) {
    return undefined;
  }
  const lines: ProjectedGridLine[] = [];
  let verticalLineCount = 0;
  let horizontalLineCount = 0;
  let segmentCount = 0;

  // 第 5 阶段：用整格距索引枚举坐标线，使相机平移时格网原点始终固定。
  // ceil(min/spacing)..floor(max/spacing) 恰好覆盖范围内的整数倍坐标。
  for (const frame of zoneFrames) {
    const minimumEastingIndex = Math.ceil(
      frame.projectedBounds.minimumEasting / eastingGridSpacing,
    );
    const maximumEastingIndex = Math.floor(
      frame.projectedBounds.maximumEasting / eastingGridSpacing,
    );
    const minimumNorthingIndex = Math.ceil(
      frame.projectedBounds.minimumNorthing / northingGridSpacing,
    );
    const maximumNorthingIndex = Math.floor(
      frame.projectedBounds.maximumNorthing / northingGridSpacing,
    );
    const { minimumEasting, maximumEasting, minimumNorthing, maximumNorthing } =
      frame.projectedBounds;

    // 固定 E、遍历 N：一条原始线裁切后可能变成多个独立连续片段。
    for (
      let eastingIndex = minimumEastingIndex;
      eastingIndex <= maximumEastingIndex;
      eastingIndex += 1
    ) {
      const fragments = createGridLines(
        frame,
        scene,
        "easting",
        eastingIndex * eastingGridSpacing,
        eastingGridSpacing,
        minimumNorthing,
        maximumNorthing,
        eastingLineSampleSpacing,
        options,
      );
      for (const line of fragments) {
        lines.push(line);
        verticalLineCount += 1;
        segmentCount += line.positions.length - 1;
      }
    }

    // 固定 N、遍历 E；后续渲染步骤对两类折线使用相同的数据格式。
    for (
      let northingIndex = minimumNorthingIndex;
      northingIndex <= maximumNorthingIndex;
      northingIndex += 1
    ) {
      const fragments = createGridLines(
        frame,
        scene,
        "northing",
        northingIndex * northingGridSpacing,
        northingGridSpacing,
        minimumEasting,
        maximumEasting,
        northingLineSampleSpacing,
        options,
      );
      for (const line of fragments) {
        lines.push(line);
        horizontalLineCount += 1;
        segmentCount += line.positions.length - 1;
      }
    }
  }

  // 统计中的 vertical/horizontal 是投影轴方向的习惯名称，非屏幕朝向。
  // drawCommandCount 是本包提交的逻辑命令数，不保证等于 Cesium 最终执行的 GPU 调用数。
  return {
    lines,
    status: {
      calculationMode: options.calculationMode,
      cameraHeight,
      rangeLimited,
      gridSpacing: northingGridSpacing,
      eastingGridSpacing,
      northingGridSpacing,
      zoneWidthDegrees: options.zoneWidthDegrees,
      zoneNumbers: [
        ...new Set(zoneFrames.map((frame) => frame.projection.zoneNumber)),
      ],
      centralMeridians: [
        ...new Set(
          zoneFrames.map((frame) =>
            Cesium.Math.toDegrees(frame.projection.centralMeridian),
          ),
        ),
      ],
      verticalLineCount,
      horizontalLineCount,
      segmentCount,
      drawCommandCount: lines.length > 0 ? 1 : 0,
    },
  };
}

/** 各带东西跨度相加，南北跨度取最大值；与原有密度/线数预算使用相同口径。 */
function getProjectedSpan(frames: readonly ZoneFrame[]): {
  width: number;
  height: number;
} {
  let width = 0;
  let height = 0;
  for (const { projectedBounds: bounds } of frames) {
    width += bounds.maximumEasting - bounds.minimumEasting;
    height = Math.max(height, bounds.maximumNorthing - bounds.minimumNorthing);
  }
  return { width, height };
}

/** 用实际投影跨度核验固定格网预算，不能只按经纬角度或相机高度推断线数。 */
function fitsFixedGridBudget(
  span: { width: number; height: number },
  options: ResolvedGridOptions,
): boolean {
  return (
    Math.ceil(span.width / options.gridSpacing) + 1 <=
      options.maximumLinesPerAxis &&
    Math.ceil(span.height / options.gridSpacing) + 1 <=
      options.maximumLinesPerAxis
  );
}

/**
 * 全视域超预算时的低空回退：与相机地表位置附近的局部窗口求交。
 * 窗口宽度由“格距 × 可用线数”推导；相机高度超过窗口半宽时不启用，
 * 避免高空浏览时出现一小块没有上下文的格网。窗口跟随相机，而格线仍锚定整米坐标。
 * 这里限制的是生成范围，远处不再生成；不是通过抽线伪装成一公里格网。
 */
function buildLocalZoneFrames(
  scene: Cesium.Scene,
  options: ResolvedGridOptions,
  visibleBounds: readonly GeographicBounds[],
): ZoneFrame[] | undefined {
  const maximumSpan = options.gridSpacing * (options.maximumLinesPerAxis - 1);
  let halfExtent = maximumSpan / 2;
  const center = scene.camera.positionCartographic;
  if (
    !Number.isFinite(halfExtent) ||
    center.height > halfExtent ||
    isViewAboveSurface(scene)
  ) {
    return undefined;
  }

  // 经纬矩形在不同带投影后会旋转，各带宽度也会相加，因此必须重新计算实际预算。
  // 2% 余量吸收投影变化和边界的 1 mm padding；最多四次，避免数据相关的无界重试。
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const latitudeHalfSpan = halfExtent / Cesium.Ellipsoid.WGS84.minimumRadius;
    const maximumLatitude = Math.min(
      Cesium.Math.PI_OVER_TWO,
      Math.abs(center.latitude) + latitudeHalfSpan,
    );
    const longitudeHalfSpan = Math.min(
      Math.PI,
      latitudeHalfSpan / Math.max(1e-8, Math.cos(maximumLatitude)),
    );
    const localBounds = splitPaddedGeographicBounds(
      new Cesium.Rectangle(
        center.longitude - longitudeHalfSpan,
        center.latitude - latitudeHalfSpan,
        center.longitude + longitudeHalfSpan,
        center.latitude + latitudeHalfSpan,
      ),
      0,
    );
    const frames: ZoneFrame[] = [];
    for (const visible of visibleBounds) {
      for (const local of localBounds) {
        // 两组范围已经各自按 ±180° 拆段，可以直接求连续区间的交集。
        const intersection = {
          west: Math.max(visible.west, local.west),
          east: Math.min(visible.east, local.east),
          south: Math.max(visible.south, local.south),
          north: Math.min(visible.north, local.north),
        };
        if (
          intersection.east <= intersection.west ||
          intersection.north <= intersection.south
        )
          continue;
        frames.push(
          ...buildZoneFrames(
            scene,
            intersection,
            options.zoneWidthDegrees,
            options.zoneNumber,
          ),
        );
      }
    }
    if (frames.length === 0) return undefined;
    const span = getProjectedSpan(frames);
    if (fitsFixedGridBudget(span, options)) return frames;
    halfExtent *=
      0.98 * Math.min(maximumSpan / span.width, maximumSpan / span.height);
  }
  return undefined;
}

/**
 * 地球在相机地表点的切平面下方。若视锥四角的射线都从平面上方朝上出发，
 * 其凸组合（整个视锥）也无法与地球相交，可直接排除全天空。
 * 这不是“四角没拾取到地球就隐藏”：中心朝天而屏幕下沿向地面时仍须保留。
 * 其余情况保守保留，由后续地平线判断和 GPU 视锥/深度裁剪决定实际可见像素。
 */
function isViewAboveSurface(scene: Cesium.Scene): boolean {
  const ellipsoid = Cesium.Ellipsoid.WGS84;
  const center = scene.camera.positionCartographic;
  const surface = ellipsoid.cartographicToCartesian(
    new Cesium.Cartographic(center.longitude, center.latitude),
  );
  const normal = ellipsoid.geodeticSurfaceNormal(surface);
  const offset = new Cesium.Cartesian3();
  const pixel = new Cesium.Cartesian2();
  const ray = new Cesium.Ray();
  for (const x of [0, scene.canvas.clientWidth]) {
    for (const y of [0, scene.canvas.clientHeight]) {
      pixel.x = x;
      pixel.y = y;
      const corner = scene.camera.getPickRay(pixel, ray);
      if (
        !corner ||
        Cesium.Cartesian3.dot(normal, corner.direction) < 0 ||
        Cesium.Cartesian3.dot(
          normal,
          Cesium.Cartesian3.subtract(corner.origin, surface, offset),
        ) <= 0
      ) {
        return false;
      }
    }
  }
  return true;
}

/** 为一个连续视域创建单带上下文；指定固定带时仅求该带，否则枚举规范带号集合。 */
function buildZoneFrames(
  scene: Cesium.Scene,
  visibleBounds: GeographicBounds,
  zoneWidthDegrees: 3 | 6,
  fixedZoneNumber: number | undefined,
): ZoneFrame[] {
  if (fixedZoneNumber !== undefined) {
    const projection = getProjection(fixedZoneNumber, zoneWidthDegrees);
    return createZoneFrames(scene, projection, visibleBounds);
  }

  const frames: ZoneFrame[] = [];
  const firstZone = zoneWidthDegrees === 6 ? 1 : 0;
  const lastZone = zoneWidthDegrees === 6 ? 60 : 119;
  // 带号在格林尼治附近循环，而地理视域在 ±180° 拆段，两种接缝不重合。
  // 直接枚举最多 120 个带，后续求交筛除，可同时正确处理这两种接缝。
  for (let zoneNumber = firstZone; zoneNumber <= lastZone; zoneNumber += 1) {
    const projection = getProjection(zoneNumber, zoneWidthDegrees);
    frames.push(...createZoneFrames(scene, projection, visibleBounds));
  }
  return frames;
}

/**
 * 为同一投影带检查 -360°、0°、+360° 三个周期副本与视域的交集。
 * 每个副本只改变经度区间的表达方式，正反投影仍复用同一个带的转换器。
 */
function createZoneFrames(
  scene: Cesium.Scene,
  projection: GaussKrugerProjection,
  visibleBounds: GeographicBounds,
): ZoneFrame[] {
  const frames: ZoneFrame[] = [];
  // 中央经线为 180° 的 3° 带会同时覆盖全球矩形的左右两端。
  // 只选距离视域中心最近的一个副本，会丢掉另一半，因此保留所有非空交集。
  for (const shift of [-Cesium.Math.TWO_PI, 0, Cesium.Math.TWO_PI]) {
    const frame = createZoneFrame(scene, projection, visibleBounds, shift);
    if (frame) frames.push(frame);
  }
  return frames;
}

/**
 * 计算“视域 ∩ 某带周期副本”，排除空交集及确定在背面的区域，再求投影包围范围。
 * longitudeShift 用弧度；返回 undefined 表示该副本本次不需要生成几何。
 */
function createZoneFrame(
  scene: Cesium.Scene,
  projection: GaussKrugerProjection,
  visibleBounds: GeographicBounds,
  longitudeShift: number,
): ZoneFrame | undefined {
  const geographicBounds: GeographicBounds = {
    // 每个区域只绘制其自身投影带内的完整格网，避免邻带坐标系在此重叠铺满。
    // 纸图可能出现的邻带边框坐标注记不等价于再覆盖一套完整格线。
    west: Math.max(
      visibleBounds.west,
      projection.westBoundary + longitudeShift,
    ),
    east: Math.min(
      visibleBounds.east,
      projection.eastBoundary + longitudeShift,
    ),
    south: visibleBounds.south,
    north: visibleBounds.north,
  };
  if (
    geographicBounds.east <= geographicBounds.west ||
    geographicBounds.north <= geographicBounds.south
  ) {
    return undefined;
  }
  if (!isGeographicFramePotentiallyVisible(scene, geographicBounds)) {
    return undefined;
  }
  return {
    projection,
    geographicBounds,
    projectedBounds: projectGeographicBounds(projection, geographicBounds),
  };
}

/**
 * 将地理矩形包围成投影 E/N 范围（米），供整数格距枚举和沿线采样使用。
 * 投影是非线性的，不能只转两个对角点；这里在窄横轴墨卡托带内加入关键极值位置。
 */
function projectGeographicBounds(
  projection: GaussKrugerProjection,
  bounds: GeographicBounds,
): ProjectedBounds {
  let minimumEasting = Number.POSITIVE_INFINITY;
  let maximumEasting = Number.NEGATIVE_INFINITY;
  let minimumNorthing = Number.POSITIVE_INFINITY;
  let maximumNorthing = Number.NEGATIVE_INFINITY;

  // 将中央经线展开到与当前矩形同一周期，再判断其是否位于区间中。
  const centralMeridian =
    projection.centralMeridian +
    Math.round(
      ((bounds.west + bounds.east) * 0.5 - projection.centralMeridian) /
        Cesium.Math.TWO_PI,
    ) *
      Cesium.Math.TWO_PI;
  // 窄 TM 带内，跨赤道时 E 范围在赤道最宽；某条纬线上的 N 极值可能在中央经线。
  // 将赤道、中央经线夹取到矩形内部，再与四边组合取样，避免非对称视域漏掉这些极值。
  const latitudes = [
    bounds.south,
    bounds.north,
    Cesium.Math.clamp(0, bounds.south, bounds.north),
  ];
  const longitudes = [
    bounds.west,
    bounds.east,
    Cesium.Math.clamp(centralMeridian, bounds.west, bounds.east),
  ];
  for (const latitude of latitudes) {
    for (const longitude of longitudes) {
      const projected = projection.project(
        new Cesium.Cartographic(longitude, latitude),
      );
      minimumEasting = Math.min(minimumEasting, projected.easting);
      maximumEasting = Math.max(maximumEasting, projected.easting);
      minimumNorthing = Math.min(minimumNorthing, projected.northing);
      maximumNorthing = Math.max(maximumNorthing, projected.northing);
    }
  }
  return {
    // 各方向额外扩 1 mm，避免边界的浮点舍入把恰好在整格距上的线排除。
    minimumEasting: minimumEasting - 0.001,
    maximumEasting: maximumEasting + 0.001,
    minimumNorthing: minimumNorthing - 0.001,
    maximumNorthing: maximumNorthing + 0.001,
  };
}

/**
 * 从相机获取 WGS84 椭球上的可见经纬度包围框，扩展余量并限制到支持的纬度范围。
 * 跨反经线时拆成两个 west≤east 的连续矩形；这是地理包围范围，不是精确屏幕轮廓。
 */
function getVisibleGeographicBounds(
  scene: Cesium.Scene,
  paddingRatio: number,
): GeographicBounds[] {
  const rectangle = scene.camera.computeViewRectangle(Cesium.Ellipsoid.WGS84);
  if (!rectangle) {
    return [];
  }
  return splitPaddedGeographicBounds(rectangle, paddingRatio);
}

/** 扩展给定矩形并在日界线拆段；局部窗口传 padding=0，避免预算裁切后再次膨胀。 */
function splitPaddedGeographicBounds(
  rectangle: Cesium.Rectangle,
  paddingRatio: number,
): GeographicBounds[] {
  // Cesium 跨反经线矩形可能 east < west，先向东展开，再计算正跨度和 padding。
  let east = rectangle.east;
  if (east < rectangle.west) {
    east += Cesium.Math.TWO_PI;
  }
  const longitudeSpan = Math.min(Cesium.Math.TWO_PI, east - rectangle.west);
  const latitudeSpan = rectangle.north - rectangle.south;
  const longitudePadding = longitudeSpan * paddingRatio;
  const latitudePadding = latitudeSpan * paddingRatio;
  const latitudeBounds = {
    south: Cesium.Math.clamp(
      rectangle.south - latitudePadding,
      MINIMUM_LATITUDE,
      MAXIMUM_LATITUDE,
    ),
    north: Cesium.Math.clamp(
      rectangle.north + latitudePadding,
      MINIMUM_LATITUDE,
      MAXIMUM_LATITUDE,
    ),
  };
  let west = rectangle.west - longitudePadding;
  east += longitudePadding;
  // 余量扩展到一整圈时直接使用全球区间，避免同一区域重复生成。
  if (east - west >= Cesium.Math.TWO_PI) {
    return [{ west: -Math.PI, east: Math.PI, ...latitudeBounds }];
  }
  while (west < -Math.PI) {
    west += Cesium.Math.TWO_PI;
    east += Cesium.Math.TWO_PI;
  }
  // 折回规范区间后若东端仍越过 +π，拆成反经线两侧的独立矩形。
  if (east > Math.PI) {
    return [
      { west, east: Math.PI, ...latitudeBounds },
      { west: -Math.PI, east: east - Cesium.Math.TWO_PI, ...latitudeBounds },
    ];
  }
  return [{ west, east, ...latitudeBounds }];
}

/**
 * LOD 先按相机高度选起始层，再按投影宽/高估计坐标线密度，逐级增大真实格距。
 * 到最后一级即停止，因此 maximumLinesPerAxis 是层级选择目标，最终仍有硬预算兜底。
 */
function selectGridSpacing(
  cameraHeight: number,
  projectedWidth: number,
  projectedHeight: number,
  levels: readonly GaussKrugerGridSpacingLevel[],
  maximumLinesPerAxis: number,
): number {
  let levelIndex = levels.findIndex(
    (level) => cameraHeight <= level.maximumCameraHeight,
  );
  if (levelIndex < 0) {
    levelIndex = levels.length - 1;
  }
  while (levelIndex < levels.length - 1) {
    const spacing = levels[levelIndex]?.gridSpacing;
    if (spacing === undefined) {
      break;
    }
    if (
      Math.ceil(projectedWidth / spacing) + 1 <= maximumLinesPerAxis &&
      Math.ceil(projectedHeight / spacing) + 1 <= maximumLinesPerAxis
    ) {
      break;
    }
    levelIndex += 1;
  }
  return levels[levelIndex]?.gridSpacing ?? 1_000_000;
}

/** 闭区间 [minimum, maximum] 内有多少个 spacing 的整数倍，三个参数均为米。 */
function gridLineCount(
  minimum: number,
  maximum: number,
  spacing: number,
): number {
  return Math.max(
    0,
    Math.floor(maximum / spacing) - Math.ceil(minimum / spacing) + 1,
  );
}

/**
 * 生成一条等 E 或等 N 坐标线的全部可见片段，并附加坐标轴、带号与主线标记。
 * coordinate 是固定轴坐标；rangeStart/rangeEnd 是另一轴的取值范围，均以米计。
 */
function createGridLines(
  frame: ZoneFrame,
  scene: Cesium.Scene,
  axis: GridAxis,
  coordinate: number,
  gridSpacing: number,
  rangeStart: number,
  rangeEnd: number,
  sampleSpacing: number,
  options: ResolvedGridOptions,
): ProjectedGridLine[] {
  const isEasting = axis === "easting";
  const fragments = sampleProjectedLine(
    frame,
    scene,
    isEasting ? coordinate : rangeStart,
    isEasting ? rangeStart : coordinate,
    isEasting ? coordinate : rangeEnd,
    isEasting ? rangeEnd : coordinate,
    sampleSpacing,
    options.altitude,
  );
  // 主线由坐标索引确定，因此视域变化、裁成多个片段后，主/次线样式仍保持一致。
  const lineIndex = Math.round(coordinate / gridSpacing);
  const isMajor = Math.abs(lineIndex) % options.majorLineEvery === 0;
  return fragments.map((positions) => ({
    axis,
    coordinate,
    zoneNumber: frame.projection.zoneNumber,
    isMajor,
    positions,
  }));
}

/**
 * 在投影平面沿线均匀取样，逐点反投影并转 ECEF，输出彼此断开的可见折线数组。
 * 采样步长是平面米制长度的上限；这里用短弦逼近地球上的曲线，不执行贴地形采样。
 * 带界/视域裁切与椭球正面测试共同决定 inside，边界变化处额外二分求交。
 */
function sampleProjectedLine(
  frame: ZoneFrame,
  scene: Cesium.Scene,
  startEasting: number,
  startNorthing: number,
  endEasting: number,
  endNorthing: number,
  sampleSpacing: number,
  altitude: number,
): Cesium.Cartesian3[][] {
  const lineLength = Math.hypot(
    endEasting - startEasting,
    endNorthing - startNorthing,
  );
  // 投影包围框的两个端点都可能位于曲线状的真实区域外，但中间部分仍可见。
  // 即使极近景整段短于采样步长，也至少分 2 段、检测 3 点，不能只检测两端。
  const segmentCount = Math.max(2, Math.ceil(lineLength / sampleSpacing));
  const fragments: Cesium.Cartesian3[][] = [];
  let positions: Cesium.Cartesian3[] = [];
  let previousFraction = 0;
  let previousInside = false;

  // fraction 是沿平面线段的 0..1 比例；每个点依次做反投影、ECEF 转换与可见性测试。
  // CGCS2000/GRS80 经纬度以同名经纬度放到 WGS84 显示椭球，此处没有基准转换。
  for (let index = 0; index <= segmentCount; index += 1) {
    const fraction = index / segmentCount;
    const cartographic = unprojectLineFraction(
      frame,
      startEasting,
      startNorthing,
      endEasting,
      endNorthing,
      fraction,
      altitude,
    );
    const position =
      Cesium.Ellipsoid.WGS84.cartographicToCartesian(cartographic);
    const inside =
      isWithinFrame(frame, cartographic) &&
      isPositionFrontFacing(scene, position);

    // 相邻样点一内一外，说明夹住了一个边界；二分后把边界点接到片段端点。
    // 两点均在外且中间存在极窄可见区时，有限采样仍可能漏检，不能视为精确解析裁切。
    if (index > 0 && inside !== previousInside) {
      const boundaryFraction = findBoundaryFraction(
        frame,
        scene,
        startEasting,
        startNorthing,
        endEasting,
        endNorthing,
        previousFraction,
        fraction,
        previousInside,
        altitude,
      );
      const boundary = unprojectLineFraction(
        frame,
        startEasting,
        startNorthing,
        endEasting,
        endNorthing,
        boundaryFraction,
        altitude,
      );
      positions.push(Cesium.Ellipsoid.WGS84.cartographicToCartesian(boundary));
      if (!inside) {
        if (positions.length >= 2) fragments.push(positions);
        // 出界就完成当前片段并清空。以后再次入界须另起片段，
        // 否则会把应隐藏的间隙用一条错误的长弦连接起来。
        positions = [];
      }
    }
    if (inside) {
      positions.push(position);
    }
    previousFraction = fraction;
    previousInside = inside;
  }
  // 最后一个片段可能一直延伸到采样终点；单个点没有可绘制线段，直接丢弃。
  if (positions.length >= 2) fragments.push(positions);
  return fragments;
}

/**
 * 对已知一内一外的两个线段比例做二分，返回仍位于可见侧的边界近似比例。
 * 终止条件为投影平面区间 ≤ 0.01 m 或 32 次迭代；该阈值仅描述边界搜索，
 * 不等于整套投影、折线曲率或地理基准的厘米级精度保证。
 */
function findBoundaryFraction(
  frame: ZoneFrame,
  scene: Cesium.Scene,
  startEasting: number,
  startNorthing: number,
  endEasting: number,
  endNorthing: number,
  startFraction: number,
  endFraction: number,
  startInside: boolean,
  altitude: number,
): number {
  let lower = startFraction;
  let upper = endFraction;
  const lineLength = Math.hypot(
    endEasting - startEasting,
    endNorthing - startNorthing,
  );
  for (
    let iteration = 0;
    iteration < 32 && (upper - lower) * lineLength > 0.01;
    iteration += 1
  ) {
    const middle = (lower + upper) * 0.5;
    const cartographic = unprojectLineFraction(
      frame,
      startEasting,
      startNorthing,
      endEasting,
      endNorthing,
      middle,
      altitude,
    );
    const middleInside =
      isWithinFrame(frame, cartographic) &&
      isPositionFrontFacing(
        scene,
        Cesium.Ellipsoid.WGS84.cartographicToCartesian(cartographic),
      );
    // 始终维持 lower 与初始 start 同侧、upper 与初始 end 同侧的夹逼关系。
    if (middleInside === startInside) {
      lower = middle;
    } else {
      upper = middle;
    }
  }
  return startInside ? lower : upper;
}

/**
 * 对整个经纬度矩形做便宜、保守的背面预剔除，避免为完全不可见的带反投影大量点。
 * 通过相机向量与该范围内表面法向的最大点积给出上界；true 仅表示“可能可见”。
 */
function isGeographicFramePotentiallyVisible(
  scene: Cesium.Scene,
  bounds: GeographicBounds,
): boolean {
  if (scene.mode !== Cesium.SceneMode.SCENE3D) return true;
  const camera = scene.camera.positionWC;
  const cameraLongitude = Math.atan2(camera.y, camera.x);
  // 将相机方位角展开到矩形附近，再选区间内最接近该方位的经度，最大化水平点积。
  const unwrappedLongitude =
    cameraLongitude +
    Math.round(
      ((bounds.west + bounds.east) * 0.5 - cameraLongitude) /
        Cesium.Math.TWO_PI,
    ) *
      Cesium.Math.TWO_PI;
  const longitude = Cesium.Math.clamp(
    unwrappedLongitude,
    bounds.west,
    bounds.east,
  );
  const horizontalDot =
    camera.x * Math.cos(longitude) + camera.y * Math.sin(longitude);
  // 固定经度后，对 H·cos(φ)+Z·sin(φ) 检查纬度区间端点和内部极值候选。
  const latitude = Cesium.Math.clamp(
    Math.atan2(camera.z, horizontalDot),
    bounds.south,
    bounds.north,
  );
  // 指定纬度法向与相机向量的点积，单位为米（法向为单位向量）。
  const dotAtLatitude = (value: number): number =>
    horizontalDot * Math.cos(value) + camera.z * Math.sin(value);
  const maximumDot = Math.max(
    dotAtLatitude(bounds.south),
    dotAtLatitude(bounds.north),
    dotAtLatitude(latitude),
  );
  // 椭球切平面到地心的距离至少为最小半径。即使最大点积都不超过此值，
  // 整个矩形必在地平线后；解析上界可避免稀疏测试点漏掉狭窄的可见地平线区域。
  return maximumDot > Cesium.Ellipsoid.WGS84.minimumRadius;
}

/**
 * 在点的椭球投影处检查 n·(camera−surface)>0，判断该处表面是否朝向相机。
 * 使用椭球法线而非地心径向，适配扁椭球；这是椭球地平线测试，不处理地形/模型遮挡。
 * 绘制点虽有 altitude，测试仍基于其地表位置，所以不会显示地平线后的抬高格线。
 */
function isPositionFrontFacing(
  scene: Cesium.Scene,
  position: Cesium.Cartesian3,
): boolean {
  if (scene.mode !== Cesium.SceneMode.SCENE3D) return true;
  Cesium.Ellipsoid.WGS84.scaleToGeodeticSurface(
    position,
    horizonSurfacePosition,
  );
  Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(
    horizonSurfacePosition,
    horizonNormal,
  );
  Cesium.Cartesian3.subtract(
    scene.camera.positionWC,
    horizonSurfacePosition,
    horizonToCamera,
  );
  return Cesium.Cartesian3.dot(horizonNormal, horizonToCamera) > 0;
}

/** 将平面线段按 fraction 线性插值后反投影；比例无量纲，坐标及 altitude 用米。 */
function unprojectLineFraction(
  frame: ZoneFrame,
  startEasting: number,
  startNorthing: number,
  endEasting: number,
  endNorthing: number,
  fraction: number,
  altitude: number,
): Cesium.Cartographic {
  return frame.projection.unproject(
    Cesium.Math.lerp(startEasting, endEasting, fraction),
    Cesium.Math.lerp(startNorthing, endNorthing, fraction),
    altitude,
  );
}

/**
 * 检查反投影点是否位于当前带与视域的地理交集内。
 * 先将经度展开到 frame 所在周期，再以很小的弧度容差比较，避免 ±180° 接缝误判。
 */
function isWithinFrame(
  frame: ZoneFrame,
  cartographic: Cesium.Cartographic,
): boolean {
  const longitudeTolerance = Cesium.Math.EPSILON10;
  const latitudeTolerance = Cesium.Math.EPSILON10;
  const longitude =
    cartographic.longitude +
    Math.round(
      ((frame.geographicBounds.west + frame.geographicBounds.east) * 0.5 -
        cartographic.longitude) /
        Cesium.Math.TWO_PI,
    ) *
      Cesium.Math.TWO_PI;
  return (
    longitude >= frame.geographicBounds.west - longitudeTolerance &&
    longitude <= frame.geographicBounds.east + longitudeTolerance &&
    cartographic.latitude >= frame.geographicBounds.south - latitudeTolerance &&
    cartographic.latitude <= frame.geographicBounds.north + latitudeTolerance
  );
}

/**
 * 在进入几何和渲染计算前校验配置：枚举、带号、正长度、层级顺序、颜色与节流间隔。
 * 对 NaN/无穷值单独检查，避免比较表达式失效、死循环或无效 GPU 数据。
 */
function validateOptions(options: ResolvedGridOptions): void {
  if (
    options.calculationMode !== "bounded" &&
    options.calculationMode !== "lod"
  ) {
    throw new RangeError('calculationMode must be either "bounded" or "lod".');
  }
  if (options.zoneWidthDegrees !== 3 && options.zoneWidthDegrees !== 6) {
    throw new RangeError("zoneWidthDegrees must be either 3 or 6.");
  }
  if (options.spacingLevels.length === 0) {
    throw new RangeError("spacingLevels must contain at least one level.");
  }
  if (options.zoneNumber !== undefined)
    validateZone(options.zoneNumber, options.zoneWidthDegrees);
  assertPositiveFinite("gridSpacing", options.gridSpacing);
  assertPositiveFinite("maximumEastingSpacing", options.maximumEastingSpacing);
  let previousMaximumHeight = Number.NEGATIVE_INFINITY;
  let previousGridSpacing = 0;
  // 高度阈值严格递增，格距允许相等但不能变小；只允许最后通过 +∞ 覆盖远景。
  for (const level of options.spacingLevels) {
    if (
      (!Number.isFinite(level.maximumCameraHeight) &&
        level.maximumCameraHeight !== Number.POSITIVE_INFINITY) ||
      level.maximumCameraHeight < 0 ||
      level.maximumCameraHeight <= previousMaximumHeight
    ) {
      throw new RangeError(
        "spacingLevels maximumCameraHeight values must be non-negative and strictly ascending.",
      );
    }
    assertPositiveFinite("gridSpacing", level.gridSpacing);
    if (level.gridSpacing < previousGridSpacing) {
      throw new RangeError(
        "spacingLevels gridSpacing values must be non-decreasing.",
      );
    }
    previousMaximumHeight = level.maximumCameraHeight;
    previousGridSpacing = level.gridSpacing;
  }
  if (!Number.isFinite(options.viewPadding) || options.viewPadding < 0) {
    throw new RangeError("viewPadding must be a non-negative finite number.");
  }
  if (
    !Number.isInteger(options.maximumLinesPerAxis) ||
    options.maximumLinesPerAxis < 2
  ) {
    throw new RangeError(
      "maximumLinesPerAxis must be an integer of at least 2.",
    );
  }
  if (options.sampleSpacing !== undefined) {
    assertPositiveFinite("sampleSpacing", options.sampleSpacing);
  }
  assertPositiveFinite("altitude", options.altitude);
  for (const component of [
    options.lineColor.red,
    options.lineColor.green,
    options.lineColor.blue,
    options.lineColor.alpha,
  ]) {
    if (!Number.isFinite(component) || component < 0 || component > 1) {
      throw new RangeError(
        "lineColor components must be finite values from 0 through 1.",
      );
    }
  }
  assertPositiveFinite("lineWidth", options.lineWidth);
  if (!Number.isInteger(options.majorLineEvery) || options.majorLineEvery < 1) {
    throw new RangeError("majorLineEvery must be a positive integer.");
  }
  assertPositiveFinite("majorLineWidth", options.majorLineWidth);
  assertPositiveFinite("minimumLabelSpacing", options.minimumLabelSpacing);
  assertPositiveFinite("labelPixelRatio", options.labelPixelRatio);
  if (
    !Number.isFinite(options.refreshInterval) ||
    options.refreshInterval < 0
  ) {
    throw new RangeError(
      "refreshInterval must be a non-negative finite number.",
    );
  }
  if (
    !Number.isFinite(options.labelUpdateInterval) ||
    options.labelUpdateInterval < 0
  ) {
    throw new RangeError(
      "labelUpdateInterval must be a non-negative finite number.",
    );
  }
  if (
    !Number.isFinite(options.largeViewRefreshInterval) ||
    options.largeViewRefreshInterval < 0
  ) {
    throw new RangeError(
      "largeViewRefreshInterval must be a non-negative finite number.",
    );
  }
  if (
    !Number.isInteger(options.largeViewZoneThreshold) ||
    options.largeViewZoneThreshold < 1
  ) {
    throw new RangeError("largeViewZoneThreshold must be a positive integer.");
  }
}

/** 共用的正有限数断言；长度、线宽及倍率等参数都不能为零、负数、NaN 或无穷。 */
function assertPositiveFinite(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive finite number.`);
  }
}
