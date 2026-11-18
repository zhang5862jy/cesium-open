import type { CalloutAvoidanceOptions, CalloutAvoidanceStats } from "./avoidance";
import type { CalloutDisplayMode } from "./display";
import type { CalloutTextRenderingOptions } from "./screenBatchRenderer";

/** Renderer-independent controls used by the public manager. */
export interface CalloutRenderer {
  readonly visibleCount: number;
  setAvoidance(options: boolean | Partial<CalloutAvoidanceOptions>, mode?: CalloutDisplayMode): void;
  getAvoidance(mode?: CalloutDisplayMode): CalloutAvoidanceOptions;
  getAvoidanceStats(mode?: CalloutDisplayMode): CalloutAvoidanceStats;
  setTextRendering(options: Partial<CalloutTextRenderingOptions>): void;
  getTextRendering(): CalloutTextRenderingOptions;
  destroy(): void;
}
