import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import * as C from 'cesium';
import { DEFAULT_CALLOUT_STYLE, DEFAULT_TEXT_RENDERING, WorkerCalloutHandle } from '../packages/cesium-screen-callout/dist/index.js';

// Real manager and Worker sources; only browser/GPU boundaries are replaced.
async function load(path, globals) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, console, performance, queueMicrotask, Float32Array, Float64Array, Uint8Array, ArrayBuffer, ...globals });
  return exports;
}
const validation = await load('../packages/cesium-screen-callout/src/validation.ts', { require: () => C });
const display = await load('../packages/cesium-screen-callout/src/display.ts', { require: () => ({ DEFAULT_CALLOUT_STYLE }) });
const avoidance = await load('../packages/cesium-screen-callout/src/avoidance.ts', {});
const interactionHost = await load('../packages/cesium-screen-callout/src/interactionHost.ts', {});
let workerFailure = false;
const workers = [], renderers = [];
class Worker {
  messages = [];
  terminated = false;
  constructor() {
    if (workerFailure) throw new Error('worker construction failed');
    workers.push(this);
  }
  postMessage(data, transfers = []) {
    if (this.throwOnSend) throw new Error('postMessage failed');
    this.messages.push(structuredClone(data, { transfer: transfers }));
  }
  terminate() { this.terminated = true; }
}
class Renderer {
  visibleCount = 0;
  destroyed = false;
  avoidanceGroups = { detailed: avoidance.normalizeAvoidance(false), compact: avoidance.normalizeAvoidance(false) };
  constructor(_scene, _count, frame) { this.frame = frame; renderers.push(this); }
  setTextRendering() {}
  getTextRendering() { return DEFAULT_TEXT_RENDERING; }
  getAvoidance(mode = 'detailed') { display.validateDisplayMode(mode); return { ...this.avoidanceGroups[mode] }; }
  setAvoidance(options, mode) {
    if (mode !== undefined) display.validateDisplayMode(mode);
    const updates = (mode ? [mode] : ['detailed', 'compact']).map(name => [name, avoidance.normalizeAvoidance(options, this.avoidanceGroups[name])]);
    for (const [name, next] of updates) this.avoidanceGroups[name] = next;
  }
  update(result, _enabled, displayModes) {
    if (this.throwOnUpload) throw new Error('GPU upload failed');
    this.last = result;
    if (!result.unchanged) this.pending = { ...result, displayModes };
    result.atlas?.close();
  }
  draw() {
    if (!this.pending) return;
    const frame = this.frame();
    frame.displayModes = this.pending.displayModes;
    frame.actionRects = this.pending.actionRects;
    this.pending.sizes.forEach((value, i) => { frame.bounds[Math.floor(i / 2) * 5 + 2 + i % 2] = value; });
    this.pending = undefined;
  }
  destroy() { this.destroyed = true; }
}
const { TargetCalloutManager } = await load('../packages/cesium-screen-callout/src/TargetCalloutManager.ts', {
  require: name => {
    if (name === 'cesium') return C;
    if (name.includes('layout.worker')) return { __esModule: true, default: Worker };
    if (name === './validation') return validation;
    if (name === './display') return display;
    if (name === './avoidance') return avoidance;
    if (name === './interactionHost') return interactionHost;
    if (name === './workerHandle') return { WorkerCalloutHandle };
    if (name === './screenBatchRenderer') return { ScreenBatchRenderer: Renderer, DEFAULT_TEXT_RENDERING };
    return { DEFAULT_CALLOUT_STYLE };
  },
});
function create(extra = {}) {
  const scene = { renders: 0, listeners: 0, isDestroyed: () => false, requestRender() { this.renders++; },
    postRender: { addEventListener() { scene.listeners++; return () => { scene.listeners--; }; } } };
  const manager = new TargetCalloutManager({
    scene, draggable: false, hoverActions: false,
    targets: [
      { id: 'flight-A', position: new C.Cartesian3(1, 2, 3), lines: ['A'] },
      { id: 'flight-B', position: new C.Cartesian3(4, 5, 6), lines: ['B'] },
    ],
    ...extra,
  });
  return { manager, scene, worker: workers.at(-1), renderer: renderers.at(-1) };
}
function respond(worker, extra = {}) {
  const request = worker.messages.at(-1);
  worker.onmessage({ data: {
    id: request.id, positions: new Float64Array([1, 2, 3, 4, 5, 6]),
    enabled: new Uint8Array([1, 1]), instances: new Float32Array(16),
    sizes: new Float32Array([30, 20, 30, 20]), count: 1, computeMs: 1, layoutMs: 1,
    ...extra,
  } });
}
const tick = () => new Promise(resolve => queueMicrotask(resolve));

