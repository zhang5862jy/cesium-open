import * as C from 'cesium';
import { TargetCalloutManager } from 'cesium-screen-callout';
import { createLocalWorldBaseLayers, completeLocalWorldBaseLayer } from '../src/cesium/tools/localWorldImagery.ts';
import { applyDefaultViewerConfig } from '../src/cesium/tools/viewerConfig.ts';

const output = document.querySelector('#result'), results = [];
let viewer, manager;
function check(ok, message) {
  if (!ok) throw new Error(message);
  results.push('PASS ' + message);
  output.textContent = results.join('\n');
}
function nextFrame(action) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { remove(); reject(new Error('requestRender frame timeout')); }, 5000);
    const remove = viewer.scene.postRender.addEventListener(() => {
      clearTimeout(timer); remove(); resolve();
    });
    action();
  });
}
try {
  const base = await createLocalWorldBaseLayers();
  viewer = new C.Viewer('viewer', {
    baseLayer: base.west, baseLayerPicker: false, geocoder: false,
    animation: false, timeline: false, requestRenderMode: true, maximumRenderTimeChange: Infinity,
  });
  applyDefaultViewerConfig(viewer);
  completeLocalWorldBaseLayer(viewer, base);
  const renderErrors = [];
  viewer.scene.renderError.addEventListener((_scene, error) => renderErrors.push(String(error)));
  const position = C.Cartesian3.fromDegrees(110, 32, 1800);
  viewer.camera.lookAt(position, new C.HeadingPitchRange(0, -.8, 20000));
  viewer.camera.lookAtTransform(C.Matrix4.IDENTITY);
  const primitives = viewer.scene.primitives.length;
  const beforeUpdate = viewer.scene.preUpdate.numberOfListeners;
  const afterRender = viewer.scene.postRender.numberOfListeners;
  for (let cycle = 0; cycle < 3; cycle++) {
    let displayChanges = 0, clicks = 0, doubleClicks = 0;
    manager = new TargetCalloutManager({
      scene: viewer.scene, container: viewer.container,
      ...(cycle === 1 ? { preservePositionOnAvoidanceDisable: false } : {}),
      onDisplayModeChange: () => { displayChanges++; },
      onClick: () => { clicks++; },
      onDoubleClick: () => { doubleClicks++; },
      targets: [
        { id: 'A', position, lines: ['目标 A'] },
        { id: 'B', position, lines: ['目标 B'], offset: new C.Cartesian2(-180, 100) },
      ],
    });
    await manager.ready;
    await nextFrame(() => viewer.scene.requestRender());
    check(manager.visibleCount === 2, `cycle ${cycle}: real Worker and GPU initialized`);
    check(manager.renderer.command.instanceCount + manager.renderer.leaderCommand.instanceCount === manager.renderer.count,
      'two commands draw disjoint instance ranges without processing the batch twice');
    const handle = manager.getById('A');
    const width = handle.getScreenBounds().width;
    manager.updateTargets({ lines: [{ index: 0, text: ['AAAAAAAAAAAAAAAA'] }] });
    manager.updateTargets({ lines: [{ index: 1, text: ['BBBBBBBBBBBBBBBBBB'] }] });
    await manager.flush();
    await nextFrame(() => viewer.scene.requestRender());
    check(handle.getScreenBounds().width > width && manager.get(1).getScreenBounds().width > width,
      'independent sparse text updates both reach the GPU');
    if (cycle === 0) {
      const before = handle.getActionBounds(), oldHeight = handle.getScreenBounds().height;
      let afterUpload;
      manager.options.onStats = () => { afterUpload = handle.getActionBounds(); };
      handle.setTitle('独立标题 title value'); handle.setBadgeText('C');
      handle.setStyle({ fontSize: 32, badgeColor: '#0000ff', badgeTextColor: '#ffffff' }, 'title');
      check(JSON.stringify(handle.getActionBounds()) === JSON.stringify(before),
        'pending GPU title styles do not move toolbar bounds ahead of uploaded geometry');
      await manager.flush();
      manager.options.onStats = undefined;
      check(JSON.stringify(afterUpload) === JSON.stringify(before),
        'uploaded title geometry preserves the last complete action bounds until the next scene draw');
      await nextFrame(() => viewer.scene.requestRender());
      const panel = handle.getScreenBounds(), action = handle.getActionBounds();
      check(handle.getTitle() === '独立标题 title value' && handle.getBadgeText() === 'C'
        && panel.height > oldHeight && action.visible && action.width === 36 && action.height === 16
        && action.left >= panel.left && action.left + action.width <= panel.left + panel.width
        && action.top >= panel.top && action.top + action.height < panel.top + panel.height,
      'GPU title row reserves a matching in-panel action area and expands collision bounds');
      const buffer = manager.recycledInstances;
      let blueBadge = false;
      for (let n = 0; n < manager.renderer.count; n++) {
        const k = n * 16;
        if (buffer[k] === 0 && buffer[k + 1] === 0 && buffer[k + 4] === 20 && buffer[k + 7] === 20
          && buffer[k + 12] === 0 && buffer[k + 13] === 0 && buffer[k + 14] === 1) blueBadge = true;
      }
      check(blueBadge, 'GPU draws the title affiliation badge as a filled square');
      handle.setTitle(''); handle.setStyle({ fontSize: 14 }, 'title');
      await manager.flush();
      await nextFrame(() => viewer.scene.requestRender());
    }
    await nextFrame(() => handle.setOffset(new C.Cartesian2(30, -40)));
    check(handle.getOffset().x === 30, 'offset requests a frame in requestRenderMode');
    await nextFrame(() => manager.setTextRendering({ weight: .1 }));
    check(manager.getTextRendering().weight === .1, 'text uniforms request a frame');
    if (cycle === 0) {
      const camera = viewer.camera;
      const pose = { destination: C.Cartesian3.clone(camera.positionWC), orientation: {
        direction: C.Cartesian3.clone(camera.directionWC), up: C.Cartesian3.clone(camera.upWC),
      } };
      const other = manager.get(1), originalOffset = handle.getPreferredOffset();
      const edgeOffset = new C.Cartesian2(24, -10);
      other.setShow(false); handle.setOffset(edgeOffset);
      await manager.flush();
      await nextFrame(() => manager.setAvoidance(true));
      const anchor = handle.getTargetScreenPosition();
      const cameraPoint = C.Matrix4.multiplyByPoint(camera.viewMatrix, handle.getPosition(), new C.Cartesian3());
      const unitsPerPixel = -cameraPoint.z * 2 * Math.tan(camera.frustum.fovy / 2) / viewer.canvas.clientHeight;
      const cameraToAnchorX = x => {
        camera.setView(pose);
        camera.moveRight((anchor.x - x) * unitsPerPixel);
        viewer.scene.requestRender();
      };
      await nextFrame(() => cameraToAnchorX(-12));
      check(handle.getTargetScreenPosition()?.x < 0 && handle.getScreenBounds().visible
        && handle.getScreenBounds().left + handle.getScreenBounds().width > 0,
      'offscreen 3D anchor keeps a naturally intersecting GPU panel visible');
      const edgeBounds = handle.getScreenBounds();
      await nextFrame(() => cameraToAnchorX(-22));
      check(Math.abs(handle.getScreenBounds().left - edgeBounds.left + 10) < .05
        && C.Cartesian2.distance(handle.getOffset(), edgeOffset) < .01,
      'collision-free camera movement crosses the GPU viewport edge without clamping or changing offsets');
      await nextFrame(() => cameraToAnchorX(-handle.getScreenBounds().width - edgeOffset.x - 30));
      check(!handle.getScreenBounds().visible, 'fully out-of-view GPU panel is clipped after natural camera movement');
      await nextFrame(() => cameraToAnchorX(-12));
      check(handle.getScreenBounds().visible && C.Cartesian2.distance(handle.getOffset(), edgeOffset) < .01,
        'GPU panel reenters the viewport with its previous offset');
      for (let frame = 0; frame < 3; frame++) await nextFrame(() => viewer.scene.requestRender());
      check(C.Cartesian2.distance(handle.getOffset(), edgeOffset) < .01 && manager.getAvoidanceStats().candidateChecks === 0,
        'GPU placement settles in the current frame without later stationary-frame optimization');
      manager.setAvoidance(false); handle.setOffset(originalOffset); other.setShow(true);
      await manager.flush();
      await nextFrame(() => { camera.setView(pose); viewer.scene.requestRender(); });
    }
    await nextFrame(() => handle.setScreenFixed(true));
    check(handle.isScreenFixed(), 'pin works after a visible frame');
    handle.setLines(['OVERRIDE']);
    const moved = C.Cartesian3.fromDegrees(110.01, 32.01, 1800);
    handle.setPosition(position);
    manager.updateTargets({
      positions: new Float64Array([moved.x, moved.y, moved.z, position.x, position.y, position.z]),
      lines: [{ index: 0, text: ['LIVE'] }],
    });
    await manager.flush();
    check(C.Cartesian3.equals(handle.getPosition(), position), 'source does not overwrite explicit override');
    handle.resetOverrides();
    await manager.flush();
    check(C.Cartesian3.equals(handle.getPosition(), moved), 'reset restores most recent source position');
    // All geometry/interaction must consume the resolved placement in the same frame.
    handle.setScreenFixed(false);
    for (const callout of manager.callouts) {
      callout.setPosition(position);
      callout.setLines([`避让 ${callout.id}`]);
      callout.setOffset(new C.Cartesian2(0, 0));
    }
    await manager.flush();
    await nextFrame(() => manager.setAvoidance(true));
    const intersects = (a, b) => a.left < b.left + b.width - .01 && a.left + a.width > b.left + .01
      && a.top < b.top + b.height - .01 && a.top + a.height > b.top + .01;
    const first = manager.get(0), second = manager.get(1);
    check(!intersects(first.getScreenBounds(), second.getScreenBounds()), 'avoidance separates actual visible panels');
    check(manager.callouts.every(c => C.Cartesian2.distance(c.getOffset(), c.getPreferredOffset()) <= 160.01),
      'default GPU placement stays within each label own automatic radius');
    const stableOffsets = manager.callouts.map(c => c.getOffset());
    await nextFrame(() => { manager.setAvoidance(manager.getAvoidance()); viewer.scene.requestRender(); });
    check(manager.getAvoidanceStats().candidateChecks === 0
      && manager.callouts.every((c, i) => C.Cartesian2.distance(c.getOffset(), stableOffsets[i]) < .01),
    'reapplying identical avoidance options preserves placement and cache');
    await nextFrame(() => manager.setAvoidance({ maxDisplacement: 0 }));
    check(manager.callouts.every(c => C.Cartesian2.distance(c.getOffset(), c.getPreferredOffset()) < .01),
      'zero automatic radius restores configured offsets without hiding labels');
    await nextFrame(() => manager.setAvoidance({ maxDisplacement: 160 }));
    const firstBounds = first.getScreenBounds();
    const dragTo = new C.Cartesian2(firstBounds.left, firstBounds.top + second.getScreenBounds().height);
    await nextFrame(() => second.setDragScreenPosition(dragTo));
    const draggedBounds = second.getScreenBounds(), yieldedBounds = first.getScreenBounds();
    check(Math.abs(draggedBounds.left - dragTo.x) < .01
      && Math.abs(draggedBounds.top + draggedBounds.height - dragTo.y) < .01
      && Math.hypot(yieldedBounds.left - firstBounds.left, yieldedBounds.top - firstBounds.top) < .01
      && intersects(draggedBounds, yieldedBounds) && manager.getAvoidanceStats().candidateChecks === 0,
    'drag owns the pointer and pauses avoidance without moving its neighbor');
    let previousNeighbor = first.getScreenBounds();
    let maxNeighborStep = 0;
    for (let frame = 0; frame < 24; frame++) {
      const pointerX = dragTo.x + (frame % 2 ? .2 : -.2);
      await nextFrame(() => second.setDragScreenPosition(new C.Cartesian2(pointerX, dragTo.y)));
      const a = first.getScreenBounds(), b = second.getScreenBounds();
      maxNeighborStep = Math.max(maxNeighborStep, Math.hypot(a.left - previousNeighbor.left, a.top - previousNeighbor.top));
      if (Math.abs(b.left - pointerX) > .01 || manager.getAvoidanceStats().candidateChecks !== 0) {
        throw new Error('subpixel drag broke pointer ownership or ran avoidance before release');
      }
      previousNeighbor = a;
    }
    check(maxNeighborStep < .01, '24-frame real GPU subpixel drag leaves neighbor placement unchanged');
    await nextFrame(() => second.setDragScreenPosition(dragTo));
    check(second.hitTest(new C.Cartesian2(draggedBounds.left + 2, draggedBounds.top + 2)), 'hit testing follows avoided panel');
    const textureOffset = manager.count * 4 + second.index * 4;
    check(Math.abs(manager.renderer.targetData[textureOffset] - second.getOffset().x) < .01
      && Math.abs(manager.renderer.targetData[textureOffset + 1] - second.getOffset().y) < .01,
    'GPU panel and leader offsets equal the hit-test offsets');
    await nextFrame(() => second.setDragScreenPosition(undefined));
    check(!intersects(first.getScreenBounds(), second.getScreenBounds()), 'avoidance resumes and separates panels only after drag release');
    const beforeDisable = manager.callouts.map(c => c.getOffset());
    const preferredBeforeDisable = manager.callouts.map(c => c.getPreferredOffset());
    check(manager.callouts.some((c, i) => C.Cartesian2.distance(beforeDisable[i], preferredBeforeDisable[i]) > 1),
      'disable fixture includes a real avoided displacement');
    await nextFrame(() => manager.setAvoidance(false));
    check(manager.callouts.every((c, i) => C.Cartesian2.distance(c.getOffset(), cycle === 1 ? preferredBeforeDisable[i] : beforeDisable[i]) < .01),
      cycle === 1 ? 'explicit opt-out restores configured positions' : 'disabling avoidance keeps every displayed position by default');
    check(manager.callouts.every(c => C.Cartesian2.distance(c.getOffset(), c.getPreferredOffset()) < .01),
      'disabled placement remains stable as the preferred offset');
    // Separate display modes have their own collision groups and style state.
    first.setLines(['目标 A', '高度：1800 m', '状态：正常']);
    second.setLines(['目标 B', '高度：1800 m']);
    first.setFields([{ key: 'name', value: 'A' }, { key: 'height', value: 1800 }]);
    second.setFields([{ key: 'name', value: 'B' }, { key: 'height', value: 1800 }]);
    first.setStyle({ fontSize: 24, textColor: '#ff0000' }, 'detailed');
    first.setStyle({ fontSize: 12, textColor: '#00ff00', paddingTop: 2, paddingBottom: 2 }, 'compact');
    second.setDisplayMode('compact');
    first.setOffset(new C.Cartesian2(0, 0));
    second.setOffset(new C.Cartesian2(0, 0));
    await manager.flush();
    await nextFrame(() => manager.setAvoidance(true));
    const detailedHeight = first.getScreenBounds().height;
    check(intersects(first.getScreenBounds(), second.getScreenBounds())
      && manager.getAvoidanceStats().unresolved === 0,
    'compact and detailed panels may overlap without displacing each other');
    first.setDisplayMode('compact');
    await manager.flush();
    await nextFrame(() => viewer.scene.requestRender());
    check(first.getRenderedDisplayMode() === 'compact' && first.getScreenBounds().height < detailedHeight
      && !intersects(first.getScreenBounds(), second.getScreenBounds()),
    'compact dimensions and same-mode avoidance take effect together after the Worker batch');
    const compactWidth = first.getScreenBounds().width;
    first.setFields([{ key: 'name', value: 'A long compact field update' }, { key: 'height', value: 1800 }]);
    await manager.flush();
    await nextFrame(() => viewer.scene.requestRender());
    check(first.getScreenBounds().width > compactWidth && first.getStyle('detailed').fontSize === 24
      && first.getStyle('compact').fontSize === 12,
    'compact field updates resize the GPU panel and preserve both mode styles');
    // Native double-click dispatch exercises the shared canvas listener and its cleanup.
    second.setShow(false);
    await manager.flush();
    await nextFrame(() => viewer.scene.requestRender());
    const clickBounds = first.getScreenBounds(), canvasRect = viewer.canvas.getBoundingClientRect();
    const hoverFirst = () => {
      const bounds = first.getScreenBounds();
      viewer.canvas.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true, clientX: canvasRect.left + (bounds.left + 2) * canvasRect.width / viewer.canvas.clientWidth,
        clientY: canvasRect.top + (bounds.top + 2) * canvasRect.height / viewer.canvas.clientHeight,
      }));
    };
    hoverFirst();
    check(manager.hover.element.style.display === 'none', 'compact hover does not show pin or close buttons');
    const doubleClick = () => viewer.canvas.dispatchEvent(new MouseEvent('dblclick', {
      bubbles: true, cancelable: true, button: 0,
      clientX: canvasRect.left + (clickBounds.left + 2) * canvasRect.width / viewer.canvas.clientWidth,
      clientY: canvasRect.top + (clickBounds.top + 2) * canvasRect.height / viewer.canvas.clientHeight,
    }));
    const beforeDoubleClick = displayChanges;
    viewer.canvas.dispatchEvent(new MouseEvent('click', {
      bubbles: true, cancelable: true, button: 0,
      clientX: canvasRect.left + (clickBounds.left + 2) * canvasRect.width / viewer.canvas.clientWidth,
      clientY: canvasRect.top + (clickBounds.top + 2) * canvasRect.height / viewer.canvas.clientHeight,
    }));
    check(clicks === 1, 'shared click callback is available on the Cesium backend');
    doubleClick();
    await manager.flush();
    await nextFrame(() => viewer.scene.requestRender());
    check(first.getDisplayMode() === 'detailed' && first.getRenderedDisplayMode() === 'detailed'
      && first.getScreenBounds().height === detailedHeight && displayChanges === beforeDoubleClick + 1 && doubleClicks === 1,
    'double click restores detailed text and style and emits exactly one mode-change callback');
    hoverFirst();
    check(manager.hover.element.style.display === 'flex', 'detailed hover still shows the action buttons');
    const buttons = [...manager.hover.element.querySelectorAll('button')];
    check(buttons.length === 2 && buttons.every(button => getComputedStyle(button).borderRadius === '50%'
      && button.getBoundingClientRect().width <= 18 && button.getBoundingClientRect().height <= 18),
    'detailed title action buttons are small circles');
    // A fully transparent panel must retain bounds and pointer hit regions even with zero instances.
    for (const item of manager.callouts) {
      item.setLines([]);
      for (const section of ['detailed', 'compact', 'title']) item.setStyle({ showBorder: false, showLeader: false,
        backgroundColor: 'transparent', textColor: 'transparent', badgeColor: 'transparent', badgeTextColor: 'transparent' }, section);
    }
    await manager.flush();
    await nextFrame(() => viewer.scene.requestRender());
    const bounds = handle.getScreenBounds();
    check(bounds.visible && bounds.width > 0 && handle.hitTest(new C.Cartesian2(bounds.left + 1, bounds.top + 1)),
      'zero-instance transparent panels still have valid hit regions');
    manager.destroy();
    manager.destroy();
    const changesAtDestroy = displayChanges;
    doubleClick();
    check(displayChanges === changesAtDestroy, 'destroy removes the double-click listener');
    check(viewer.scene.primitives.length === primitives
      && viewer.scene.preUpdate.numberOfListeners === beforeUpdate
      && viewer.scene.postRender.numberOfListeners === afterRender
      && !viewer.container.querySelector('.target-callout-actions'),
    `cycle ${cycle}: primitives, listeners and toolbar restored`);
    manager = undefined;
  }
  check(renderErrors.length === 0, 'no Cesium render errors');
  output.textContent = results.join('\n') + '\nALL PASSED';
} catch (error) {
  output.textContent = results.join('\n') + '\nFAIL ' + error.stack;
} finally {
  manager?.destroy();
  viewer?.destroy();
}
