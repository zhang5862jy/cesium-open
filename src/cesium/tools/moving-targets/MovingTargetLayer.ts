import * as Cesium from "cesium";
import type {
  MovingTargetCurrentState,
  MovingTargetDefinition,
  MovingTargetFactionStyle,
  MovingTargetLayerOptions,
  MovingTargetSample,
  MovingTargetStats,
} from "./types";
import {
  getInterpolationAmount,
  interpolateAngle,
  interpolateNumber,
  slerpQuaternion,
} from "./interpolation";

interface PreparedSample {
  time: number;
  orientation: Cesium.Quaternion;
  longitude: number;
  latitude: number;
  height: number;
  heading: number;
  pitch: number;
  roll: number;
}

interface TargetState {
  id: string;
  name: string;
  modelType: string;
  targetType: string;
  faction: string;
  health: number;
  maxHealth: number;
  status: string;
  showModel: boolean;
  modelUrl: string;
  modelKey: string;
  scale: number;
  minimumPixelSize: number;
  forwardAxis: Cesium.Axis;
  upAxis: Cesium.Axis;
  samples: PreparedSample[];
  times: Float64Array;
  geodetics: Float64Array;
  orientations: Float64Array;
  attitudes: Float64Array;
  sampleIndex: number;
  currentPosition: Cesium.Cartesian3;
  currentOrientation: Cesium.Quaternion;
  currentHeading: number;
  currentPitch: number;
  currentRoll: number;
  currentLongitude: number;
  currentLatitude: number;
  currentHeight: number;
  model?: Cesium.Model;
  wantsModel: boolean;
  loadRequested: boolean;
  hasPosition: boolean;
  disposed: boolean;
  pickInfo: {
    type: "moving-target";
    id: string;
  };
}

const DEFAULT_MODEL_LOD_DISTANCE = 1_500_000;
const DEFAULT_MAX_VISIBLE_MODELS = 80;
const DEFAULT_LOD_INTERVAL = 10;
const DEFAULT_MAX_CONCURRENT_LOADS = 8;
const DEFAULT_NEAR_SCALE_DISTANCE = 0;
const DEFAULT_FAR_SCALE_DISTANCE = 20_000_000;
const DEFAULT_NEAR_SCALE_FACTOR = 100;
const DEFAULT_FAR_SCALE_FACTOR = 3000;
const DEFAULT_OPACITY = 0.62;
const DEFAULT_SILHOUETTE_SIZE = 1.6;
const J2000 = Cesium.JulianDate.fromIso8601("2000-01-01T12:00:00Z");

const scratchFirstQuaternion = new Cesium.Quaternion();
const scratchSecondQuaternion = new Cesium.Quaternion();
const scratchRotation = new Cesium.Matrix3();

function toSeconds(time: string | Cesium.JulianDate): number {
  const julianDate =
    typeof time === "string"
      ? Cesium.JulianDate.fromIso8601(time)
      : Cesium.JulianDate.clone(time);
  return Cesium.JulianDate.secondsDifference(julianDate, J2000);
}

export class MovingTargetLayer {
  private readonly viewer: Cesium.Viewer;
  private readonly factions: Record<string, MovingTargetFactionStyle>;
  private readonly attitudeUnit: "degrees" | "radians";
  private readonly lodEvaluationInterval: number;
  private readonly maxConcurrentLoads: number;
  private readonly targets = new Map<string, TargetState>();
  private readonly createdModels = new Set<Cesium.Model>();
  private readonly availableModels = new Map<string, Cesium.Model[]>();
  private readonly modelKeys = new WeakMap<Cesium.Model, string>();
  private readonly loadQueue: TargetState[] = [];
  private readonly removePreUpdate: () => void;
  private modelLodDistance: number;
  private maxVisibleModels: number;
  private readonly nearScaleDistance: number;
  private readonly farScaleDistance: number;
  private readonly nearScaleFactor: number;
  private readonly farScaleFactor: number;
  private opacity: number;
  private silhouetteSize: number;
  private loadingModels = 0;
  private reservedModels = 0;
  private frameNumber = 0;
  private destroyed = false;

