import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import * as C from 'cesium';
import { DEFAULT_CALLOUT_STYLE, DEFAULT_TEXT_RENDERING } from '../packages/cesium-screen-callout/dist/index.js';

// Exercise the actual manager, handle and Worker pipeline; replace only the
// browser transport/GPU and glyph rasterization, which have a browser suite.
async function load(name, require, globals = {}) {
  const source = await readFile(new URL(`../packages/cesium-screen-callout/src/${name}.ts`, import.meta.url), 'utf8');
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports, require, console, performance, queueMicrotask, Float32Array, Float64Array,
    Uint8Array, ArrayBuffer, ...globals,
  });
  return exports;
}
const validation = await load('validation', () => C);
const display = await load('display', name => name === './validation' ? validation : { DEFAULT_CALLOUT_STYLE });
const avoidance = await load('avoidance', () => ({}));
const interactionHost = await load('interactionHost', () => ({}));
const click = await load('click', () => C, { window: new EventTarget() });
const presentation = await load('presentationLayout', () => ({}));
const handle = await load('workerHandle', name => ({
  cesium: C, './legacyCallout': { DEFAULT_CALLOUT_STYLE }, './validation': validation, './display': display,
  './presentationLayout': presentation,
}[name]));
const tick = () => new Promise(resolve => queueMicrotask(resolve));
const clone = value => JSON.parse(JSON.stringify(value));
let latestWorker;
class Worker {
  pending = [];
  messages = [];
  lastPaint = [];
  constructor() {
    latestWorker = this;
    const self = { postMessage: data => this.onmessage?.({ data }) };
    const worker = this;
    this.loaded = load('layout.worker', name => name === './glyphBatch' ? {
      GlyphBatchBuilder: class {
        async build(items) {
          worker.lastPaint = clone(items);
          const sizes = new Float32Array(items.length * 2);
          items.forEach((item, i) => {
            sizes[i * 2] = Math.max(0, ...item.lines.map(line => [...line].length * item.style.fontSize * .6))
              + item.style.paddingLeft + item.style.paddingRight + 4;
            sizes[i * 2 + 1] = item.lines.length * item.style.fontSize
              + Math.max(0, item.lines.length - 1) * item.style.lineGap
              + item.style.paddingTop + item.style.paddingBottom + 4;
          });
          return { sizes, instances: new Float32Array(items.length * 16), count: items.length };
        }
      },
    } : name === './display' ? display : {}, { self });
    this.self = self;
  }
  postMessage(data, transfers = []) {
    const message = structuredClone(data, { transfer: transfers });
    this.messages.push(message);
    this.pending.push(message);
  }
  async respond() {
    await this.loaded;
    const message = this.pending.shift();
    if (message) await this.self.onmessage({ data: message });
  }
  terminate() { this.terminated = true; }
}
class Renderer {
  visibleCount = 2;
  constructor(_scene, _count, frame) { this.frame = frame; }
  setTextRendering() {}
  getTextRendering() { return DEFAULT_TEXT_RENDERING; }
  setAvoidance() {}
  update(result, _enabled, displayModes) {
    this.last = result;
    if (!result.unchanged) this.pending = { ...result, displayModes };
  }
  draw() {
    if (!this.pending) return;
    const frame = this.frame();
    this.pending.sizes.forEach((value, i) => { frame.bounds[Math.floor(i / 2) * 5 + 2 + i % 2] = value; });
    frame.displayModes = this.pending.displayModes;
    frame.actionRects = this.pending.actionRects;
    this.pending = undefined;
  }
  destroy() {}
}
const { TargetCalloutManager } = await load('TargetCalloutManager', name => {
  if (name.includes('layout.worker')) return { __esModule: true, default: Worker };
  return {
    cesium: C, './legacyCallout': { DEFAULT_CALLOUT_STYLE }, './validation': validation,
    './avoidance': avoidance, './display': display, './workerHandle': handle,
    './interactionHost': interactionHost, './click': click,
    './screenBatchRenderer': { ScreenBatchRenderer: Renderer, DEFAULT_TEXT_RENDERING },
  }[name] ?? {};
});
function create(options = {}) {
  const canvas = new EventTarget();
  const scene = { canvas, isDestroyed: () => false, requestRender() {},
    postRender: { addEventListener: () => () => {} } };
  const manager = new TargetCalloutManager({
    scene, draggable: false, hoverActions: false,
    targets: [
      { id: 'A', position: new C.Cartesian3(1, 2, 3), lines: ['目标 A', '速度：120'],
        fields: [{ key: 'name', value: 'A' }, { key: 'speed', value: 120 }, { key: 'active', value: true }] },
      { id: 'B', position: new C.Cartesian3(4, 5, 6), lines: ['目标 B', '速度：80'],
        fields: [{ key: 'name', value: 'B' }, { key: 'speed', value: 80 }] },
    ], ...options,
  });
  return { manager, worker: latestWorker };
}
async function settle(manager, worker) {
  const flushed = manager.flush();
  for (let attempt = 0; attempt < 30; attempt++) {
    await tick();
    while (worker.pending.length) await worker.respond();
    await tick();
    if (!worker.pending.length && !manager.busy && !manager.scheduled) break;
  }
  await flushed;
  manager.renderer.draw();
}

