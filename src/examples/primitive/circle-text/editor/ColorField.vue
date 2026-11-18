<template>
  <label class="field color-field">
    <span>{{ label }}</span>
    <span class="color-controls">
      <input
        :value="modelValue"
        type="color"
        @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      />
      <input
        :value="alpha"
        type="number"
        min="0"
        max="1"
        step="0.1"
        title="透明度"
        @input="emit('update:alpha', ($event.target as HTMLInputElement).valueAsNumber)"
      />
    </span>
  </label>
</template>

<script setup lang="ts">
defineProps<{ modelValue: string; alpha: number; label: string }>();
const emit = defineEmits<{
  "update:modelValue": [value: string];
  "update:alpha": [value: number];
}>();
</script>

<style scoped>
.color-controls {
  display: grid;
  grid-template-columns: 42px 1fr;
  gap: 6px;
}

input[type="color"] {
  width: 42px;
  padding: 3px;
}
</style>