{
  const { manager, worker, scene } = create();
  assert.equal(manager.getById('flight-B'), manager.get(1));
  assert.equal(manager.get(0).getProperties().id, 'flight-A');
  manager.updateTargets({ lines: [{ index: 0, text: ['first'] }] });
  const text = ['second'];
  manager.updateTargets({ lines: [{ index: 1, text }] });
  text[0] = 'mutated';
  const flushed = manager.flush();
  await tick();
  assert.deepEqual(worker.messages.at(-1).lines, [{ index: 0, text: ['first'] }, { index: 1, text: ['second'] }]);
  manager.updateTargets({ lines: [{ index: 0, text: ['old'] }] });
  manager.updateTargets({ lines: [{ index: 1, text: ['preserved'] }] });
  manager.updateTargets({ lines: [{ index: 0, text: ['latest'] }] });
  const sent = worker.messages.length;
  await tick();
  assert.equal(worker.messages.length, sent, 'one request in flight');
  respond(worker);
  await manager.ready;
  await tick();
  assert.deepEqual(worker.messages.at(-1).lines, [{ index: 0, text: ['latest'] }, { index: 1, text: ['preserved'] }]);
  respond(worker);
  await flushed;
  const before = worker.messages.length, renders = scene.renders;
  manager.get(0).setOffset(new C.Cartesian2(20, -30));
  manager.get(0).setMaxOffsetDistance(60);
  manager.get(0).setStyle(manager.get(0).getStyle());
  await tick();
  await manager.flush();
  assert.equal(worker.messages.length, before, 'offset/limit/identical style needs no Worker message');
  assert.ok(scene.renders > renders, 'screen changes request rendering');
  manager.destroy();
  assert.equal(scene.listeners, 0);
  assert.throws(() => manager.get(0).setLines(['after destroy']), /已销毁/);
}
console.log('PASS merged sparse updates, latest value, snapshots, one in-flight request, IDs, flush, screen-only changes');

{
  const { manager, worker } = create({ avoidance: true });
  await tick(); respond(worker, { displayModes: new Uint8Array([0, 1]) }); await manager.ready;
  manager.renderer.draw();
  const a = manager.get(0), b = manager.get(1);
  manager.frame.bounds.set([100, 200, 50, 20, 1, 200, 200, 50, 20, 1]);
  a.setScreenFixed(true);
  a.applyAvoidanceOffset(120, -30);
  b.applyAvoidanceOffset(-10, -70);
  const before = worker.messages.length;
  const preferredB = b.getPreferredOffset();
  assert.throws(() => manager.setAvoidance({ enabled: false, gap: NaN }), /间距|有限|gap/);
  assert.throws(() => manager.setAvoidance(false, 'invalid'), /模式/);
  assert.equal(a.getPreferredOffset().x, 80, 'rejected settings must not commit displayed offsets');
  manager.setAvoidance(false, 'detailed');
  assert.deepEqual(a.getPreferredOffset(), new C.Cartesian2(120, -30));
  assert.deepEqual(b.getPreferredOffset(), preferredB, 'only the disabled mode saves its displayed position');
  assert.equal(manager.getAvoidance('compact').enabled, true);
  a.resolveScreenOffset(100, 200);
  assert.deepEqual(a.getOffset(), new C.Cartesian2(120, -30), 'screen-fixed position survives the next projection');
  manager.setAvoidance(false, 'detailed');
  assert.deepEqual(a.getPreferredOffset(), new C.Cartesian2(120, -30), 'repeated disable is idempotent');
  manager.setAvoidance({ enabled: false }, 'compact');
  b.resolveScreenOffset(200, 200);
  assert.deepEqual(b.getOffset(), new C.Cartesian2(-10, -70));
  await tick(); await manager.flush();
  assert.equal(worker.messages.length, before, 'preserving positions needs no Worker message');
  manager.destroy();
}
{
  const { manager, worker } = create({ avoidance: true, preservePositionOnAvoidanceDisable: false });
  await tick(); respond(worker); await manager.ready;
  const a = manager.get(0), original = a.getPreferredOffset();
  a.applyAvoidanceOffset(140, 20);
  manager.setAvoidance(false);
  a.resolveScreenOffset(100, 200);
  assert.deepEqual(a.getOffset(), original, 'explicit false retains the old restore behavior');
  manager.destroy();
}
{
  const { manager, worker } = create({ avoidance: true });
  await tick(); respond(worker); await manager.ready;
  const a = manager.get(0);
  a.applyAvoidanceOffset(140, 20);
  a.setDisplayMode('compact');
  manager.setAvoidance(false, 'detailed');
  assert.deepEqual(a.getPreferredOffset(), new C.Cartesian2(140, 20), 'pending mode changes preserve the currently uploaded placement');
  manager.destroy();
}
assert.throws(() => create({ preservePositionOnAvoidanceDisable: 'yes' }), /布尔/);
assert.throws(() => create({ map: {} }), /scene 或 map/);
assert.throws(() => create({ scene: undefined }), /scene 或 map/);
console.log('PASS disabling avoidance preserves displayed positions by default, per-mode isolation, pinning, pending modes and opt-out');