{
  let notifications = 0;
  const { manager, worker } = create({ onDisplayModeChange: () => { notifications++; } });
  await settle(manager, worker);
  const a = manager.get(0), b = manager.get(1);
  assert.equal(a.getDisplayMode(), 'detailed');
  assert.equal(a.getRenderedDisplayMode(), 'detailed');
  a.setStyle({ fontSize: 24, textColor: '#ff0000' }, 'detailed');
  a.setStyle({ fontSize: 12, textColor: '#00ff00' }, 'compact');
  await settle(manager, worker);
  const detailedHeight = a.getScreenBounds().height;
  a.setDisplayMode('compact');
  assert.equal(a.getDisplayMode(), 'compact');
  assert.equal(a.getRenderedDisplayMode(), 'detailed', 'requested mode must not reclassify old GPU geometry');
  assert.equal(a.getScreenBounds().height, detailedHeight, 'old dimensions remain until the Worker responds');
  await settle(manager, worker);
  assert.equal(a.getRenderedDisplayMode(), 'compact');
  assert.equal(worker.lastPaint[0].lines.length, 1);
  assert.equal(worker.lastPaint[0].lines[0], 'A 120 true');
  assert.ok(a.getScreenBounds().height < detailedHeight);
  assert.equal(worker.lastPaint[0].style.fontSize, 12);
  assert.equal(a.getStyle('detailed').fontSize, 24);
  assert.equal(b.getStyle('detailed').fontSize, DEFAULT_CALLOUT_STYLE.fontSize);
  const exposedFields = a.getFields(); exposedFields[0].value = 'external mutation';
  assert.equal(a.getFields()[0].value, 'A', 'field getters are snapshots');
  const styles = a.getStyle('compact'); styles.fontSize = 40;
  assert.equal(a.getStyle('compact').fontSize, 12, 'mode style getters are snapshots');

  const calls = [];
  a.setCompactFieldFormatter((field, index, id) => {
    calls.push([field.key, index, id]);
    return field.key === 'speed' ? `  ${field.value}\n km/h  ` : String(field.value);
  });
  await settle(manager, worker);
  assert.equal(worker.lastPaint[0].lines[0], 'A 120 km/h true');
  assert.ok(calls.some(([key, index, id]) => key === 'speed' && index === 1 && id === 'A'));
  a.setFields([{ key: 'unicode', value: '飞行 ✈️' }, { key: 'empty', value: null }]);
  await settle(manager, worker);
  assert.equal(worker.lastPaint[0].lines[0], '飞行 ✈️ null', 'custom formatter owns field value conversion');
  a.setCompactFieldFormatter(undefined);
  await settle(manager, worker);
  assert.equal(worker.lastPaint[0].lines[0], '飞行 ✈️ —', 'default null value has a visible placeholder');
  a.setLines(['详细人工备注', '保留换行']);
  await settle(manager, worker);
  assert.equal(worker.lastPaint[0].lines.length, 1, 'detailed override does not replace structured compact content');
  a.toggleDisplayMode();
  await settle(manager, worker);
  assert.deepEqual(worker.lastPaint[0].lines, ['详细人工备注', '保留换行']);
  assert.equal(worker.lastPaint[0].style.fontSize, 24);
  assert.ok(notifications >= 2);
  manager.destroy();
}
console.log('PASS one-line compact values, formatting, Unicode, independent mode styles, snapshots and atomic mode/geometry');