  constructor(viewer: Cesium.Viewer, options: MovingTargetLayerOptions) {
    this.viewer = viewer;
    this.factions = options.factions;
    this.attitudeUnit = options.attitudeUnit ?? "degrees";
    this.modelLodDistance =
      options.modelLodDistance ?? DEFAULT_MODEL_LOD_DISTANCE;
    this.maxVisibleModels =
      options.maxVisibleModels ?? DEFAULT_MAX_VISIBLE_MODELS;
    this.lodEvaluationInterval = Math.max(
      1,
      options.lodEvaluationInterval ?? DEFAULT_LOD_INTERVAL,
    );
    this.maxConcurrentLoads = Math.max(
      1,
      options.maxConcurrentLoads ?? DEFAULT_MAX_CONCURRENT_LOADS,
    );
    this.nearScaleDistance =
      options.nearScaleDistance ?? DEFAULT_NEAR_SCALE_DISTANCE;
    this.farScaleDistance =
      options.farScaleDistance ?? DEFAULT_FAR_SCALE_DISTANCE;
    this.nearScaleFactor =
      options.nearScaleFactor ?? DEFAULT_NEAR_SCALE_FACTOR;
    this.farScaleFactor =
      options.farScaleFactor ?? DEFAULT_FAR_SCALE_FACTOR;
    this.opacity = Math.max(
      0.05,
      Math.min(1, options.opacity ?? DEFAULT_OPACITY),
    );
    this.silhouetteSize = Math.max(
      0,
      options.silhouetteSize ?? DEFAULT_SILHOUETTE_SIZE,
    );
    this.removePreUpdate = viewer.scene.preUpdate.addEventListener(
      (_scene: Cesium.Scene, time: Cesium.JulianDate) => {
        this.update(time);
      },
    );
  }

  addTarget(definition: MovingTargetDefinition): void {
    if (this.destroyed) {
      throw new Error("MovingTargetLayer has been destroyed.");
    }
    if (this.targets.has(definition.id)) {
      throw new Error(`Moving target "${definition.id}" already exists.`);
    }
    const factionStyle = this.factions[definition.faction];
    if (!factionStyle) {
      throw new Error(`Unknown moving target faction "${definition.faction}".`);
    }

    const forwardAxis = definition.forwardAxis ?? Cesium.Axis.X;
    const upAxis = definition.upAxis ?? Cesium.Axis.Z;
    const modelKey = `${definition.modelUrl}|${forwardAxis}|${upAxis}`;
    const pickInfo = {
      type: "moving-target" as const,
      id: definition.id,
    };
    const target: TargetState = {
      id: definition.id,
      name: definition.name,
      modelType: definition.modelType,
      targetType: definition.targetType,
      faction: definition.faction,
      health: definition.health,
      maxHealth: definition.maxHealth,
      status: definition.status ?? "active",
      showModel: definition.showModel,
      modelUrl: definition.modelUrl,
      modelKey,
      scale: definition.scale ?? 1,
      minimumPixelSize: definition.minimumPixelSize ?? 0,
      forwardAxis,
      upAxis,
      samples: [],
      times: new Float64Array(),
      geodetics: new Float64Array(),
      orientations: new Float64Array(),
      attitudes: new Float64Array(),
      sampleIndex: 0,
      currentPosition: new Cesium.Cartesian3(),
      currentOrientation: new Cesium.Quaternion(),
      currentHeading: 0,
      currentPitch: 0,
      currentRoll: 0,
      currentLongitude: 0,
      currentLatitude: 0,
      currentHeight: 0,
      wantsModel: false,
      loadRequested: false,
      hasPosition: false,
      disposed: false,
      pickInfo,
    };
    this.targets.set(target.id, target);
    this.appendSamples(target, definition.samples);
  }

