import type * as Cesium from "cesium";

/** Construction options for one spherical, GPU-animated energy shield. */
export interface EnergyShieldOptions {
  /** World-space center of the shield. */
  position: Cesium.Cartesian3;
  /** Shield radius in meters. */
  radius: number;
  /** Translucent surface color. */
  color?: Cesium.Color;
  /** Hexagon edges and impact-wave color. */
  glowColor?: Cesium.Color;
  /** Honeycomb density on each direction-projection face. */
  hexScale?: number;
  /** Base surface opacity in the inclusive range [0, 1]. */
  opacity?: number;
  /** Seconds between automatically generated impacts. */
  impactInterval?: number;
  /** Lifetime of one expanding impact wave in seconds. */
  impactDuration?: number;
  /** Whether random impacts are generated automatically. */
  autoImpact?: boolean;
}

/** Normalized local longitude/latitude coordinates for a shield impact. */
export interface EnergyShieldImpact {
  /** Horizontal coordinate, wrapped to [0, 1). */
  u: number;
  /** Vertical coordinate, clamped to [0, 1]. */
  v: number;
  /** Relative wave brightness. */
  intensity?: number;
}