{
  const { manager, worker } = create();
  await settle(manager, worker);
  const a = manager.get(0), b = manager.get(1);
  a.setDisplayMode('compact'); b.setDisplayMode('compact');
  await settle(manager, worker);
  const fields = [{ key: 'value', value: 'first' }];
  manager.updateTargets({ fields: [{ index: 0, fields }] });
  manager.updateTargets({ fields: [{ index: 1, fields: [{ key: 'value', value: 'second' }] }] });
  fields[0].value = 'mutated';
  await settle(manager, worker);
  assert.equal(worker.lastPaint[0].lines[0], 'first');
  assert.equal(worker.lastPaint[1].lines[0], 'second');
  a.setFields([{ key: 'value', value: 'local' }]);
  manager.updateTargets({ fields: [{ index: 0, fields: [{ key: 'value', value: 'latest source' }] }] });
  await settle(manager, worker);
  assert.equal(worker.lastPaint[0].lines[0], 'latest source', 'latest fields replace local values without an override layer');
  manager.updateTargets({ lines: [{ index: 0, text: ['最新详细源'] }] });
  a.setLines(['详细覆写']);
  a.resetOverrides(['lines']);
  a.setDisplayMode('detailed');
  await settle(manager, worker);
  assert.equal(worker.lastPaint[0].lines[0], '最新详细源');
  a.setDisplayMode('compact');
  await tick();
  a.setDisplayMode('detailed');
  assert.equal(a.getRenderedDisplayMode(), 'detailed');
  await worker.respond();
  assert.equal(a.getRenderedDisplayMode(), 'detailed', 'uploaded mode waits for its matching projected bounds');
  manager.renderer.draw();
  assert.equal(a.getRenderedDisplayMode(), 'compact', 'in-flight compact batch has matching collision group');
  assert.equal(a.getDisplayMode(), 'detailed', 'later requested state is not overwritten by an old result');
  await settle(manager, worker);
  assert.equal(a.getRenderedDisplayMode(), 'detailed');
  assert.equal(worker.lastPaint[0].lines[0], '最新详细源');
  manager.destroy();
}
console.log('PASS sparse fields merge, latest source wins, detailed overrides and rapid pending mode switches');

{
  const { manager, worker } = create({
    defaultTitleStyle: { fontSize: 18, textColor: '#123456', badgeColor: '#234567' },
  });
  await settle(manager, worker);
  const a = manager.get(0), b = manager.get(1);
  assert.equal(a.getTitle(), '');
  assert.equal(a.getBadgeText(), 'A');
  assert.equal(a.getStyle('title').fontSize, 18);
  a.setTitle('  标题\n值  ');
  a.setBadgeText('b');
  a.setStyle({ fontSize: 26, textColor: '#ff0000', badgeColor: '#0000ff' }, 'title');
  a.setStyle({ fontSize: 12, badgeColor: '#00ff00' }, 'compact');
  await settle(manager, worker);
  assert.equal(a.getTitle(), '标题 值');
  assert.equal(a.getBadgeText(), 'B');
  assert.equal(worker.lastPaint[0].title, '标题 值');
  assert.equal(worker.lastPaint[0].badgeText, 'B');
  assert.equal(worker.lastPaint[0].titleStyle.fontSize, 26);
  assert.equal(a.getStyle('detailed').fontSize, DEFAULT_CALLOUT_STYLE.fontSize);
  assert.equal(a.getStyle('compact').badgeColor, '#00ff00');
  assert.equal(b.getStyle('title').fontSize, 18);
  const snapshot = a.getProperties(); snapshot.titleStyle.fontSize = 48;
  assert.equal(a.getStyle('title').fontSize, 26);
  manager.updateTargets({ titles: [{ index: 0, title: 'old' }], badges: [{ index: 1, badgeText: 'c' }] });
  manager.updateTargets({ titles: [{ index: 1, title: 'second' }] });
  manager.updateTargets({ titles: [{ index: 0, title: 'latest' }] });
  await settle(manager, worker);
  assert.equal(worker.lastPaint[0].title, 'latest');
  assert.equal(worker.lastPaint[1].title, 'second');
  assert.equal(worker.lastPaint[1].badgeText, 'C');
  a.setDisplayMode('compact');
  a.setTitle('updated while compact');
  a.setStyle({ fontSize: 28 }, 'title');
  await settle(manager, worker);
  a.setDisplayMode('detailed');
  await settle(manager, worker);
  assert.equal(worker.lastPaint[0].title, 'updated while compact');
  assert.equal(worker.lastPaint[0].titleStyle.fontSize, 28);
  a.setFields([{ key: 'title', value: '字段标题' }, { key: 'speed', value: 25 }]);
  await settle(manager, worker);
  assert.equal(worker.lastPaint[0].title, '字段标题');
  assert.deepEqual(worker.lastPaint[0].lines, ['目标 A', '速度：120']);
  manager.updateTargets({ fields: [{ index: 0, fields: [{ key: 'title', value: 'field' }] }],
    titles: [{ index: 0, title: 'explicit' }] });
  await settle(manager, worker);
  assert.equal(a.getTitle(), 'explicit', 'explicit title in the same batch wins over fields.title');
  assert.throws(() => manager.updateTargets({ titles: [{ index: 0, title: 'must not commit' }],
    badges: [{ index: 1, badgeText: 'AB' }] }), /字母/);
  assert.equal(a.getTitle(), 'explicit', 'validation covers the entire sparse batch before committing anything');
  assert.throws(() => a.setTitle(123), /title/);
  assert.throws(() => a.setStyle({ badgeColor: 'not-a-color' }, 'title'), /颜色/);
  assert.equal(a.getStyle('title').badgeColor, '#0000ff');
  manager.destroy();
  assert.throws(() => a.setTitle('after destroy'), /销毁/);
  assert.throws(() => a.setBadgeText('D'), /销毁/);
}
console.log('PASS value-only title, per-target letter, three independent style sections, sparse updates and atomic validation');