  addSamples(id: string, samples: MovingTargetSample[]): void {
    const target = this.targets.get(id);
    if (!target) {
      throw new Error(`Moving target "${id}" does not exist.`);
    }
    this.appendSamples(target, samples);
  }

  removeTarget(id: string): boolean {
    const target = this.targets.get(id);
    if (!target) return false;

    target.disposed = true;
    target.wantsModel = false;
    this.releaseModel(target);
    return this.targets.delete(id);
  }

  clear(): void {
    for (const id of Array.from(this.targets.keys())) {
      this.removeTarget(id);
    }
    this.loadQueue.length = 0;
  }

  setModelLodDistance(distance: number): void {
    this.modelLodDistance = Math.max(0, distance);
    this.frameNumber = this.lodEvaluationInterval;
  }

  setMaxVisibleModels(count: number): void {
    this.maxVisibleModels = Math.max(0, Math.floor(count));
    this.frameNumber = this.lodEvaluationInterval;
  }

  setOpacity(opacity: number): void {
    this.opacity = Math.max(0.05, Math.min(1, opacity));
    for (const target of this.targets.values()) {
      if (target.model) this.applyModelStyle(target, target.model);
    }
  }

  setSilhouetteSize(size: number): void {
    this.silhouetteSize = Math.max(0, size);
    for (const model of this.createdModels) {
      model.silhouetteSize = this.silhouetteSize;
    }
  }

  getStats(): MovingTargetStats {
    let modelTargets = 0;
    let dataHiddenTargets = 0;
    for (const target of this.targets.values()) {
      if (target.model?.show) modelTargets++;
      if (!target.showModel) dataHiddenTargets++;
    }
    return {
      totalTargets: this.targets.size,
      modelTargets,
      hiddenTargets: this.targets.size - modelTargets,
      dataHiddenTargets,
      loadingModels: this.loadingModels,
      pooledModels: this.createdModels.size - modelTargets,
    };
  }

  getCurrentState(id: string): MovingTargetCurrentState | undefined {
    const target = this.targets.get(id);
    if (!target?.hasPosition) return undefined;
    return {
      id: target.id,
      name: target.name,
      modelType: target.modelType,
      targetType: target.targetType,
      faction: target.faction,
      health: target.health,
      maxHealth: target.maxHealth,
      status: target.status,
      showModel: target.showModel,
      longitude: Cesium.Math.toDegrees(target.currentLongitude),
      latitude: Cesium.Math.toDegrees(target.currentLatitude),
      height: target.currentHeight,
      heading: Cesium.Math.toDegrees(target.currentHeading),
      pitch: Cesium.Math.toDegrees(target.currentPitch),
      roll: Cesium.Math.toDegrees(target.currentRoll),
      representation: target.model?.show ? "model" : "hidden",
    };
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.removePreUpdate();
    this.clear();

    for (const model of this.createdModels) {
      if (!model.isDestroyed()) {
        this.viewer.scene.primitives.remove(model);
      }
    }
    this.createdModels.clear();
    this.availableModels.clear();
  }

