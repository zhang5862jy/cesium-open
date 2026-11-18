import type * as Cesium from "cesium";

/** One GPU-instanced hemisphere radar. Distances in scale are meters. */
export interface HemisphereRadarData {
  id: string;
  position: Cesium.Cartesian3;
  orientation?: Cesium.HeadingPitchRoll;
  scale: number | Cesium.Cartesian3;
  color?: Cesium.Color;
}

export interface InstancedHemisphereRadarOptions {
  /** Maximum number of records accepted by set(). */
  capacity?: number;
  /** Longitudinal subdivisions of the shared unit hemisphere. */
  sliceCount?: number;
  /** Elevation subdivisions of the shared unit hemisphere. */
  stackCount?: number;
  color?: Cesium.Color;
}

