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
export declare function createCesiumInteractionHost(scene: C.Scene): CalloutInteractionHost;
export declare function normalizeCalloutInteractionHost(source: C.Scene | CalloutInteractionHost): CalloutInteractionHost;
//# sourceMappingURL=interactionHost.d.ts.map