  private appendSamples(
    target: TargetState,
    samples: MovingTargetSample[],
  ): void {
    for (const sample of samples) {
      const longitude = Cesium.Math.toRadians(sample.longitude);
      const latitude = Cesium.Math.toRadians(sample.latitude);
      const heading = this.toRadians(sample.heading);
      const pitch = this.toRadians(sample.pitch);
      const roll = this.toRadians(sample.roll);
      const position = Cesium.Cartesian3.fromRadians(
        longitude,
        latitude,
        sample.height,
      );
      const orientation = Cesium.Transforms.headingPitchRollQuaternion(
        position,
        new Cesium.HeadingPitchRoll(heading, pitch, roll),
      );
      target.samples.push({
        time: toSeconds(sample.time),
        orientation,
        longitude,
        latitude,
        height: sample.height,
        heading,
        pitch,
        roll,
      });
    }

    target.samples.sort((first, second) => first.time - second.time);
    const deduplicated: PreparedSample[] = [];
    for (const sample of target.samples) {
      if (
        deduplicated.length > 0 &&
        deduplicated[deduplicated.length - 1]!.time === sample.time
      ) {
        deduplicated[deduplicated.length - 1] = sample;
      } else {
        deduplicated.push(sample);
      }
    }
    target.samples = deduplicated;
    target.times = new Float64Array(deduplicated.length);
    target.geodetics = new Float64Array(deduplicated.length * 3);
    target.orientations = new Float64Array(deduplicated.length * 4);
    target.attitudes = new Float64Array(deduplicated.length * 3);
    deduplicated.forEach((sample, index) => {
      target.times[index] = sample.time;
      const geodeticOffset = index * 3;
      target.geodetics[geodeticOffset] = sample.longitude;
      target.geodetics[geodeticOffset + 1] = sample.latitude;
      target.geodetics[geodeticOffset + 2] = sample.height;
      const orientationOffset = index * 4;
      target.orientations[orientationOffset] = sample.orientation.x;
      target.orientations[orientationOffset + 1] = sample.orientation.y;
      target.orientations[orientationOffset + 2] = sample.orientation.z;
      target.orientations[orientationOffset + 3] = sample.orientation.w;
      target.attitudes[index * 3] = sample.heading;
      target.attitudes[index * 3 + 1] = sample.pitch;
      target.attitudes[index * 3 + 2] = sample.roll;
    });
    target.sampleIndex = 0;
  }

  private toRadians(value: number): number {
    return this.attitudeUnit === "degrees"
      ? Cesium.Math.toRadians(value)
      : value;
  }

  private update(time: Cesium.JulianDate): void {
    if (this.destroyed) return;
    const seconds = Cesium.JulianDate.secondsDifference(time, J2000);
    for (const target of this.targets.values()) {
      this.updateTarget(target, seconds);
    }

    this.frameNumber++;
    if (this.frameNumber >= this.lodEvaluationInterval) {
      this.frameNumber = 0;
      this.updateLod();
    }
  }

  private updateTarget(target: TargetState, seconds: number): void {
    const sampleCount = target.times.length;
    if (sampleCount === 0) {
      target.hasPosition = false;
      if (target.model) target.model.show = false;
      return;
    }

    let firstIndex: number;
    let secondIndex: number;
    let amount: number;
    if (sampleCount === 1 || seconds <= target.times[0]!) {
      firstIndex = 0;
      secondIndex = 0;
      amount = 0;
    } else if (seconds >= target.times[sampleCount - 1]!) {
      firstIndex = sampleCount - 1;
      secondIndex = firstIndex;
      amount = 0;
    } else {
      let index = target.sampleIndex;
      if (
        index >= sampleCount - 1 ||
        seconds < target.times[index]! ||
        seconds >= target.times[index + 1]!
      ) {
        index = this.findSampleIndex(target.times, seconds);
      }
      target.sampleIndex = index;
      firstIndex = index;
      secondIndex = index + 1;
      amount = getInterpolationAmount(
        seconds,
        target.times[firstIndex]!,
        target.times[secondIndex]!,
      );
    }

    const firstGeodetic = firstIndex * 3;
    const secondGeodetic = secondIndex * 3;
    target.currentLongitude = interpolateAngle(
      target.geodetics[firstGeodetic]!,
      target.geodetics[secondGeodetic]!,
      amount,
    );
    target.currentLatitude = interpolateNumber(
      target.geodetics[firstGeodetic + 1]!,
      target.geodetics[secondGeodetic + 1]!,
      amount,
    );
    target.currentHeight = interpolateNumber(
      target.geodetics[firstGeodetic + 2]!,
      target.geodetics[secondGeodetic + 2]!,
      amount,
    );
    Cesium.Cartesian3.fromRadians(
      target.currentLongitude,
      target.currentLatitude,
      target.currentHeight,
      Cesium.Ellipsoid.WGS84,
      target.currentPosition,
    );

    this.unpackOrientation(
      target.orientations,
      firstIndex * 4,
      scratchFirstQuaternion,
    );
    if (firstIndex === secondIndex) {
      Cesium.Quaternion.clone(
        scratchFirstQuaternion,
        target.currentOrientation,
      );
    } else {
      this.unpackOrientation(
        target.orientations,
        secondIndex * 4,
        scratchSecondQuaternion,
      );
      slerpQuaternion(
        scratchFirstQuaternion,
        scratchSecondQuaternion,
        amount,
        target.currentOrientation,
      );
    }

    const firstAttitude = firstIndex * 3;
    const secondAttitude = secondIndex * 3;
    target.currentHeading = interpolateAngle(
      target.attitudes[firstAttitude]!,
      target.attitudes[secondAttitude]!,
      amount,
    );
    target.currentPitch = interpolateNumber(
      target.attitudes[firstAttitude + 1]!,
      target.attitudes[secondAttitude + 1]!,
      amount,
    );
    target.currentRoll = interpolateAngle(
      target.attitudes[firstAttitude + 2]!,
      target.attitudes[secondAttitude + 2]!,
      amount,
    );

    target.hasPosition = true;

    if (target.model?.show) {
      Cesium.Matrix3.fromQuaternion(target.currentOrientation, scratchRotation);
      Cesium.Matrix4.fromRotationTranslation(
        scratchRotation,
        target.currentPosition,
        target.model.modelMatrix,
      );
      target.model.scale =
        target.scale * this.getDistanceScale(target.currentPosition);
    }
  }

