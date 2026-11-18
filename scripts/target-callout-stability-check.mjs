import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../packages/cesium-screen-callout/src/avoidance.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { CalloutAvoidanceLayout, normalizeAvoidance } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const options = normalizeAvoidance(true);
const item = (index, overrides = {}) => ({
  index, visible: true, preferredLeft: 500, preferredTop: 300,
  anchorX: 550, anchorY: 350, width: 100, height: 50, maxDistance: Infinity,
  dragging: false, priority: 0, left: 0, top: 0, ...overrides,
});
const translate = (b, dx, dy) => {
  b.anchorX += dx; b.anchorY += dy; b.preferredLeft += dx; b.preferredTop += dy;
};

// Camera translation must not restart an impossible dense packing problem.
// Check relative positions, not a broad 12px/frame speed limit.
for (const count of [12, 100]) {
  const layout = new CalloutAvoidanceLayout();
  const labels = Array.from({length: count}, (_, index) => item(index, {width: 200, height: 140}));
  layout.layout(labels, 1600, 900, options);
  const offsets = labels.map(b => [b.left - b.preferredLeft, b.top - b.preferredTop]);
  let work = 0;
  for (let frame = 0; frame < 120; frame++) {
    for (const b of labels) translate(b, .1, -.05);
    work += layout.layout(labels, 1600, 900, options).candidateChecks;
    labels.forEach((b, i) => assert.ok(Math.hypot(
      b.left - b.preferredLeft - offsets[i][0], b.top - b.preferredTop - offsets[i][1],
    ) < 1e-6, `${count} labels: rigid translation changed layout on frame ${frame}, label ${i}`));
  }
  assert.equal(work, 0, 'rigid translation reuses placement');
}
console.log('PASS 120-frame sparse/dense rigid camera translation without layout drift');

{
  const layout = new CalloutAvoidanceLayout();
  const labels = [item(0, { preferredLeft: 200, preferredTop: 150 }), item(1, { preferredLeft: 200, preferredTop: 150 })];
  layout.layout(labels, 500, 400, options);
  const offsets = labels.map(b => [b.left - b.preferredLeft, b.top - b.preferredTop]);
  assert.ok(offsets.some(([x, y]) => Math.hypot(x, y) > 1), 'fixture begins with a real resolved avoidance offset');
  for (const [dx, dy, width, height] of [
    [400, 0, 500, 400], [-900, -500, 500, 400], [0, 0, 180, 90],
    [600, 450, 300, 200], [0, 0, 1000, 800], [-100, 50, 500, 400],
  ]) {
    for (const b of labels) translate(b, dx, dy);
    layout.layout(labels, width, height, options);
    labels.forEach((b, i) => assert.ok(Math.hypot(
      b.left - b.preferredLeft - offsets[i][0], b.top - b.preferredTop - offsets[i][1],
    ) < 1e-6, 'natural boundary exit/re-entry and viewport resize must retain each resolved offset'));
  }
  labels[1].visible = false;
  layout.layout(labels, 80, 60, options);
  assert.ok(Math.hypot(labels[0].left - labels[0].preferredLeft - offsets[0][0],
    labels[0].top - labels[0].preferredTop - offsets[0][1]) < 1e-6,
  'another target becoming hidden does not pull an uncollided label back into the viewport');
}
console.log('PASS resolved labels keep offsets through camera exits, re-entry, viewport resize and visibility changes');

{
  const layout = new CalloutAvoidanceLayout();
  const labels = [item(0, { preferredLeft: 200, preferredTop: 150 }), item(1, { preferredLeft: 600, preferredTop: 150 })];
  const settings = normalizeAvoidance({ enabled: true, maxDisplacement: Infinity, distanceWeight: 0 });
  layout.layout(labels, 1000, 600, settings);
  translate(labels[1], -400, 0);
  const result = layout.layout(labels, 1000, 600, settings);
  const overlapWidth = Math.min(labels[0].left + labels[0].width, labels[1].left + labels[1].width) - Math.max(labels[0].left, labels[1].left);
  const overlapHeight = Math.min(labels[0].top + labels[0].height, labels[1].top + labels[1].height) - Math.max(labels[0].top, labels[1].top);
  assert.equal(result.unresolved, 0);
  assert.ok(overlapWidth <= .01 || overlapHeight <= .01, 'new collision must be resolved in the first solve');
  assert.ok(labels.some(b => Math.hypot(b.left - b.preferredLeft, b.top - b.preferredTop) > 13),
    'large corrections are applied directly, without a small per-frame step limit');
  const settled = labels.map(b => [b.left, b.top]);
  for (let frame = 0; frame < 60; frame++) {
    assert.equal(layout.layout(labels, 1000, 600, settings).candidateChecks, 0);
    assert.deepEqual(labels.map(b => [b.left, b.top]), settled, 'finished repair must not animate or creep in later frames');
  }
}
console.log('PASS collision correction lands immediately and remains identical for the next 60 frames');

