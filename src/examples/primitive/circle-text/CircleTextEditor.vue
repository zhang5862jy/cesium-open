<template>
  <aside class="editor-panel">
    <header>
      <div>
        <span class="eyebrow">DRAWCOMMAND DATA EDITOR</span>
        <h2>目标编辑</h2>
      </div>
      <span class="target-count">{{ targets.length }}</span>
    </header>

    <label class="field full-width">
      <span>选择目标</span>
      <select
        v-model="selectedId"
        :disabled="editing"
        @change="handleTargetSelection"
      >
        <option v-for="target in targets" :key="target.id" :value="target.id">
          {{ target.id }} · {{ target.label?.text }}
        </option>
      </select>
    </label>

    <button
      v-if="!editing"
      type="button"
      class="primary-button"
      :disabled="!selectedTarget"
      @click="startEditing"
    >
      开启编辑
    </button>

    <form v-else-if="form" novalidate @submit.prevent="save">
      <details open>
        <summary>点位与显示</summary>
        <div class="field-grid">
          <NumberField v-model="form.longitude" label="经度" :step="0.01" />
          <NumberField v-model="form.latitude" label="纬度" :step="0.01" />
          <NumberField v-model="form.height" label="高度（m）" :step="100" />
          <NumberField
            v-model="form.maximumVisibleHeight"
            label="最大显示高度（km）"
            :step="500"
            :min="0"
          />
          <BooleanField v-model="form.show" label="目标显示" />
          <BooleanField v-model="form.ellipseShow" label="椭圆显示" />
          <BooleanField v-model="form.textShow" label="文字显示" />
        </div>
      </details>

      <details>
        <summary>椭圆</summary>
        <div class="field-grid">
          <NumberField
            v-model="form.ellipseWidth"
            label="宽度（m）"
            :min="1"
            :step="2000"
          />
          <NumberField
            v-model="form.ellipseHeight"
            label="高度（m）"
            :min="1"
            :step="2000"
          />
          <NumberField
            v-model="form.ellipseRotation"
            label="纹理顺时针旋转（°）"
            :step="5"
          />
          <SelectField
            v-model="form.ellipseMode"
            label="显示模式"
            :options="MODE_OPTIONS"
          />
          <SelectField
            v-model="form.ellipseAnchor"
            label="锚点"
            :options="ANCHOR_OPTIONS"
          />
          <NumberField
            v-model="form.ellipseOffsetX"
            label="偏移 X（m）"
            :step="1000"
          />
          <NumberField
            v-model="form.ellipseOffsetY"
            label="偏移 Y（m）"
            :step="1000"
          />
          <label class="field full-width">
            <span>图片纹理</span>
            <input v-model.trim="form.ellipseImage" type="text" />
          </label>
        </div>
      </details>

      <details>
        <summary>原生 Label 布局</summary>
        <p class="native-note">
          文字由 Cesium LabelCollection 的原生 SDF 字形纹理绘制，不再生成 Canvas 图片。
        </p>
        <div class="field-grid">
          <SelectField
            v-model="form.textAnchor"
            label="锚点"
            :options="ANCHOR_OPTIONS"
          />
          <NumberField
            v-model="form.textOffsetX"
            label="文字偏移 X（px）"
            :step="5"
          />
          <NumberField
            v-model="form.textOffsetY"
            label="文字偏移 Y（px）"
            :step="5"
          />
        </div>
      </details>

      <details>
        <summary>原生 Label 样式</summary>
        <div class="field-grid">
          <label class="field full-width">
            <span>文字</span>
            <input v-model="form.text" type="text" />
          </label>
          <label class="field full-width">
            <span>字体</span>
            <input v-model="form.font" type="text" />
          </label>
          <SelectField
            v-model="form.style"
            label="绘制样式"
            :options="STYLE_OPTIONS"
          />
          <NumberField
            v-model="form.labelScale"
            label="Label 缩放"
            :min="0.01"
            :step="0.25"
          />
          <NumberField
            v-model="form.outlineWidth"
            label="轮廓宽度"
            :min="0"
            :step="1"
          />
          <BooleanField v-model="form.showBackground" label="显示背景" />
          <NumberField
            v-model="form.paddingX"
            label="背景边距 X"
            :min="0"
            :step="2"
          />
          <NumberField
            v-model="form.paddingY"
            label="背景边距 Y"
            :min="0"
            :step="2"
          />
          <ColorField v-model="form.fillColor" v-model:alpha="form.fillAlpha" label="文字颜色" />
          <ColorField
            v-model="form.outlineColor"
            v-model:alpha="form.outlineAlpha"
            label="轮廓颜色"
          />
          <ColorField
            v-model="form.backgroundColor"
            v-model:alpha="form.backgroundAlpha"
            label="背景颜色"
          />
        </div>
      </details>

      <div class="actions">
        <button type="submit" class="primary-button">保存修改</button>
        <button type="button" @click="resetForm">重置</button>
        <button type="button" @click="stopEditing">关闭编辑</button>
      </div>
      <p v-if="previewing" class="preview-message">正在预览未保存修改</p>
      <p v-if="saved" class="saved-message">已保存到当前目标</p>
      <p v-if="errorMessage" class="error-message">{{ errorMessage }}</p>
    </form>
  </aside>