  private findSampleIndex(times: Float64Array, seconds: number): number {
    let low = 0;
    let high = times.length - 2;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      if (seconds < times[middle]!) {
        high = middle - 1;
      } else if (seconds >= times[middle + 1]!) {
        low = middle + 1;
      } else {
        return middle;
      }
    }
    return Math.max(0, Math.min(times.length - 2, low));
  }

  private unpackOrientation(
    values: Float64Array,
    offset: number,
    result: Cesium.Quaternion,
  ): Cesium.Quaternion {
    result.x = values[offset]!;
    result.y = values[offset + 1]!;
    result.z = values[offset + 2]!;
    result.w = values[offset + 3]!;
    return result;
  }

  private updateLod(): void {
    const cameraPosition = this.viewer.camera.positionWC;
    const maximumDistanceSquared =
      this.modelLodDistance * this.modelLodDistance;
    const candidates = Array.from(this.targets.values())
      .filter(
        (target) =>
          target.showModel &&
          target.hasPosition &&
          Cesium.Cartesian3.distanceSquared(
            cameraPosition,
            target.currentPosition,
          ) <= maximumDistanceSquared,
      )
      .sort(
        (first, second) =>
          Cesium.Cartesian3.distanceSquared(
            cameraPosition,
            first.currentPosition,
          ) -
          Cesium.Cartesian3.distanceSquared(
            cameraPosition,
            second.currentPosition,
          ),
      )
      .slice(0, this.maxVisibleModels);
    const selected = new Set(candidates);

    for (const target of this.targets.values()) {
      const wantsModel = selected.has(target);
      target.wantsModel = wantsModel;
      if (!wantsModel) {
        this.releaseModel(target);
      } else if (!target.model) {
        this.requestModel(target);
      }
    }
    this.drainLoadQueue();
  }

  private requestModel(target: TargetState): void {
    const available = this.availableModels.get(target.modelKey)?.pop();
    if (available) {
      this.bindModel(target, available);
      return;
    }
    if (this.reservedModels >= this.maxVisibleModels) {
      this.releaseOneIncompatiblePooledModel(target.modelKey);
    }
    if (target.loadRequested) return;
    target.loadRequested = true;
    this.loadQueue.push(target);
  }

  private releaseOneIncompatiblePooledModel(requiredKey: string): void {
    for (const [key, models] of this.availableModels) {
      if (key === requiredKey || models.length === 0) continue;
      const model = models.pop()!;
      this.createdModels.delete(model);
      this.viewer.scene.primitives.remove(model);
      this.reservedModels--;
      if (models.length === 0) this.availableModels.delete(key);
      return;
    }
  }

  private drainLoadQueue(): void {
    while (
      this.loadingModels < this.maxConcurrentLoads &&
      this.reservedModels < this.maxVisibleModels &&
      this.loadQueue.length > 0
    ) {
      const target = this.loadQueue.shift()!;
      if (target.disposed || !target.wantsModel || target.model) {
        target.loadRequested = false;
        continue;
      }
      this.loadingModels++;
      this.reservedModels++;
      void this.loadModel(target);
    }
  }

  private async loadModel(target: TargetState): Promise<void> {
    try {
      const model = await Cesium.Model.fromGltfAsync({
        url: target.modelUrl,
        forwardAxis: target.forwardAxis,
        upAxis: target.upAxis,
        allowPicking: true,
        incrementallyLoadTextures: true,
        shadows: Cesium.ShadowMode.DISABLED,
        silhouetteSize: this.silhouetteSize,
      });
      if (this.destroyed) {
        model.destroy();
        return;
      }
      this.viewer.scene.primitives.add(model);
      this.createdModels.add(model);
      this.modelKeys.set(model, target.modelKey);
      if (!target.disposed && target.wantsModel && !target.model) {
        this.bindModel(target, model);
      } else {
        this.poolModel(model);
      }
    } catch (error) {
      console.error(`Failed to load moving target model: ${target.modelUrl}`, error);
      this.reservedModels--;
    } finally {
      target.loadRequested = false;
      this.loadingModels--;
      this.drainLoadQueue();
    }
  }

  private bindModel(target: TargetState, model: Cesium.Model): void {
    target.model = model;
    model.id = target.pickInfo;
    model.scale =
      target.scale * this.getDistanceScale(target.currentPosition);
    // 距离缩放由图层逐帧计算，避免与 Cesium 的 minimumPixelSize 二次放大。
    model.minimumPixelSize = 0;
    this.applyModelStyle(target, model);
    model.show = target.showModel && target.hasPosition;
  }

  private applyModelStyle(target: TargetState, model: Cesium.Model): void {
    const factionStyle = this.factions[target.faction]!;
    const fillColor = Cesium.Color.clone(factionStyle.color);
    fillColor.alpha = this.opacity;
    model.color = Cesium.Color.clone(fillColor, model.color);
    model.colorBlendMode = Cesium.ColorBlendMode.REPLACE;
    model.colorBlendAmount = 1;

    const outlineColor = Cesium.Color.clone(factionStyle.color);
    outlineColor.alpha = Math.min(1, this.opacity + 0.3);
    model.silhouetteColor = Cesium.Color.clone(
      outlineColor,
      model.silhouetteColor,
    );
    model.silhouetteSize = this.silhouetteSize;
  }

  private getDistanceScale(position: Cesium.Cartesian3): number {
    const distance = Cesium.Cartesian3.distance(
      this.viewer.camera.positionWC,
      position,
    );
    const distanceRange = this.farScaleDistance - this.nearScaleDistance;
    const amount =
      distanceRange <= 0
        ? 1
        : Math.max(
            0,
            Math.min(
              1,
              (distance - this.nearScaleDistance) / distanceRange,
            ),
          );
    // 开平方让中距离目标更早增大，远端仍被 farScaleFactor 限制。
    const easedAmount = Math.sqrt(amount);
    return (
      this.nearScaleFactor +
      (this.farScaleFactor - this.nearScaleFactor) * easedAmount
    );
  }

  private releaseModel(target: TargetState): void {
    if (!target.model) return;
    const model = target.model;
    target.model = undefined;
    this.poolModel(model);
  }

  private poolModel(model: Cesium.Model): void {
    model.show = false;
    model.id = undefined;
    const key = this.modelKeys.get(model);
    if (!key) return;
    const models = this.availableModels.get(key) ?? [];
    models.push(model);
    this.availableModels.set(key, models);
  }
}
