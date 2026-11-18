import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import * as C from 'cesium';
import { DEFAULT_CALLOUT_STYLE, GlyphBatchBuilder, ScreenBatchRenderer, WorkerCalloutHandle } from '../packages/cesium-screen-callout/dist/index.js';

// Deterministic Canvas double: verifies geometry/cache behavior, not browser font quality.
let reads = 0;
const rasterFonts = new Set();
class Canvas {
  getContext() {
    return {
      clearRect() {}, fillRect() {}, fillText() { rasterFonts.add(this.font); }, putImageData() {},
      measureText() {
        return { actualBoundingBoxLeft: 0, actualBoundingBoxRight: 8,
          actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2, width: 9 };
      },
      getImageData(x, y, width, height) {
        reads++;
        if (width === 1 && height === 1) {
          const rgba = C.Color.fromCssColorString(this.fillStyle)?.toBytes() ?? [255, 255, 255, 255];
          return { width, height, data: new Uint8ClampedArray(rgba) };
        }
        return { width, height, data: new Uint8ClampedArray(width * height * 4).fill(255) };
      },
    };
  }
}
globalThis.OffscreenCanvas = Canvas;
globalThis.createImageBitmap = async () => ({ close() {} });
const items = Array.from({ length: 1000 }, (_, index) => ({
  style: { ...DEFAULT_CALLOUT_STYLE }, x: 0, y: 0,
  lines: [`目标 ${index}`, '平台 A / 红', '经度 110.00', '高度 1800', '速度 140', '时间 1.0 😀'],
}));
const builder = new GlyphBatchBuilder();
const initial = await builder.build(items);
assert.equal(initial.leaderCount, 1000);
for (let i = 0; i < initial.count; i++) {
  assert.equal(initial.instances[i * 16 + 1] === 1, i < initial.leaderCount,
    'leaders must occupy one contiguous range, panels the other');
}
const initialReads = reads;
const repeated = await builder.build(items);
assert.equal(reads, initialReads, 'Unchanged text must not read Canvas pixels again');
assert.equal(repeated.atlas, undefined);
assert.deepEqual(repeated.instances, initial.instances);

for (const item of items) {
  item.lines[5] = '时间 1.1 😀';
  item.style = { ...item.style, fontSize: 20, fontWeight: 700 };
}
const changed = await builder.build(items);
const reference = await new GlyphBatchBuilder().build(items);
assert.equal(changed.count, reference.count);
assert.deepEqual(changed.sizes, reference.sizes);
// UV packing may differ between warm and fresh caches; all other geometry must match.
for (let i = 0; i < changed.count * 16; i++) {
  if (i % 16 < 8 || i % 16 >= 12) assert.equal(changed.instances[i], reference.instances[i]);
}
const started = performance.now();
for (let i = 0; i < 30; i++) await builder.build(items, changed.instances);
console.log(`Warm layout, 1000 targets: ${((performance.now() - started) / 30).toFixed(2)} ms/build (mock Canvas)`);

