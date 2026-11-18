import type * as C from "cesium";

/** Screen-space interaction boundary shared by Cesium and DOM map renderers. */
export interface CalloutInteractionHost {
  readonly element: HTMLElement;
  requestRender(): void;
  onBeforeRender(listener: () => void): () => void;
  /** Temporarily suspend map navigation and restore its previous settings. */
  suspendInputs(): () => void;
  /** Exclude controls and unrelated overlays before performing a label hit test. */
  ownsEventTarget?(target: EventTarget | null): boolean;
}

export function createCesiumInteractionHost(scene: C.Scene): CalloutInteractionHost {
  return {
    element: scene.canvas,
    requestRender: () => scene.requestRender(),
    onBeforeRender: listener => scene.preUpdate.addEventListener(listener),
    ownsEventTarget: target => target === scene.canvas,
    suspendInputs: () => {
      const controller = scene.screenSpaceCameraController;
      const previousInputs = controller.enableInputs;
      let restored = false;
      controller.enableInputs = false;
      return () => {
        if (restored) return;
        restored = true;
        controller.enableInputs = previousInputs;
      };
    },
  };
}

export function normalizeCalloutInteractionHost(source: C.Scene | CalloutInteractionHost): CalloutInteractionHost {
  return "element" in source ? source : createCesiumInteractionHost(source);
}
