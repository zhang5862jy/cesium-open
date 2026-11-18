import 'ol/ol.css';
import OpenLayersMap from 'ol/Map.js';
import View from 'ol/View.js';
import { clearUserProjection, fromLonLat, getUserProjection, useGeographic } from 'ol/proj.js';
import * as C from 'cesium';
import { TargetCalloutManager } from 'cesium-screen-callout';

// Real OpenLayers map, DOM renderer and public manager/handle API; no network basemap.
const output = document.querySelector('#result'), results = [];
const errors = [];
const recordError = event => errors.push(String(event.error ?? event.reason ?? event.message));
window.addEventListener('error', recordError);
window.addEventListener('unhandledrejection', recordError);
const OriginalWorker = window.Worker;
const originalGetContext = HTMLCanvasElement.prototype.getContext;
let workerAllocations = 0, webglAllocations = 0, map, manager;
window.Worker = new Proxy(OriginalWorker, {
  construct(target, args) { workerAllocations++; return Reflect.construct(target, args); },
});
HTMLCanvasElement.prototype.getContext = function (type, ...args) {
  if (/^webgl2?$/.test(type) || type === 'experimental-webgl') webglAllocations++;
  return originalGetContext.call(this, type, ...args);
};
function check(ok, message) {
  if (!ok) throw new Error(message);
  results.push('PASS ' + message);
  output.textContent = results.join('\n');
}
const close = (a, b, tolerance = .06) => Math.abs(a - b) <= tolerance;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const contentRows = panel => [...panel.querySelectorAll('.target-callout-dom-row')];
const contentText = panel => contentRows(panel).map(row => row.textContent).join('');
const intersects = (a, b) => a.left < b.left + b.width - .01 && a.left + a.width > b.left + .01
  && a.top < b.top + b.height - .01 && a.top + a.height > b.top + .01;