{
  const layout = new CalloutAvoidanceLayout();
  const labels = [item(0, { preferredLeft: 300, preferredTop: 200, width: 100, height: 100, priority: 2 }),
    item(1, { preferredLeft: 600, preferredTop: 200, width: 100, height: 100, priority: 3 })];
  layout.layout(labels, 1000, 800, options);
  translate(labels[1], -300, 0);
  assert.equal(layout.layout(labels, 1000, 800, options).unresolved, 0,
    'a newly formed collision between previously dragged labels must not enter the settled cache unresolved');
  const offsets = labels.map(b => [b.left - b.preferredLeft, b.top - b.preferredTop]);
  for (let frame = 0; frame < 30; frame++) {
    for (const b of labels) translate(b, .2, -.1);
    assert.equal(layout.layout(labels, 1000, 800, options).unresolved, 0, 'camera motion must not cache an avoidable overlap indefinitely');
    labels.forEach((b, i) => assert.ok(Math.hypot(b.left - b.preferredLeft - offsets[i][0], b.top - b.preferredTop - offsets[i][1]) < 1e-6));
  }
  translate(labels[1], labels[0].left - labels[1].left, labels[0].top - labels[1].top);
  assert.equal(layout.layout(labels, 1000, 800, options).unresolved, 0,
    'a new contact invalidates a previously successful cached placement');
}
console.log('PASS previously dragged labels resolve new contacts before caching and reflow again when contacts change');

{
  // Over-capacity scenes take the occupancy fallback instead of the ordinary
  // pair solver. Existing labels must also land directly when its repair runs.
  const layout = new CalloutAvoidanceLayout();
  const settings = normalizeAvoidance({ enabled: true, maxDisplacement: 160, distanceWeight: 0 });
  const labels = Array.from({ length: 80 }, (_, index) => item(index, {
    preferredLeft: 400, preferredTop: 260, anchorX: 450, anchorY: 300, width: 200, height: 140,
  }));
  layout.layout(labels, 1200, 800, settings);
  const before = labels.map(b => [b.left, b.top]);
  translate(labels[0], 60, 0);
  const stats = layout.layout(labels, 1200, 800, settings);
  assert.ok(stats.unresolved > 0 && stats.candidateChecks > 0, 'fixture exercises an infeasible dense repair');
  assert.ok(labels.some((b, i) => Math.hypot(b.left - before[i][0] - (i === 0 ? 60 : 0), b.top - before[i][1]) > 13),
    'dense fallback applies its final candidate without the former 12px per-frame cap');
  const settled = labels.map(b => [b.left, b.top]);
  for (let frame = 0; frame < 20; frame++) {
    assert.equal(layout.layout(labels, 1200, 800, settings).candidateChecks, 0);
    assert.deepEqual(labels.map(b => [b.left, b.top]), settled, 'dense repair cannot creep on later identical frames');
  }
}
console.log('PASS saturated collision repair also lands directly without the old per-frame displacement cap');

{
  const layout = new CalloutAvoidanceLayout();
  const labels = [item(0, {preferredLeft: -500}), item(1, {preferredLeft: -500})];
  const result = layout.layout(labels, 800, 600, normalizeAvoidance({enabled: true, maxDisplacement: 0}));
  assert.equal(result.unresolved, 2, 'offscreen rectangles still participate in exact conflict accounting');
}
console.log('PASS offscreen broad phase has no missing rectangles');

