<script setup lang="ts">
import {
  Handle,
  Position,
  type NodeProps,
} from "@vue-flow/core";
import type { WorkflowNodeData } from "../types";
import NodeKindIcon from "./NodeKindIcon.vue";

defineProps<NodeProps<WorkflowNodeData>>();
</script>

<template>
  <article
    class="workflow-node"
    :class="[`workflow-node--${data.kind}`, { 'is-selected': selected }]"
  >
    <Handle
      v-if="data.kind !== 'start'"
      id="target"
      class="workflow-handle workflow-handle--target"
      type="target"
      :position="Position.Left"
      :connectable="connectable"
    />

    <div class="workflow-node__drag">
      <header>
        <span class="workflow-node__icon">
          <NodeKindIcon :kind="data.kind" />
        </span>
        <div>
          <strong>{{ data.title }}</strong>
          <span>{{ data.kind === "llm" ? "AI MODEL" : data.kind.toUpperCase() }}</span>
        </div>
        <i aria-hidden="true"></i>
      </header>

      <p>{{ data.description }}</p>

      <div class="workflow-node__config">
        <span>{{ data.configLabel }}</span>
        <strong>{{ data.configValue || "未配置" }}</strong>
      </div>
    </div>

    <template v-if="data.kind === 'condition'">
      <span class="branch-label branch-label--true">YES</span>
      <Handle
        id="true"
        class="workflow-handle workflow-handle--source workflow-handle--true"
        type="source"
        :position="Position.Right"
        :connectable="connectable"
      />
      <span class="branch-label branch-label--false">NO</span>
      <Handle
        id="false"
        class="workflow-handle workflow-handle--source workflow-handle--false"
        type="source"
        :position="Position.Right"
        :connectable="connectable"
      />
    </template>

    <Handle
      v-else-if="data.kind !== 'answer'"
      id="source"
      class="workflow-handle workflow-handle--source"
      type="source"
      :position="Position.Right"
      :connectable="connectable"
    />
  </article>
</template>

<style scoped>
.workflow-node {
  --node-accent: #3c78ff;
  --node-soft: #eef4ff;
  position: relative;
  width: 224px;
  color: #172033;
  background: rgb(255 255 255 / 96%);
  border: 1px solid #dce3ee;
  border-radius: 14px;
  box-shadow:
    0 1px 2px rgb(27 39 64 / 5%),
    0 8px 26px rgb(27 39 64 / 8%);
  transition:
    border-color 160ms ease,
    box-shadow 160ms ease,
    transform 160ms ease;
}

.workflow-node--knowledge {
  --node-accent: #0c9f76;
  --node-soft: #e9f8f3;
}

.workflow-node--llm {
  --node-accent: #7856e8;
  --node-soft: #f1edff;
}

.workflow-node--condition {
  --node-accent: #d27a14;
  --node-soft: #fff5e7;
}

.workflow-node--answer {
  --node-accent: #de526d;
  --node-soft: #fff0f3;
}

.workflow-node:hover {
  border-color: #b7c4d8;
  box-shadow:
    0 2px 4px rgb(27 39 64 / 6%),
    0 13px 34px rgb(27 39 64 / 12%);
}

.workflow-node.is-selected {
  border-color: var(--node-accent);
  box-shadow:
    0 0 0 3px color-mix(in srgb, var(--node-accent) 15%, transparent),
    0 14px 34px rgb(27 39 64 / 14%);
}

.workflow-node__drag {
  padding: 15px;
  cursor: grab;
}

.workflow-node__drag:active {
  cursor: grabbing;
}

header {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
}

.workflow-node__icon {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  color: var(--node-accent);
  background: var(--node-soft);
  border-radius: 10px;
}

header > div {
  min-width: 0;
}

header strong {
  display: block;
  overflow: hidden;
  font-size: 13px;
  font-weight: 720;
  text-overflow: ellipsis;
  white-space: nowrap;
}

header span:not(.workflow-node__icon) {
  display: block;
  margin-top: 3px;
  color: #9aa5b5;
  font-size: 8px;
  font-weight: 750;
  letter-spacing: 0.12em;
}

header i {
  width: 7px;
  height: 7px;
  background: #4dc392;
  border: 2px solid #e5f8f0;
  border-radius: 50%;
  box-sizing: content-box;
}

p {
  min-height: 36px;
  margin-top: 13px;
  color: #728096;
  font-size: 11px;
  line-height: 1.55;
}

.workflow-node__config {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 13px;
  padding: 9px 10px;
  color: #8a96a8;
  background: #f7f9fc;
  border: 1px solid #edf0f5;
  border-radius: 8px;
  font-size: 9px;
}

.workflow-node__config strong {
  overflow: hidden;
  max-width: 112px;
  color: #4d5a70;
  font-size: 9px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:deep(.workflow-handle) {
  width: 11px;
  height: 11px;
  background: #ffffff;
  border: 2px solid #9aa8bd;
  box-shadow: 0 1px 4px rgb(26 41 67 / 18%);
  transition:
    border-color 140ms ease,
    background 140ms ease,
    transform 140ms ease;
}

:deep(.workflow-handle:hover),
:deep(.workflow-handle.connecting),
:deep(.workflow-handle.valid) {
  background: var(--node-accent);
  border-color: #ffffff;
  transform: translate(-50%, -50%) scale(1.25);
}

:deep(.workflow-handle--source) {
  border-color: var(--node-accent);
}

:deep(.workflow-handle--true) {
  top: 37%;
}

:deep(.workflow-handle--false) {
  top: 72%;
}

.branch-label {
  position: absolute;
  right: 10px;
  z-index: 2;
  color: #a66a21;
  font-size: 7px;
  font-weight: 800;
  letter-spacing: 0.08em;
  pointer-events: none;
}

.branch-label--true {
  top: calc(37% - 4px);
}

.branch-label--false {
  top: calc(72% - 4px);
}
</style>
