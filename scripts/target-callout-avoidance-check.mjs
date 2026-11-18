import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import * as C from 'cesium';
import { WorkerCalloutHandle, ScreenBatchRenderer } from '../packages/cesium-screen-callout/dist/index.js';

const source = await readFile(new URL('../packages/cesium-screen-callout/src/avoidance.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { CalloutAvoidanceLayout, normalizeAvoidance } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
// Retain the unrestricted packing suite as an explicit opt-in policy. Defaults
// now favor each label's own neighborhood and are tested separately below.
const options = normalizeAvoidance({ enabled: true, maxDisplacement: Infinity, distanceWeight: 0 });
function item(index, overrides = {}) {
  return { index, visible: true, preferredLeft: 200, preferredTop: 180,
    anchorX: 250, anchorY: 250, width: 100, height: 50, maxDistance: Infinity,
    dragging: false, priority: 0, left: 0, top: 0, ...overrides };
}
function overlaps(a, b, gap = 0) {
  return Math.min(a.left + a.width + gap, b.left + b.width + gap) - Math.max(a.left, b.left) > .01
    && Math.min(a.top + a.height + gap, b.top + b.height + gap) - Math.max(a.top, b.top) > .01;
}
function separated(items, gap = options.gap) {
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    assert.ok(!overlaps(items[i], items[j], gap), `overlap: ${i}, ${j}`);
  }
}
function inViewport(b, width, height) {
  return b.left >= -.001 && b.top >= -.001 && b.left + b.width <= width + .001 && b.top + b.height <= height + .001;
}
{
  // Viewport edges are not standalone layout constraints. Partially outside,
  // wholly outside and larger-than-viewport panels retain their chosen homes.
  for (const fixture of [
    { preferredLeft: -20, preferredTop: 120 }, { preferredLeft: 450, preferredTop: 120 },
    { preferredLeft: 180, preferredTop: -20 }, { preferredLeft: 180, preferredTop: 280 },
    { preferredLeft: -700, preferredTop: -400 }, { preferredLeft: 900, preferredTop: 700 },
    { preferredLeft: -15, preferredTop: -10, width: 700, height: 500 },
  ]) {
    const layout = new CalloutAvoidanceLayout(), b = item(0, fixture);
    const home = [b.preferredLeft, b.preferredTop];
    assert.equal(layout.layout([b], 500, 300, options).unresolved, 0);
    assert.deepEqual([b.left, b.top], home, 'an uncollided label must not be pulled into the viewport');
    layout.layout([b], 200, 100, options);
    assert.deepEqual([b.left, b.top], home, 'viewport resize alone must not change the offset');
  }
  console.log('PASS uncollided labels outside each edge, wholly outside and oversized remain exactly in place');
}
{
  // An inside start only restricts collision repair candidates. This preserves
  // edge labels without turning ordinary map/camera motion into a clamp.
  for (const [x, y] of [[0, 100], [300, 100], [150, 0], [150, 250]]) {
    const labels = [item(0, { preferredLeft: x, preferredTop: y, priority: 100 }),
      item(1, { preferredLeft: x, preferredTop: y })];
    const result = new CalloutAvoidanceLayout().layout(labels, 400, 300, options);
    assert.equal(result.unresolved, 0, `edge collision at ${x},${y} has a feasible in-view solution`);
    separated(labels);
    assert.ok(labels.every(b => inViewport(b, 400, 300)), 'collision repair cannot push a fully inside start outside');
  }
  const mixed = [item(0, { preferredLeft: 0, preferredTop: 100, priority: 100 }),
    item(1, { preferredLeft: -20, preferredTop: 100 })];
  new CalloutAvoidanceLayout().layout(mixed, 100, 300, options);
  separated(mixed);
  assert.ok(inViewport(mixed[0], 100, 300), 'inside member of a mixed edge contact remains inside');
  assert.ok(mixed[1].left < 0, 'outside member may separate on the outer side instead of clamping inward');
  console.log('PASS four-edge collision repairs keep inside starts inside while outside members may move outside');
}
{
  const layout = new CalloutAvoidanceLayout();
  const first = item(0, { preferredLeft: 40, preferredTop: 100 });
  layout.layout([first], 500, 300, options);
  first.preferredLeft -= 70; first.anchorX -= 70;
  const second = item(1, { preferredLeft: -30, preferredTop: 100 });
  const labels = [first, second];
  const stats = layout.layout(labels, 500, 300, options);
  assert.equal(stats.unresolved, 0);
  separated(labels);
  assert.ok(labels.some(b => b.left < 0), 'current warm starts govern the repair, not their inside status in an earlier frame');
  const placed = labels.map(b => [b.left, b.top]);
  for (let frame = 0; frame < 10; frame++) {
    assert.equal(layout.layout(labels, 500, 300, options).candidateChecks, 0);
    assert.deepEqual(labels.map(b => [b.left, b.top]), placed, 'outside collision reaches its final placement in one solve');
  }
  console.log('PASS a naturally exited label repairs new collisions outside and settles in one solve');
}
{
  const nearby = normalizeAvoidance(true);
  assert.equal(nearby.maxDisplacement, 160);
  assert.equal(nearby.distanceWeight, .25);
  const withinHome = (entries, radius) => {
    for (const b of entries) if (!b.dragging) {
      assert.ok(Math.hypot(b.left - b.preferredLeft, b.top - b.preferredTop) <= radius + .001,
        `panel ${b.index} escaped its own neighborhood`);
    }
  };
  // Test both the rectangle solver and saturated density path. Large unused
  // areas elsewhere in the viewport must not attract a label far from home.
  for (const count of [24, 1000]) {
    const entries = Array.from({ length: count }, (_, index) => item(index, {
      preferredLeft: 500, preferredTop: 300, anchorX: 600, anchorY: 370, width: 200, height: 140,
    }));
    const layout = new CalloutAvoidanceLayout();
    const result = layout.layout(entries, 1600, 900, nearby);
    withinHome(entries, 160);
    assert.ok(result.unresolved > 0, 'keep unavoidable local overlaps instead of scattering across the viewport');
    for (let step = 0; step < 12; step++) {
      for (const b of entries) { b.preferredLeft += 2; b.anchorX += 2; }
      layout.layout(entries, 1600, 900, nearby);
      withinHome(entries, 160);
    }
    layout.layout(entries, 1600, 900, normalizeAvoidance({ ...nearby, maxDisplacement: 60 }));
    withinHome(entries, 60);
    layout.layout(entries, 1600, 900, normalizeAvoidance({ ...nearby, maxDisplacement: 0 }));
    withinHome(entries, 0);
  }
  const layout = new CalloutAvoidanceLayout(), dragged = item(0, { dragging: true }), neighbor = item(1);
  assert.equal(layout.layout([dragged, neighbor], 1000, 700, nearby).candidateChecks, 0);
  assert.equal(neighbor.left, neighbor.preferredLeft, 'active drag defers neighbor displacement');
  dragged.dragging = false;
  layout.layout([dragged, neighbor], 1000, 700, nearby);
  separated([dragged, neighbor]);
  assert.ok(Math.hypot(neighbor.left - neighbor.preferredLeft, neighbor.top - neighbor.preferredTop) > 0);
  // Removing an obstruction must not disturb an already feasible placement.
  const settledNeighbor = [neighbor.left, neighbor.top];
  layout.layout([neighbor], 1000, 700, nearby);
  assert.deepEqual([neighbor.left, neighbor.top], settledNeighbor);
  dragged.preferredLeft = 850; dragged.preferredTop = 600;
  dragged.dragging = true;
  layout.layout([dragged, neighbor], 1000, 700, nearby);
  assert.equal(dragged.left, 850);
  assert.equal(dragged.top, 600);
  // A user-configured position is the home; dragging/pinning is not pulled back
  // towards the original target anchor by the automatic radius.
  neighbor.preferredLeft = 750; neighbor.preferredTop = 450; neighbor.priority = 2;
  layout.layout([neighbor], 1000, 700, nearby);
  assert.equal(neighbor.left, 750);
  assert.equal(neighbor.top, 450);
  const limited = [item(0, { maxDistance: 90 }), item(1, { maxDistance: 90 })];
  layout.layout(limited, 800, 600, normalizeAvoidance({ ...nearby, maxDisplacement: 35 }));
  withinHome(limited, 35);
  for (const b of limited) assert.ok(Math.hypot(b.left + b.width / 2 - b.anchorX, b.top + b.height / 2 - b.anchorY) <= 90.001);
  const weighted = [item(0), item(1)];
  const weightedResult = new CalloutAvoidanceLayout().layout(weighted, 800, 600,
    normalizeAvoidance({ enabled: true, maxDisplacement: Infinity, distanceWeight: 10 }));
  assert.equal(weightedResult.unresolved, 0, 'distance preference must not outweigh a feasible collision-free placement');
  separated(weighted);
  assert.equal(weighted.filter(b => Math.hypot(b.left - b.preferredLeft, b.top - b.preferredTop) > .01).length, 1,
    'a larger displacement weight does not justify moving both panels when moving one is enough');
  console.log('PASS default local radius, dense local fallback, bounded motion, radius changes, stable removal, manual drag and intersecting limits');
}
{
  // Distinct priorities > 1 are real handle states after two labels have each
  // been dragged. They express precedence, not permission to retain overlap.
  const labels = [item(0, { preferredLeft: 300, preferredTop: 200, width: 100, height: 100, priority: 2 }),
    item(1, { preferredLeft: 300, preferredTop: 200, width: 100, height: 100, priority: 3 })];
  const result = new CalloutAvoidanceLayout().layout(labels, 1000, 800, normalizeAvoidance(true));
  assert.equal(result.unresolved, 0, 'previously dragged labels must still separate with default options');
  separated(labels);
  assert.equal(labels.filter(b => Math.hypot(b.left - b.preferredLeft, b.top - b.preferredTop) > .01).length, 1,
    'historical interaction priorities must not replace a one-label repair with a multi-label displacement');
  console.log('PASS historical drag priorities cannot freeze a feasible one-panel collision repair');
}
{
  // A distant, over-capacity cluster must not make a simple local collision
  // unsolvable. The two small labels have empty space on all four sides.
  const labels = [item(0, { preferredLeft: 100, preferredTop: 100, anchorX: 125, anchorY: 112, width: 50, height: 24 }),
    item(1, { preferredLeft: 100, preferredTop: 100, anchorX: 125, anchorY: 112, width: 50, height: 24 }),
    ...Array.from({ length: 65 }, (_, index) => item(index + 2, {
      preferredLeft: 650, preferredTop: 450, anchorX: 750, anchorY: 520, width: 200, height: 140,
    }))];
  const result = new CalloutAvoidanceLayout().layout(labels, 1000, 700, normalizeAvoidance(true));
  assert.ok(result.unresolved > 0, 'the far cluster remains genuinely over capacity');
  separated(labels.slice(0, 2));
  assert.equal(labels.slice(0, 2).filter(b => Math.hypot(b.left - b.preferredLeft, b.top - b.preferredTop) > .01).length, 1,
    'independent simple collision moves one of its two panels even in a globally dense scene');
  assert.ok(labels.slice(0, 2).every(b => Math.hypot(b.left - b.preferredLeft, b.top - b.preferredTop) <= 160.001));
  console.log('PASS a remote dense cluster does not freeze an independent feasible collision between small labels');
}
{
  const lowBudget = normalizeAvoidance({ enabled: true, maxCandidates: 8 });
  const labels = [item(0, { preferredLeft: 700, preferredTop: 100, anchorX: 725, anchorY: 112, width: 50, height: 24 }),
    item(1, { preferredLeft: 700, preferredTop: 100, anchorX: 725, anchorY: 112, width: 50, height: 24 }),
    ...Array.from({ length: 64 }, (_, index) => {
      // Each group is small enough to enter exact local repair, while their
      // combined area also triggers density repair and its residual pass.
      const group = Math.floor(index / 16), x = group % 2 ? 1100 : 100, y = group < 2 ? 200 : 650;
      return item(index + 2, { preferredLeft: x, preferredTop: y, anchorX: x + 100, anchorY: y + 70, width: 200, height: 140 });
    })];
  const layout = new CalloutAvoidanceLayout();
  const result = layout.layout(labels, 1600, 900, lowBudget);
  assert.ok(result.candidateChecks > 0 && result.candidateChecks <= labels.length * 8,
    'exact, density and residual passes must share one per-label candidate budget');
  separated(labels.slice(0, 2));
  assert.equal(labels.slice(0, 2).filter(b => Math.hypot(b.left - b.preferredLeft, b.top - b.preferredTop) > .01).length, 1,
    'minimum candidate budget still clears an independent feasible pair by moving one label');
  const placed = labels.map(b => [b.left, b.top]);
  assert.equal(layout.layout(labels, 1600, 900, lowBudget).candidateChecks, 0);
  assert.deepEqual(labels.map(b => [b.left, b.top]), placed);
  console.log('PASS dense mixed regions share the 8-candidate budget and retain exact sparse repair');
}
{
  // The background rectangles cannot move and cover every legal position of
  // the small panel. A grid-edge density estimate must not invent a benefit
  // from moving that panel far away when its real conflicts cannot improve.
  const small = item(0, { preferredLeft: 120, preferredTop: 300, anchorX: 145, anchorY: 312, width: 50, height: 24 });
  const labels = [small, ...Array.from({ length: 65 }, (_, index) => item(index + 1, {
    preferredLeft: 0, preferredTop: 0, anchorX: 500, anchorY: 350, width: 1000, height: 700, maxDistance: 0,
  }))];
  const result = new CalloutAvoidanceLayout().layout(labels, 1000, 700, normalizeAvoidance(true));
  assert.equal(result.unresolved, labels.length, 'the fixture is infeasible regardless of the small panel position');
  assert.deepEqual([small.left, small.top], [small.preferredLeft, small.preferredTop],
    'a coarse density reduction with no real collision benefit must not cause a large displacement');
  assert.ok(labels.slice(1).every(b => b.left === 0 && b.top === 0), 'explicit zero-distance constraints remain respected');
  console.log('PASS infeasible uniform coverage does not turn approximate density improvement into needless movement');
}
{
  const layout = new CalloutAvoidanceLayout();
  const items = Array.from({ length: 24 }, (_, index) => item(index));
  const result = layout.layout(items, 900, 600, options);
  assert.equal(result.unresolved, 0);
  separated(items);
  for (const entry of items) {
    assert.ok(entry.left >= 0 && entry.top >= 0 && entry.left + entry.width <= 900 && entry.top + entry.height <= 600);
  }
  const positions = items.map(entry => [entry.left, entry.top]);
  assert.equal(layout.layout(items, 900, 600, options).candidateChecks, 0);
  assert.deepEqual(items.map(entry => [entry.left, entry.top]), positions);
  // Resizing/font layout changes invalidate the cache.
  items[0].width = 180;
  layout.layout(items, 1000, 650, options);
  separated(items);
}
console.log('PASS enough space, gap, inside-start collision bounds, stable cached layout and resized panels');
{
  const layout = new CalloutAvoidanceLayout();
  const items = Array.from({ length: 30 }, (_, index) => item(index, {
    width: 70 + index % 5 * 17, height: 30 + index % 4 * 13,
    preferredLeft: 350 + index % 3 * 7, preferredTop: 250 + index % 5 * 3,
  }));
  assert.equal(layout.layout(items, 1200, 800, options).unresolved, 0);
  separated(items);
  // Camera motion should not invalidate the fixed ordering or create persistent collisions.
  for (const entry of items) {
    entry.preferredLeft += 25; entry.preferredTop += 12;
    entry.anchorX += 25; entry.anchorY += 12;
  }
  assert.equal(layout.layout(items, 1200, 800, options).unresolved, 0);
  separated(items);
}
console.log('PASS mixed panel sizes and camera translation');
{
  // Crowded, mixed-size initial layouts: candidate duplication used to consume
  // the budget while perfectly usable space remained elsewhere in the viewport.
  for (const count of [60, 100, 300]) {
    const layout = new CalloutAvoidanceLayout();
    const labels = Array.from({ length: count }, (_, index) => item(index, {
      preferredLeft: 500 + index % 7 * 4, preferredTop: 300 + index % 9 * 4,
      anchorX: 550, anchorY: 350, width: 80 + index % 5 * 15, height: 35 + index % 3 * 10,
    }));
    labels[0].dragging = true;
    assert.equal(layout.layout(labels, 1200, 800, options).candidateChecks, 0);
    labels[0].dragging = false;
    layout.layout(labels, 1200, 800, options);
    let overlapArea = 0, pairs = 0;
    for (let i = 0; i < count; i++) for (let j = i + 1; j < count; j++) {
      const a = labels[i], b = labels[j];
      const w = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left);
      const h = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top);
      if (w > .01 && h > .01) { overlapArea += w * h; pairs++; }
    }
    if (count === 60) separated(labels);
    if (count === 100) assert.ok(pairs <= 3 && overlapArea < 1000, `mixed cluster: ${pairs} pairs, area ${overlapArea}`);
    if (count === 300) {
      assert.ok(overlapArea < 1500000, `over-capacity labels should spread instead of forming stacks: ${overlapArea}`);
      const before = labels.map(b => ({ ...b }));
      for (const b of labels) { b.preferredLeft += 1; b.anchorX += 1; }
      layout.layout(labels, 1200, 800, options);
      for (let i = 0; i < count; i++) {
        assert.ok(Math.hypot(labels[i].left - before[i].left - 1, labels[i].top - before[i].top) < 1e-6,
          'rigid saturated camera motion preserves offsets instead of continuing a per-frame relaxation');
      }
    }
    console.log(`PASS ${count} mixed-size initial panels: ${pairs} overlap pairs, ${Math.round(overlapArea)}px² overlap`);
  }
}
{
  const layout = new CalloutAvoidanceLayout();
  const items = [item(0, { priority: 100 }), item(1), item(2)];
  layout.layout(items, 800, 600, options);
  const before = items.slice(0, 2).map(b => [b.left, b.top]);
  items[2].dragging = true;
  items[2].preferredLeft = items[0].left;
  items[2].preferredTop = items[0].top;
  layout.layout(items, 800, 600, options);
  assert.equal(items[2].left, items[2].preferredLeft);
  assert.equal(items[2].top, items[2].preferredTop);
  assert.deepEqual(items.slice(0, 2).map(b => [b.left, b.top]), before);
  for (let step = 0; step < 20; step++) {
    items[2].preferredLeft += 3;
    assert.equal(layout.layout(items, 800, 600, options).candidateChecks, 0);
    assert.equal(items[2].left, items[2].preferredLeft, 'dragged panel must never be pushed');
    assert.deepEqual(items.slice(0, 2).map(b => [b.left, b.top]), before, 'ordinary labels remain still until release');
  }
  items[2].dragging = false;
  items[2].priority = 101;
  layout.layout(items, 800, 600, options);
  assert.equal(items[2].left, items[2].preferredLeft, 'released panel keeps its last interaction priority');
  separated(items);
}
console.log('PASS active drag freezes neighbors; release takes precedence and starts separation');
{
  const layout = new CalloutAvoidanceLayout();
  const labels = [item(0, { preferredLeft: 200 }), item(1, { preferredLeft: 400 }),
    item(2, { preferredLeft: 650, preferredTop: 400 })];
  layout.layout(labels, 1000, 700, options);
  labels[1].preferredLeft = 280;
  const baseline = labels.map(b => [b.left + (b.index === 1 ? -120 : 0), b.top]);
  layout.layout(labels, 1000, 700, options);
  separated(labels);
  assert.equal(labels.filter((b, i) => Math.hypot(b.left - baseline[i][0], b.top - baseline[i][1]) > .01).length, 1,
    'a feasible ordinary pair collision should move one panel, not split displacement between two');
  assert.deepEqual([labels[2].left, labels[2].top], baseline[2], 'unrelated established panel stays still');

  const cluster = new CalloutAvoidanceLayout();
  const entries = [item(0, { preferredLeft: 200 }), item(1, { preferredLeft: 320 }),
    item(2, { preferredLeft: 600 })];
  cluster.layout(entries, 1000, 700, options);
  entries[2].preferredLeft = 260;
  const homes = entries.map(b => [b.preferredLeft, b.preferredTop]);
  cluster.layout(entries, 1000, 700, options);
  separated(entries);
  assert.equal(entries.filter((b, i) => Math.hypot(b.left - homes[i][0], b.top - homes[i][1]) > .01).length, 1,
    'one panel touching two established neighbors should move itself when that clears both contacts');
  console.log('PASS unilateral pair repair and multi-contact repair minimize moved panel count');
}
{
  const layout = new CalloutAvoidanceLayout();
  const labels = Array.from({ length: 80 }, (_, index) => item(index, {
    preferredLeft: 180, preferredTop: 180, width: 230, height: 140,
  }));
  const isolated = item(80, { preferredLeft: 1050, preferredTop: 600 });
  labels.push(isolated);
  layout.layout(labels, 1200, 800, normalizeAvoidance(true));
  assert.equal(isolated.left, isolated.preferredLeft);
  assert.equal(isolated.top, isolated.preferredTop);
  console.log('PASS saturated density repair leaves an unrelated isolated panel unchanged');
}
{
  const layout = new CalloutAvoidanceLayout();
  const labels = [item(0), item(1)];
  layout.layout(labels, 1000, 700, options);
  const offsets = labels.map(b => [b.left - b.preferredLeft, b.top - b.preferredTop]);
  for (const b of labels) { b.preferredLeft += 50; b.anchorX += 50; }
  labels[1].width = 170;
  const held = layout.layout(labels, 800, 500, normalizeAvoidance({ ...options, maxDisplacement: 0 }), true);
  assert.equal(held.candidateChecks, 0, 'dragging another display group also freezes this group');
  assert.deepEqual(labels.map(b => [b.left - b.preferredLeft, b.top - b.preferredTop]), offsets);
  layout.layout(labels, 800, 500, normalizeAvoidance({ ...options, maxDisplacement: 0 }));
  assert.ok(labels.every(b => b.left === b.preferredLeft && b.top === b.preferredTop),
    'release invalidates unchanged groups and applies deferred settings');
  console.log('PASS cross-group drag deferral preserves offsets and resumes changed constraints on release');
}
{
  // One-row corridor: no label should move until pointer release, then the
  // bounded local solver must resolve contacts while preserving the drop.
  const layout = new CalloutAvoidanceLayout();
  const local = normalizeAvoidance({ ...options, maxDisplacement: 160 });
  const chain = Array.from({ length: 8 }, (_, index) => item(index, {
    preferredLeft: index * 106, preferredTop: 0, height: 50,
  }));
  layout.layout(chain, 1200, 50, local);
  const before = chain.map(b => b.left);
  chain[0].dragging = true;
  for (let frame = 1; frame <= 80; frame++) {
    chain[0].preferredLeft = frame * 2;
    const stats = layout.layout(chain, 1200, 50, local);
    assert.equal(stats.candidateChecks, 0, `corridor drag frame ${frame}`);
    assert.equal(chain[0].left, frame * 2);
    assert.deepEqual(chain.slice(1).map(b => b.left), before.slice(1));
  }
  chain[0].dragging = false;
  chain[0].priority = 2;
  layout.layout(chain, 1200, 50, local);
  assert.equal(chain[0].left, 160, 'released panel remains at the pointer drop');
  separated(chain);
  console.log('PASS 80-frame corridor drag does no layout work; release resolves the bounded chain');
}
{
  const layout = new CalloutAvoidanceLayout();
  const labels = Array.from({ length: 12 }, (_, index) => item(index, {
    width: 70, height: 30, maxDistance: 180,
  }));
  for (let frame = 0; frame < 60; frame++) {
    for (const [index, b] of labels.entries()) {
      b.anchorX = 400 + Math.cos(frame / 50 + index * .4) * 60;
      b.anchorY = 280 + Math.sin(frame / 50 + index * .4) * 50;
      b.preferredLeft = b.anchorX - 35; b.preferredTop = b.anchorY - 15;
    }
    const stats = layout.layout(labels, 800, 600, options);
    assert.equal(stats.unresolved, 0, `crossing targets frame ${frame}`);
    separated(labels);
    for (const b of labels) assert.ok(Math.hypot(b.left + 35 - b.anchorX, b.top + 15 - b.anchorY) <= 180.001);
  }
  // Resizing at the right edge must choose a feasible separation direction.
  labels[0].dragging = true;
  labels[0].width = 150; labels[0].preferredLeft = 650; labels[0].preferredTop = 570;
  labels[1].preferredLeft = 650; labels[1].preferredTop = 570; labels[1].maxDistance = Infinity;
  assert.equal(layout.layout(labels, 800, 600, options).candidateChecks, 0);
  labels[0].dragging = false;
  labels[0].priority = 2;
  const stats = layout.layout(labels, 800, 600, options);
  assert.equal(stats.unresolved, 0);
  assert.equal(labels[0].left, 650);
  separated(labels);
  console.log('PASS crossing moving targets, camera-like motion, resized edge drag and distance constraints');
}
{
  const layout = new CalloutAvoidanceLayout();
  const labels = [item(0, { maxDistance: 0 }), item(1, { maxDistance: 0 }), item(2, { preferredLeft: 700, preferredTop: 500 })];
  const stats = layout.layout(labels, 1000, 700, options);
  assert.equal(stats.unresolved, 2, 'count both visible members of an unsatisfiable conflict');
  assert.equal(labels[2].left, 700, 'unrelated panel stays put');
  assert.equal(labels[2].top, 500);
  layout.layout([labels[2]], 1000, 700, options);
  assert.equal(layout.layout([labels[2]], 1000, 700, options).candidateChecks, 0, 'removed IDs do not poison cache');
  console.log('PASS infeasible constraints keep labels and count actual conflicts; distant panels and removed IDs');
}
{
  const layout = new CalloutAvoidanceLayout();
  const items = Array.from({ length: 8 }, (_, index) => item(index, { maxDistance: 160 }));
  layout.layout(items, 700, 600, options);
  for (const entry of items) {
    assert.ok(Math.hypot(entry.left + entry.width / 2 - entry.anchorX, entry.top + entry.height / 2 - entry.anchorY) <= 160.01);
  }
  const hidden = item(10, { visible: false, width: 10000, height: 10000 });
  const single = item(11);
  layout.layout([hidden, single], 800, 600, options);
  assert.equal(single.left, single.preferredLeft);
  assert.equal(single.top, single.preferredTop);
}
{
  const layout = new CalloutAvoidanceLayout();
  const items = Array.from({ length: 1000 }, (_, index) => item(index, { width: 230, height: 140 }));
  const started = performance.now();
  const result = layout.layout(items, 800, 600, options);
  const elapsed = performance.now() - started;
  assert.ok(result.unresolved > 0);
  assert.ok(result.candidateChecks <= 1000 * options.maxCandidates);
  assert.equal(items.length, 1000);
  assert.ok(items.every(entry => Number.isFinite(entry.left) && Number.isFinite(entry.top)));
  assert.equal(layout.layout(items, 800, 600, options).candidateChecks, 0);
  console.log(`PASS dense 1000-panel fallback: ${result.unresolved} unresolved, ${result.candidateChecks} candidates, ${elapsed.toFixed(1)}ms (Node geometry only)`);
}
{
  const frame = { positions: new Float64Array([1, 2, 3]), bounds: new Float32Array([250, 250, 100, 50, 1]) };
  const handle = new WorkerCalloutHandle(0, () => frame, () => {});
  handle.resolveScreenOffset(250, 250);
  handle.applyAvoidanceOffset(150, 100);
  assert.equal(handle.getOffset().x, 150);
  assert.equal(handle.getPreferredOffset().x, 80);
  assert.equal(handle.hitTest(new C.Cartesian2(410, 310)), true);
  assert.equal(handle.getScreenBounds().left, 400);
  handle.setScreenFixed(true);
  handle.resolveScreenOffset(300, 250);
  assert.equal(handle.getScreenBounds().left, 350); // frame anchor remains 250 in this isolated test
  handle.setDragScreenPosition(new C.Cartesian2(450, 300));
  handle.resolveScreenOffset(250, 250);
  assert.equal(handle.isDragging(), true);
  assert.equal(handle.getOffset().x, 200);
  handle.setDragScreenPosition(undefined);
  assert.equal(handle.isDragging(), false);
  assert.ok(handle.getAvoidancePriority() > 1);
  handle.setScreenFixed(false);
  handle.setOffset(new C.Cartesian2(80, -80));
  handle.applyAvoidanceOffset(140, 40);
  handle.resolveScreenOffset(250, 250); // renderer disabling avoidance restores the preferred position
  assert.equal(handle.getOffset().x, 80);
}
assert.throws(() => normalizeAvoidance({ gap: NaN }), /间距/);
assert.throws(() => normalizeAvoidance({ maxCandidates: 0 }), /搜索/);
assert.throws(() => normalizeAvoidance({ maxIterations: 0 }), /迭代/);
assert.throws(() => normalizeAvoidance({ maxDisplacement: -1 }), /半径/);
assert.throws(() => normalizeAvoidance({ maxDisplacement: NaN }), /半径/);
assert.throws(() => normalizeAvoidance({ distanceWeight: Infinity }), /权重/);
assert.equal(typeof ScreenBatchRenderer.prototype.setAvoidance, 'function');
console.log('PASS displayed offsets, hit testing, pin/drag/release, disabling, invalid settings');
