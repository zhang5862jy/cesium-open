export interface CalloutAvoidanceOptions {
  enabled: boolean;
  /** Minimum spacing between panel rectangles, in CSS pixels. */
  gap: number;
  /** Maximum expanded local repair candidates per panel (heap estimates are separate). */
  maxCandidates: number;
  /** Maximum separation-projection sweeps; work is also capped for dense scenes. */
  maxIterations: number;
  /** Maximum automatic displacement from the configured position, in CSS pixels. Infinity disables it. */
  maxDisplacement: number;
  /** Preference for the configured position after collision constraints are satisfied. */
  distanceWeight: number;
}

export const DEFAULT_CALLOUT_AVOIDANCE: Readonly<CalloutAvoidanceOptions> = Object.freeze({
  enabled: false, gap: 6, maxCandidates: 96, maxIterations: 32, maxDisplacement: 160, distanceWeight: .25,
});

export interface CalloutAvoidanceStats {
  /** Visible panels participating in a remaining overlap (including the spacing gap). */
  unresolved: number;
  moved: number;
  /** Expanded local candidates / density samples; excludes broad-phase and heap estimates. */
  candidateChecks: number;
}

export function normalizeAvoidance(
  value: boolean | Partial<CalloutAvoidanceOptions>,
  previous = DEFAULT_CALLOUT_AVOIDANCE,
): CalloutAvoidanceOptions {
  const next = { ...previous, ...(typeof value === "boolean" ? { enabled: value } : value) };
  if (typeof next.enabled !== "boolean") throw new TypeError("避让 enabled 必须是布尔值");
  if (!Number.isFinite(next.gap) || next.gap < 0 || next.gap > 200) throw new RangeError("避让间距须为 0–200px");
  if (!Number.isInteger(next.maxCandidates) || next.maxCandidates < 8 || next.maxCandidates > 512) {
    throw new RangeError("避让搜索次数须为 8–512 的整数");
  }
  if (!Number.isInteger(next.maxIterations) || next.maxIterations < 1 || next.maxIterations > 128) {
    throw new RangeError("避让迭代次数须为 1–128 的整数");
  }
  if (next.maxDisplacement !== Infinity && (!Number.isFinite(next.maxDisplacement) || next.maxDisplacement < 0)) {
    throw new RangeError("自动避让半径须为非负数或 Infinity");
  }
  if (!Number.isFinite(next.distanceWeight) || next.distanceWeight < 0 || next.distanceWeight > 10) {
    throw new RangeError("避让距离权重须为 0–10");
  }
  return next;
}

export interface AvoidanceItem {
  index: number;
  visible: boolean;
  preferredLeft: number;
  preferredTop: number;
  anchorX: number;
  anchorY: number;
  width: number;
  height: number;
  maxDistance: number;
  dragging: boolean;
  priority: number;
  /** Output: top-left corner in canvas CSS pixels. */
  left: number;
  top: number;
}

interface Placement {
  input: number[];
  left: number;
  top: number;
  conflicted: boolean;
  settled: boolean;
}
interface Body {
  item: AvoidanceItem;
  x: number;
  y: number;
  startX: number;
  startY: number;
  homeX: number;
  homeY: number;
  mobility: number;
  dragDepth: number;
  cells: number[];
  constrained: boolean;
  /** Only collision repairs that start fully onscreen must remain onscreen. */
  keepInViewport: boolean;
  /** Pointer-owned until the first layout after release has completed. */
  fixed: boolean;
}
interface Score { drag: number; overlap: number; movement: number; changed: number }
const CELL_SIZE = 128;
const EPSILON = .01;
const SEPARATION_SLOP = .05;
const REFLOW_THRESHOLD = 1; // CSS pixels, accumulated relative to the last solve.

/**
 * Warm-started rectangle separation via projected Gauss-Seidel relaxation.
 * Like VPSC/adjustText, solves interacting rectangles with minimum-displacement
 * corrections. Existing placements reserve their space and local repairs try
 * to move one conflicting rectangle before propagating a correction. This is
 * a bounded 2D heuristic, NOT a VPSC quadratic solver or a minimum-cardinality
 * optimizer. Active drags defer layout; the released rectangle is protected.
 */
export class CalloutAvoidanceLayout {
  private previous = new Map<number, Placement>();
  private cells = new Map<number, Set<Body>>();
  private stamps = new Map<Body, number>();
  private queryId = 0;
  private bodies: Body[] = [];
  private dragged: Body[] = [];
  private viewportWidth = 0;
  private viewportHeight = 0;
  private configuration = "";
  private stats: CalloutAvoidanceStats = { unresolved: 0, moved: 0, candidateChecks: 0 };
  private gap = 0;
  private maxDisplacement = 160;
  private distanceWeight = .25;
  private settledInputs = new Map<number, number[]>();
  private deferred = false;

  clear(): void {
    this.previous.clear();
    this.cells.clear();
    this.bodies.length = 0;
    this.dragged.length = 0;
    this.stamps.clear();
    this.settledInputs.clear();
    this.deferred = false;
  }

