import { Cartesian3 } from "cesium";

/**
 * 所有表现形式统一使用的显隐接口。
 * 可以包装 Model、Billboard、独立 Primitive，或自定义批次中的单个实例。
 * 管理器只调用此接口，不负责更新位置、创建对象或释放 GPU 资源。
 */
export interface LodView {
  setVisible(visible: boolean): void;
}

/**
 * 适配已有的、具有 show 属性的对象；不会创建新的渲染对象。
 * GeometryInstance 等批次内对象应自行实现 LodView，避免隐藏整个批次。
 */
export function asLodView(object: { show: boolean }): LodView {
  return {
    setVisible(visible) {
      object.show = visible;
    },
  };
}

/** distance 使用相机到目标的直线距离；cameraHeight 使用调用方传入的高度。 */
export type LodMetric = "distance" | "cameraHeight";

export interface LodLevel {
  /** 区间下界，包含此值，单位米。 */
  min: number;
  /** 区间上界，不包含此值，单位米；支持 Infinity 表示无上限。 */
  max: number;
  /** 此层级对应的已有表现对象，由调用方持有并最终销毁。 */
  view: LodView;
}

export interface LodTargetOptions {
  /** 业务目标的唯一标识；同一目标的多个表现共用此标识。 */
  id: string;
  metric: LodMetric;
  /** 世界坐标，注册时复制；后续通过 setPosition() 更新，与 getPosition 二选一。 */
  position?: Cartesian3;
  /** 距离模式每轮读取；允许返回同一个持续原地更新的 Cartesian3。 */
  getPosition?: () => Cartesian3;
  /** 当前区间向两侧扩展的滞回距离，单位米；应远小于层级和间隙宽度。 */
  hysteresis?: number;
  /** 按 min 升序排列且不能重叠；未被区间覆盖的范围表示全部隐藏。 */
  levels: readonly LodLevel[];
}

/**
 * 内部判定区间：除了用户配置的可见层级，还包含自动补齐的隐藏区间。
 * 因此 regions 的数组下标不是 levels 的层级下标，必须通过 level 转换。
 * 普通边界用于首次选择；retain 边界仅用于保留当前状态，实现双向滞回。
 */
interface Region {
  /** 对应用户 levels 的下标；-1 表示此区间内所有表现都隐藏。 */
  level: number;
  min: number;
  max: number;
  minSquared: number;
  maxSquared: number;
  retainMin: number;
  retainMax: number;
  retainMinSquared: number;
  retainMaxSquared: number;
}

interface TargetRecord {
  metric: LodMetric;
  /** 独立的坐标数值快照，避免业务原地修改位置后无法检测变化。 */
  position: Cartesian3;
  hasPosition: boolean;
  getPosition: (() => Cartesian3) | undefined;
  views: LodView[];
  regions: Region[];
  enabled: boolean;
  /** 注册、配置变化或距离模式下的位置变化，要求下一轮重新选择区间。 */
  dirty: boolean;
  /** 内部 regions 的下标；-1 表示尚未选择，或需要重置滞回状态。 */
  region: number;
  /** 当前实际显示的 levels 下标；-1 表示没有表现可见。 */
  level: number;
}

// 距离不可能为负。先把负边界映射到零，再平方，避免负数平方打乱区间顺序。
// 高度判断仍保留原始有符号边界，因此同一组规则也能表示负的相机高度。
function squaredBound(value: number): number {
  return value <= 0 ? 0 : value * value;
}

/** 注册时预计算边界及其平方，逐帧判断时无需重复平方阈值或计算距离开方。 */
function makeRegion(
  level: number,
  min: number,
  max: number,
  hysteresis: number,
): Region {
  const retainMin = min - hysteresis;
  const retainMax = max + hysteresis;
  return {
    level,
    min,
    max,
    minSquared: squaredBound(min),
    maxSquared: squaredBound(max),
    retainMin,
    retainMax,
    retainMinSquared: squaredBound(retainMin),
    retainMaxSquared: squaredBound(retainMax),
  };
}

function validateMetric(metric: LodMetric): void {
  if (metric !== "distance" && metric !== "cameraHeight") {
    throw new Error(`Unknown LOD metric: ${String(metric)}`);
  }
}

function validatePosition(position: Cartesian3): void {
  if (
    !Number.isFinite(position.x) ||
    !Number.isFinite(position.y) ||
    !Number.isFinite(position.z)
  ) {
    throw new Error("LOD position must contain finite world coordinates.");
  }
}