{
  const { manager, worker } = create();
  assert.throws(() => manager.updateTargets({ lines: [{ index: .5, text: [] }] }), /索引/);
  assert.throws(() => manager.updateTargets({ positions: new Float64Array([NaN, 0, 0, 0, 0, 0]) }), /有限数/);
  assert.throws(() => manager.get(0).setStyle({ fontSize: NaN }), /8–48/);
  assert.throws(() => manager.get(0).setStyle({ textColor: 'not-a-color' }), /颜色/);
  assert.throws(() => manager.get(0).setPosition(new C.Cartesian3(Infinity, 0, 0)), /有限数/);
  assert.throws(() => manager.get(0).setLines([4]), /字符串/);
  assert.throws(() => manager.get(0).setDistance(-1), /非负/);
  assert.equal(manager.get(0).getStyle().fontSize, 14);
  const positions = new Float64Array([7, 8, 9, 4, 5, 6]);
  manager.updateTargets({ positions });
  positions[0] = 99;
  await tick();
  assert.equal(worker.messages.at(-1).positions[0], 7);
  respond(worker);
  await manager.ready;
  manager.updateTargets({ positions }, true);
  await tick();
  assert.equal(positions.byteLength, 0, 'explicit transfer hands over the buffer');
  respond(worker);
  manager.destroy();
}
assert.throws(() => create({ targets: [
  { id: 'same', position: C.Cartesian3.ZERO }, { id: 'same', position: C.Cartesian3.ZERO },
] }), /重复/);
console.log('PASS atomic validation, copied/transferable buffers, duplicate IDs');

for (const kind of ['worker', 'decode', 'send', 'upload', 'destroy']) {
  const { manager, worker, scene, renderer } = create();
  const readyCheck = assert.rejects(manager.ready);
  const flushCheck = assert.rejects(manager.flush());
  if (kind === 'send') worker.throwOnSend = true;
  await tick();
  if (kind === 'worker') worker.onerror({ message: 'crash' });
  if (kind === 'decode') worker.onmessageerror({});
  if (kind === 'upload') {
    renderer.throwOnUpload = true;
    let closed = 0;
    respond(worker, { atlas: { close() { closed++; } } });
    assert.equal(closed, 1);
  }
  if (kind === 'destroy') manager.destroy();
  await Promise.all([readyCheck, flushCheck]);
  assert.equal(manager.isDestroyed(), true);
  assert.equal(worker.terminated, true);
  assert.equal(renderer.destroyed, true);
  assert.equal(scene.listeners, 0);
  manager.destroy();
}
workerFailure = true;
assert.throws(() => create(), /construction failed/);
assert.equal(renderers.at(-1).destroyed, true, 'constructor failure releases existing GPU renderer');
workerFailure = false;
{
  let reported = 0;
  const { manager, worker } = create({ onStats() { throw new Error('consumer callback failed'); }, onError() { reported++; } });
  await tick();
  respond(worker);
  await manager.ready;
  await manager.flush();
  assert.equal(reported, 1);
  assert.equal(manager.isDestroyed(), false);
  manager.destroy();
}
console.log('PASS Worker/message/GPU/constructor failures, disposal, callback isolation');

let response, builtLines;
const self = { postMessage(data) { response = data; } };
await load('../packages/cesium-screen-callout/src/layout.worker.ts', {
  self,
  require: () => ({ GlyphBatchBuilder: class {
    async build(items) {
      builtLines = items.map(item => [...item.lines]);
      return { instances: new Float32Array(16), sizes: new Float32Array([30, 20]), count: 1 };
    }
  } }),
});
await self.onmessage({ data: { type: 'init', targets: [
  { position: [1, 2, 3], lines: ['source'], style: DEFAULT_CALLOUT_STYLE, show: true },
] } });
async function step(extra) {
  await self.onmessage({ data: { type: 'layout', patches: [], instances: new Float32Array(16), ...extra } });
  assert.equal(response.error, undefined);
}
await step({ patches: [{ index: 0, position: [10, 20, 30], lines: ['override'] }] });
await step({ positions: new Float64Array([7, 8, 9]), lines: [{ index: 0, text: ['latest source'] }] });
assert.deepEqual([...response.positions], [10, 20, 30]);
assert.equal(builtLines[0][0], 'override');
await step({ patches: [{ index: 0, position: null, lines: null }] });
assert.deepEqual([...response.positions], [7, 8, 9]);
assert.equal(builtLines[0][0], 'latest source');
console.log('PASS resetOverrides restores latest source position and text without another source update');
