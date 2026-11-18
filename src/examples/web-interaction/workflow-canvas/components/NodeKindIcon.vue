<script setup lang="ts">
import type { WorkflowNodeKind } from "../types";

defineProps<{
  kind: WorkflowNodeKind;
}>();
</script>

<template>
  <svg v-if="kind === 'start'" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M8 5v14l11-7L8 5Z" />
  </svg>
  <svg v-else-if="kind === 'knowledge'" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4Z" />
    <path d="M8 8h7M8 12h7M8 16h4" />
  </svg>
  <svg v-else-if="kind === 'llm'" viewBox="0 0 24 24" aria-hidden="true">
    <path d="m12 3 1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3Z" />
    <path d="m18.5 15 .7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7.7-2.3Z" />
  </svg>
  <svg v-else-if="kind === 'condition'" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M7 4v5a3 3 0 0 0 3 3h7" />
    <path d="M7 20v-5a3 3 0 0 1 3-3" />
    <path d="m15 8 4 4-4 4" />
  </svg>
  <svg v-else viewBox="0 0 24 24" aria-hidden="true">
    <path d="M5 5h14v11H9l-4 4V5Z" />
    <path d="M9 9h6M9 12h4" />
  </svg>
</template>

<style scoped>
svg {
  width: 20px;
  height: 20px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}
</style>