{
  const layout = new CalloutAvoidanceLayout();
  const labels = Array.from({length: 100}, (_, index) => item(index, {width: 200, height: 140}));
  layout.layout(labels, 1600, 900, options);
  const offsets = labels.map(b => [b.left - b.preferredLeft, b.top - b.preferredTop]);
  for (let frame = 0; frame < 120; frame++) {
    labels.forEach((b, i) => {
      const dx = Math.sin(frame * .4 + i) * .2, dy = Math.cos(frame * .4 + i) * .2;
      b.preferredLeft = 500 + dx; b.preferredTop = 300 + dy;
      b.anchorX = 550 + dx; b.anchorY = 350 + dy;
    });
    layout.layout(labels, 1600, 900, options);
    labels.forEach((b, i) => assert.ok(Math.hypot(
      b.left - b.preferredLeft - offsets[i][0], b.top - b.preferredTop - offsets[i][1],
    ) < 1e-6, 'subpixel input noise must not reshuffle a saturated layout'));
  }
}
console.log('PASS saturated placement resists independent subpixel motion');

{
  const layout = new CalloutAvoidanceLayout();
  const drag = item(0, {preferredLeft: 200, preferredTop: 180, dragging: true});
  const neighbor = item(1, {preferredLeft: 200, preferredTop: 180});
  layout.layout([drag, neighbor], 1000, 700, options);
  let before = [neighbor.left, neighbor.top];
  for (let frame = 0; frame < 120; frame++) {
    drag.preferredLeft = frame % 2 ? 305.8 : 306.2;
    assert.equal(layout.layout([drag, neighbor], 1000, 700, options).candidateChecks, 0);
    assert.equal(drag.left, drag.preferredLeft, 'pointer position remains exact');
    assert.deepEqual([neighbor.left, neighbor.top], before,
      'neighbor stays completely still throughout an active drag');
    before = [neighbor.left, neighbor.top];
  }
}
console.log('PASS 120-frame drag deferral has zero neighbor movement and zero candidate work');

{
  const layout = new CalloutAvoidanceLayout();
  const a = item(0, {preferredLeft: 200}), b = item(1, {preferredLeft: 400});
  layout.layout([a, b], 1000, 700, options);
  let moved = false;
  for (let frame = 0; frame < 400; frame++) {
    translate(b, -.25, 0);
    layout.layout([a, b], 1000, 700, options);
    moved ||= Math.hypot(b.left - b.preferredLeft, b.top - b.preferredTop) > .01
      || Math.hypot(a.left - a.preferredLeft, a.top - a.preferredTop) > .01;
    const w = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left);
    const h = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top);
    assert.ok(w <= .01 || h <= .01, 'slow movement must still trigger collision handling');
  }
  assert.ok(moved, 'deadband cannot freeze slow accumulating motion forever');
}
console.log('PASS accumulated slow motion triggers reflow before physical collision');

{
  let seed = 718;
  const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let n = 0; n < 1000; n++) {
    const b = item(0, {
      preferredLeft: random() * 1000 - 300, preferredTop: random() * 900 - 300,
      anchorX: random() * 500, anchorY: random() * 400,
      width: random() * 400 + 30, height: random() * 200 + 20, maxDistance: random() * 300,
    });
    const local = random() * 150, layout = new CalloutAvoidanceLayout();
    const settings = normalizeAvoidance({enabled: true, maxDisplacement: local});
    layout.layout([b], 500, 400, settings);
    const placed = [b.left, b.top];
    const dx = b.preferredLeft + b.width / 2 - b.anchorX;
    const dy = b.preferredTop + b.height / 2 - b.anchorY;
    const scale = Math.min(1, b.maxDistance / Math.hypot(dx, dy));
    const home = [b.anchorX - b.width / 2 + dx * scale, b.anchorY - b.height / 2 + dy * scale];
    for (let repeat = 0; repeat < 4; repeat++) {
      b.priority = repeat % 2; // Invalidate cache without changing geometry.
      layout.layout([b], 500, 400, settings);
      assert.ok(Number.isFinite(b.left) && Number.isFinite(b.top));
      assert.ok(Math.hypot(b.left - placed[0], b.top - placed[1]) < 1e-5,
        `projection must be idempotent; fixture ${n}`);
      assert.ok(Math.hypot(b.left + b.width / 2 - b.anchorX, b.top + b.height / 2 - b.anchorY) <= b.maxDistance + 1e-5);
      assert.ok(Math.hypot(b.left - home[0], b.top - home[1]) <= local + 1e-5);
    }
  }
}
console.log('PASS 1000 constraint intersections: finite, idempotent and within both radii');
