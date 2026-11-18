import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import * as C from 'cesium';
import { DEFAULT_CALLOUT_STYLE, DEFAULT_COMPACT_CALLOUT_STYLE, DEFAULT_TITLE_CALLOUT_STYLE } from '../packages/cesium-screen-callout/dist/index.js';

// 执行真实 TS 源码，仅替换浏览器 Worker、时钟和定时器，不模拟业务逻辑。
async function load(path, globals = {}) {
  const source = (await readFile(new URL(path, import.meta.url), 'utf8'))
    .replaceAll('import.meta.url', JSON.stringify(import.meta.url));
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, URL, ...globals });
  return exports;
}
let failures = 0;
function test(name, run) {
  try { run(); console.log('PASS', name); }
  catch (error) { failures++; console.error('FAIL', name, error.message); }
}
let now = 0;
const timers = new Map(), workers = [];
let timerId = 0;
class Worker {
  messages = [];
  terminated = false;
  constructor() { workers.push(this); }
  postMessage(message) { this.messages.push(message); }
  terminate() { this.terminated = true; }
}
const { TargetSimulationController } = await load('../src/examples/primitive/target-callout/TargetSimulationController.ts', {
  Worker, performance: { now: () => now },
  setTimeout: (fn) => { timers.set(++timerId, fn); return timerId; },
  clearTimeout: (id) => timers.delete(id),
});
for (const failure of ['message', 'event']) {
  test(`Worker ${failure} failure stops timer; restart ignores stale events`, () => {
    timers.clear(); now = 0;
    const errors = [], results = [];
    const controller = new TargetSimulationController({ interval: () => 16, running: () => true,
      onError: error => errors.push(error), onResult: result => results.push(result) });
    try {
      controller.start({});
      const worker = workers.at(-1), stale = worker.onerror;
      if (failure === 'message') worker.onmessage({ data: { id: 1, error: 'failed' } });
      else worker.onerror({ message: 'failed' });
      assert.equal(worker.terminated, true);
      assert.equal(timers.size, 0, 'failed Worker must not leave a timer');
      controller.start({});
      const replacement = workers.at(-1);
      stale({ message: 'late failure' });
      assert.equal(replacement.terminated, false);
      assert.equal(errors.length, 1);
      replacement.onmessage({ data: { id: 1 } });
      assert.equal(results.length, 1);
    } finally { controller.destroy(); }
    assert.equal(timers.size, 0);
  });
}
test('single in-flight request, zero-origin clock, pause and destroy', () => {
  now = 0; let running = true;
  const controller = new TargetSimulationController({ interval: () => 16, running: () => running,
    onError() {}, onResult() {} });
  try {
    controller.start({}); const worker = workers.at(-1);
    now = 16; controller.tick(); assert.equal(worker.messages.length, 2);
    worker.onmessage({ data: { id: 1 } }); controller.tick();
    assert.equal(worker.messages.at(-1).seconds, .016);
    worker.onmessage({ data: { id: 2 } });
    controller.advance(); running = false; now = 1000; controller.tick();
    assert.equal(worker.messages.length, 3);
  } finally { controller.destroy(); }
  assert.equal(timers.size, 0);
  assert.equal(workers.at(-1).terminated, true);
});
const { WorkerCalloutHandle } = await import('../packages/cesium-screen-callout/dist/index.js');
test('limited pinned drag retains displayed release position', () => {
  const frame = { positions: new Float64Array(3), bounds: new Float32Array([100, 200, 100, 40, 1]) };
  const handle = new WorkerCalloutHandle(0, () => frame, () => {});
  handle.setMaxOffsetDistance(80); handle.setScreenFixed(true);
  handle.setDragScreenPosition(new C.Cartesian2(1000, 1000));
  const displayed = C.Cartesian2.clone(handle.resolveScreenOffset(100, 200));
  assert.ok(Math.hypot(displayed.x + 50, displayed.y - 20) <= 80 + 1e-9);
  handle.setDragScreenPosition(undefined);
  handle.setMaxOffsetDistance(Infinity);
  assert.ok(C.Cartesian2.distance(displayed, handle.resolveScreenOffset(100, 200)) < 1e-9);
  handle.setMaxOffsetDistance(0);
  const centered = handle.resolveScreenOffset(100, 200);
  assert.equal(centered.x, -50); assert.equal(centered.y, 20);
});
const { CalloutStyleController } = await load('../src/examples/primitive/target-callout/CalloutStyleController.ts', {
  require: () => ({ DEFAULT_CALLOUT_STYLE, DEFAULT_COMPACT_CALLOUT_STYLE, DEFAULT_TITLE_CALLOUT_STYLE }),
});
test('1000 targets: platform typography and affiliation colors update independently', () => {
  const platforms = Array.from({ length: 11 }, (_, id) => ({ id, typography: { fontSize: 14 } }));
  const affiliations = Array.from({ length: 6 }, (_, id) => ({ id, colors: { textColor: '#fff' } }));
  const classifications = Array.from({ length: 1000 }, (_, index) => ({
    platform: platforms[index % 11], affiliation: affiliations[index % 6],
  }));
  const handles = classifications.map((_, index) => new WorkerCalloutHandle(index, () => ({}), () => {}));
  const controller = new CalloutStyleController(classifications, () => handles);
  controller.restore(handles);
  controller.setTypography(platforms[3], { fontSize: 24, fontWeight: 700, fontStyle: 'italic' });
  controller.setAffiliationColor(affiliations[2], 'textColor', '#f00');
  handles.forEach((handle, index) => {
    const style = handle.getStyle();
    assert.equal(style.fontSize, index % 11 === 3 ? 24 : 14);
    assert.equal(style.textColor, index % 6 === 2 ? '#f00' : '#fff');
    if (index % 11 === 3) {
      assert.equal(style.fontWeight, 700); assert.equal(style.fontStyle, 'italic');
    }
  });
});
test('title and compact classification edits and restores preserve all three style sections', () => {
  const detailed = [
    { platform: { id: 'air', typography: { fontSize: 20 } }, affiliation: { id: 'friend', colors: { textColor: '#00ff00' } } },
    { platform: { id: 'sea', typography: { fontSize: 18 } }, affiliation: { id: 'other', colors: { textColor: '#ff0000' } } },
  ];
  const compact = detailed.map(item => ({
    platform: { id: item.platform.id, typography: { fontSize: 12 } },
    affiliation: { id: item.affiliation.id, colors: { textColor: '#ffffff' } },
  }));
  const title = detailed.map(item => ({
    platform: { id: item.platform.id, typography: { fontSize: 16 } },
    affiliation: { id: item.affiliation.id, colors: { textColor: '#ffff00', badgeColor: '#ff0000' } },
  }));
  const handles = detailed.map((_, index) => new WorkerCalloutHandle(index, () => ({}), () => {}));
  const controller = new CalloutStyleController(detailed, () => handles, compact, title);
  controller.restore(handles, 'detailed');
  controller.restore(handles, 'compact');
  controller.restore(handles, 'title');
  handles[0].setBadgeText('C');
  controller.setTypography(title[0].platform, { fontSize: 22 }, 'title');
  controller.setAffiliationColor(title[0].affiliation, 'badgeColor', '#00ffff', 'title');
  controller.setTypography(compact[0].platform, { fontSize: 10 }, 'compact');
  controller.setAffiliationColor(compact[0].affiliation, 'textColor', '#0000ff', 'compact');
  assert.equal(handles[0].getStyle('compact').fontSize, 10);
  assert.equal(handles[0].getStyle('compact').textColor, '#0000ff');
  assert.equal(handles[0].getStyle('detailed').fontSize, 20);
  assert.equal(handles[0].getStyle('detailed').textColor, '#00ff00');
  assert.equal(handles[0].getStyle('title').fontSize, 22);
  assert.equal(handles[0].getStyle('title').badgeColor, '#00ffff');
  assert.equal(handles[1].getStyle('title').fontSize, 16);
  assert.equal(handles[1].getStyle('title').badgeColor, '#ff0000');
  assert.equal(handles[0].getBadgeText(), 'C', 'affiliation style updates preserve each target letter');
  assert.equal(handles[1].getStyle('compact').fontSize, 12);
  assert.equal(detailed[0].platform.typography.fontSize, 20);
  assert.equal(detailed[0].affiliation.colors.textColor, '#00ff00');
  handles[0].setStyle({ fontSize: 35 }, 'compact');
  controller.restore(handles, 'compact');
  assert.equal(handles[0].getStyle('compact').fontSize, 10);
  assert.equal(handles[0].getStyle('detailed').fontSize, 20);
  assert.equal(handles[0].getStyle('title').fontSize, 22);
  handles[0].setStyle({ fontSize: 35 }, 'title');
  controller.restore(handles, 'title');
  assert.equal(handles[0].getStyle('title').fontSize, 22);
  assert.equal(handles[0].getStyle('compact').fontSize, 10);
});
const { compactFieldFormatter } = await load('../src/examples/primitive/target-callout/compactFieldFormatter.ts');
const { simulate } = await load('../src/examples/primitive/target-callout/simulation.ts', {
  performance, Float64Array, Uint8Array,
  require: () => ({ isTargetVisible: () => true }),
});
test('simulation supplies all compact fields in order with value-only unit formatting', () => {
  const frame = C.Transforms.eastNorthUpToFixedFrame(C.Cartesian3.fromDegrees(110, 32, 1800));
  const result = simulate({ count: 2, columns: 2, frame: C.Matrix4.toArray(frame),
    classifications: [{ platform: '无人机', affiliation: '友方' }, { platform: '舰船', affiliation: '中立' }],
  }, { id: 7, seconds: 12.3, viewProjection: [], camera: [] });
  assert.equal(result.fields.length, 2);
  assert.deepEqual(Array.from(result.fields[0].fields, field => field.key),
    ['id', 'status', 'platform', 'affiliation', 'longitude', 'latitude', 'height', 'speed', 'time']);
  const formatted = Array.from(result.fields[0].fields, (field, index) => compactFieldFormatter(field, index, 'A'));
  assert.equal(formatted[0], '001');
  assert.equal(formatted[2], '无人机');
  assert.equal(formatted[3], '友方');
  assert.match(formatted[4], /^-?\d+\.\d{3}°$/);
  assert.match(formatted[6], /^-?\d+m$/);
  assert.match(formatted[7], /^\d+\.\dm\/s$/);
  assert.equal(formatted[8], '12.3s');
  assert.ok(formatted.every(value => !/[\n\r\t]/.test(value)));
  assert.equal(compactFieldFormatter({ key: 'missing', value: null }), '—');
  assert.equal(result.titles[0].title, '目标 001 / TRACKING', 'detailed title is an independent field');
  assert.equal(result.lines[0].text.length, 5, 'detailed body excludes the independent title');
  assert.ok(result.lines[0].text.every(line => !line.includes('TRACKING')), 'title is not repeated in the body');
  assert.ok(result.fields.every(row => row.fields.every(field => typeof field.value !== 'number' || Number.isFinite(field.value))));
});
// Keep the actual hover controller and handles; replace only browser DOM plumbing.
class HoverElement {
  children = [];
  listeners = new Map();
  attributes = new Map();
  style = { display: 'none' };
  capturedPointers = new Set();
  clientWidth = 800;
  clientHeight = 600;
  offsetWidth = 800;
  offsetHeight = 600;
  clientLeft = 0;
  clientTop = 0;
  scrollLeft = 0;
  scrollTop = 0;
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }
  removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
  emit(type, details = {}) {
    const event = { type, target: this, ...details };
    this.listeners.get(type)?.forEach(listener => listener(event));
  }
  setAttribute(name, value) { this.attributes.set(name, value); }
  appendChild(child) { this.children.push(child); child.offsetParent = this; }
  contains(target) { return target === this || this.children.some(child => child.contains(target)); }
  getBoundingClientRect() { return { left: 0, top: 0, width: 800, height: 600 }; }
  setPointerCapture(id) { this.capturedPointers.add(id); }
  hasPointerCapture(id) { return this.capturedPointers.has(id); }
  releasePointerCapture(id) { this.capturedPointers.delete(id); }
  remove() { this.offsetParent.children = this.offsetParent.children.filter(child => child !== this); }
}
const hoverWindow = new HoverElement();
const presentationLayout = await load('../packages/cesium-screen-callout/src/presentationLayout.ts');
const { TargetCalloutHoverController } = await load('../packages/cesium-screen-callout/src/hover.ts', {
  require: path => path === 'cesium' ? C : presentationLayout, console,
  document: { createElement: () => new HoverElement() }, window: hoverWindow,
});
function hoverFixture() {
  const frame = { positions: new Float64Array(3), bounds: new Float32Array([100, 200, 120, 40, 1]),
    displayModes: new Uint8Array(1), actionRects: new Float32Array([78, 6, 36, 16]) };
  const handle = new WorkerCalloutHandle(0, () => frame, () => {});
  handle.setOffset(new C.Cartesian2(0, 0));
  const container = new HoverElement(), canvas = new HoverElement();
  const hover = new TargetCalloutHoverController(container, canvas, () => [handle]);
  const events = [];
  for (const type of ['mouseenter', 'mousemove', 'mouseleave', 'fixedchange', 'close']) hover.on(type, event => events.push(event));
  const move = (target = canvas, x = 110, y = 170) => container.emit('pointermove', { target, clientX: x, clientY: y });
  return { frame, handle, container, canvas, hover, events, move };
}
test('16px circular actions follow the committed title action rectangle and updated panel bounds', () => {
  const { frame, handle, hover, move } = hoverFixture();
  try {
    move();
    assert.equal(hover.element.style.display, 'flex');
    assert.deepEqual(handle.getActionBounds(), { left: 178, top: 166, width: 36, height: 16, visible: true });
    assert.equal(hover.element.style.left, '178px');
    assert.equal(hover.element.style.top, '166px');
    for (const button of hover.element.children) {
      assert.match(button.style.cssText, /(?:^|;)width:16px(?:;|$)/);
      assert.match(button.style.cssText, /(?:^|;)height:16px(?:;|$)/);
      assert.match(button.style.cssText, /(?:^|;)border-radius:50%(?:;|$)/);
    }
    frame.bounds[2] = 160; frame.bounds[3] = 70;
    frame.actionRects.set([118, 20, 36, 16]);
    handle.setOffset(new C.Cartesian2(10, -5));
    hover.update();
    assert.deepEqual(handle.getActionBounds(), { left: 228, top: 145, width: 36, height: 16, visible: true });
    assert.equal(hover.element.style.left, '228px', 'toolbar follows the uploaded action rectangle rather than the old panel corner');
    assert.equal(hover.element.style.top, '145px');
    frame.actionRects.fill(0);
    hover.update();
    assert.equal(hover.element.style.display, 'none', 'a frame without action geometry cannot expose stale buttons');
  } finally { hover.destroy(); }
});
test('only detailed geometry exposes actions; compact retains hover events and rejects stale clicks', () => {
  const { frame, handle, hover, events, move } = hoverFixture();
  try {
    const [pin, close] = hover.element.children;
    move();
    assert.equal(hover.element.style.display, 'flex');
    pin.emit('click');
    assert.equal(handle.isScreenFixed(), true);
    assert.equal(events.filter(event => event.type === 'fixedchange').length, 1);
    handle.setScreenFixed(false);
    handle.setDisplayMode('compact');
    // Clicks already queued before the next frame must not mutate the compact target.
    pin.emit('click'); close.emit('click');
    assert.equal(handle.isScreenFixed(), false);
    assert.equal(handle.getShow(), true);
    assert.equal(hover.element.style.display, 'none');
    assert.equal(events.filter(event => event.type === 'fixedchange').length, 1);
    assert.equal(events.filter(event => event.type === 'close').length, 0);
    frame.displayModes[0] = 1;
    hover.update(); move();
    assert.equal(hover.element.style.display, 'none');
    assert.ok(events.some(event => event.type === 'mousemove' && event.properties.displayMode === 'compact'));
    handle.setDisplayMode('detailed'); hover.update();
    assert.equal(hover.element.style.display, 'none', 'detailed request still has compact dimensions until Worker completes');
    pin.emit('click'); close.emit('click');
    assert.equal(handle.isScreenFixed(), false);
    assert.equal(handle.getShow(), true);
    frame.displayModes[0] = 0; hover.update();
    assert.equal(hover.element.style.display, 'flex');
    close.emit('click');
    assert.equal(handle.getShow(), false);
    assert.equal(hover.element.style.display, 'none');
    assert.equal(events.filter(event => event.type === 'close').length, 1);
  } finally { hover.destroy(); }
});
test('switching to compact releases toolbar hover even while the pointer is over a button', () => {
  const { handle, container, hover, events, move } = hoverFixture();
  const pin = hover.element.children[0];
  move(); move(pin, 230, 170);
  assert.equal(hover.element.style.display, 'flex');
  handle.setDisplayMode('compact'); hover.update();
  assert.equal(hover.element.style.display, 'none');
  assert.equal(events.filter(event => event.type === 'mouseleave').length, 1);
  pin.emit('click');
  assert.equal(handle.isScreenFixed(), false);
  handle.setDisplayMode('detailed'); hover.update();
  assert.equal(hover.element.style.display, 'none', 'hidden toolbar does not retain the old hover selection');
  move();
  assert.equal(hover.element.style.display, 'flex');
  hover.destroy();
  assert.equal(container.children.length, 0);
  assert.ok([...container.listeners.values(), ...hoverWindow.listeners.values()].every(listeners => listeners.size === 0));
});
test('hover actions follow handle drag state when a shared viewport consumes pointerdown first', () => {
  const { handle, hover, move } = hoverFixture();
  try {
    move();
    assert.equal(hover.element.style.display, 'flex');
    handle.setDragScreenPosition(new C.Cartesian2(100, 200));
    hover.update();
    assert.equal(hover.element.style.display, 'none');
    hover.update();
    assert.equal(hover.element.style.display, 'none', 'subsequent drag frames cannot reactivate the toolbar');
    handle.setDragScreenPosition(undefined);
    hover.update();
    assert.equal(hover.element.style.display, 'flex');
  } finally { hover.destroy(); }
});
test('toolbar gestures stop before map navigation and every toolbar listener is removed on destroy', () => {
  const { hover } = hoverFixture();
  const events = ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'click', 'dblclick', 'wheel', 'contextmenu'];
  let stopped = 0;
  for (const type of events) hover.element.emit(type, { stopPropagation: () => { stopped++; } });
  assert.equal(stopped, events.length);
  hover.destroy();
  assert.ok([...hover.element.listeners.values()].every(listeners => listeners.size === 0));
});
test('DOM viewport descendants hover labels while map controls never select labels behind them', () => {
  const frame = { positions: new Float64Array(3), bounds: new Float32Array([100, 200, 120, 40, 1]),
    displayModes: new Uint8Array(1) };
  const handle = new WorkerCalloutHandle(0, () => frame, () => {});
  handle.setOffset(new C.Cartesian2(0, 0));
  const viewport = new HoverElement(), panel = new HoverElement(), control = new HoverElement();
  viewport.appendChild(panel); viewport.appendChild(control);
  const owns = target => target === viewport || target === panel;
  const hover = new TargetCalloutHoverController(viewport, viewport, () => [handle], owns);
  const events = [];
  hover.on('mouseenter', event => events.push(event.type));
  hover.on('mouseleave', event => events.push(event.type));
  try {
    viewport.emit('pointermove', { target: panel, clientX: 110, clientY: 170 });
    assert.equal(hover.element.style.display, 'flex');
    viewport.emit('pointermove', { target: control, clientX: 110, clientY: 170 });
    assert.equal(hover.element.style.display, 'none');
    assert.deepEqual(events, ['mouseenter', 'mouseleave']);
    viewport.emit('pointerdown', { target: control });
    viewport.emit('pointermove', { target: panel, clientX: 110, clientY: 170 });
    assert.equal(hover.element.style.display, 'flex', 'unrelated control presses must not mark labels as dragging');
    viewport.getBoundingClientRect = () => ({ left: 0, top: 0, width: 0, height: 0 });
    viewport.emit('pointermove', { target: panel, clientX: 110, clientY: 170 });
    assert.equal(hover.element.style.display, 'none', 'a hidden host does not divide by zero');
  } finally { hover.destroy(); }
  assert.equal(viewport.children.length, 2, 'only controller-owned toolbar is removed');
});
const interactionHostExports = await load('../packages/cesium-screen-callout/src/interactionHost.ts');
const { TargetCalloutDragController } = await load('../packages/cesium-screen-callout/src/drag.ts', {
  require: path => path === 'cesium' ? C : interactionHostExports, window: hoverWindow,
});
function dragFixture() {
  const element = new HoverElement(), label = new HoverElement(), control = new HoverElement();
  element.appendChild(label); element.appendChild(control);
  const frames = new Set(), selected = [], ended = [], dragPositions = [];
  const anchor = new C.Cartesian2(100, 200), offset = new C.Cartesian2(10, -40);
  let inputs = true, restored = 0, suspended = 0, renders = 0;
  const callout = {
    hitTest: point => point.x >= 110 && point.x <= 230 && point.y >= 160 && point.y <= 200,
    getTargetScreenPosition: result => C.Cartesian2.clone(anchor, result),
    getOffset: result => C.Cartesian2.clone(offset, result),
    setOffset: value => C.Cartesian2.clone(value, offset),
    setDragScreenPosition: value => dragPositions.push(value && C.Cartesian2.clone(value)),
  };
  const host = {
    element,
    requestRender: () => { renders++; },
    onBeforeRender: listener => { frames.add(listener); return () => frames.delete(listener); },
    ownsEventTarget: target => target === element || target === label,
    suspendInputs: () => {
      const previous = inputs; inputs = false; suspended++;
      return () => { inputs = previous; restored++; };
    },
  };
  const controller = new TargetCalloutDragController(host, () => [callout], item => selected.push(item), item => ended.push(item));
  const pointer = (type, details = {}) => element.emit(type, { target: label, clientX: 120, clientY: 170,
    pointerId: 1, button: 0, preventDefault() {}, stopImmediatePropagation() {}, ...details });
  return { element, label, control, host, controller, pointer, frames, selected, ended, dragPositions, anchor, offset,
    state: () => ({ inputs, restored, suspended, renders }) };
}
test('shared drag host excludes controls, preserves click semantics and defers drag until three CSS pixels', () => {
  const f = dragFixture();
  try {
    f.pointer('pointerdown', { target: f.control });
    assert.equal(f.selected.length, 0);
    assert.equal(f.state().inputs, true);
    f.pointer('pointerdown');
    assert.equal(f.selected.length, 1);
    assert.equal(f.state().inputs, false);
    f.pointer('pointermove', { clientX: 122 });
    for (const frame of f.frames) frame();
    assert.equal(f.dragPositions.length, 0, 'click jitter must not freeze avoidance or start a drag');
    f.pointer('pointerup', { clientX: 122 });
    assert.equal(f.ended.length, 0);
    assert.equal(f.state().inputs, true);
    assert.equal(f.element.hasPointerCapture(1), false);
    f.pointer('pointerdown');
    f.pointer('pointermove', { clientX: 123, clientY: 174 });
    assert.deepEqual(f.dragPositions.at(-1), new C.Cartesian2(113, 164));
    f.anchor.x = 300;
    for (const frame of f.frames) frame();
    assert.deepEqual(f.dragPositions.at(-1), new C.Cartesian2(113, 164), 'moving target does not move the grabbed screen position');
    f.pointer('pointerup', { clientX: 130, clientY: 180 });
    assert.deepEqual(f.dragPositions.at(-2), new C.Cartesian2(120, 170));
    assert.equal(f.dragPositions.at(-1), undefined);
    assert.equal(f.ended.length, 1);
    assert.equal(f.state().inputs, true);
    assert.equal(f.state().suspended, f.state().restored);
    assert.ok(f.state().renders > 0);
  } finally { f.controller.destroy(); }
  assert.equal(f.frames.size, 0);
  assert.ok([...f.element.listeners.values(), ...hoverWindow.listeners.values()].every(listeners => listeners.size === 0));
});
test('shared drag cleanup restores map inputs and capture without sending completion after destroy', () => {
  const f = dragFixture();
  f.element.style.cursor = 'crosshair';
  f.pointer('pointerdown');
  f.pointer('pointermove', { clientX: 130 });
  f.controller.destroy();
  assert.equal(f.state().inputs, true);
  assert.equal(f.element.style.cursor, 'crosshair');
  assert.equal(f.dragPositions.at(-1), undefined);
  assert.equal(f.ended.length, 0);
  assert.equal(f.element.hasPointerCapture(1), false);
  assert.equal(f.frames.size, 0);
  f.controller.destroy();
  assert.equal(f.state().restored, 1);
});
test('legacy Cesium scene constructor keeps previously disabled camera input disabled', () => {
  const canvas = new HoverElement(), frames = new Set();
  const scene = { canvas, screenSpaceCameraController: { enableInputs: false }, requestRender() {},
    preUpdate: { addEventListener: listener => { frames.add(listener); return () => frames.delete(listener); } } };
  const callout = { hitTest: () => true, getTargetScreenPosition: result => C.Cartesian2.fromElements(100, 200, result),
    getOffset: () => new C.Cartesian2(), setOffset() {} };
  const controller = new TargetCalloutDragController(scene, () => [callout]);
  canvas.emit('pointerdown', { clientX: 100, clientY: 200, pointerId: 7, button: 0, preventDefault() {}, stopImmediatePropagation() {} });
  assert.equal(canvas.hasPointerCapture(7), true);
  hoverWindow.emit('blur');
  assert.equal(scene.screenSpaceCameraController.enableInputs, false);
  assert.equal(canvas.hasPointerCapture(7), false);
  controller.destroy();
  assert.equal(frames.size, 0);
});
const { TargetCalloutClickController } = await load('../packages/cesium-screen-callout/src/click.ts', {
  require: () => C, window: hoverWindow,
});
test('non-draggable labels own pointer gestures before map emulation while blank map gestures pass through', () => {
  const frame = { positions: new Float64Array(3), bounds: new Float32Array([100, 200, 120, 40, 1]), displayModes: new Uint8Array(1) };
  const handle = new WorkerCalloutHandle(0, () => frame, () => {});
  handle.setOffset(new C.Cartesian2(0, 0));
  const element = new HoverElement();
  let clicks = 0, doubles = 0, selected = 0, stopped = 0;
  const controller = new TargetCalloutClickController({ element, ownsEventTarget: target => target === element }, () => [handle], {
    blockMapGestures: true, onClick: () => { clicks++; }, onDoubleClick: () => { doubles++; }, onSelect: () => { selected++; },
  });
  const emit = (type, x = 110, y = 170) => element.emit(type, { button: 0, pointerId: 19, clientX: x, clientY: y,
    preventDefault() {}, stopImmediatePropagation() { stopped++; } });
  try {
    emit('pointerdown');
    assert.equal(element.hasPointerCapture(19), true);
    emit('pointerup'); emit('click');
    emit('pointerdown'); emit('pointerup'); emit('click'); emit('dblclick');
    assert.equal(stopped, 7, 'both pointer sequences and their native clicks are isolated');
    assert.equal(clicks, 2); assert.equal(selected, 2); assert.equal(doubles, 1);
    assert.equal(handle.getDisplayMode(), 'compact');
    assert.equal(element.hasPointerCapture(19), false);
    const beforeBlank = stopped;
    emit('pointerdown', 10, 10); emit('pointermove', 30, 30); emit('pointerup', 40, 40);
    assert.equal(stopped, beforeBlank, 'blank-map dragging still reaches navigation');
    emit('pointerdown'); emit('pointermove', 120, 180); emit('pointerup', 120, 180); emit('click', 120, 180);
    assert.equal(clicks, 2, 'drag-sized movement does not become a click');
    emit('pointerdown');
    controller.destroy();
    assert.equal(element.hasPointerCapture(19), false);
    assert.ok([...element.listeners.values(), ...hoverWindow.listeners.values()].every(listeners => listeners.size === 0));
  } finally { controller.destroy(); }
});
if (failures) process.exitCode = 1;
