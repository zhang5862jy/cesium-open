<template>
  <label class="field boolean-field">
    <span>{{ label }}</span>
    <input
      :checked="modelValue"
      type="checkbox"
      @change="emit('update:modelValue', ($event.target as HTMLInputElement).checked)"
    />
  </label>
</template>

<script setup lang="ts">
defineProps<{ modelValue: boolean; label: string }>();
const emit = defineEmits<{ "update:modelValue": [value: boolean] }>();
</script>

<style scoped>
.boolean-field {
  grid-template-columns: 1fr auto;
  align-items: center;
  min-height: 32px;
  padding: 0 9px;
  border: 1px solid rgb(255 255 255 / 10%);
  border-radius: 7px;
}

input {
  width: 16px;
  height: 16px;
  accent-color: #35a9ee;
}
</style>