</template>

<script setup lang="ts">
import * as Cesium from "cesium";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import BooleanField from "./editor/BooleanField.vue";
import ColorField from "./editor/ColorField.vue";
import NumberField from "./editor/NumberField.vue";
import SelectField from "./editor/SelectField.vue";
import type {
  CircleTextDisplayMode,
  CircleTextPrimitiveEditOptions,
  CircleTextPrimitiveOptions,
  PlaneAnchor,
} from "../../../cesium/tools/circle-text";

interface EditorForm {
  longitude: number;
  latitude: number;
  height: number;
  maximumVisibleHeight: number;
  show: boolean;
  ellipseShow: boolean;
  textShow: boolean;
  ellipseWidth: number;
  ellipseHeight: number;
  ellipseRotation: number;
  ellipseImage: string;
  ellipseMode: CircleTextDisplayMode;
  ellipseAnchor: PlaneAnchor;
  ellipseOffsetX: number;
  ellipseOffsetY: number;
  textAnchor: PlaneAnchor;
  textOffsetX: number;
  textOffsetY: number;
  text: string;
  font: string;
  style: Cesium.LabelStyle;
  labelScale: number;
  showBackground: boolean;
  backgroundColor: string;
  backgroundAlpha: number;
  paddingX: number;
  paddingY: number;
  fillColor: string;
  fillAlpha: number;
  outlineColor: string;
  outlineAlpha: number;
  outlineWidth: number;
}

interface SelectOption {
  value: number;
  label: string;
}

const props = defineProps<{ targets: CircleTextPrimitiveOptions[] }>();
const emit = defineEmits<{
  select: [id: string];
  preview: [id: string, changes: CircleTextPrimitiveEditOptions];
  save: [id: string, changes: CircleTextPrimitiveEditOptions];
  cancel: [id: string, changes: CircleTextPrimitiveEditOptions];
}>();

const MODE_OPTIONS: SelectOption[] = [
  { value: 0, label: "0 · 面向屏幕" },
  { value: 1, label: "1 · 平躺" },
];
const ANCHOR_OPTIONS: SelectOption[] = [
  "左上", "上中", "右上", "左中", "中心", "右中", "左下", "下中", "右下",
].map((label, value) => ({ value, label: `${value} · ${label}` }));
const STYLE_OPTIONS: SelectOption[] = [
  { value: Cesium.LabelStyle.FILL, label: "填充" },
  { value: Cesium.LabelStyle.OUTLINE, label: "轮廓" },
  { value: Cesium.LabelStyle.FILL_AND_OUTLINE, label: "填充 + 轮廓" },
];

