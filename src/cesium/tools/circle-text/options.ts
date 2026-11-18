import * as Cesium from "cesium";
import {
  DEFAULT_ITEM_OPTIONS,
  DEFAULT_LABEL_OPTIONS,
  DEFAULT_LAYER_OPTIONS,
} from "./defaults";
import type {
  CircleTextLabelOptions,
  CircleTextPrimitiveEditOptions,
  CircleTextPrimitiveLayerOptions,
  CircleTextPrimitiveOptions,
  LocalOffset,
  NormalizedCircleTextOptions,
  NormalizedLabelOptions,
  ResolvedLayerOptions,
} from "./types";

let nextPrimitiveId = 1;

/** 复制偏移对象，避免调用方后续修改入参影响内部状态。 */
export function cloneOffset(offset: LocalOffset): LocalOffset {
  return { x: offset.x, y: offset.y };
}

/** 返回可安全交给编辑界面的公开参数副本。 */
export function clonePublicOptions(
  options: NormalizedCircleTextOptions,
): CircleTextPrimitiveOptions {
  return {
    id: options.id,
    longitude: options.longitude,
    latitude: options.latitude,
    height: options.height,
    ellipseWidth: options.ellipseWidth,
    ellipseHeight: options.ellipseHeight,
    ellipseRotation: options.ellipseRotation,
    ellipseImage: options.ellipseImage,
    ellipseAnchor: options.ellipseAnchor,
    ellipseOffset: cloneOffset(options.ellipseOffset),
    textHeight: options.textHeight,
    label: {
      ...options.label,
      backgroundColor: Cesium.Color.clone(options.label.backgroundColor),
      backgroundPadding: Cesium.Cartesian2.clone(
        options.label.backgroundPadding,
      ),
      fillColor: Cesium.Color.clone(options.label.fillColor),
      outlineColor: Cesium.Color.clone(options.label.outlineColor),
    },
    textAnchor: options.textAnchor,
    textOffset: cloneOffset(options.textOffset),
    show: options.show,
    ellipseShow: options.ellipseShow,
    textShow: options.textShow,
    maximumVisibleHeight: options.maximumVisibleHeight,
    ellipseMode: options.ellipseMode,
    textMode: options.textMode,
  };
}

/** 合并并深拷贝 Label 参数。 */
export function normalizeLabelOptions(
  label: CircleTextLabelOptions = {},
  fallbackText: string,
  base:
    | NormalizedLabelOptions
    | Omit<NormalizedLabelOptions, "text"> = DEFAULT_LABEL_OPTIONS,
): NormalizedLabelOptions {
  const baseText = "text" in base ? base.text : fallbackText;
  return {
    text: label.text ?? baseText,
    font: label.font ?? base.font,
    style: label.style ?? base.style,
    scale: label.scale ?? base.scale,
    showBackground: label.showBackground ?? base.showBackground,
    backgroundColor: Cesium.Color.clone(
      label.backgroundColor ?? base.backgroundColor,
      new Cesium.Color(),
    ),
    backgroundPadding: Cesium.Cartesian2.clone(
      label.backgroundPadding ?? base.backgroundPadding,
      new Cesium.Cartesian2(),
    ),
    fillColor: Cesium.Color.clone(
      label.fillColor ?? base.fillColor,
      new Cesium.Color(),
    ),
    outlineColor: Cesium.Color.clone(
      label.outlineColor ?? base.outlineColor,
      new Cesium.Color(),
    ),
    outlineWidth: label.outlineWidth ?? base.outlineWidth,
    resolutionScale: label.resolutionScale ?? base.resolutionScale,
  };
}

