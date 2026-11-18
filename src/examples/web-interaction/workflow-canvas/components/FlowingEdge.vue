<script setup lang="ts">
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from "@vue-flow/core";
import { gsap } from "gsap";
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import type { WorkflowEdgeData } from "../types";

const props = defineProps<EdgeProps<WorkflowEdgeData>>();

const flowPath = ref<SVGPathElement | null>(null);
const pathResult = computed(() => getBezierPath(props));
const edgePath = computed(() => pathResult.value[0]);
const labelX = computed(() => pathResult.value[1]);
const labelY = computed(() => pathResult.value[2]);

let mediaContext: gsap.MatchMedia | undefined;

async function setupAnimation() {
  mediaContext?.revert();
  mediaContext = undefined;

  await nextTick();
  const path = flowPath.value;
  if (!path) return;

  mediaContext = gsap.matchMedia();
  mediaContext.add(
    { reduceMotion: "(prefers-reduced-motion: reduce)" },
    (context) => {
      const { reduceMotion } = context.conditions as {
        reduceMotion: boolean;
      };

      if (!props.data.flowEnabled || reduceMotion) {
        gsap.set(path, { strokeDashoffset: 0 });
        return;
      }

      const tween = gsap.fromTo(
        path,
        { strokeDashoffset: 0 },
        {
          strokeDashoffset: -40,
          duration: 1.25,
          ease: "none",
          repeat: -1,
        },
      );

      return () => tween.kill();
    },
  );
}

watch(() => props.data.flowEnabled, setupAnimation);

onMounted(setupAnimation);

onUnmounted(() => {
  mediaContext?.revert();
  mediaContext = undefined;
});
</script>

<template>
  <BaseEdge
    :id="id"
    :path="edgePath"
    :marker-end="markerEnd"
    :interaction-width="interactionWidth"
    class="flowing-edge__base"
  />
  <path
    ref="flowPath"
    :d="edgePath"
    class="flowing-edge__stream"
    :class="{
      'is-active': data.flowEnabled,
      'is-selected': selected,
    }"
    fill="none"
  />

  <EdgeLabelRenderer v-if="data.branchLabel">
    <span
      class="flowing-edge__label nodrag nopan"
      :style="{
        transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
      }"
    >
      {{ data.branchLabel }}
    </span>
  </EdgeLabelRenderer>
</template>

<style scoped>
:deep(.flowing-edge__base.vue-flow__edge-path) {
  stroke: #aeb9c8;
  stroke-width: 1.6;
}

.flowing-edge__stream {
  stroke: #4f7cf3;
  stroke-dasharray: 7 13;
  stroke-linecap: round;
  stroke-width: 2.4;
  opacity: 0;
  filter: drop-shadow(0 0 2px rgb(79 124 243 / 38%));
  pointer-events: none;
}

.flowing-edge__stream.is-active {
  opacity: 1;
}

.flowing-edge__stream.is-selected {
  stroke: #245de7;
  stroke-width: 3.1;
}

.flowing-edge__label {
  position: absolute;
  padding: 3px 7px;
  color: #69768a;
  font-size: 7px;
  font-weight: 800;
  letter-spacing: 0.08em;
  background: #ffffff;
  border: 1px solid #dce3ec;
  border-radius: 999px;
  box-shadow: 0 2px 8px rgb(31 46 74 / 9%);
  pointer-events: none;
}

@media (prefers-reduced-motion: reduce) {
  .flowing-edge__stream {
    stroke-dasharray: 4 8;
  }
}
</style>
