import * as Cesium from "cesium";
import type {
  CircleTextDisplayMode,
  CircleTextLabelOptions,
  CircleTextSharedDisplayOptions,
  EllipseImageSource,
  LocalOffset,
  NormalizedLabelOptions,
  PlaneAnchor,
  ResolvedLayerOptions,
  ScreenOffset,
} from "./types";

/** 单个目标未显式传参时使用的 Label 默认值。 */
export const DEFAULT_LABEL_OPTIONS: Omit<
  NormalizedLabelOptions,
  "text"
> = {
  font: 'bold 64px "Microsoft YaHei", "PingFang SC", sans-serif',
  style: Cesium.LabelStyle.FILL_AND_OUTLINE,
  scale: 1,
  showBackground: false,
  backgroundColor: new Cesium.Color(0.165, 0.165, 0.165, 0.8),
  backgroundPadding: new Cesium.Cartesian2(12, 8),
  fillColor: Cesium.Color.WHITE,
  outlineColor: Cesium.Color.BLACK,
  outlineWidth: 4,
  resolutionScale: 4,
};

/** 单独 new CircleTextPrimitive 时采用的距离缩放配置。 */
export const DEFAULT_SHARED_DISPLAY_OPTIONS: CircleTextSharedDisplayOptions =
  {
    nearDistance: 100_000,
    farDistance: 8_000_000,
    nearScale: 1,
    farScale: 4,
  };

/** 几何、纹理及布局的默认值。 */
export const DEFAULT_ITEM_OPTIONS = {
  height: 200,
  ellipseWidth: 24_000,
  ellipseHeight: 16_000,
  ellipseRotation: 0,
  ellipseImage: "/textures/circle.svg" as EllipseImageSource,
  ellipseAnchor: 4 as PlaneAnchor,
  ellipseOffset: { x: 0, y: 0 } as LocalOffset,
  textHeight: 6_000,
  textAnchor: 7 as PlaneAnchor,
  textOffset: { x: 0, y: -48 } as ScreenOffset,
  show: true,
  ellipseShow: true,
  textShow: true,
  maximumVisibleHeight: Number.POSITIVE_INFINITY,
  ellipseMode: 0 as CircleTextDisplayMode,
  textMode: 0 as CircleTextDisplayMode,
};

/** 管理器的完整默认配置。 */
export const DEFAULT_LAYER_OPTIONS: ResolvedLayerOptions = {
  capacity: 2_000,
  defaultEllipseMode: DEFAULT_ITEM_OPTIONS.ellipseMode,
  defaultTextMode: DEFAULT_ITEM_OPTIONS.textMode,
  height: DEFAULT_ITEM_OPTIONS.height,
  ellipseWidth: DEFAULT_ITEM_OPTIONS.ellipseWidth,
  ellipseHeight: DEFAULT_ITEM_OPTIONS.ellipseHeight,
  ellipseRotation: DEFAULT_ITEM_OPTIONS.ellipseRotation,
  ellipseImage: DEFAULT_ITEM_OPTIONS.ellipseImage,
  ellipseAnchor: DEFAULT_ITEM_OPTIONS.ellipseAnchor,
  ellipseOffset: DEFAULT_ITEM_OPTIONS.ellipseOffset,
  textHeight: DEFAULT_ITEM_OPTIONS.textHeight,
  label: {} as CircleTextLabelOptions,
  textAnchor: DEFAULT_ITEM_OPTIONS.textAnchor,
  textOffset: DEFAULT_ITEM_OPTIONS.textOffset,
  ...DEFAULT_SHARED_DISPLAY_OPTIONS,
};