{
  const bodyStyle = { ...DEFAULT_CALLOUT_STYLE, fontSize: 12, lineGap: 3, paddingTop: 5, paddingBottom: 7,
    paddingLeft: 6, paddingRight: 8, backgroundColor: '#102030', badgeColor: '#00ff00', badgeTextColor: '#ffffff' };
  const titleStyle = { ...DEFAULT_CALLOUT_STYLE, fontSize: 24, fontFamily: 'serif', fontStyle: 'italic', fontWeight: 700,
    paddingTop: 2, paddingBottom: 3, paddingLeft: 4, paddingRight: 5,
    backgroundColor: '#405060', badgeColor: '#ff0000', badgeTextColor: '#ffffff' };
  const target = { x: 0, y: 0, style: bodyStyle, titleStyle, lines: ['body', 'data'],
    title: 'title', badgeText: 'B', displayMode: 'detailed' };
  const decoratedBuilder = new GlyphBatchBuilder();
  const batch = await decoratedBuilder.build([target]);
  assert.deepEqual([...batch.sizes], [98, 76], 'detailed dimensions combine independent title and body line boxes');
  assert.deepEqual([...batch.actionRects], [55, 8, 36, 16], 'toolbar bounds reserve their own space beside the title');
  assert.equal(batch.count, 24, 'both backgrounds, outer borders without a title divider, badge, leader and all glyphs are emitted');
  assert.ok(batch.instances.length >= batch.count * 16, 'multi-region geometry cannot overflow its reusable instance allocation');
  assert.ok(rasterFonts.has('italic 700 64px serif') && rasterFonts.has('normal 700 64px sans-serif'),
    'title typography and fixed badge typography use separate glyph runs');
  const rectangles = batch => Array.from({ length: batch.count }, (_, i) => [...batch.instances.slice(i * 16, i * 16 + 16)])
    .filter(instance => instance[1] === 0);
  const badge = rectangles(batch).find(instance => instance[4] === 20 && instance[7] === 20);
  assert.deepEqual(badge.slice(2, 4), [6, 6]);
  assert.deepEqual(badge.slice(12), [1, 0, 0, 1], 'detailed badge takes the title affiliation color');
  const priorReads = reads;
  const repeat = await decoratedBuilder.build([target], batch.instances);
  assert.equal(reads, priorReads); assert.equal(repeat.atlas, undefined);
  assert.deepEqual(repeat.instances, batch.instances);
  target.titleStyle = { ...titleStyle, fontSize: 30 };
  const resizedTitle = await decoratedBuilder.build([target], repeat.instances);
  assert.deepEqual([...resizedTitle.sizes], [103, 82]);
  assert.equal(target.style.fontSize, 12, 'title sizing does not change body typography');
  assert.equal(reads, priorReads, 'changing title font size only scales the existing atlas glyphs');
  target.badgeText = 'C';
  const badgeChanged = await decoratedBuilder.build([target], resizedTitle.instances);
  assert.ok(badgeChanged.atlas, 'a new badge letter reaches the glyph atlas');
  target.displayMode = 'compact'; target.lines = ['body'];
  const compact = await decoratedBuilder.build([target], badgeChanged.instances);
  assert.deepEqual([...compact.sizes], [51, 36], 'compact is one body row plus an inline square badge');
  assert.deepEqual([...compact.actionRects], [0, 0, 0, 0], 'compact geometry has no toolbar rectangle');
  const compactBadge = rectangles(compact).find(instance => instance[4] === 20 && instance[7] === 20);
  assert.deepEqual(compactBadge.slice(12), [0, 1, 0, 1], 'compact badge takes the compact/body affiliation color');
  target.displayMode = 'detailed'; target.title = ''; target.titleStyle = titleStyle;
  const emptyTitle = await decoratedBuilder.build([target], compact.instances);
  assert.deepEqual([...emptyTitle.sizes], [81, 61], 'an explicitly empty title still reserves its title row and controls');
  assert.ok(emptyTitle.actionRects[2] > 0);
}
console.log('PASS title/body/badge font runs, independent regions, compact geometry, action rectangles and reusable capacity');

