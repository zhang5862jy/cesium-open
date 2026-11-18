import {
  clonePublicOptions,
  normalizeEditOptions,
  normalizeInitialOptions,
} from "./options";
import type {
  CircleTextPrimitiveEditOptions,
  CircleTextPrimitiveOptions,
  EllipseImageSource,
  LocalOffset,
  NormalizedCircleTextOptions,
  NormalizedLabelOptions,
  PlaneAnchor,
  ScreenOffset,
  CircleTextDisplayMode,
} from "./types";
import type { Color } from "cesium";

type ChangeListener = (property?: PropertyKey) => void;
const changeListeners = new WeakMap<CircleTextData, ChangeListener>();

/**
 * 单个“椭圆图片 + 原生文字”的业务数据。
 *
 * 构造函数返回的仍是 `CircleTextData` 实例，但外层包了一层 Proxy。直接给任意
 * 可绘制属性赋值都会经过 `set` trap，并把 `expired` 标记为 true。渲染器下一帧
 * 同步完成后才会把它恢复为 false。
 */
export class CircleTextData implements NormalizedCircleTextOptions {
  readonly id!: string;
  longitude!: number;
  latitude!: number;
  height!: number;
  ellipseWidth!: number;
  ellipseHeight!: number;
  ellipseRotation!: number;
  ellipseImage!: EllipseImageSource;
  ellipseAnchor!: PlaneAnchor;
  ellipseOffset!: LocalOffset;
  textHeight!: number;
  label!: NormalizedLabelOptions;
  textAnchor!: PlaneAnchor;
  textOffset!: ScreenOffset;
  show!: boolean;
  ellipseShow!: boolean;
  textShow!: boolean;
  maximumVisibleHeight!: number;
  ellipseMode!: CircleTextDisplayMode;
  textMode!: CircleTextDisplayMode;

  /** true 表示 CPU/GPU 或原生 Label 状态尚未同步。 */
  expired = true;

  /** 原生 Label 文字的扁平快捷属性；赋值同样经过 Proxy.set。 */
  get text(): string {
    return this.label.text;
  }

  set text(value: string) {
    this.label = { ...this.label, text: value };
  }

  get font(): string {
    return this.label.font;
  }

  set font(value: string) {
    this.label = { ...this.label, font: value };
  }

  get fillColor(): Color {
    return this.label.fillColor;
  }

  set fillColor(value: Color) {
    this.label = { ...this.label, fillColor: value };
  }

  get outlineColor(): Color {
    return this.label.outlineColor;
  }

  set outlineColor(value: Color) {
    this.label = { ...this.label, outlineColor: value };
  }

  constructor(options: CircleTextPrimitiveOptions) {
    const normalized = normalizeInitialOptions(options);
    Object.assign(this, normalized);

    return new Proxy(this, {
      set(target, property, value, receiver) {
        if (property === "id" && target.id !== undefined && value !== target.id) {
          throw new Error("CircleTextData.id 创建后不可修改");
        }
        if (property === "expired") {
          const written = Reflect.set(target, property, Boolean(value), receiver);
          if (value) changeListeners.get(receiver)?.();
          return written;
        }

        const previous = Reflect.get(target, property, receiver);
        const changed = !Object.is(previous, value);
        const written = Reflect.set(target, property, value, receiver);
        if (written && changed) {
          target.expired = true;
          changeListeners.get(receiver)?.(property);
        }
        return written;
      },
    });
  }

  /** @internal 渲染器订阅变更；移除 Data 时解除订阅。 */
  setChangeListener(listener?: ChangeListener): void {
    if (listener) changeListeners.set(this, listener);
    else changeListeners.delete(this);
  }

  /**
   * 合并一组局部修改。内部仍逐属性写回当前 Proxy，因此和直接赋值一样会触发
   * `set` trap。业务侧也可以直接写 `data.longitude = ...`。
   */
  edit(changes: CircleTextPrimitiveEditOptions): void {
    const next = normalizeEditOptions(this.toNormalizedOptions(), changes);
    Object.assign(this, next);
  }

  /** 手动标记过期，适用于调用方原地修改了 Color/Cartesian 等嵌套对象。 */
  expire(): void {
    this.expired = true;
  }

  /** 返回与 Data 脱离引用的公开配置副本。 */
  getOptions(): CircleTextPrimitiveOptions {
    return clonePublicOptions(this.toNormalizedOptions());
  }

  /** @internal 生成校验和渲染使用的完整快照。 */
  toNormalizedOptions(): NormalizedCircleTextOptions {
    return {
      id: this.id,
      longitude: this.longitude,
      latitude: this.latitude,
      height: this.height,
      ellipseWidth: this.ellipseWidth,
      ellipseHeight: this.ellipseHeight,
      ellipseRotation: this.ellipseRotation,
      ellipseImage: this.ellipseImage,
      ellipseAnchor: this.ellipseAnchor,
      ellipseOffset: this.ellipseOffset,
      textHeight: this.textHeight,
      label: this.label,
      textAnchor: this.textAnchor,
      textOffset: this.textOffset,
      show: this.show,
      ellipseShow: this.ellipseShow,
      textShow: this.textShow,
      maximumVisibleHeight: this.maximumVisibleHeight,
      ellipseMode: this.ellipseMode,
      textMode: this.textMode,
    };
  }
}
