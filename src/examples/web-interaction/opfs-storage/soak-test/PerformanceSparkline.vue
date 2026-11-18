<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  title: string;
  values: number[];
  tone: "write" | "query";
}>();

const width = 320;
const height = 76;
const maxValue = computed(() => Math.max(1, ...props.values));
const points = computed(() => {
  if (props.values.length === 0) return "";
  return props.values
    .map((value, index) => {
      const x =
        props.values.length === 1
          ? width
          : (index / (props.values.length - 1)) * width;
      const y = height - (value / maxValue.value) * (height - 8) - 4;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
});
</script>

<template>
  <div class="sparkline-block">
    <div class="sparkline-title">
      <span>{{ title }}</span>
      <b>{{ values.length ? `${values.at(-1)?.toFixed(1)}ms` : "等待数据" }}</b>
    </div>
    <svg
      :viewBox="`0 0 ${width} ${height}`"
      role="img"
      :aria-label="`${title}最近性能曲线`"
    >
      <line x1="0" :y1="height - 1" :x2="width" :y2="height - 1" />
      <polyline v-if="points" :class="`series-${tone}`" :points="points" />
    </svg>
  </div>
</template>