  /** defer also freezes this group while a different display group is dragged. */
  layout(items: readonly AvoidanceItem[], width: number, height: number, options: CalloutAvoidanceOptions, defer = false): CalloutAvoidanceStats {
    const deferred = defer || items.some(item => item.dragging);
    const released = this.deferred && !deferred;
    const configuration = `${options.gap}/${options.maxCandidates}/${options.maxIterations}/${options.maxDisplacement}/${options.distanceWeight}`;
    let unchanged = !released && this.deferred === deferred
      && this.viewportWidth === width && this.viewportHeight === height && this.configuration === configuration
      && this.previous.size === items.length;
    const inputs = items.map(item => [
      +item.visible, item.preferredLeft, item.preferredTop, item.anchorX, item.anchorY,
      item.width, item.height, item.maxDistance, +item.dragging, item.priority,
    ]);
    this.deferred = deferred;
    if (deferred) {
      // The pointer owns its panel and all other automatic offsets are frozen.
      // Do not project constraints or run collision/density queries during drag:
      // even a viewport/configuration change is applied only after release.
      const previous = new Map<number, Placement>();
      let moved = 0;
      items.forEach((item, index) => {
        const old = this.previous.get(item.index);
        const warm = old && !item.dragging && old.input[9] === item.priority;
        item.left = warm ? old.left + (item.preferredLeft - old.input[1]!) : item.preferredLeft;
        item.top = warm ? old.top + (item.preferredTop - old.input[2]!) : item.preferredTop;
        if (Math.abs(item.left - item.preferredLeft) > EPSILON || Math.abs(item.top - item.preferredTop) > EPSILON) moved++;
        previous.set(item.index, { input: inputs[index]!, left: item.left, top: item.top,
          conflicted: old?.conflicted ?? false, settled: old?.settled ?? false });
      });
      this.previous = previous;
      this.settledInputs.clear();
      return { unresolved: this.stats.unresolved, moved, candidateChecks: 0 };
    }
    for (let i = 0; i < items.length && unchanged; i++) {
      const old = this.previous.get(items[i]!.index);
      unchanged = !!old && inputs[i]!.every((value, index) => value === old.input[index]);
    }
    if (unchanged) {
      for (const item of items) {
        const old = this.previous.get(item.index)!;
        item.left = old.left; item.top = old.top;
      }
      return { ...this.stats, candidateChecks: 0 };
    }
    const sameConfiguration = this.viewportWidth === width && this.viewportHeight === height && this.configuration === configuration;
    const removed = items.length < this.previous.size
      || items.some(item => !item.visible && this.previous.get(item.index)?.input[0]);
    this.viewportWidth = width; this.viewportHeight = height; this.configuration = configuration;
    this.gap = options.gap;
    this.maxDisplacement = options.maxDisplacement;
    this.distanceWeight = options.distanceWeight;
    this.cells.clear(); this.stamps.clear(); this.bodies.length = 0; this.dragged.length = 0;
    const stats: CalloutAvoidanceStats = { unresolved: 0, moved: 0, candidateChecks: 0 };
    const fresh = new Set<Body>();
    for (const item of items) {
      const old = this.previous.get(item.index);
      const fixed = !!old?.input[8];
      // Follow anchor/camera motion without discarding the previous relative layout.
      const warm = old && (old.settled || fixed) && !item.dragging && (fixed || old.input[9] === item.priority);
      const x = warm ? old.left + (item.preferredLeft - old.input[1]!) : item.preferredLeft;
      const y = warm ? old.top + (item.preferredTop - old.input[2]!) : item.preferredTop;
      // Culling does not reset a placement. Returning to the viewport restores
      // the same relative offset instead of restarting avoidance from home.
      item.left = x; item.top = y;
      if (!item.visible) continue;
      const body: Body = {
        item, x, y, startX: x, startY: y, homeX: item.preferredLeft, homeY: item.preferredTop,
        cells: [], constrained: false, keepInViewport: false, fixed, dragDepth: fixed ? 0 : Infinity,
        mobility: fixed ? 0 : item.priority > 1 ? .05 : item.priority ? .25 : 1,
      };
      // The handle normally supplies an already distance-limited preference.
      // Keep the home feasible even when dimensions or a distance limit change.
      const dx = body.homeX + item.width / 2 - item.anchorX, dy = body.homeY + item.height / 2 - item.anchorY;
      const distance = Math.hypot(dx, dy);
      if (distance > item.maxDistance) {
        body.homeX = item.anchorX - item.width / 2 + dx / distance * item.maxDistance;
        body.homeY = item.anchorY - item.height / 2 + dy / distance * item.maxDistance;
      }
      if (!warm) {
        fresh.add(body);
        if (!item.dragging) { body.x = body.homeX; body.y = body.homeY; }
      }
      this.constrain(body);
      body.constrained = Math.hypot(body.x - x, body.y - y) > 1e-6;
      body.startX = body.x; body.startY = body.y;
      // The viewport is not a placement constraint. Protect an onscreen panel
      // only from being pushed out by this solve; camera motion may take it out.
      body.keepInViewport = body.x >= 0 && body.y >= 0
        && body.x + item.width <= width && body.y + item.height <= height;
      this.bodies.push(body);
      if (fixed) this.dragged.push(body);
    }
    this.bodies.sort((a, b) => Number(b.item.dragging) - Number(a.item.dragging)
      || b.item.priority - a.item.priority || a.item.index - b.item.index);
    // As in variable-anchor map labels, keep the previous placement before
    // attempting alternatives. A tiny camera change must not restart packing.
    // The baseline is the LAST SOLVE, not the previous frame: slow motion still
    // eventually triggers a solve. Pointer-owned rectangles bypass this gate.
    if (!released && sameConfiguration && !removed && !fresh.size && !this.dragged.length && this.canReusePlacement(items, inputs)) {
      for (const body of this.bodies) this.insert(body);
      const newCollision = this.bodies.some(body => !this.previous.get(body.item.index)?.conflicted
        && this.query(body.x, body.y, body.item.width, body.item.height).some(other =>
          other !== body && this.overlap(body, other, 0) > 0));
      if (!newCollision) return this.finish(items, inputs, stats);
      this.cells.clear();
      for (const body of this.bodies) body.cells.length = 0;
    }
    this.settledInputs.clear();
    items.forEach((item, index) => this.settledInputs.set(item.index, inputs[index]!));
    const area = this.bodies.reduce((sum, b) => sum + (b.item.width + this.gap) * (b.item.height + this.gap), 0);
    const dense = area > width * height;
    if (this.bodies.length > 64 && dense) {
      for (const body of this.bodies) this.insert(body);
      const remaining = new Map(this.bodies.map(body => [body, options.maxCandidates]));
      // A saturated region must not suppress exact repairs in another region.
      // Reserve feasible local placements before using the coarse density field,
      // then clean up its residual sparse contacts with exact rectangle tests.
      stats.candidateChecks += this.repairSparse(remaining);
      stats.candidateChecks += this.layoutSaturated(remaining, fresh);
      stats.candidateChecks += this.repairSparse(remaining);
      return this.finish(items, inputs, stats);
    }
    const candidates = dense ? Math.min(options.maxCandidates, Math.max(8, Math.floor(4096 / Math.max(1, this.bodies.length))))
      : options.maxCandidates;
    const remaining = new Map(this.bodies.map(body => [body, candidates]));
    const repair = (body: Body, budget: number, spread = false) => {
      const checks = this.repair(body, Math.min(remaining.get(body) ?? 0, budget), spread);
      remaining.set(body, (remaining.get(body) ?? 0) - checks);
      stats.candidateChecks += checks;
    };
    // Existing positions reserve space first. New labels are seeded close to their
    // targets; failed seeds ALSO reserve space and participate in every later pass.
    for (const body of this.bodies) if (!fresh.has(body) || body.fixed) this.insert(body);
    // A feasible established position stays reserved even when an obstruction
    // disappears. Returning home would move an additional, already-clear panel.
    for (const body of this.bodies) if (fresh.has(body) && !body.fixed) {
      repair(body, Math.ceil(candidates / 2));
      this.insert(body);
    }
    // Resolve contacts with the drop first, in stable order. Otherwise a local
    // search can send two neighbors to the same side of the fixed panel and
    // trap a feasible corridor in an avoidable overlapping configuration.
    for (const body of this.bodies) if (!body.fixed && this.dragged.some(d => this.overlap(body, d))) {
      this.remove(body);
      this.protectDrag(body);
      this.insert(body);
    }
    // Reserve all established panels first, then attempt a unilateral repair.
    // Lower-priority panels yield first; among peers try the panel responsible
    // for most contacts so one move can clear several stationary neighbors.
    const repairs = this.bodies.filter(body => !body.fixed).map(body => ({ body,
      contacts: this.query(body.x, body.y, body.item.width, body.item.height)
        .filter(other => other !== body && this.overlap(body, other)).length,
    })).filter(entry => entry.contacts > 0).sort((a, b) => a.body.item.priority - b.body.item.priority
      || b.contacts - a.contacts || b.body.item.index - a.body.item.index);
    for (const { body } of repairs) {
      if (fresh.has(body) || !this.localScore(body).overlap) continue;
      this.remove(body);
      repair(body, Math.ceil(candidates / 2));
      this.insert(body);
    }
    let best = this.measure();
    let positions = this.bodies.map(b => [b.x, b.y]);
    const iterations = Math.min(options.maxIterations, Math.max(2, Math.floor(8192 / Math.max(1, this.bodies.length))));
    let work = 0;
    const pairBudget = Math.max(16384, this.bodies.length * 32);
    for (let iteration = 0; iteration < iterations && best.overlap > 0 && work < pairBudget; iteration++) {
      let corrections = 0;
      this.propagateDragPriority();
      // Alternate sweep direction to avoid persistent bias from array order.
      const order = iteration % 2 ? [...this.bodies].reverse() : this.bodies;
      for (const a of order) {
        for (const b of this.query(a.x, a.y, a.item.width, a.item.height)) {
          if (b.item.index <= a.item.index || !this.overlap(a, b)) continue;
          if (++work > pairBudget) break;
          if (this.separate(a, b)) corrections++;
        }
        if (work > pairBudget) break;
      }
      const score = this.measure();
      if (this.better(score, best)) {
        best = score; positions = this.bodies.map(b => [b.x, b.y]);
      }
      if (!corrections || score.overlap === 0) break;
    }
    // Infeasible clusters can oscillate. Never return a worse iterate.
    this.cells.clear();
    this.bodies.forEach((b, i) => { [b.x, b.y] = positions[i]! as [number, number]; b.cells = []; this.insert(b); });
    // Local minimum / infeasibility repair. All neighbors remain in the index,
    // including unresolved panels. Only new labels may probe distant free space.
    for (const body of this.bodies) if (!body.fixed && this.localScore(body).overlap > 0) {
      this.remove(body);
      repair(body, candidates, fresh.has(body));
      this.insert(body);
    }
    // Enforce drag exclusion last: ordinary corrections must never push a neighbor
    // back onto the pointer-owned rectangle when a valid edge position exists.
    for (const body of this.bodies) if (!body.fixed && this.dragged.some(d => this.overlap(body, d))) {
      this.remove(body);
      this.protectDrag(body);
      this.insert(body);
    }
    return this.finish(items, inputs, stats);
  }