{
  const { manager, worker } = create();
  await settle(manager, worker);
  const a = manager.get(0);
  const initialFields = clone(a.getFields());
  assert.throws(() => a.setDisplayMode('unknown'));
  assert.equal(a.getDisplayMode(), 'detailed');
  assert.throws(() => a.setFields([{ key: 'bad', value: NaN }]));
  assert.throws(() => a.setFields([{ key: 'bad', value: {} }]));
  assert.throws(() => a.setCompactFieldFormatter(() => 42));
  assert.throws(() => a.setCompactFieldFormatter(() => { throw new Error('formatter failed'); }));
  assert.deepEqual(clone(a.getFields()), initialFields);
  assert.throws(() => manager.updateTargets({ fields: [
    { index: 0, fields: [{ key: 'value', value: 'must not apply' }] },
    { index: 1, fields: [{ key: 'bad', value: Infinity }] },
  ] }));
  assert.deepEqual(clone(a.getFields()), initialFields, 'all sparse fields validate before any target changes');
  manager.get(1).setCompactFieldFormatter(field => {
    if (field.value === 'boom') throw new Error('bulk formatter failed');
    return String(field.value);
  });
  assert.throws(() => manager.updateTargets({
    lines: [{ index: 0, text: ['must not replace detailed source'] }],
    fields: [
      { index: 0, fields: [{ key: 'value', value: 'must not apply' }] },
      { index: 1, fields: [{ key: 'value', value: 'boom' }] },
    ],
  }), /bulk formatter failed/);
  assert.deepEqual(clone(a.getFields()), initialFields, 'formatter failure cannot partially apply preceding fields');
  await settle(manager, worker);
  assert.deepEqual(worker.lastPaint[0].lines, ['目标 A', '速度：120'], 'formatter failure cannot partially apply detailed lines');
  a.setDisplayMode('compact');
  await settle(manager, worker);
  assert.equal(worker.lastPaint[0].lines[0], 'A 120 true', 'a rejected formatter never replaces the previous formatter');
  manager.destroy();
  assert.throws(() => a.setDisplayMode('compact'), /已销毁/);
  assert.throws(() => a.setFields([]), /已销毁/);
}
{
  let changes = 0;
  const { manager, worker } = create({
    defaultCompactStyle: { fontSize: 11 },
    compactFieldFormatter: field => `(${field.value})`,
    onDisplayModeChange: () => { changes++; },
    targets: [{ id: 'fallback', position: C.Cartesian3.ZERO, lines: ['  old line  ', 'next\tline'], displayMode: 'compact' }],
  });
  assert.equal(changes, 0, 'initial compact mode does not emit a change callback during construction');
  await settle(manager, worker);
  assert.equal(changes, 0, 'initial compact upload does not emit a change callback');
  assert.equal(worker.lastPaint[0].lines[0], 'old line next line', 'legacy lines have a normalized one-line fallback');
  assert.equal(worker.lastPaint[0].style.fontSize, 11);
  manager.get(0).setDisplayMode('detailed');
  assert.equal(changes, 1, 'subsequent programmatic mode change emits one callback');
  manager.get(0).setDisplayMode('compact');
  assert.equal(changes, 2);
  manager.get(0).setFields([{ key: 'value', value: 12 }]);
  await settle(manager, worker);
  assert.equal(worker.lastPaint[0].lines[0], '(12)', 'manager formatter applies after structured fields arrive');
  manager.destroy();
}
console.log('PASS invalid modes/fields/formatters are atomic, disposal guards and legacy source fallback');