async function paint(action) {
  action?.();
  await manager?.flush();
  map.renderSync();
  await new Promise(resolve => requestAnimationFrame(resolve));
  map.renderSync();
}
function verifyPanel(handle, panel, message) {
  const bounds = handle.getScreenBounds(), rect = panel.getBoundingClientRect();
  const viewport = map.getViewport().getBoundingClientRect();
  const matrix = new DOMMatrixReadOnly(panel.style.transform);
  const matches = bounds.visible && panel.style.visibility === 'visible'
    && close(matrix.m41, bounds.left) && close(matrix.m42, bounds.top)
    && close(rect.left - viewport.left, bounds.left) && close(rect.top - viewport.top, bounds.top)
    && close(rect.width, bounds.width) && close(rect.height, bounds.height)
    && handle.hitTest(new C.Cartesian2(bounds.left + 1, bounds.top + 1));
  check(matches, matches ? message : `${message}: ${JSON.stringify({ bounds,
    dom: { left: rect.left - viewport.left, top: rect.top - viewport.top, width: rect.width, height: rect.height },
    transform: [matrix.m41, matrix.m42], visibility: panel.style.visibility })}`);
}
function verifyProjection(handle, message, expectedLonLat) {
  const cartographic = C.Cartographic.fromCartesian(handle.getPosition());
  const lonLat = expectedLonLat ?? [
    C.Math.toDegrees(cartographic.longitude), C.Math.toDegrees(cartographic.latitude),
  ];
  const coordinate = getUserProjection() ? lonLat : fromLonLat(lonLat, map.getView().getProjection());
  const expected = map.getPixelFromCoordinate(coordinate);
  const actual = handle.getTargetScreenPosition();
  check(actual && close(actual.x, expected[0]) && close(actual.y, expected[1]), message);
}
function clientPoint(handle) {
  const bounds = handle.getScreenBounds(), viewport = map.getViewport();
  const rect = viewport.getBoundingClientRect();
  return { clientX: rect.left + (bounds.left + 4) * rect.width / viewport.clientWidth,
    clientY: rect.top + (bounds.top + 4) * rect.height / viewport.clientHeight };
}
function mouse(type, handle, target = map.getViewport()) {
  target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, ...clientPoint(handle) }));
}
function hover(handle) {
  map.getViewport().dispatchEvent(new PointerEvent('pointermove', {
    bubbles: true, pointerId: 99, ...clientPoint(handle),
  }));
}
try {
  const position = C.Cartesian3.fromDegrees(110, 32, 1800);
  map = new OpenLayersMap({ target: 'map', layers: [], view: new View({ center: fromLonLat([110, 32]), zoom: 10 }) });
  map.renderSync();
  const viewport = map.getViewport();
  const originalPostrenderListeners = map.getListeners('postrender')?.length ?? 0;
  const interactions = map.getInteractions().getArray();
  interactions[0].setActive(false);
  const originalInputStates = interactions.map(interaction => interaction.getActive());
  for (let cycle = 0; cycle < 3; cycle++) {
    let clicks = 0, doubleClicks = 0, selected = 0, dragEnds = 0, modeChanges = 0;
    const noDragging = cycle === 2;
    if (cycle === 0) document.querySelector('#map').style.display = 'none';
    manager = new TargetCalloutManager({
      map, draggable: !noDragging,
      ...(cycle === 1 ? { preservePositionOnAvoidanceDisable: false } : {}),
      onClick: () => { clicks++; }, onDoubleClick: () => { doubleClicks++; },
      onSelect: () => { selected++; }, onDragEnd: () => { dragEnds++; },
      onDisplayModeChange: () => { modeChanges++; }, onError: error => errors.push(error.message),
      compactFieldFormatter: field => field.key === 'speed' ? `${field.value}m/s` : String(field.value),
      targets: [
        { id: 'A', position, lines: ['目标 A', '状态：正常'], fields: [{ key: 'name', value: 'A' }, { key: 'speed', value: 10 }], offset: new C.Cartesian2(20, -30) },
        { id: 'B', position, lines: ['目标 B', '状态：正常'], fields: [{ key: 'name', value: 'B' }, { key: 'speed', value: 20 }], offset: new C.Cartesian2(-180, 100) },
      ],
    });
    await manager.ready;
    if (cycle === 0) {
      document.querySelector('#map').style.display = '';
      map.updateSize();
    }
    await paint();
    const first = manager.getById('A'), second = manager.get(1);
    const panels = [...viewport.querySelectorAll('.target-callout-dom-panel')];
    check(manager.visibleCount === 2 && panels.length === 2 && !manager.worker && !manager.gpuRenderer
      && workerAllocations === 0 && webglAllocations === 0,
    `cycle ${cycle}: same manager creates DOM labels without Worker or WebGL allocation`);
    verifyPanel(first, panels[0], 'DOM transform, measured bounds and hit test share CSS coordinates');
    check(panels.every(panel => panel.querySelector('.target-callout-dom-header')
      && panel.querySelector('.target-callout-dom-title')
      && panel.querySelector('.target-callout-dom-badge')?.textContent === 'A'),
    'detailed labels reserve a title row and a square affiliation letter even when the title value is empty');
    if (cycle === 0) {
      check(first.getScreenBounds().width > 0 && first.getScreenBounds().height > 0,
        'manager created in a hidden container measures valid geometry after becoming visible');
      const oldWidth = first.getScreenBounds().width;
      document.querySelector('#map').style.display = 'none';
      first.setLines(['A longer line changed while the map is hidden']);
      first.setStyle({ fontSize: 22 });
      await manager.flush();
      document.querySelector('#map').style.display = '';
      map.updateSize(); await paint();
      verifyPanel(first, panels[0], 'hidden content/style updates are remeasured when the map becomes visible');
      check(first.getScreenBounds().width > oldWidth, 'restored visible geometry reflects the new longer text');
      first.resetOverrides(['lines']); first.setStyle({ fontSize: 14 }); await paint();
      first.setLines(['A\nB\tC\r\nD\fE']); await paint();
      const whitespaceStyle = first.getStyle();
      check(contentRows(panels[0]).length === 1 && contentText(panels[0]) === 'A B C  D E'
        && close(panels[0].querySelector('.target-callout-dom-body').getBoundingClientRect().height,
          whitespaceStyle.fontSize + whitespaceStyle.paddingTop + whitespaceStyle.paddingBottom + 4),
      'embedded control whitespace becomes spaces within one measured row, matching Canvas text preparation');
      first.resetOverrides(['lines']); await paint();
    }
    verifyProjection(first, 'ECEF positions project onto OpenLayers target pixels');
    for (const [label, action] of [
      ['pan', () => map.getView().setCenter(fromLonLat([110.025, 32.015]))],
      ['zoom', () => map.getView().setZoom(11)],
      ['rotation', () => map.getView().setRotation(.65)],
    ]) {
      await paint(action);
      verifyProjection(first, `${label} keeps target projection synchronized`);
      verifyPanel(first, panels[0], `${label} keeps DOM placement and picking synchronized`);
    }
    if (cycle === 0) {
      await paint(() => map.setView(new View({ projection: 'EPSG:4326', center: [110, 32], zoom: 10 })));
      verifyProjection(first, 'EPSG:4326 view uses geographic projection correctly');
      await paint(() => map.setView(new View({ center: fromLonLat([470, 32]), zoom: 10, multiWorld: true })));
      verifyProjection(first, 'wrapped world selects the target copy closest to the view center', [470, 32]);
      check(first.getScreenBounds().visible, 'nearest wrapped world target remains visible');
      useGeographic();
      await paint(() => map.setView(new View({ center: [110, 32], zoom: 10 })));
      verifyProjection(first, 'useGeographic user coordinates work with a Mercator view');
      clearUserProjection();
      await paint(() => map.setView(new View({ center: fromLonLat([110, 32]), zoom: 10 })));
      const center = [...map.getView().getCenter()], resolution = map.getView().getResolution();
      const edgeOffset = new C.Cartesian2(24, -10);
      second.setShow(false); first.setOffset(edgeOffset);
      await paint(() => manager.setAvoidance(true));
      const cameraToAnchorX = x => map.getView().setCenter([center[0] + (map.getSize()[0] / 2 - x) * resolution, center[1]]);
      await paint(() => cameraToAnchorX(-12));
      check(first.getTargetScreenPosition()?.x < 0 && first.getScreenBounds().visible
        && first.getScreenBounds().left < map.getSize()[0] && first.getScreenBounds().left + first.getScreenBounds().width > 0,
      'offscreen anchor keeps a naturally intersecting DOM panel visible at the viewport edge');
      verifyPanel(first, panels[0], 'edge-visible DOM panel retains correct transforms and hit bounds');
      const edgeBounds = first.getScreenBounds();
      await paint(() => cameraToAnchorX(-22));
      check(close(first.getScreenBounds().left - edgeBounds.left, -10)
        && distance(first.getOffset(), edgeOffset) < .01,
      'collision-free camera movement crosses the DOM viewport edge without clamping or changing offsets');
      await paint(() => cameraToAnchorX(-first.getScreenBounds().width - edgeOffset.x - 30));
      check(!first.getScreenBounds().visible && panels[0].style.visibility === 'hidden', 'fully out-of-view DOM panel is clipped after natural camera movement');
      await paint(() => cameraToAnchorX(-12));
      check(first.getScreenBounds().visible && distance(first.getOffset(), edgeOffset) < .01,
        'DOM panel reenters the viewport with its previous offset');
      for (let frame = 0; frame < 3; frame++) await paint();
      check(distance(first.getOffset(), edgeOffset) < .01 && manager.getAvoidanceStats().candidateChecks === 0
        && [...viewport.querySelectorAll('.target-callout-dom-panel,.target-callout-dom-leader,.target-callout-dom-anchor')]
          .every(node => getComputedStyle(node).animationName === 'none' && getComputedStyle(node).transitionDuration.split(',').every(duration => parseFloat(duration) === 0)),
      'DOM placement settles immediately without CSS animation or later stationary-frame optimization');
      second.setShow(true); second.setDisplayMode('compact'); second.setOffset(edgeOffset);
      await paint();
      // Model the renderer's retained displacement from the previous display
      // group. The new compact group has no placement for this label yet.
      first.applyAvoidanceOffset(-100, edgeOffset.y);
      check(first.getScreenBounds().left + first.getScreenBounds().width < 0
        && distance(first.getOffset(), first.getPreferredOffset()) <= manager.getAvoidance().maxDisplacement,
      'mode-switch fixture retains a valid old automatic offset fully outside the viewport');
      first.setDisplayMode('compact');
      // DOM flush includes exactly the mode's first placement, before another
      // requestAnimationFrame or map.renderSync can conceal a delayed repair.
      await manager.flush();
      check(first.getScreenBounds().visible && second.getScreenBounds().visible
        && !intersects(first.getScreenBounds(), second.getScreenBounds()),
      'mode switch resolves preferred-position collisions in its first frame even when the old automatic placement was offscreen');
      first.setDisplayMode('detailed'); second.setDisplayMode('detailed');
      manager.setAvoidance(false); first.setOffset(new C.Cartesian2(20, -30)); second.setShow(true);
      second.setOffset(new C.Cartesian2(-180, 100));
      await paint(() => map.getView().setCenter(center));
    }
    first.setScreenFixed(true);
    const pinned = first.getScreenBounds();
    await paint(() => map.getView().setCenter(fromLonLat([110.035, 32.02])));
    check(close(first.getScreenBounds().left, pinned.left) && close(first.getScreenBounds().top, pinned.top),
      'screen-fixed panel stays fixed while its map target moves');
    first.setScreenFixed(false);
    await paint(() => { map.getView().setCenter(fromLonLat([110, 32])); map.getView().setRotation(0); map.getView().setZoom(10); });
    const moved = C.Cartesian3.fromDegrees(110.01, 32.01, 1800);
    first.setPosition(position); first.setLines(['OVERRIDE']);
    manager.updateTargets({
      positions: new Float64Array([moved.x, moved.y, moved.z, position.x, position.y, position.z]),
      lines: [{ index: 0, text: ['LIVE source', 'second line'] }],
      fields: [{ index: 0, fields: [{ key: 'name', value: '<img src=x>' }, { key: 'speed', value: 25 }] }],
    });
    await paint();
    check(C.Cartesian3.equals(first.getPosition(), position) && contentText(panels[0]) === 'OVERRIDE',
      'live source updates preserve explicit position and detailed text overrides');
    first.setDisplayMode('compact');
    await paint();
    check(contentText(panels[0]) === '<img src=x> 25m/s' && !panels[0].querySelector('img')
      && !contentText(panels[0]).includes('\n'), 'compact formatter joins values with spaces and inserts untrusted values as text');
    first.resetOverrides(); first.setDisplayMode('detailed');
    await paint();
    check(C.Cartesian3.equals(first.getPosition(), moved) && contentRows(panels[0]).length === 2
      && contentRows(panels[0])[0].textContent === 'LIVE source' && contentRows(panels[0])[1].textContent === 'second line',
      'resetOverrides restores the newest live position and detailed lines');
    if (cycle === 0) {
      const originalFields = first.getFields(), titleStyle = first.getStyle('title');
      const detailedStyle = first.getStyle('detailed'), compactStyle = first.getStyle('compact');
      manager.updateTargets({ fields: [{ index: 0, fields: [{ key: 'title', value: '<img src=x>\n 标题' }, ...originalFields] }],
        badges: [{ index: 0, badgeText: 'c' }] });
      first.setStyle({ fontSize: 22, textColor: '#ffffff', backgroundColor: '#112233', badgeColor: '#00aa44',
        badgeTextColor: '#ffffff', paddingTop: 7, paddingBottom: 5 }, 'title');
      first.setStyle({ backgroundColor: '#221133', textColor: '#ff0000' }, 'detailed');
      first.setStyle({ backgroundColor: '#334411', textColor: '#00ff00', badgeColor: '#4466cc' }, 'compact');
      await paint();
      const header = panels[0].querySelector('.target-callout-dom-header');
      const title = panels[0].querySelector('.target-callout-dom-title');
      const badge = panels[0].querySelector('.target-callout-dom-badge');
      const body = panels[0].querySelector('.target-callout-dom-body');
      check(first.getTitle() === '<img src=x> 标题' && title.textContent === first.getTitle() && !panels[0].querySelector('img')
        && !title.textContent.includes('title:') && contentText(panels[0]) === 'LIVE sourcesecond line',
      'title field renders only its value in a separate safe single line without replacing detailed body content');
      check(getComputedStyle(header).backgroundColor === 'rgb(17, 34, 51)'
        && getComputedStyle(body).backgroundColor === 'rgb(34, 17, 51)'
        && getComputedStyle(header).fontSize === '22px' && first.getStyle('detailed').fontSize === detailedStyle.fontSize
        && badge.textContent === 'C' && getComputedStyle(badge).backgroundColor === 'rgb(0, 170, 68)'
        && close(badge.getBoundingClientRect().width, 20) && close(badge.getBoundingClientRect().height, 20),
      'title style is independent of detailed body style and owns the 20px square affiliation badge colors');
      const headerRect = header.getBoundingClientRect(), bodyRect = body.getBoundingClientRect();
      check(close(headerRect.bottom, bodyRect.top) && close(headerRect.width, bodyRect.width)
        && close(first.getScreenBounds().height, headerRect.height + bodyRect.height),
      'header and body share panel width and their combined size participates in collision and picking bounds');
      verifyPanel(first, panels[0], 'title and body changes publish matching DOM and hit geometry in the same frame');
      hover(first);
      const actions = first.getActionBounds(), toolbar = manager.hover.element.getBoundingClientRect(), viewportRect = viewport.getBoundingClientRect();
      const buttons = [...manager.hover.element.querySelectorAll('button')];
      check(actions.visible && close(toolbar.left - viewportRect.left, actions.left)
        && close(toolbar.top - viewportRect.top, actions.top) && close(toolbar.width, 36) && close(toolbar.height, 16)
        && toolbar.left >= title.getBoundingClientRect().right + 6 - .06 && toolbar.right <= headerRect.right
        && buttons.every(button => button.style.borderRadius === '50%'
          && close(button.getBoundingClientRect().width, 16) && close(button.getBoundingClientRect().height, 16)),
      'two small circular action buttons occupy the measured title-right area without covering title text');
      first.setDisplayMode('compact'); await paint(); hover(first);
      const compactBadge = panels[0].querySelector('.target-callout-dom-badge');
      check(!panels[0].querySelector('.target-callout-dom-header') && compactBadge.textContent === 'C'
        && getComputedStyle(compactBadge).backgroundColor === 'rgb(68, 102, 204)'
        && contentRows(panels[0]).length === 1 && !panels[0].querySelector('img')
        && !first.getActionBounds().visible && manager.hover.element.style.display === 'none',
      'compact layout has its own colored letter square beside one value row and exposes no title actions');
      manager.updateTargets({ fields: [{ index: 0, fields: originalFields }], titles: [{ index: 0, title: '' }], badges: [{ index: 0, badgeText: 'A' }] });
      first.setStyle(titleStyle, 'title'); first.setStyle(detailedStyle, 'detailed'); first.setStyle(compactStyle, 'compact');
      first.setDisplayMode('detailed'); await paint();
    }
    first.setStyle({ fontSize: 24, textColor: '#ff0000' }, 'detailed');
    first.setStyle({ fontSize: 12, textColor: '#00ff00', paddingTop: 2, paddingBottom: 2 }, 'compact');
    await paint();
    const detailedHeight = first.getScreenBounds().height;
    first.setDisplayMode('compact'); await paint();
    check(first.getScreenBounds().height < detailedHeight && panels[0].style.color === 'rgb(0, 255, 0)'
      && first.getStyle('detailed').fontSize === 24, 'compact and detailed styles remain independent');
    first.setDisplayMode('detailed');
    for (const item of manager.callouts) {
      item.setPosition(position); item.setLines([`避让 ${item.id}`]); item.setOffset(new C.Cartesian2(0, 0));
    }
    await paint(() => manager.setAvoidance(true));
    check(!intersects(first.getScreenBounds(), second.getScreenBounds()), 'same-mode DOM labels avoid overlap');
    if (cycle === 0) {
      const titleStyle = first.getStyle('title'), height = first.getScreenBounds().height;
      first.setTitle('同帧标题扩展'); first.setStyle({ fontSize: 34, paddingTop: 9 }, 'title');
      await manager.flush();
      check(first.getScreenBounds().height > height && !intersects(first.getScreenBounds(), second.getScreenBounds()),
        'title size changes update the entire collision rectangle and resolve contacts in their first rendered frame');
      verifyPanel(first, panels[0], 'resized title publishes final panel and hit geometry without an extra animation frame');
      first.setTitle(''); first.setStyle(titleStyle, 'title'); await paint();
    }
    const unchanged = manager.callouts.map(item => item.getOffset());
    await paint();
    check(manager.getAvoidanceStats().candidateChecks === 0 && manager.callouts.every((item, i) => distance(item.getOffset(), unchanged[i]) < .01),
      'stationary DOM labels keep their cached placements without jitter');
    const otherOffset = first.getOffset(), firstBounds = first.getScreenBounds();
    await paint(() => second.setDragScreenPosition(new C.Cartesian2(firstBounds.left, firstBounds.top + second.getScreenBounds().height)));
    check(intersects(first.getScreenBounds(), second.getScreenBounds()) && distance(first.getOffset(), otherOffset) < .01
      && manager.getAvoidanceStats().candidateChecks === 0, 'dragging pauses all avoidance and preserves other label offsets');
    await paint(() => second.setDragScreenPosition(undefined));
    check(!intersects(first.getScreenBounds(), second.getScreenBounds()), 'avoidance resumes after release and separates DOM panels');
    const displayed = manager.callouts.map(item => item.getOffset()), preferred = manager.callouts.map(item => item.getPreferredOffset());
    check(manager.callouts.some((item, i) => distance(displayed[i], preferred[i]) > 1), 'disable fixture contains a real avoidance displacement');
    await paint(() => manager.setAvoidance(false));
    check(manager.callouts.every((item, i) => distance(item.getOffset(), cycle === 1 ? preferred[i] : displayed[i]) <= .8),
      cycle === 1 ? 'disable opt-out restores preferred positions' : 'disabling avoidance preserves displayed positions by default');
    if (cycle === 0) {
      first.setOffset(new C.Cartesian2(-100, 0)); second.setOffset(new C.Cartesian2(100, 0));
      await paint(() => manager.setAvoidance(true));
      for (const item of manager.callouts) {
        const bounds = item.getScreenBounds();
        await paint(() => item.setDragScreenPosition(new C.Cartesian2(bounds.left + 1, bounds.top + bounds.height)));
        await paint(() => item.setDragScreenPosition(undefined));
      }
      check(manager.callouts.every(item => !item.isDragging() && item.getAvoidancePriority() > 1),
        'both labels retain drag history after their release frames have settled');
      manager.setAvoidance(false);
      for (const item of manager.callouts) item.setOffset(new C.Cartesian2(0, 0));
      map.renderSync();
      check(intersects(first.getScreenBounds(), second.getScreenBounds()),
        'historically dragged labels can collide again at their new preferred positions');
      const beforeRepair = manager.callouts.map(item => item.getOffset());
      manager.setAvoidance(true);
      map.renderSync();
      const afterRepair = manager.callouts.map(item => item.getOffset());
      check(!intersects(first.getScreenBounds(), second.getScreenBounds()) && manager.getAvoidanceStats('detailed').unresolved === 0,
        'one rendered frame separates colliding labels despite both having historical drag priority');
      check(afterRepair.filter((offset, index) => distance(offset, beforeRepair[index]) > .01).length === 1,
        'historical drag priority preserves one label and moves only the other to resolve the collision');
      verifyPanel(first, panels[0], 'first repaired label updates DOM transform and hit bounds in the same frame');
      verifyPanel(second, panels[1], 'second repaired label updates DOM transform and hit bounds in the same frame');
      await paint();
      check(manager.getAvoidanceStats().candidateChecks === 0
        && manager.callouts.every((item, index) => distance(item.getOffset(), afterRepair[index]) < .01),
      'historical-priority repair remains stable without animation or repeated movement');
      await paint(() => manager.setAvoidance(false));
      // Fractional DOM widths used to be rounded down by offsetWidth, so this
      // visible contact was missed entirely when the configured gap was zero.
      await paint(() => second.setLines(['Fractional body width regression sample']));
      const priorWidth = panels[1].getBoundingClientRect().width;
      await paint(() => second.setStyle({ paddingRight: second.getStyle('detailed').paddingRight
        + Math.floor(priorWidth) + .375 - priorWidth }, 'detailed'));
      const fractionalWidth = panels[1].getBoundingClientRect().width;
      check(fractionalWidth - Math.floor(fractionalWidth) > .25,
        'zero-gap fixture includes a measurable fractional panel width');
      first.setOffset(new C.Cartesian2(fractionalWidth - .2, 0));
      second.setOffset(new C.Cartesian2(0, 0));
      map.renderSync();
      check(intersects(panels[0].getBoundingClientRect(), panels[1].getBoundingClientRect()),
        'fractional panel edges overlap visibly before enabling zero-gap avoidance');
      manager.setAvoidance({ enabled: true, gap: 0 });
      map.renderSync();
      check(!intersects(panels[0].getBoundingClientRect(), panels[1].getBoundingClientRect())
        && manager.getAvoidanceStats('detailed').unresolved === 0,
      'zero-gap avoidance resolves subpixel DOM overlap in the current frame');
      verifyPanel(second, panels[1], 'fractional panel width is shared by DOM, collision bounds and hit testing');
      await paint(() => manager.setAvoidance({ enabled: false, gap: 6 }));
    }
    second.setDisplayMode('compact');
    for (const item of manager.callouts) item.setOffset(new C.Cartesian2(0, 0));
    await paint(() => manager.setAvoidance(true));
    check(intersects(first.getScreenBounds(), second.getScreenBounds()) && manager.getAvoidanceStats().unresolved === 0,
      'different display modes use independent collision groups');
    first.setDisplayMode('compact'); await paint();
    check(!intersects(first.getScreenBounds(), second.getScreenBounds()), 'switching both labels to compact activates compact-group avoidance');
    await paint(() => manager.setAvoidance(false));
    second.setShow(false); first.setOffset(new C.Cartesian2(20, -30)); await paint();
    hover(first);
    check(manager.hover.element.style.display === 'none', 'compact hover exposes no pin or close buttons');
    const clicksBefore = clicks, modeBefore = modeChanges;
    const pointerClick = () => {
      const point = clientPoint(first);
      for (const type of ['pointerdown', 'pointerup']) viewport.dispatchEvent(new PointerEvent(type, {
        bubbles: true, cancelable: true, pointerType: 'mouse', isPrimary: true, pointerId: 41,
        button: 0, buttons: type === 'pointerup' ? 0 : 1, ...point,
      }));
      mouse('click', first);
    };
    const zoomBeforeDouble = map.getView().getZoom();
    let emulatedMapDoubleClicks = 0;
    const recordEmulatedDoubleClick = () => { emulatedMapDoubleClicks++; };
    map.on('dblclick', recordEmulatedDoubleClick);
    if (noDragging) pointerClick(); else mouse('click', first);
    check(clicks === clicksBefore + 1 && (!noDragging || selected === 1), 'shared single-click callback works, including draggable:false');
    if (noDragging) pointerClick();
    mouse('dblclick', first); await paint();
    map.un('dblclick', recordEmulatedDoubleClick);
    check(first.getDisplayMode() === 'detailed' && doubleClicks === 1 && modeChanges === modeBefore + 1,
      'shared double-click toggles the display mode and emits one callback');
    if (noDragging) check(close(map.getView().getZoom(), zoomBeforeDouble, 1e-8) && !map.getView().getAnimating()
      && emulatedMapDoubleClicks === 0 && clicks === clicksBefore + 2,
    'draggable:false isolates both full pointer click sequences before OpenLayers double-click zoom emulation');
    hover(first);
    check(manager.hover.element.style.display === 'flex', 'detailed hover still exposes pin and close buttons');
    let viewportGestures = 0, mapClicks = 0, mapDrags = 0;
    const recordViewportGesture = () => { viewportGestures++; };
    const recordMapClick = () => { mapClicks++; };
    const recordMapDrag = () => { mapDrags++; };
    const toolbarEvents = ['pointerdown', 'pointermove', 'pointerup', 'click', 'dblclick', 'wheel'];
    for (const type of toolbarEvents) viewport.addEventListener(type, recordViewportGesture);
    map.on('click', recordMapClick); map.on('pointerdrag', recordMapDrag);
    try {
      const pin = manager.hover.element.querySelector('button');
      const rect = pin.getBoundingClientRect(), point = { clientX: rect.left + 5, clientY: rect.top + 5 };
      for (const type of ['pointerdown', 'pointermove', 'pointerup']) pin.dispatchEvent(new PointerEvent(type, {
        bubbles: true, cancelable: true, pointerId: 23, button: 0, ...point,
      }));
      pin.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...point }));
      pin.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, button: 0, ...point }));
      pin.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 100, ...point }));
      check(first.isScreenFixed() && viewportGestures === 0 && mapClicks === 0 && mapDrags === 0,
        'toolbar pin works without forwarding clicks, pointer gestures or wheel input to the map');
      first.setScreenFixed(false);
    } finally {
      for (const type of toolbarEvents) viewport.removeEventListener(type, recordViewportGesture);
      map.un('click', recordMapClick); map.un('pointerdrag', recordMapDrag);
    }
    const zoomButton = viewport.querySelector('.ol-zoom-in');
    const countBeforeControl = clicks, doubleBeforeControl = doubleClicks, modeBeforeControl = first.getDisplayMode();
    mouse('click', first, zoomButton); mouse('dblclick', first, zoomButton);
    check(clicks === countBeforeControl && doubleClicks === doubleBeforeControl && first.getDisplayMode() === modeBeforeControl,
      'map control events do not click or toggle a label behind the control');
    // Browser-generated synthetic pointer events are not active hardware pointers.
    // Replace capture plumbing only; run the actual shared controller and OL interactions.
    if (!noDragging) {
      const capture = { set: viewport.setPointerCapture, has: viewport.hasPointerCapture, release: viewport.releasePointerCapture };
      const captured = new Set();
      viewport.setPointerCapture = id => captured.add(id);
      viewport.hasPointerCapture = id => captured.has(id);
      viewport.releasePointerCapture = id => captured.delete(id);
      try {
        const point = clientPoint(first);
        const pointer = (type, dx = 0, dy = 0) => viewport.dispatchEvent(new PointerEvent(type, {
          bubbles: true, cancelable: true, pointerId: 17, button: 0, buttons: type === 'pointerup' ? 0 : 1,
          clientX: point.clientX + dx, clientY: point.clientY + dy,
        }));
        pointer('pointerdown'); pointer('pointermove', 12, 9); await paint();
        check(first.isDragging() && captured.has(17) && interactions.every(item => !item.getActive())
          && manager.hover.element.style.display === 'none', 'pointer controller suspends map interactions and hides actions while dragging');
        pointer('pointerup', 12, 9); await paint();
        check(!first.isDragging() && !captured.size && dragEnds === 1
          && interactions.every((item, index) => item.getActive() === originalInputStates[index]),
        'pointer release restores each interaction previous state and emits one drag-end callback');
        const beforeSuppressedClick = clicks;
        mouse('click', first);
        check(clicks === beforeSuppressedClick, 'pointer movement suppresses the synthetic click after drag');
      } finally {
        viewport.setPointerCapture = capture.set; viewport.hasPointerCapture = capture.has; viewport.releasePointerCapture = capture.release;
      }
    }
    map.getView().cancelAnimations();
    const centerBeforePan = [...map.getView().getCenter()], viewportRect = viewport.getBoundingClientRect();
    const blankPoint = { clientX: viewportRect.left + 70, clientY: viewportRect.top + 560 };
    for (const [type, dx, dy] of [['pointerdown', 0, 0], ['pointermove', 14, 4], ['pointermove', 37, 15], ['pointerup', 37, 15]]) {
      viewport.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerType: 'mouse', isPrimary: true,
        pointerId: 51, button: 0, buttons: type === 'pointerup' ? 0 : 1,
        clientX: blankPoint.clientX + dx, clientY: blankPoint.clientY + dy }));
    }
    const centerAfterPan = map.getView().getCenter();
    check(Math.hypot(centerAfterPan[0] - centerBeforePan[0], centerAfterPan[1] - centerBeforePan[1]) > 1,
      'blank map pointerdown, two drag moves and pointerup still pan the real OpenLayers view after label interaction');
    map.getView().cancelAnimations();
    await paint(() => { map.getView().setCenter(fromLonLat([110, 32])); map.getView().setZoom(10); });
    const offscreen = C.Cartesian3.fromDegrees(150, -20, 0);
    first.setPosition(offscreen); await paint();
    check(!first.getScreenBounds().visible && panels[0].style.visibility === 'hidden', 'offscreen target hides its DOM panel');
    first.setPosition(position); first.setShow(false); await paint();
    check(manager.visibleCount === 0 && panels[0].style.visibility === 'hidden', 'setShow(false) hides labels and excludes them from visible count');
    first.setShow(true); await paint();
    check(first.getScreenBounds().visible && panels[0].style.visibility === 'visible', 'setShow(true) restores the DOM panel');
    const changesAtDestroy = modeChanges, clicksAtDestroy = clicks, pointAtDestroy = clientPoint(first);
    manager.destroy(); manager.destroy();
    for (const type of ['click', 'dblclick']) viewport.dispatchEvent(new MouseEvent(type, {
      bubbles: true, cancelable: true, button: 0, ...pointAtDestroy,
    }));
    check(modeChanges === changesAtDestroy && clicks === clicksAtDestroy
      && !viewport.querySelector('.target-callout-dom-overlay') && !viewport.querySelector('.target-callout-actions')
      && (map.getListeners('postrender')?.length ?? 0) === originalPostrenderListeners
      && interactions.every((item, index) => item.getActive() === originalInputStates[index]),
    `cycle ${cycle}: destroy removes DOM, shared event handlers and map render subscription`);
    manager = undefined;
    map.getView().cancelAnimations(); map.getView().setZoom(10); map.getView().setCenter(fromLonLat([110, 32])); map.renderSync();
  }
  check(workerAllocations === 0 && webglAllocations === 0 && errors.length === 0, 'all cycles finish without Worker, WebGL or browser errors');
  output.textContent = results.join('\n') + '\nALL PASSED';
} catch (error) {
  output.textContent = results.join('\n') + '\nFAIL ' + error.stack;
} finally {
  manager?.destroy();
  map?.setTarget(undefined); map?.dispose();
  clearUserProjection();
  window.Worker = OriginalWorker;
  HTMLCanvasElement.prototype.getContext = originalGetContext;
  window.removeEventListener('error', recordError);
  window.removeEventListener('unhandledrejection', recordError);
}
