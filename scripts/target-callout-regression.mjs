import * as C from "cesium";
import { TargetCallout } from "../src/cesium/tools/target-callout/index.ts";
import { createLocalWorldBaseLayers, completeLocalWorldBaseLayer } from "../src/cesium/tools/localWorldImagery.ts";
import { applyDefaultViewerConfig } from "../src/cesium/tools/viewerConfig.ts";
import { applyCalloutRenderQuality } from "../src/cesium/tools/target-callout/renderQuality.ts";

const output = document.querySelector("#result");
const results = [];
let viewer;
let annotation;
function check(condition, message) {
  if (!condition) throw new Error(message);
  results.push(`PASS ${message}`);
}
try {
  const base = await createLocalWorldBaseLayers();
  viewer = new C.Viewer("viewer", {
    baseLayer: base.west, baseLayerPicker: false, geocoder: false,
    animation: false, timeline: false, useDefaultRenderLoop: false,
  });
  applyDefaultViewerConfig(viewer);
  completeLocalWorldBaseLayer(viewer, base);
  let renderError;
  viewer.scene.renderError.addEventListener((_scene, error) => { renderError = error; });
  const draw = () => {
    viewer.resize();
    viewer.render();
    if (renderError) throw renderError;
  };
  const position = C.Cartesian3.fromDegrees(110, 32, 1800);
  const count = viewer.scene.primitives.length;
  const listeners = viewer.scene.preUpdate.numberOfListeners;
  annotation = new TargetCallout(viewer.scene, position);
  annotation.setLines(["目标 001", "经度 110.00000°", "纬度 32.00000°"]);
  let maximumError = 0;
  for (const scale of [1, 2]) {
    viewer.resolutionScale = scale;
    for (const range of [6000, 15000, 60000]) {
      for (const heading of [0, 1.3, 2.8]) {
        viewer.camera.lookAt(position, new C.HeadingPitchRange(heading, -0.8, range));
        viewer.camera.lookAtTransform(C.Matrix4.IDENTITY);
        for (const distance of [50, 100]) {
          annotation.setDistance(distance);
          draw();
          const target = C.SceneTransforms.worldToWindowCoordinates(viewer.scene, position);
          const corner = annotation.panel.computeScreenSpacePosition(viewer.scene);
          const middle = annotation.line.computeScreenSpacePosition(viewer.scene);
          const error = Math.abs(C.Cartesian2.distance(target, corner) - distance);
          maximumError = Math.max(maximumError, error);
          if (error > 1 || Math.abs(C.Cartesian2.distance(target, middle) - distance / 2) > 1) {
            throw new Error(`screen offset error ${error}, scale ${scale}, range ${range}`);
          }
          if (!annotation.panel.show) throw new Error("visible target unexpectedly hidden");
        }
      }
    }
  }
  check(true, `36 camera/distance/render-scale combinations; max error ${maximumError.toFixed(6)} CSS px`);
  check(annotation.panel.color.alpha === 0 && C.Color.equals(annotation.line.color, C.Color.RED)
    && annotation.borders.every((item) => C.Color.equals(item.color, C.Color.RED))
    && annotation.rows.every((item) => C.Color.equals(item.fillColor, C.Color.RED)), "defaults: red leader/borders/text, transparent background");
  for (const offset of [new C.Cartesian2(-180, -30), new C.Cartesian2(160, 200), new C.Cartesian2(-150, 180)]) {
    annotation.setOffset(offset);
    draw();
    const anchor = annotation.getTargetScreenPosition();
    const corner = annotation.panel.computeScreenSpacePosition(viewer.scene);
    check(C.Cartesian2.distance(C.Cartesian2.subtract(corner, anchor, new C.Cartesian2()), offset) < 1,
      `free drag offset ${offset.x},${offset.y} preserves screen coordinates`);
    const centre = new C.Cartesian2(corner.x + annotation.panel.width / 2, corner.y - annotation.panel.height / 2);
    check(annotation.hitTest(centre), "fully transparent interior hit test");
    const angle = annotation.line.rotation;
    const end = new C.Cartesian2(anchor.x + Math.cos(angle) * annotation.line.width, anchor.y - Math.sin(angle) * annotation.line.width);
    const endpoint = C.Cartesian2.add(anchor, annotation.getLeaderEndpoint(), new C.Cartesian2());
    check(C.Cartesian2.distance(end, endpoint) < 1, "rotated leader endpoint reaches nearest panel corner");
  }
  const expectedCorners = [
    [80, -80, "bottom-left"], [-600, -80, "bottom-right"],
    [80, 400, "top-left"], [-600, 400, "top-right"],
  ];
  for (const [x, y, expected] of expectedCorners) {
    annotation.setOffset(new C.Cartesian2(x, y));
    draw();
    check(annotation.getLeaderCorner() === expected, `nearest corner ${expected}`);
  }
  annotation.setOffset(new C.Cartesian2(80, 60));
  check(annotation.getLeaderCorner() === "top-left", "corner before padding resize");
  annotation.setStyle({ paddingTop: 112 });
  check(annotation.getLeaderCorner() === "bottom-left", "padding resize recomputes nearest corner");
  annotation.setStyle({ fontSize: 14, lineGap: 20, paddingTop: 10, paddingRight: 30, paddingBottom: 25, paddingLeft: 40 });
  check(annotation.rows[1].pixelOffset.y - annotation.rows[0].pixelOffset.y === 34
    && annotation.rows[2].pixelOffset.y - annotation.rows[1].pixelOffset.y === 34,
    "uniform line gap: 14px text + 20px gap");
  check(annotation.rows[0].pixelOffset.x - annotation.getOffset().x === 42
    && annotation.rows[0].pixelOffset.y - (annotation.getOffset().y - annotation.panel.height) === 12
    && annotation.panel.height === 121, "independent padding and content-driven panel height");
  const oldWidth = annotation.panel.width;
  annotation.setStyle({ paddingRight: 50 });
  check(annotation.panel.width === oldWidth + 20, "right padding grows width without moving text");
  const initialOffset = new C.Cartesian2(-360, 200);
  const created = new TargetCallout(viewer.scene, position, { offset: initialOffset, distance: 50, style: { lineGap: 9 } });
  initialOffset.x = 123;
  check(created.getOffset().x === -360 && created.getOffset().y === 200 && created.getStyle().lineGap === 9,
    "constructor offset overrides distance and copies caller data");
  created.destroy();
  annotation.setStyle({ lineGap: 7, paddingTop: 12, paddingRight: 14, paddingBottom: 12, paddingLeft: 14 });
  annotation.setStyle({ showBorder: false, showLeader: false, fontSize: 28, fontStyle: "bold italic", textColor: "#00ff00", backgroundColor: "rgba(0,0,255,0.5)" });
  draw();
  check(!annotation.line.show && annotation.borders.every((item) => !item.show)
    && annotation.rows[0].show && annotation.rows[0].font.includes("bold italic 28px")
    && C.Color.equals(annotation.rows[0].fillColor, C.Color.LIME)
    && annotation.panel.height === 126 && annotation.panel.color.alpha === 0.5, "independent visibility, colors and larger styled text layout");
  annotation.setStyle({ showBorder: true, showLeader: true, leaderColor: "#ffff00", borderColor: "#0000ff" });
  draw();
  check(annotation.line.show && C.Color.equals(annotation.line.color, C.Color.YELLOW)
    && annotation.borders.every((item) => item.show && C.Color.equals(item.color, C.Color.BLUE)), "leader and border colors update independently");
  const bulk = Array.from({ length: 99 }, () => new TargetCallout(viewer.scene, position));
  draw();
  check(viewer.scene.primitives.length === count + 2 && annotation.pool.backgrounds.length === 600 && annotation.pool.labels.length === 600,
    "100 callouts share two collections: 600 billboards and 600 labels");
  bulk[0].setStyle({ textColor: "#ffffff" });
  check(bulk[1].getStyle().textColor === "#ff0000", "per-target style changes are isolated");
  for (const item of bulk) item.destroy();
  check(annotation.pool.backgrounds.length === 6 && annotation.pool.labels.length === 6 && annotation.panel.show,
    "destroying 99 callouts preserves remaining instance");
  annotation.setPosition(C.Cartesian3.fromDegrees(110.001, 32.001, 1800));
  annotation.setLines(["目标 001", "updated"]);
  draw();
  check(annotation.rows[1].text === "updated" && C.Cartesian3.equals(annotation.panel.position, annotation.line.position), "moving position and dynamic text share anchor");
  annotation.setShow(false);
  draw();
  check(!annotation.panel.show && !annotation.rows[0].show, "explicit hide affects whole annotation");
  annotation.setShow(true);
  annotation.setPosition(C.Cartesian3.negate(position, new C.Cartesian3()));
  draw();
  check(!annotation.panel.show, "earth-back target hidden");
  annotation.setPosition(C.Cartesian3.add(viewer.camera.positionWC, C.Cartesian3.multiplyByScalar(viewer.camera.directionWC, -100, new C.Cartesian3()), new C.Cartesian3()));
  draw();
  check(!annotation.panel.show, "behind-camera target hidden");
  annotation.setPosition(C.Cartesian3.add(viewer.camera.positionWC, C.Cartesian3.add(C.Cartesian3.multiplyByScalar(viewer.camera.directionWC, 100, new C.Cartesian3()), C.Cartesian3.multiplyByScalar(viewer.camera.rightWC, 100000, new C.Cartesian3()), new C.Cartesian3()), new C.Cartesian3()));
  draw();
  check(!annotation.panel.show, "offscreen target hidden");
  annotation.destroy();
  annotation.destroy();
  check(viewer.scene.primitives.length === count && viewer.scene.preUpdate.numberOfListeners === listeners, "idempotent destroy restores collections and listeners");
  for (let i = 0; i < 4; i++) {
    annotation = new TargetCallout(viewer.scene, position);
    draw();
    annotation.destroy();
  }
  check(viewer.scene.primitives.length === count && viewer.scene.preUpdate.numberOfListeners === listeners, "repeated create/destroy has no resource accumulation");
  const oldScale = viewer.resolutionScale;
  const restoreQuality = applyCalloutRenderQuality(viewer);
  draw(); draw();
  const ratio = viewer.canvas.width / viewer.canvas.clientWidth;
  check(!viewer.useBrowserRecommendedResolution && ratio >= 1.99
    && !viewer.scene.postProcessStages.fxaa.enabled
    && (!viewer.scene.msaaSupported || viewer.scene.msaaSamples === 4),
    `quality: actual buffer ratio ${ratio.toFixed(2)}, MSAA ${viewer.scene.msaaSamples}, FXAA off`);
  restoreQuality();
  check(viewer.resolutionScale === oldScale && viewer.scene.preUpdate.numberOfListeners === listeners,
    "quality settings and listener restored on cleanup");
  output.textContent = results.join("\n");
} catch (error) {
  output.textContent = `${results.join("\n")}\nFAIL ${error.stack}`;
} finally {
  annotation?.destroy();
  viewer?.destroy();
}