  private canReusePlacement(items: readonly AvoidanceItem[], inputs: number[][]): boolean {
    if (this.settledInputs.size !== items.length || this.bodies.some(body => body.constrained)) return false;
    const reference = this.bodies[0];
    if (!reference) return true;
    const origin = this.settledInputs.get(reference.item.index);
    if (!origin) return false;
    const dx = reference.item.preferredLeft - origin[1]!, dy = reference.item.preferredTop - origin[2]!;
    for (let n = 0; n < items.length; n++) {
      const item = items[n]!, current = inputs[n]!, settled = this.settledInputs.get(item.index);
      if (!settled || current[0] !== settled[0]) return false;
      if (!item.visible) continue;
      for (const k of [5, 6, 7, 8, 9]) if (current[k] !== settled[k]) return false;
      for (const k of [1, 2, 3, 4]) {
        if (Math.abs(current[k]! - settled[k]! - (k % 2 ? dx : dy)) > REFLOW_THRESHOLD) return false;
      }
    }
    return true;
  }

  private finish(items: readonly AvoidanceItem[], inputs: number[][], stats: CalloutAvoidanceStats): CalloutAvoidanceStats {
    // Count actual remaining conflicts, not failed searches. Stop at the first
    // witness for each body; no need to enumerate O(n²) pairs in saturated views.
    const conflicts = new Set<number>();
    for (const body of this.bodies) {
      let conflict = false, physical = false;
      this.visitCells(body.x - this.gap, body.y - this.gap, body.item.width + this.gap * 2, body.item.height + this.gap * 2, key => {
        if (physical) return;
        for (const other of this.cells.get(key) ?? []) if (other !== body && this.overlap(body, other)) {
          conflict = true;
          if (this.overlap(body, other, 0)) { physical = true; break; }
        }
      });
      if (conflict) stats.unresolved++;
      if (physical) conflicts.add(body.item.index);
    }
    for (const body of this.bodies) {
      const item = body.item;
      item.left = body.x; item.top = body.y;
      if (Math.abs(body.x - item.preferredLeft) > EPSILON || Math.abs(body.y - item.preferredTop) > EPSILON) stats.moved++;
    }
    this.previous.clear();
    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      this.previous.set(item.index, { input: inputs[i]!, left: item.left, top: item.top,
        conflicted: conflicts.has(item.index), settled: true });
    }
    this.stats = stats;
    return { ...stats };
  }

  /**
   * When requested area exceeds the viewport, use an occupancy energy field.
   * Every panel contributes (including unresolved ones); bounded local moves
   * reduce crowding without performing an infeasible quadratic pair solve.
   * Exact local passes surround this approximation; density is never the only
   * collision check for an independently repairable sparse neighborhood.
   */
  private layoutSaturated(remaining: Map<Body, number>, fresh: Set<Body>): number {
    const size = Math.max(64, Math.sqrt(this.viewportWidth * this.viewportHeight / 8192));
    const cols = Math.ceil(this.viewportWidth / size) + 2, rows = Math.ceil(this.viewportHeight / size) + 2;
    const density = new Float64Array(cols * rows);
    const stride = cols + 1, prefix = new Float64Array(stride * (rows + 1));
    const visit = (b: Body, action: (index: number, fraction: number) => void) => {
      const left = b.x - this.gap / 2, top = b.y - this.gap / 2;
      const right = b.x + b.item.width + this.gap / 2, bottom = b.y + b.item.height + this.gap / 2;
      for (let y = Math.max(-1, Math.floor(top / size)); y <= Math.min(rows - 2, Math.floor(bottom / size)); y++) {
        for (let x = Math.max(-1, Math.floor(left / size)); x <= Math.min(cols - 2, Math.floor(right / size)); x++) {
          const fraction = Math.max(0, Math.min(right, (x + 1) * size) - Math.max(left, x * size))
            * Math.max(0, Math.min(bottom, (y + 1) * size) - Math.max(top, y * size)) / (size * size);
          action((y + 1) * cols + x + 1, fraction);
        }
      }
    };
    const update = (b: Body, sign: number) => visit(b, (i, f) => { density[i]! += sign * f; });
    const rebuildPrefix = () => {
      for (let y = 0; y < rows; y++) {
        let row = 0;
        for (let x = 0; x < cols; x++) {
          row += Math.max(0, density[y * cols + x]!);
          prefix[(y + 1) * stride + x + 1] = prefix[y * stride + x + 1]! + row;
        }
      }
    };
    // Integral of the piecewise-constant density field. Bilinear prefix sampling
    // accounts for fractional cell coverage instead of favoring grid boundaries.
    const integral = (px: number, py: number) => {
      const x = Math.min(cols - .000001, Math.max(0, px / size + 1)), y = Math.min(rows - .000001, Math.max(0, py / size + 1));
      const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, p = iy * stride + ix;
      return prefix[p]! * (1 - fx) * (1 - fy) + prefix[p + 1]! * fx * (1 - fy)
        + prefix[p + stride]! * (1 - fx) * fy + prefix[p + stride + 1]! * fx * fy;
    };
    const score = (b: Body): Score => {
      const x = b.x - this.gap / 2, y = b.y - this.gap / 2, right = b.x + b.item.width + this.gap / 2, bottom = b.y + b.item.height + this.gap / 2;
      const overlap = Math.max(0, integral(right, bottom) - integral(x, bottom) - integral(right, y) + integral(x, y));
      return { drag: this.dragged.reduce((sum, d) => sum + this.overlap(b, d), 0), overlap,
        movement: this.displacementCost(b) / (size * size), changed: this.changed(b) };
    };
    for (const b of this.bodies) update(b, 1);
    let checks = 0;
    for (const b of [...this.bodies].reverse()) {
      const budget = Math.min(remaining.get(b) ?? 0, 32);
      if (!budget) continue;
      if (b.fixed) continue;
      if (!this.hasOverlap(b)) continue;
      this.remove(b);
      update(b, -1);
      rebuildPrefix();
      let best = score(b), bx = b.x, by = b.y;
      const points: [number, number][] = [];
      if (Number.isFinite(this.maxDisplacement)) {
        points.push([b.homeX, b.homeY]);
      }
      for (const d of this.dragged) {
        if (!fresh.has(b) && !this.overlap(b, d)) continue;
        const gap = this.gap + SEPARATION_SLOP;
        points.push([d.x - b.item.width - gap, by], [d.x + d.item.width + gap, by],
          [bx, d.y - b.item.height - gap], [bx, d.y + d.item.height + gap]);
      }
      const count = budget - points.length;
      const sampleCols = Math.max(2, Math.ceil(Math.sqrt(count * this.viewportWidth / this.viewportHeight)));
      const sampleRows = Math.max(2, Math.ceil(count / sampleCols));
      // Stratified phases avoid stacking every label on the same 32 sample
      // coordinates. The phase is deterministic and remains stable across frames.
      const phaseX = (b.item.index * .61803398875) % 1, phaseY = (b.item.index * .41421356237) % 1;
      for (let n = 0; n < count; n++) {
        let x = (n % sampleCols + phaseX) / sampleCols * Math.max(0, this.viewportWidth - b.item.width);
        let y = (Math.floor(n / sampleCols) + phaseY) / sampleRows * Math.max(0, this.viewportHeight - b.item.height);
        if (Number.isFinite(this.maxDisplacement)) {
          x = b.homeX + ((n % sampleCols + phaseX) / sampleCols * 2 - 1) * this.maxDisplacement;
          y = b.homeY + ((Math.floor(n / sampleCols) + phaseY) / sampleRows * 2 - 1) * this.maxDisplacement;
        }
        // Choose the final candidate now. Applying a per-frame distance cap
        // would make a fixed avoidance result creep towards its destination.
        points.push([x, y]);
      }
      const candidates = points.slice(0, budget);
      remaining.set(b, (remaining.get(b) ?? 0) - candidates.length);
      for (const [x, y] of candidates) {
        b.x = x; b.y = y; this.constrain(b); checks++;
        const candidate = score(b);
        if (this.betterDensity(candidate, best)) { best = candidate; bx = b.x; by = b.y; }
      }
      b.x = bx; b.y = by; update(b, 1); this.insert(b);
    }
    return checks;
  }

  /** Distance intervals, plus conditional containment for collision repairs. */
  private interval(b: Body, axis: "x" | "y"): [number, number] {
    const i = b.item, horizontal = axis === "x", half = (horizontal ? i.width : i.height) / 2;
    const anchor = horizontal ? i.anchorX : i.anchorY;
    const perpendicular = horizontal ? b.y + i.height / 2 - i.anchorY : b.x + i.width / 2 - i.anchorX;
    const radius = Number.isFinite(i.maxDistance) ? Math.sqrt(Math.max(0, i.maxDistance ** 2 - perpendicular ** 2)) : Infinity;
    const localPerpendicular = horizontal ? b.y - b.homeY : b.x - b.homeX;
    const localRadius = Number.isFinite(this.maxDisplacement)
      ? Math.sqrt(Math.max(0, this.maxDisplacement ** 2 - localPerpendicular ** 2)) : Infinity;
    const home = horizontal ? b.homeX : b.homeY;
    const low = Math.max(anchor - radius - half, home - localRadius);
    const high = Math.min(anchor + radius - half, home + localRadius);
    if (low > high) return [b[axis], b[axis]];
    if (!b.keepInViewport) return [low, high];
    const min = Math.max(0, low), max = Math.min(Math.max(0, (horizontal ? this.viewportWidth : this.viewportHeight) - 2 * half), high);
    return min <= max ? [min, max] : [b[axis], b[axis]];
  }

  private constrain(b: Body): void {
    if (b.fixed) return;
    const x = b.x, y = b.y, i = b.item;
    const right = Math.max(0, this.viewportWidth - i.width), bottom = Math.max(0, this.viewportHeight - i.height);
    const disks = [
      { x: i.anchorX - i.width / 2, y: i.anchorY - i.height / 2, r: i.maxDistance },
      { x: b.homeX, y: b.homeY, r: this.maxDisplacement },
    ].filter(d => Number.isFinite(d.r));
    // Exact Euclidean projection onto a rectangle intersected with up to two
    // disks. The nearest point is interior, on one boundary, or at a boundary
    // intersection. Enumerating these features is bounded and idempotent;
    // sequential clamping is neither when the constraints compete.
    const project = (viewport: boolean): [number, number] | undefined => {
      const valid = (px: number, py: number) => (!viewport || (px >= -1e-7 && py >= -1e-7 && px <= right + 1e-7 && py <= bottom + 1e-7))
        && disks.every(d => Math.hypot(px - d.x, py - d.y) <= d.r + 1e-7);
      if (valid(x, y)) return viewport ? [Math.max(0, Math.min(right, x)), Math.max(0, Math.min(bottom, y))] : [x, y];
      let best: [number, number] | undefined, cost = Infinity;
      const consider = (px: number, py: number) => {
        if (viewport) { px = Math.max(0, Math.min(right, px)); py = Math.max(0, Math.min(bottom, py)); }
        if (!valid(px, py)) return;
        const next = (px - x) ** 2 + (py - y) ** 2;
        if (next < cost) { cost = next; best = [px, py]; }
      };
      if (viewport) {
        consider(Math.max(0, Math.min(right, x)), Math.max(0, Math.min(bottom, y)));
        for (const px of [0, right]) for (const py of [0, bottom]) consider(px, py);
      }
      for (const d of disks) {
        const dx = x - d.x, dy = y - d.y, length = Math.hypot(dx, dy);
        consider(d.x, d.y);
        if (length) consider(d.x + dx / length * d.r, d.y + dy / length * d.r);
        if (viewport) {
          for (const px of [0, right]) {
            const h2 = d.r ** 2 - (px - d.x) ** 2;
            if (h2 >= 0) { const h = Math.sqrt(h2); consider(px, d.y - h); consider(px, d.y + h); }
          }
          for (const py of [0, bottom]) {
            const w2 = d.r ** 2 - (py - d.y) ** 2;
            if (w2 >= 0) { const w = Math.sqrt(w2); consider(d.x - w, py); consider(d.x + w, py); }
          }
        }
      }
      if (disks.length === 2) {
        const a = disks[0]!, c = disks[1]!;
        const dx = c.x - a.x, dy = c.y - a.y, length = Math.hypot(dx, dy);
        if (length > 0 && length <= a.r + c.r && length >= Math.abs(a.r - c.r)) {
          const along = (a.r ** 2 - c.r ** 2 + length ** 2) / (2 * length);
          const height = Math.sqrt(Math.max(0, a.r ** 2 - along ** 2));
          const px = a.x + dx / length * along, py = a.y + dy / length * along;
          consider(px - dy / length * height, py + dx / length * height);
          consider(px + dy / length * height, py - dx / length * height);
        }
      }
      return best;
    };
    // Onscreen starting placements are feasible fallbacks: unresolved overlap
    // is preferable to pushing them outside. Other panels have no screen fence.
    [b.x, b.y] = b.keepInViewport
      ? project(true) ?? [b.startX, b.startY]
      : project(false) ?? [b.homeX, b.homeY];
  }

  private overlap(a: Body, b: Body, gap = this.gap): number {
    const w = Math.min(a.x + a.item.width + gap, b.x + b.item.width + gap) - Math.max(a.x, b.x);
    const h = Math.min(a.y + a.item.height + gap, b.y + b.item.height + gap) - Math.max(a.y, b.y);
    return w > EPSILON && h > EPSILON ? w * h : 0;
  }

  private hasOverlap(body: Body): boolean {
    let found = false;
    this.visitCells(body.x - this.gap, body.y - this.gap,
      body.item.width + this.gap * 2, body.item.height + this.gap * 2, key => {
        if (found) return;
        for (const other of this.cells.get(key) ?? []) if (other !== body && this.overlap(body, other)) {
          found = true;
          break;
        }
      });
    return found;
  }

  /** Propagate the released panel's precedence through touching neighbors. */
  private propagateDragPriority(): void {
    for (const b of this.bodies) b.dragDepth = b.fixed ? 0 : Infinity;
    const queue = [...this.dragged];
    for (let n = 0; n < queue.length; n++) {
      const a = queue[n]!;
      for (const b of this.query(a.x - .5, a.y - .5, a.item.width + 1, a.item.height + 1)) {
        if (b.dragDepth <= a.dragDepth + 1) continue;
        const nearX = a.x < b.x + b.item.width + this.gap + .5 && b.x < a.x + a.item.width + this.gap + .5;
        const nearY = a.y < b.y + b.item.height + this.gap + .5 && b.y < a.y + a.item.height + this.gap + .5;
        if (nearX && nearY) { b.dragDepth = a.dragDepth + 1; queue.push(b); }
      }
    }
  }

  private separate(a: Body, b: Body): boolean {
    if (!a.mobility && !b.mobility) return false;
    let bestCost = Infinity, bestCount = Infinity, bestDepth = Infinity, bestAxis: "x" | "y" = "x", bestA = 0, bestB = 0;
    for (const axis of ["x", "y"] as const) {
      const sizeA = axis === "x" ? a.item.width : a.item.height, sizeB = axis === "x" ? b.item.width : b.item.height;
      const [amin, amax] = this.interval(a, axis), [bmin, bmax] = this.interval(b, axis);
      for (const sign of [-1, 1]) {
        const distance = sign === -1 ? a[axis] + sizeA + this.gap - b[axis] : b[axis] + sizeB + this.gap - a[axis];
        const needed = distance + SEPARATION_SLOP;
        const capacityA = a.mobility ? Math.max(0, sign === -1 ? a[axis] - amin : amax - a[axis]) : 0;
        const capacityB = b.mobility ? Math.max(0, sign === -1 ? bmax - b[axis] : b[axis] - bmin) : 0;
        if (capacityA + capacityB < needed) continue;
        // Exhaust one panel's available capacity before moving its neighbor.
        // Consider both choices; unlike a weighted half/half relaxation this
        // minimizes changed rectangles for the pair, then displacement cost.
        const ma = a.dragDepth < b.dragDepth ? 0 : a.mobility;
        const mb = b.dragDepth < a.dragDepth ? 0 : b.mobility;
        for (const initialA of [needed, 0, needed * ma / (ma + mb)]) {
          let da = Math.min(capacityA, initialA);
          const db = Math.min(capacityB, needed - da);
          da = Math.min(capacityA, needed - db);
          const homeA = axis === "x" ? a.homeX : a.homeY, homeB = axis === "x" ? b.homeX : b.homeY;
          const count = Number(this.changed(a) || da > EPSILON) + Number(this.changed(b) || db > EPSILON);
          // Contact depth wins ties so a release pushes outward through chains.
          const depthPenalty = Number((a.dragDepth < b.dragDepth && da > EPSILON)
            || (b.dragDepth < a.dragDepth && db > EPSILON));
          const cost = da * da / (a.mobility || 1) + db * db / (b.mobility || 1) + this.distanceWeight * (
            ((a[axis] + sign * da - homeA) ** 2 - (a[axis] - homeA) ** 2) / (a.mobility || 1)
            + ((b[axis] - sign * db - homeB) ** 2 - (b[axis] - homeB) ** 2) / (b.mobility || 1));
          if (depthPenalty < bestDepth || (depthPenalty === bestDepth
            && (count < bestCount || (count === bestCount && cost < bestCost)))) {
            bestDepth = depthPenalty; bestCount = count; bestCost = cost; bestAxis = axis; bestA = sign * da; bestB = -sign * db;
          }
        }
      }
    }
    if (!Number.isFinite(bestCost)) return false;
    this.remove(a); this.remove(b);
    a[bestAxis] += bestA; b[bestAxis] += bestB;
    this.constrain(a); this.constrain(b);
    this.insert(a); this.insert(b);
    return Math.abs(bestA) + Math.abs(bestB) > EPSILON;
  }

  private better(a: Score, b: Score): boolean {
    // Separation is a constraint, not a cost that distance/priority can buy off.
    // Use the same ordering for candidates, the heap and the best whole layout.
    if (a.drag !== b.drag) return a.drag < b.drag;
    if (a.overlap !== b.overlap) return a.overlap < b.overlap;
    if (a.changed !== b.changed) return a.changed < b.changed;
    return a.movement < b.movement - .001;
  }

  private betterDensity(a: Score, b: Score): boolean {
    // A cell-density estimate is not an exact collision constraint. Balance it
    // with distance so tiny approximate gains cannot cause a large displacement.
    // Both terms are in cell-area units; exact drag exclusion still takes priority.
    if (a.drag !== b.drag) return a.drag < b.drag;
    const difference = a.overlap + a.movement - b.overlap - b.movement;
    if (Math.abs(difference) > .001) return difference < 0;
    if (a.changed !== b.changed) return a.changed < b.changed;
    return a.movement < b.movement - .001;
  }

  private changed(b: Body): number {
    return Number(Math.abs(b.x - b.startX) > EPSILON || Math.abs(b.y - b.startY) > EPSILON);
  }

  private displacementCost(b: Body): number {
    return (this.distanceWeight * ((b.x - b.homeX) ** 2 + (b.y - b.homeY) ** 2)
      + .15 * ((b.x - b.startX) ** 2 + (b.y - b.startY) ** 2)) / (b.mobility || 1);
  }

  private localScore(b: Body): Score {
    const score = { drag: 0, overlap: 0, movement: this.displacementCost(b), changed: this.changed(b) };
    for (const other of this.query(b.x, b.y, b.item.width, b.item.height)) if (other !== b) {
      const area = this.overlap(b, other);
      score.overlap += area;
      if (other.fixed) score.drag += area;
    }
    return score;
  }

  private measure(): Score {
    const score = { drag: 0, overlap: 0, movement: 0, changed: 0 };
    for (const a of this.bodies) {
      score.movement += this.displacementCost(a);
      score.changed += this.changed(a);
      for (const b of this.query(a.x, a.y, a.item.width, a.item.height)) if (a.item.index < b.item.index) {
        const area = this.overlap(a, b);
        score.overlap += area;
        if (a.fixed || b.fixed) score.drag += area;
      }
    }
    return score;
  }

  /** Bounded exact repairs for small neighborhoods, even in saturated views. */
  private repairSparse(remaining: Map<Body, number>): number {
    let checks = 0;
    for (const body of [...this.bodies].reverse()) {
      const budget = Math.min(remaining.get(body) ?? 0, 16);
      if (!budget) continue;
      if (body.fixed || !this.hasOverlap(body)) continue;
      // Limit broad-phase neighbors as well as expanded candidates: a dense
      // cluster must not turn this cleanup into an unbounded pairwise solve.
      if (this.query(body.x, body.y, body.item.width, body.item.height, 32).length > 32) continue;
      this.remove(body);
      const used = this.repair(body, budget, false, 32);
      remaining.set(body, (remaining.get(body) ?? 0) - used);
      checks += used;
      this.insert(body);
    }
    return checks;
  }

  private repair(body: Body, budget: number, spread = false, maxNeighbors = Infinity): number {
    if (!budget) return 0;
    let best = this.localScore(body), bx = body.x, by = body.y;
    if (best.overlap === 0) return 0;
    const queue: [number, number, Score][] = [];
    const visited = new Set<string>();
    const enqueue = (x: number, y: number) => {
      if (visited.size >= budget * 8) return;
      const ox = body.x, oy = body.y;
      body.x = x; body.y = y; this.constrain(body);
      x = body.x; y = body.y;
      const key = `${Math.round(x * 100)}/${Math.round(y * 100)}`;
      if (visited.has(key)) { body.x = ox; body.y = oy; return; }
      visited.add(key);
      if (maxNeighbors !== Infinity && this.query(x, y, body.item.width, body.item.height, maxNeighbors).length > maxNeighbors) {
        body.x = ox; body.y = oy; return;
      }
      const estimate = this.localScore(body);
      body.x = ox; body.y = oy;
      const point: [number, number, Score] = [x, y, estimate];
      let n = queue.length;
      queue.push(point);
      while (n > 0) {
        const parent = (n - 1) >> 1;
        if (!this.better(point[2], queue[parent]![2])) break;
        queue[n] = queue[parent]!; n = parent;
      }
      queue[n] = point;
    };
    enqueue(body.x, body.y);
    enqueue(body.item.preferredLeft, body.item.preferredTop);
    let checks = 0;
    const localBudget = spread ? Math.max(1, budget - 24) : budget;
    while (queue.length && checks < localBudget) {
      const point = queue[0]!, tail = queue.pop()!;
      if (queue.length) {
        let n = 0;
        while (n * 2 + 1 < queue.length) {
          let child = n * 2 + 1;
          if (child + 1 < queue.length && this.better(queue[child + 1]![2], queue[child]![2])) child++;
          if (!this.better(queue[child]![2], tail[2])) break;
          queue[n] = queue[child]!; n = child;
        }
        queue[n] = tail;
      }
      body.x = point[0]; body.y = point[1]; checks++;
      const score = this.localScore(body);
      if (this.better(score, best)) { best = score; bx = body.x; by = body.y; }
      if (score.overlap === 0) break;
      // Best-first contact search (collision cost, then displacement),
      // deduplicated BEFORE entering the heap. A
      // crowded rectangle cannot flood the queue with identical edge positions.
      for (const other of this.query(body.x, body.y, body.item.width, body.item.height)) if (other !== body && this.overlap(body, other)) {
        const gap = this.gap + SEPARATION_SLOP;
        enqueue(other.x - body.item.width - gap, body.y); enqueue(other.x + other.item.width + gap, body.y);
        enqueue(body.x, other.y - body.item.height - gap); enqueue(body.x, other.y + other.item.height + gap);
      }
    }
    // Initial clusters can exhaust contact candidates inside a local pocket.
    // Reserve coarse viewport probes for new labels only; existing labels are
    // handled by contact propagation and cannot teleport to a distant free area.
    if (spread && best.overlap > 0) {
      const probes: [number, number][] = [];
      for (let y = 0; y <= 4; y++) for (let x = 0; x <= 4; x++) if (x !== 2 || y !== 2) {
        probes.push(Number.isFinite(this.maxDisplacement)
          ? [body.homeX + (x / 2 - 1) * this.maxDisplacement, body.homeY + (y / 2 - 1) * this.maxDisplacement]
          : [x / 4 * Math.max(0, this.viewportWidth - body.item.width), y / 4 * Math.max(0, this.viewportHeight - body.item.height)]);
      }
      probes.sort((a, b) => (a[0] - body.startX) ** 2 + (a[1] - body.startY) ** 2
        - (b[0] - body.startX) ** 2 - (b[1] - body.startY) ** 2);
      for (const [x, y] of probes) {
        if (checks >= budget) break;
        body.x = x; body.y = y;
        this.constrain(body); checks++;
        const score = this.localScore(body);
        if (this.better(score, best)) { best = score; bx = body.x; by = body.y; }
      }
    }
    body.x = bx; body.y = by;
    return checks;
  }

  private protectDrag(body: Body): void {
    let best = this.localScore(body), bx = body.x, by = body.y;
    for (const d of this.dragged) {
      const gap = this.gap + SEPARATION_SLOP;
      for (const [x, y] of [[d.x - body.item.width - gap, by], [d.x + d.item.width + gap, by],
        [bx, d.y - body.item.height - gap], [bx, d.y + d.item.height + gap]]) {
        body.x = x!; body.y = y!; this.constrain(body);
        const score = this.localScore(body);
        if (this.better(score, best)) { best = score; bx = body.x; by = body.y; }
      }
    }
    body.x = bx; body.y = by;
  }

  private remove(body: Body): void {
    for (const key of body.cells) this.cells.get(key)?.delete(body);
    body.cells.length = 0;
  }

  private insert(body: Body): void {
    this.visitCells(body.x, body.y, body.item.width, body.item.height, key => {
      let bucket = this.cells.get(key);
      if (!bucket) { bucket = new Set(); this.cells.set(key, bucket); }
      bucket.add(body); body.cells.push(key);
    });
  }

  private query(x: number, y: number, width: number, height: number, limit = Infinity): Body[] {
    this.queryId++;
    const conflicts: Body[] = [], gap = this.gap;
    this.visitCells(x - gap, y - gap, width + gap * 2, height + gap * 2, key => {
      if (conflicts.length > limit) return;
      const bucket = this.cells.get(key);
      if (!bucket) return;
      for (const body of bucket) {
        if (this.stamps.get(body) === this.queryId) continue;
        this.stamps.set(body, this.queryId);
        conflicts.push(body);
        if (conflicts.length > limit) break;
      }
    });
    return conflicts;
  }

  private visitCells(x: number, y: number, width: number, height: number, visit: (key: number) => void): void {
    // Clip hash coverage to the viewport; oversized/offscreen rectangles cannot create huge loops.
    // Clamp BOTH ends to boundary buckets. Merely clipping the iteration range
    // drops wholly offscreen rectangles, causing false negatives.
    const maxX = Math.ceil(this.viewportWidth / CELL_SIZE), maxY = Math.ceil(this.viewportHeight / CELL_SIZE);
    const left = Math.min(maxX, Math.max(-1, Math.floor(x / CELL_SIZE)));
    const top = Math.min(maxY, Math.max(-1, Math.floor(y / CELL_SIZE)));
    const right = Math.max(-1, Math.min(maxX, Math.floor((x + width) / CELL_SIZE)));
    const bottom = Math.max(-1, Math.min(maxY, Math.floor((y + height) / CELL_SIZE)));
    const columns = Math.ceil(this.viewportWidth / CELL_SIZE) + 2;
    for (let row = top; row <= bottom; row++) for (let col = left; col <= right; col++) visit((row + 1) * columns + col + 1);
  }
}
