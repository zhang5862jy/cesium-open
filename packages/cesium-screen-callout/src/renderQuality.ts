import type { Viewer } from "cesium";

/** Scene-wide quality for this demo. Rechecks DPR and viewport size without remounting. */
export function applyCalloutRenderQuality(viewer: Viewer): () => void {
  const previous = {
    recommended: viewer.useBrowserRecommendedResolution,
    scale: viewer.resolutionScale,
    samples: viewer.scene.msaaSamples,
    fxaa: viewer.scene.postProcessStages.fxaa.enabled,
  };
  viewer.useBrowserRecommendedResolution = false;
  viewer.scene.msaaSamples = viewer.scene.msaaSupported ? 4 : 1;
  // SDF glyph edges are already antialiased in the shader. A second full-frame
  // FXAA pass softens the whole glyph, especially at 12–16 CSS pixels.
  viewer.scene.postProcessStages.fxaa.enabled = false;
  const update = () => {
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, viewer.canvas.clientWidth);
    const height = Math.max(1, viewer.canvas.clientHeight);
    // Match one Cesium drawing-buffer pixel to one physical display pixel.
    // Rendering above DPR makes the browser downsample the final canvas and can
    // blur text again. Bound the buffer for unusually large/high-DPI windows.
    const ratio = Math.min(dpr, 3, Math.sqrt(12_000_000 / (width * height)), 8192 / width, 8192 / height);
    const scale = ratio / dpr;
    if (Math.abs(viewer.resolutionScale - scale) > 0.001) viewer.resolutionScale = scale;
  };
  update();
  const removeUpdate = viewer.scene.preUpdate.addEventListener(update);
  return () => {
    removeUpdate();
    if (viewer.isDestroyed()) return;
    viewer.useBrowserRecommendedResolution = previous.recommended;
    viewer.resolutionScale = previous.scale;
    viewer.scene.msaaSamples = previous.samples;
    viewer.scene.postProcessStages.fxaa.enabled = previous.fxaa;
  };
}