/** 把单体构造参数补全为内部不可缺省的配置。 */
export function normalizeInitialOptions(
  options: CircleTextPrimitiveOptions,
): NormalizedCircleTextOptions {
  const id = options.id ?? `circle-text-${nextPrimitiveId++}`;
  const normalized: NormalizedCircleTextOptions = {
    id,
    longitude: options.longitude,
    latitude: options.latitude,
    height: options.height ?? DEFAULT_ITEM_OPTIONS.height,
    ellipseWidth:
      options.ellipseWidth ?? DEFAULT_ITEM_OPTIONS.ellipseWidth,
    ellipseHeight:
      options.ellipseHeight ?? DEFAULT_ITEM_OPTIONS.ellipseHeight,
    ellipseRotation:
      options.ellipseRotation ?? DEFAULT_ITEM_OPTIONS.ellipseRotation,
    ellipseImage:
      options.ellipseImage ?? DEFAULT_ITEM_OPTIONS.ellipseImage,
    ellipseAnchor:
      options.ellipseAnchor ?? DEFAULT_ITEM_OPTIONS.ellipseAnchor,
    ellipseOffset: cloneOffset(
      options.ellipseOffset ?? DEFAULT_ITEM_OPTIONS.ellipseOffset,
    ),
    textHeight: options.textHeight ?? DEFAULT_ITEM_OPTIONS.textHeight,
    label: normalizeLabelOptions(options.label, id),
    textAnchor: options.textAnchor ?? DEFAULT_ITEM_OPTIONS.textAnchor,
    textOffset: cloneOffset(
      options.textOffset ?? DEFAULT_ITEM_OPTIONS.textOffset,
    ),
    show: options.show ?? DEFAULT_ITEM_OPTIONS.show,
    ellipseShow:
      options.ellipseShow ?? DEFAULT_ITEM_OPTIONS.ellipseShow,
    textShow: options.textShow ?? DEFAULT_ITEM_OPTIONS.textShow,
    maximumVisibleHeight:
      options.maximumVisibleHeight ??
      DEFAULT_ITEM_OPTIONS.maximumVisibleHeight,
    ellipseMode:
      options.ellipseMode ??
      options.mode ??
      DEFAULT_ITEM_OPTIONS.ellipseMode,
    textMode:
      options.textMode ?? options.mode ?? DEFAULT_ITEM_OPTIONS.textMode,
  };
  validateItemOptions(normalized);
  return normalized;
}

/** 基于现有状态合并 edit() 的局部变更。 */
export function normalizeEditOptions(
  current: NormalizedCircleTextOptions,
  changes: CircleTextPrimitiveEditOptions,
): NormalizedCircleTextOptions {
  const normalized: NormalizedCircleTextOptions = {
    id: current.id,
    longitude: changes.longitude ?? current.longitude,
    latitude: changes.latitude ?? current.latitude,
    height: changes.height ?? current.height,
    ellipseWidth: changes.ellipseWidth ?? current.ellipseWidth,
    ellipseHeight: changes.ellipseHeight ?? current.ellipseHeight,
    ellipseRotation:
      changes.ellipseRotation ?? current.ellipseRotation,
    ellipseImage: changes.ellipseImage ?? current.ellipseImage,
    ellipseAnchor: changes.ellipseAnchor ?? current.ellipseAnchor,
    ellipseOffset: changes.ellipseOffset
      ? cloneOffset(changes.ellipseOffset)
      : current.ellipseOffset,
    textHeight: changes.textHeight ?? current.textHeight,
    label: changes.label ? normalizeLabelOptions(
      changes.label,
      current.label.text,
      current.label,
    ) : current.label,
    textAnchor: changes.textAnchor ?? current.textAnchor,
    textOffset: changes.textOffset ? cloneOffset(changes.textOffset) : current.textOffset,
    show: changes.show ?? current.show,
    ellipseShow: changes.ellipseShow ?? current.ellipseShow,
    textShow: changes.textShow ?? current.textShow,
    maximumVisibleHeight:
      changes.maximumVisibleHeight ?? current.maximumVisibleHeight,
    ellipseMode:
      changes.ellipseMode ?? changes.mode ?? current.ellipseMode,
    textMode: changes.textMode ?? changes.mode ?? current.textMode,
  };
  validateItemOptions(normalized);
  return normalized;
}