/** 校验配置并补齐隐藏范围，使隐藏状态也能拥有自己的滞回边界。 */
function createRegions(
  levels: readonly LodLevel[],
  hysteresis: number,
): Region[] {
  if (levels.length === 0) {
    throw new Error("LOD requires at least one level.");
  }
  if (!Number.isFinite(hysteresis) || hysteresis < 0) {
    throw new Error("LOD hysteresis must be finite and nonnegative.");
  }
  const regions: Region[] = [];
  let previousMax = -Infinity;
  for (let index = 0; index < levels.length; index++) {
    const level = levels[index]!;
    if (
      !Number.isFinite(level.min) ||
      !(Number.isFinite(level.max) || level.max === Infinity) ||
      level.min >= level.max ||
      level.min < previousMax
    ) {
      throw new Error(
        "LOD ranges must be valid, ordered, and non-overlapping.",
      );
    }
    if (typeof level.view?.setVisible !== "function") {
      throw new Error("Each LOD level requires a setVisible adapter.");
    }
    // 首层之前、相邻层级之间没有被覆盖的范围，都显式记为隐藏区间。
    if (level.min > previousMax) {
      regions.push(makeRegion(-1, previousMax, level.min, hysteresis));
    }
    regions.push(makeRegion(index, level.min, level.max, hysteresis));
    previousMax = level.max;
  }
  // 最远层级有上限时，超过上限后隐藏；保留此区间可避免边界附近反复重现。
  if (previousMax < Infinity) {
    regions.push(makeRegion(-1, previousMax, Infinity, hysteresis));
  }
  return regions;
}

/** value 在距离模式下是平方米，在高度模式下是米。返回内部 region 下标。 */
function chooseRegion(target: TargetRecord, value: number): number {
  const distance = target.metric === "distance";
  const current = target.regions[target.region];
  if (current) {
    // 只扩展当前区间，而不同时扩展所有候选区间，因此始终只保留一个状态。
    // 例如 [0, 100) 配 10 米滞回：达到 110 米退出，返回时需越过 90 米。
    const min = distance ? current.retainMinSquared : current.retainMin;
    const max = distance ? current.retainMaxSquared : current.retainMax;
    if (value >= min && value < max) return target.region;
  }

  // 超出保留区间后，按实际新值直接查找；目标远跳时可一次跨过多层和隐藏间隙。
  // 初次选择或切换判断模式时没有 current，直接按原始半开区间选择。
  for (let index = 0; index < target.regions.length; index++) {
    const region = target.regions[index]!;
    const min = distance ? region.minSquared : region.min;
    const max = distance ? region.maxSquared : region.max;
    if (value >= min && value < max) return index;
  }
  return -1;
}

/** 仅在层级变化时写显隐，先隐藏旧表现，再显示新表现。 */
function applyLevel(target: TargetRecord, level: number): boolean {
  if (target.level === level) return false;
  if (target.level !== -1) target.views[target.level]!.setVisible(false);
  if (level !== -1) target.views[level]!.setVisible(true);
  target.level = level;
  return true;
}

/**
 * 已有渲染对象的 LOD 显隐调度器，不依赖 Entity，也不持有 Scene。
 *
 * 使用顺序：每个目标 add() 一次；业务更新插值位置后调用 setPosition()，
 * 或由 getPosition 提供最新位置；每帧统一 update()，在场景绘制前完成选择。
 * 管理器只决定显隐，模型矩阵、billboard 位置等仍由业务同步。
 *
 * 每个表现只能属于一个目标，显隐由本管理器统一控制，避免外部竞争修改 show。
 * 所有表现均为借用资源：remove()/destroy() 只隐藏，不销毁渲染对象或 GPU 资源。
 */
export class LodManager {
  private readonly targets = new Map<string, TargetRecord>();
  private readonly lastCameraPosition = new Cartesian3();
  private lastCameraHeight = NaN;
  private hasCameraSample = false;
  private destroyed = false;

  /** 已注册目标数量，包含当前被禁用或超距隐藏的目标。 */
  get size(): number {
    return this.targets.size;
  }

  /**
   * 注册一个业务目标及其已有表现，每个目标只调用一次。
   * 注册时先隐藏所有表现，首次 update() 再按规则显示，防止同时出现多种表现。
   * 距离模式必须提供 position 或 getPosition；高度模式可以暂时不提供位置。
   */
  add(options: LodTargetOptions): void {
    this.assertAlive();
    if (!options.id || this.targets.has(options.id)) {
      throw new Error("LOD target id must be nonempty and unique.");
    }
    validateMetric(options.metric);
    if (options.position && options.getPosition) {
      throw new Error("Use either position or getPosition for an LOD target.");
    }
    const position = options.position;
    if (position) validatePosition(position);
    if (options.metric === "distance" && !position && !options.getPosition) {
      throw new Error("Distance LOD requires position or getPosition.");
    }
    const regions = createRegions(options.levels, options.hysteresis ?? 0);
    const views = options.levels.map((level) => level.view);
    for (const view of views) view.setVisible(false);
    this.targets.set(options.id, {
      metric: options.metric,
      position: position ? Cartesian3.clone(position) : new Cartesian3(),
      hasPosition: position !== undefined,
      getPosition: options.getPosition,
      views,
      regions,
      enabled: true,
      dirty: true,
      region: -1,
      level: -1,
    });
  }

  /**
   * 更新目标的世界坐标快照，复用内部 Cartesian3，不重新创建表现对象。
   * 这里只更新缓存并标记待计算，下一次 update() 才统一判断，不立即修改显隐。
   * 使用 getPosition 注册时应更新其数据来源，不能混用此方法。
   */
  setPosition(id: string, position: Cartesian3): void {
    const target = this.getTarget(id);
    if (target.getPosition) {
      throw new Error("Update the getPosition source instead of setPosition.");
    }
    validatePosition(position);
    if (!target.hasPosition || !Cartesian3.equals(target.position, position)) {
      Cartesian3.clone(position, target.position);
      target.hasPosition = true;
      // 高度模式也保存最新坐标，以便随后切回距离模式；仅目标移动时无需重算高度。
      if (target.metric === "distance") target.dirty = true;
    }
  }

