import * as Cesium from "cesium";

type CameraEventTypes =
  Cesium.ScreenSpaceCameraController["rotateEventTypes"];

export interface ViewerConfigOverrides {
  translateEventTypes?: CameraEventTypes;
  rotateEventTypes?: CameraEventTypes;
  tiltEventTypes?: CameraEventTypes;
  zoomEventTypes?: CameraEventTypes;
}

/**
 * Applies the shared interaction defaults used by every Cesium example.
 *
 * Pass an override when an example needs a different mapping:
 * `applyDefaultViewerConfig(viewer, { tiltEventTypes: MIDDLE_DRAG })`.
 * Controller properties may also be reassigned after this function returns.
 */
export function applyDefaultViewerConfig(
  viewer: Cesium.Viewer,
  overrides: ViewerConfigOverrides = {},
): void {
  const controller = viewer.scene.screenSpaceCameraController;

  // Cesium calls globe panning in 3D "rotate" and view-orbiting "tilt".
  // Keep the user-facing convention consistent in every scene:
  // left drag moves the map, right drag rotates/tilts the view.
  controller.translateEventTypes = Cesium.CameraEventType.LEFT_DRAG;
  controller.rotateEventTypes = Cesium.CameraEventType.LEFT_DRAG;
  controller.tiltEventTypes = Cesium.CameraEventType.RIGHT_DRAG;
  controller.zoomEventTypes = [
    Cesium.CameraEventType.WHEEL,
    Cesium.CameraEventType.PINCH,
  ];

  if ("translateEventTypes" in overrides) {
    controller.translateEventTypes = overrides.translateEventTypes;
  }
  if ("rotateEventTypes" in overrides) {
    controller.rotateEventTypes = overrides.rotateEventTypes;
  }
  if ("tiltEventTypes" in overrides) {
    controller.tiltEventTypes = overrides.tiltEventTypes;
  }
  if ("zoomEventTypes" in overrides) {
    controller.zoomEventTypes = overrides.zoomEventTypes;
  }
}