const selectedId = ref("");
const editing = ref(false);
const saved = ref(false);
const previewing = ref(false);
const errorMessage = ref("");
const form = ref<EditorForm>();
const baselineForm = ref<EditorForm>();
let previewTimer: ReturnType<typeof setTimeout> | undefined;
let hasPreviewChanges = false;
let suppressPreview = false;
const selectedTarget = computed(() =>
  props.targets.find((target) => target.id === selectedId.value),
);

watch(
  () => props.targets,
  (targets) => {
    if (!targets.some((target) => target.id === selectedId.value)) {
      selectedId.value = targets[0]?.id ?? "";
    }
    if (editing.value) {
      loadSelectedTarget(true);
    }
  },
  { immediate: true },
);

watch(
  form,
  () => {
    if (!editing.value || suppressPreview || !form.value) {
      return;
    }
    saved.value = false;
    errorMessage.value = "";
    schedulePreview();
  },
  { deep: true, flush: "sync" },
);

onBeforeUnmount(clearPreviewTimer);

function startEditing(): void {
  editing.value = true;
  saved.value = false;
  previewing.value = false;
  errorMessage.value = "";
  hasPreviewChanges = false;
  loadSelectedTarget(true);
}

function stopEditing(): void {
  clearPreviewTimer();
  if (hasPreviewChanges && baselineForm.value && selectedId.value) {
    const originalChanges = createChanges(baselineForm.value);
    if (originalChanges) {
      emit("cancel", selectedId.value, originalChanges);
    }
  }
  editing.value = false;
  saved.value = false;
  previewing.value = false;
  errorMessage.value = "";
  hasPreviewChanges = false;
}

function resetForm(): void {
  clearPreviewTimer();
  saved.value = false;
  previewing.value = false;
  errorMessage.value = "";
  if (!baselineForm.value) {
    loadSelectedTarget(true);
    return;
  }
  setForm({ ...baselineForm.value });
  if (hasPreviewChanges && selectedId.value) {
    const originalChanges = createChanges(baselineForm.value);
    if (originalChanges) {
      emit("preview", selectedId.value, originalChanges);
    }
  }
  hasPreviewChanges = false;
}

function handleTargetSelection(): void {
  saved.value = false;
  previewing.value = false;
  errorMessage.value = "";
  loadSelectedTarget(false);
  if (selectedId.value) {
    emit("select", selectedId.value);
  }
}

function loadSelectedTarget(updateBaseline: boolean): void {
  const target = selectedTarget.value;
  if (!target) {
    setForm(undefined);
    return;
  }
  const label = target.label ?? {};
  const nextForm: EditorForm = {
    longitude: target.longitude,
    latitude: target.latitude,
    height: target.height ?? 0,
    maximumVisibleHeight: target.maximumVisibleHeight ?? 0,
    show: target.show ?? true,
    ellipseShow: target.ellipseShow ?? true,
    textShow: target.textShow ?? true,
    ellipseWidth: target.ellipseWidth ?? 1,
    ellipseHeight: target.ellipseHeight ?? 1,
    ellipseRotation: target.ellipseRotation ?? 0,
    ellipseImage: typeof target.ellipseImage === "string" ? target.ellipseImage : "",
    ellipseMode: target.ellipseMode ?? 0,
    ellipseAnchor: target.ellipseAnchor ?? 4,
    ellipseOffsetX: target.ellipseOffset?.x ?? 0,
    ellipseOffsetY: target.ellipseOffset?.y ?? 0,
    textAnchor: target.textAnchor ?? 4,
    textOffsetX: target.textOffset?.x ?? 0,
    textOffsetY: target.textOffset?.y ?? 0,
    text: label.text ?? "",
    font: label.font ?? "64px sans-serif",
    style: label.style ?? Cesium.LabelStyle.FILL,
    labelScale: label.scale ?? 1,
    showBackground: label.showBackground ?? false,
    backgroundColor: colorToHex(label.backgroundColor ?? Cesium.Color.BLACK),
    backgroundAlpha: label.backgroundColor?.alpha ?? 1,
    paddingX: label.backgroundPadding?.x ?? 0,
    paddingY: label.backgroundPadding?.y ?? 0,
    fillColor: colorToHex(label.fillColor ?? Cesium.Color.WHITE),
    fillAlpha: label.fillColor?.alpha ?? 1,
    outlineColor: colorToHex(label.outlineColor ?? Cesium.Color.BLACK),
    outlineAlpha: label.outlineColor?.alpha ?? 1,
    outlineWidth: label.outlineWidth ?? 0,
  };
  setForm(nextForm);
  if (updateBaseline) {
    baselineForm.value = { ...nextForm };
    hasPreviewChanges = false;
  }
}

