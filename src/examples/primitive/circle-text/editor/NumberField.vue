<template>
  <label class="field">
    <span>{{ label }}</span>
    <input
      :value="modelValue"
      :aria-label="label"
      type="number"
      :min="min"
      :max="max"
      :step="step ?? 'any'"
      required
      @input="update"
      @keydown.up.prevent="increment(1)"
      @keydown.down.prevent="increment(-1)"
    />
  </label>
</template>

<script setup lang="ts">
const props = defineProps<{
  modelValue: number;
  label: string;
  min?: number;
  max?: number;
  step?: number | "any";
}>();
const emit = defineEmits<{ "update:modelValue": [value: number] }>();

function update(event: Event): void {
  emit("update:modelValue", (event.target as HTMLInputElement).valueAsNumber);
}

/** 使用配置步长处理键盘上下键，避免随机初始值不落在 step 网格时失效。 */
function increment(direction: 1 | -1): void {
  const amount = typeof props.step === "number" ? props.step : 1;
  let nextValue = props.modelValue + amount * direction;
  if (props.min !== undefined) {
    nextValue = Math.max(props.min, nextValue);
  }
  if (props.max !== undefined) {
    nextValue = Math.min(props.max, nextValue);
  }
  emit("update:modelValue", Number(nextValue.toFixed(12)));
}
</script>