  /**
   * 切换距离/高度判断，下一次 update() 生效。
   * 清除旧模式的滞回状态，避免用旧指标的区间状态限制新指标的首次选择。
   */
  setMetric(id: string, metric: LodMetric): void {
    const target = this.getTarget(id);
    validateMetric(metric);
    if (metric === "distance" && !target.hasPosition && !target.getPosition) {
      throw new Error("Distance LOD requires position or getPosition.");
    }
    if (target.metric !== metric) {
      target.metric = metric;
      target.region = -1;
      target.dirty = true;
    }
  }

  /** 设置业务总开关；禁用后在下一次 update() 隐藏，恢复时重新按当前值选择。 */
  setEnabled(id: string, enabled: boolean): void {
    const target = this.getTarget(id);
    if (target.enabled !== enabled) {
      target.enabled = enabled;
      target.region = -1;
      target.dirty = true;
    }
  }

  /** 返回当前可见表现对应的 levels 数组下标；全部隐藏时返回 -1。 */
  getLevel(id: string): number {
    return this.getTarget(id).level;
  }

  /**
   * 每帧统一调度；应在目标运动/插值更新之后、实际场景绘制之前调用。
   * @param cameraPosition 相机世界坐标，通常为 camera.positionWC。
   * @param cameraHeight 相机高度，单位米；传 positionCartographic.height
   *   时表示椭球高度，不是离地形高度。由调用方每帧读取一次并共享给所有目标。
   * @returns 本轮是否有表现显隐变化，可用于触发 requestRender()。
   */
  update(cameraPosition: Cartesian3, cameraHeight: number): boolean {
    this.assertAlive();
    validatePosition(cameraPosition);
    if (!Number.isFinite(cameraHeight)) {
      throw new Error("LOD camera height must be finite.");
    }
    // 与独立快照按坐标值比较：Cesium 相机对象本身可以保持同一引用并原地更新。
    const cameraMoved =
      !this.hasCameraSample ||
      !Cartesian3.equals(cameraPosition, this.lastCameraPosition);
    const heightChanged = cameraHeight !== this.lastCameraHeight;
    let changed = false;

    for (const target of this.targets.values()) {
      if (!target.enabled) {
        changed = applyLevel(target, -1) || changed;
        target.dirty = false;
        continue;
      }

      // 先读取移动目标，再决定是否跳过；否则相机静止时会漏掉目标主动靠近/远离。
      if (target.metric === "distance" && target.getPosition) {
        const position = target.getPosition();
        validatePosition(position);
        if (
          !target.hasPosition ||
          !Cartesian3.equals(position, target.position)
        ) {
          Cartesian3.clone(position, target.position);
          target.hasPosition = true;
          target.dirty = true;
        }
      }

      // 相机位置只影响距离模式，高度只影响高度模式；没有相关变化则复用上次结果。
      const cameraChanged =
        target.metric === "distance" ? cameraMoved : heightChanged;
      if (!target.dirty && !cameraChanged) continue;
      // 比较距离平方，避免几百个目标每帧逐个开方；预计算的阈值也使用平方单位。
      const value =
        target.metric === "distance"
          ? Cartesian3.distanceSquared(cameraPosition, target.position)
          : cameraHeight;
      target.region = chooseRegion(target, value);
      const level = target.regions[target.region]?.level ?? -1;
      changed = applyLevel(target, level) || changed;
      target.dirty = false;
    }

    Cartesian3.clone(cameraPosition, this.lastCameraPosition);
    this.lastCameraHeight = cameraHeight;
    this.hasCameraSample = true;
    return changed;
  }

  /**
   * 注销目标并立即隐藏当前表现。不存在时返回 false；存在并移除时返回 true。
   * 不从 Scene 移除对象，也不销毁资源，调用方可自行复用或回收。
   */
  remove(id: string): boolean {
    this.assertAlive();
    const target = this.targets.get(id);
    if (!target) return false;
    applyLevel(target, -1);
    return this.targets.delete(id);
  }

  /**
   * 隐藏所有当前表现并清空管理记录，可重复调用。
   * 调用方应先销毁管理器，再释放借用的模型、图标、Primitive 等资源。
   * 销毁后不能继续注册或更新；本方法不销毁这些渲染对象。
   */
  destroy(): void {
    if (this.destroyed) return;
    for (const target of this.targets.values()) applyLevel(target, -1);
    this.targets.clear();
    this.destroyed = true;
  }

  private getTarget(id: string): TargetRecord {
    this.assertAlive();
    const target = this.targets.get(id);
    if (!target) throw new Error(`Unknown LOD target: ${id}`);
    return target;
  }

  private assertAlive(): void {
    if (this.destroyed) throw new Error("LodManager has been destroyed.");
  }
}