function save(): void {
  if (!form.value || !selectedId.value) {
    return;
  }
  clearPreviewTimer();
  const changes = createChanges(form.value);
  if (!changes) {
    errorMessage.value = "请检查数值范围和图片纹理地址";
    return;
  }
  emit("save", selectedId.value, changes);
  baselineForm.value = { ...form.value };
  hasPreviewChanges = false;
  errorMessage.value = "";
  previewing.value = false;
  saved.value = true;
}

/** 将纯表单状态转换为可写入 CircleTextData 的参数。 */
function createChanges(
  value: EditorForm,
): CircleTextPrimitiveEditOptions | undefined {
  const numbers = [
    value.longitude,
    value.latitude,
    value.height,
    value.maximumVisibleHeight,
    value.ellipseWidth,
    value.ellipseHeight,
    value.ellipseRotation,
    value.ellipseOffsetX,
    value.ellipseOffsetY,
    value.textOffsetX,
    value.textOffsetY,
    value.labelScale,
    value.backgroundAlpha,
    value.paddingX,
    value.paddingY,
    value.fillAlpha,
    value.outlineAlpha,
    value.outlineWidth,
  ];
  if (
    numbers.some((number) => !Number.isFinite(number)) ||
    value.ellipseWidth <= 0 ||
    value.ellipseHeight <= 0 ||
    value.labelScale <= 0 ||
    value.maximumVisibleHeight < 0 ||
    !value.ellipseImage
  ) {
    return undefined;
  }
  return {
    longitude: value.longitude,
    latitude: value.latitude,
    height: value.height,
    maximumVisibleHeight: value.maximumVisibleHeight,
    show: value.show,
    ellipseShow: value.ellipseShow,
    textShow: value.textShow,
    ellipseWidth: value.ellipseWidth,
    ellipseHeight: value.ellipseHeight,
    ellipseRotation: value.ellipseRotation,
    ellipseImage: value.ellipseImage,
    ellipseMode: value.ellipseMode,
    ellipseAnchor: value.ellipseAnchor,
    ellipseOffset: { x: value.ellipseOffsetX, y: value.ellipseOffsetY },
    textAnchor: value.textAnchor,
    textOffset: { x: value.textOffsetX, y: value.textOffsetY },
    label: {
      text: value.text,
      font: value.font,
      style: value.style,
      scale: value.labelScale,
      showBackground: value.showBackground,
      backgroundColor: parseColor(value.backgroundColor, value.backgroundAlpha),
      backgroundPadding: new Cesium.Cartesian2(value.paddingX, value.paddingY),
      fillColor: parseColor(value.fillColor, value.fillAlpha),
      outlineColor: parseColor(value.outlineColor, value.outlineAlpha),
      outlineWidth: value.outlineWidth,
    },
  };
}

