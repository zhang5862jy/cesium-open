import type * as Cesium from "cesium";

export interface MovingTargetSample {
  time: string | Cesium.JulianDate;
  longitude: number;
  latitude: number;
  height: number;
  heading: number;
  pitch: number;
  roll: number;
}

export interface MovingTargetDefinition {
  id: string;
  name: string;
  modelType: string;
  targetType: string;
  modelUrl: string;
  faction: string;
  health: number;
  maxHealth: number;
  status?: string;
  showModel: boolean;
  scale?: number;
  minimumPixelSize?: number;
  forwardAxis?: Cesium.Axis;
  upAxis?: Cesium.Axis;
  samples: MovingTargetSample[];
}

export interface MovingTargetFactionStyle {
  color: Cesium.Color;
}

export interface MovingTargetLayerOptions {
  factions: Record<string, MovingTargetFactionStyle>;
  attitudeUnit?: "degrees" | "radians";
  modelLodDistance?: number;
  maxVisibleModels?: number;
  lodEvaluationInterval?: number;
  maxConcurrentLoads?: number;
  nearScaleDistance?: number;
  farScaleDistance?: number;
  nearScaleFactor?: number;
  farScaleFactor?: number;
  opacity?: number;
  silhouetteSize?: number;
}

export interface MovingTargetStats {
  totalTargets: number;
  modelTargets: number;
  hiddenTargets: number;
  dataHiddenTargets: number;
  loadingModels: number;
  pooledModels: number;
}

export interface MovingTargetCurrentState {
  id: string;
  name: string;
  modelType: string;
  targetType: string;
  faction: string;
  health: number;
  maxHealth: number;
  status: string;
  showModel: boolean;
  longitude: number;
  latitude: number;
  height: number;
  heading: number;
  pitch: number;
  roll: number;
  representation: "model" | "hidden";
}
