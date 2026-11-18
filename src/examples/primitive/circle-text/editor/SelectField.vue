<template>
  <label class="field">
    <span>{{ label }}</span>
    <select :value="modelValue" :aria-label="label" @change="update">
      <option v-for="option in options" :key="option.value" :value="option.value">
        {{ option.label }}
      </option>
    </select>
  </label>
</template>

<script setup lang="ts">
interface SelectOption {
  value: number;
  label: string;
}

defineProps<{
  modelValue: number;
  label: string;
  options: SelectOption[];
}>();
const emit = defineEmits<{ "update:modelValue": [value: number] }>();

function update(event: Event): void {
  emit("update:modelValue", Number((event.target as HTMLSelectElement).value));
}
</script>
