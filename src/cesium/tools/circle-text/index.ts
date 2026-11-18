export { CircleTextData } from "./CircleTextData";
export { CircleTextDrawCommand } from "./CircleTextDrawCommand";
/** 兼容旧名称；实现已改为统一的 DrawCommand + 原生 Label 管理类。 */
export { CircleTextData as CircleTextPrimitive } from "./CircleTextData";
export { CircleTextDrawCommand as CircleTextPrimitiveLayer } from "./CircleTextDrawCommand";
export { DEFAULT_SHARED_DISPLAY_OPTIONS } from "./defaults";
export type {
  CircleTextDisplayMode,
  CircleTextLabelOptions,
  CircleTextPrimitiveEditOptions,
  CircleTextPrimitiveLayerOptions,
  CircleTextPrimitiveOptions,
  CircleTextSharedDisplayOptions,
  EllipseImageSource,
  LocalOffset,
  PlaneAnchor,
  ScreenOffset,
} from "./types";

/** 兼容管理器旧版类型命名。 */
export type {
  CircleTextPrimitiveOptions as CircleTextItemOptions,
  CircleTextPrimitiveEditOptions as CircleTextEditOptions,
} from "./types";