/** 合并管理器默认参数，并校验共享距离缩放区间。 */
export function resolveLayerOptions(
  options: CircleTextPrimitiveLayerOptions,
): ResolvedLayerOptions {
  const resolved: ResolvedLayerOptions = {
    capacity: Math.max(1, Math.floor(options.capacity ?? DEFAULT_LAYER_OPTIONS.capacity)),
    defaultEllipseMode:
      options.defaultEllipseMode ??
      options.defaultMode ??
      DEFAULT_LAYER_OPTIONS.defaultEllipseMode,
    defaultTextMode:
      options.defaultTextMode ??
      options.defaultMode ??
      DEFAULT_LAYER_OPTIONS.defaultTextMode,
    height: options.height ?? DEFAULT_LAYER_OPTIONS.height,
    ellipseWidth:
      options.ellipseWidth ?? DEFAULT_LAYER_OPTIONS.ellipseWidth,
    ellipseHeight:
      options.ellipseHeight ?? DEFAULT_LAYER_OPTIONS.ellipseHeight,
    ellipseRotation:
      options.ellipseRotation ?? DEFAULT_LAYER_OPTIONS.ellipseRotation,
    ellipseImage:
      options.ellipseImage ?? DEFAULT_LAYER_OPTIONS.ellipseImage,
    ellipseAnchor:
      options.ellipseAnchor ?? DEFAULT_LAYER_OPTIONS.ellipseAnchor,
    ellipseOffset: cloneOffset(
      options.ellipseOffset ?? DEFAULT_LAYER_OPTIONS.ellipseOffset,
    ),
    textHeight: options.textHeight ?? DEFAULT_LAYER_OPTIONS.textHeight,
    label: { ...DEFAULT_LAYER_OPTIONS.label, ...options.label },
    textAnchor: options.textAnchor ?? DEFAULT_LAYER_OPTIONS.textAnchor,
    textOffset: cloneOffset(
      options.textOffset ?? DEFAULT_LAYER_OPTIONS.textOffset,
    ),
    nearDistance:
      options.nearDistance ?? DEFAULT_LAYER_OPTIONS.nearDistance,
    farDistance: options.farDistance ?? DEFAULT_LAYER_OPTIONS.farDistance,
    nearScale: options.nearScale ?? DEFAULT_LAYER_OPTIONS.nearScale,
    farScale: options.farScale ?? DEFAULT_LAYER_OPTIONS.farScale,
  };
  if (resolved.farDistance <= resolved.nearDistance) {
    throw new Error("farDistance 必须大于 nearDistance");
  }
  return resolved;
}

/** 校验会造成无效几何或原生 Label 状态的参数。 */
export function validateItemOptions(options: NormalizedCircleTextOptions): void {
  if (
    !Number.isFinite(options.ellipseWidth) ||
    !Number.isFinite(options.ellipseHeight) ||
    options.ellipseWidth <= 0 ||
    options.ellipseHeight <= 0
  ) {
    throw new Error("ellipseWidth 和 ellipseHeight 必须大于 0");
  }
  if (!Number.isFinite(options.ellipseRotation)) {
    throw new Error("ellipseRotation 必须是有效角度");
  }
  if (options.textHeight <= 0) {
    throw new Error("textHeight 必须大于 0");
  }
  if (
    options.label.outlineWidth < 0 ||
    options.label.backgroundPadding.x < 0 ||
    options.label.backgroundPadding.y < 0
  ) {
    throw new Error("文字轮廓和内边距不能为负数");
  }
  if (
    options.label.scale <= 0 ||
    options.label.resolutionScale <= 0
  ) {
    throw new Error("label.scale 和 resolutionScale 必须大于 0");
  }
  if (options.maximumVisibleHeight < 0) {
    throw new Error("maximumVisibleHeight 不能小于 0");
  }
}