/** 防抖实时预览，避免输入每个字符时都立刻把 Data 标记过期。 */
function schedulePreview(): void {
  clearPreviewTimer();
  previewTimer = setTimeout(() => {
    previewTimer = undefined;
    if (!form.value || !selectedId.value) {
      return;
    }
    const changes = createChanges(form.value);
    if (!changes) {
      return;
    }
    emit("preview", selectedId.value, changes);
    hasPreviewChanges = true;
    previewing.value = true;
  }, 120);
}

function clearPreviewTimer(): void {
  if (previewTimer !== undefined) {
    clearTimeout(previewTimer);
    previewTimer = undefined;
  }
}

/** 程序化装载表单时抑制 deep watch，避免把初始化误判为用户编辑。 */
function setForm(value: EditorForm | undefined): void {
  suppressPreview = true;
  form.value = value;
  suppressPreview = false;
}

function colorToHex(color: Cesium.Color): string {
  const channel = (value: number) =>
    Cesium.Color.floatToByte(value).toString(16).padStart(2, "0");
  return `#${channel(color.red)}${channel(color.green)}${channel(color.blue)}`;
}

function parseColor(cssColor: string, alpha: number): Cesium.Color {
  const color = Cesium.Color.fromCssColorString(cssColor) ?? Cesium.Color.WHITE.clone();
  return color.withAlpha(alpha);
}
</script>

<style scoped>
.editor-panel {
  position: absolute;
  top: 16px;
  left: 16px;
  z-index: 10;
  width: min(390px, calc(100vw - 32px));
  max-height: calc(100% - 32px);
  overflow: auto;
  padding: 16px;
  color: #edf6ff;
  background: rgb(8 18 30 / 92%);
  border: 1px solid rgb(129 203 255 / 26%);
  border-radius: 12px;
  box-shadow: 0 14px 40px rgb(0 0 0 / 32%);
  backdrop-filter: blur(12px);
}

header,
.actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

header {
  justify-content: space-between;
  margin-bottom: 14px;
}

h2 {
  margin: 3px 0 0;
  font-size: 20px;
}

.eyebrow,
.target-count {
  color: #72c8ff;
  font-size: 11px;
  letter-spacing: 0.12em;
}

.target-count {
  padding: 5px 9px;
  background: rgb(80 174 235 / 16%);
  border-radius: 999px;
}

details {
  margin-top: 10px;
  border-top: 1px solid rgb(255 255 255 / 9%);
}

summary {
  padding: 11px 0;
  color: #a9d9f8;
  cursor: pointer;
  font-size: 13px;
  font-weight: 650;
}

.native-note {
  margin: 0 0 10px;
  color: #79cfff;
  font-size: 11px;
  line-height: 1.5;
}

.field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 9px;
}

.field,
:deep(.field) {
  display: grid;
  gap: 5px;
  color: #aebfce;
  font-size: 11px;
}

.full-width {
  grid-column: 1 / -1;
}

input,
select,
button,
:deep(input),
:deep(select) {
  min-width: 0;
  border: 1px solid rgb(255 255 255 / 14%);
  border-radius: 7px;
  color: #f3f8fc;
  background: rgb(255 255 255 / 7%);
}

input,
select,
:deep(input),
:deep(select) {
  height: 32px;
  padding: 0 9px;
}

option {
  color: #182633;
}

button {
  padding: 8px 12px;
  cursor: pointer;
}

.primary-button {
  width: 100%;
  margin-top: 12px;
  border-color: #46acec;
  background: #167bb7;
}

.actions {
  margin-top: 14px;
}

.actions .primary-button {
  width: auto;
  margin-top: 0;
}

.saved-message {
  margin: 9px 0 0;
  color: #76dfa3;
  font-size: 12px;
}

.preview-message {
  margin: 9px 0 0;
  color: #ffd479;
  font-size: 12px;
}

.error-message {
  margin: 9px 0 0;
  color: #ff9c9c;
  font-size: 12px;
}
</style>