// Exercise the real Worker handler with a spy for expensive text layout.
let builds = 0;
let response, builtItems, transfer;
const self = { postMessage(value, options) { response = value; transfer = options?.transfer; } };
const source = await readFile(new URL('../packages/cesium-screen-callout/src/layout.worker.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
vm.runInNewContext(compiled, {
  exports: {}, self, performance, Float32Array, Float64Array, Uint8Array,
  require: () => ({ GlyphBatchBuilder: class {
    async build(items) {
      builds++;
      builtItems = structuredClone(items);
      return { count: 1, instances: new Float32Array(16), sizes: new Float32Array([20, 20]), actionRects: new Float32Array([1, 2, 36, 16]) };
    }
  } }),
});
await self.onmessage({ data: { type: 'init', targets: [{ position: [0, 0, 0], lines: ['A'], style: DEFAULT_CALLOUT_STYLE, show: true }] } });
async function step(extra = {}) {
  await self.onmessage({ data: { type: 'layout', patches: [], instances: new Float32Array(16), ...extra } });
}
await step();
assert.equal(builds, 1);
await step({ positions: new Float64Array([1, 2, 3]), lines: [{ index: 0, text: ['A'] }] });
assert.equal(builds, 1);
assert.equal(response.unchanged, true);
assert.deepEqual([...response.positions], [1, 2, 3]);
await step({ patches: [{ index: 0, show: false }] });
assert.equal(builds, 1);
assert.equal(response.enabled[0], 0);
await step({ patches: [{ index: 0, style: { ...DEFAULT_CALLOUT_STYLE, fontSize: 20 } }] });
assert.equal(builds, 2);
await step({ lines: [{ index: 0, text: ['B'] }] });
assert.equal(builds, 3);
await step({ patches: [{ index: 0, title: 'TITLE', badgeText: 'B', titleStyle: { ...DEFAULT_CALLOUT_STYLE, fontSize: 20 } }] });
assert.equal(builds, 4);
assert.equal(builtItems[0].title, 'TITLE'); assert.equal(builtItems[0].badgeText, 'B');
assert.ok(transfer.includes(response.actionRects.buffer), 'toolbar bounds transfer with the matching size/geometry batch');
await step({ patches: [{ index: 0, displayMode: 'compact', compactLines: ['compact'] }] });
assert.equal(builds, 5);
await step({ patches: [{ index: 0, title: 'LATEST TITLE', titleStyle: { ...DEFAULT_CALLOUT_STYLE, fontSize: 30 } }] });
assert.equal(builds, 5, 'inactive title metadata updates do not rebuild compact geometry');
assert.equal(response.unchanged, true);
await step({ patches: [{ index: 0, displayMode: 'detailed' }] });
assert.equal(builds, 6);
assert.equal(builtItems[0].title, 'LATEST TITLE'); assert.equal(builtItems[0].titleStyle.fontSize, 30);
await step({ patches: [{ index: 0, badgeText: 'C' }] });
assert.equal(builds, 7, 'badge changes rebuild active geometry');
await step({ positions: new Float64Array([4, 5, 6]) });
assert.equal(builds, 7, 'position-only updates still bypass every text run');
const renderer = { enabled: null };
ScreenBatchRenderer.prototype.update.call(renderer, { unchanged: true }, new Uint8Array([1]));
assert.equal(renderer.enabled[0], 1); // No GPU access needed on this path.
const frame = { positions: new Float64Array([1, 2, 3]), bounds: new Float32Array(5), positionsVersion: 0 };
const projectionRenderer = {
  count: 1, targetCount: 1, viewport: new C.Cartesian2(), vp: new C.Matrix4(),
  matrix: new Array(16), camera: [0, 0, 0], offset: new C.Cartesian2(),
  previousOffset: new C.Cartesian2(), previousPreference: new C.Cartesian2(),
  sizes: new Float32Array([20, 20]), enabled: new Uint8Array([1]), targetData: new Float32Array(8),
  command: { boundingVolume: new C.BoundingSphere() }, targets: { copyFrom() {} },
};
const scene = {
  canvas: { clientWidth: 800, clientHeight: 600 }, mode: C.SceneMode.SCENE3D,
  camera: { frustum: { projectionMatrix: C.Matrix4.IDENTITY }, viewMatrix: C.Matrix4.IDENTITY, positionWC: new C.Cartesian3(1e7, 0, 0) },
};
const handles = [new WorkerCalloutHandle(0, () => frame, () => {})];
const draw = () => ScreenBatchRenderer.prototype.draw.call(projectionRenderer, scene, frame, handles);
draw();
const sphere = projectionRenderer.command.boundingVolume;
assert.equal(sphere.center.x, 1);
frame.positions[0] = 2;
draw();
assert.equal(sphere.center.x, 1, 'explicitly versioned data is reused');
frame.positionsVersion++;
draw();
assert.equal(sphere.center.x, 2);
delete frame.positionsVersion;
frame.positions[0] = 3;
draw();
assert.equal(sphere.center.x, 3, 'legacy frames support in-place array mutation without a version');

// Exercise the real upload/draw split: public hit bounds always describe a
// complete projected frame, including when an unchanged response follows it.
let uploads = 0;
Object.assign(projectionRenderer, { capacity: 64, panelStart: 0, buffer: { copyFromArrayView() { uploads++; } } });
frame.positions.set([6378137, 0, 0]);
scene.camera.viewMatrix = C.Matrix4.fromTranslation(new C.Cartesian3(-6378137, 0, 0));
const upload = (size, actions, mode) => ScreenBatchRenderer.prototype.update.call(projectionRenderer, {
  count: 1, leaderCount: 0, instances: new Float32Array(16), sizes: new Float32Array(size),
  actionRects: new Float32Array(actions),
}, new Uint8Array([1]), new Uint8Array([mode]));
upload([100, 50], [50, 5, 36, 16], 0); draw();
const beforePanel = handles[0].getScreenBounds(), beforeActions = handles[0].getActionBounds();
assert.equal(beforeActions.visible, true);
upload([160, 90], [110, 15, 36, 16], 0);
assert.equal(uploads, 2, 'new geometry has already reached the GPU upload boundary');
assert.deepEqual(handles[0].getScreenBounds(), beforePanel);
assert.deepEqual(handles[0].getActionBounds(), beforeActions, 'new local action coordinates cannot mix with old panel height');
ScreenBatchRenderer.prototype.update.call(projectionRenderer, { unchanged: true }, new Uint8Array([1]), new Uint8Array([0]));
scene.canvas.clientWidth = 0; draw();
assert.deepEqual(handles[0].getActionBounds(), beforeActions, 'a hidden viewport cannot publish an unprojected layout');
scene.canvas.clientWidth = 800; draw();
const afterPanel = handles[0].getScreenBounds(), afterActions = handles[0].getActionBounds();
assert.equal(afterPanel.width, 160); assert.equal(afterPanel.height, 90);
assert.equal(afterActions.left, afterPanel.left + 110); assert.equal(afterActions.top, afterPanel.top + 15);
assert.equal(afterActions.visible, true, 'the pending layout survives a later position-only upload');
const group = () => ({ options: { enabled: true }, items: [], layout: { layout(items) {
  for (const item of items) { item.left = item.preferredLeft; item.top = item.preferredTop; }
  return { unresolved: 0, moved: 0, candidateChecks: 0 };
} } });
projectionRenderer.avoidanceGroups = { detailed: group(), compact: group() };
projectionRenderer.avoidanceItems = [];
handles[0].setDisplayMode('compact');
upload([80, 30], [0, 0, 0, 0], 1);
assert.equal(handles[0].getRenderedDisplayMode(), 'detailed');
assert.deepEqual(handles[0].getActionBounds(), afterActions, 'uploaded mode waits for the matching screen frame');
draw();
assert.equal(handles[0].getRenderedDisplayMode(), 'compact');
assert.equal(handles[0].getScreenBounds().height, 30);
assert.equal(handles[0].getActionBounds().visible, false);
assert.equal(projectionRenderer.avoidanceGroups.detailed.items.length, 0);
assert.equal(projectionRenderer.avoidanceGroups.compact.items.length, 1, 'collision groups use the same mode as projected dimensions');
console.log('PASS GPU upload/draw atomic action bounds, hidden viewport, unchanged updates and collision-mode classification');
console.log('PASS: cached geometry, Unicode, style changes, position-only updates, visibility, GPU upload bypass, versioned/legacy bounds');
