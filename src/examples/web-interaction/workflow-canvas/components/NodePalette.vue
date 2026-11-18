<script setup lang="ts">
import type { NodePaletteItem, WorkflowNodeKind } from "../types";
import NodeKindIcon from "./NodeKindIcon.vue";

defineProps<{
  items: NodePaletteItem[];
}>();

const emit = defineEmits<{
  add: [kind: WorkflowNodeKind];
  close: [];
}>();

function handleDragStart(event: DragEvent, kind: WorkflowNodeKind) {
  if (!event.dataTransfer) return;
  event.dataTransfer.effectAllowed = "copy";
  event.dataTransfer.setData("application/x-workflow-node", kind);
  event.dataTransfer.setData("text/plain", kind);
}
</script>

<template>
  <section class="node-palette">
    <header>
      <div>
        <span>NODE LIBRARY</span>
        <h2>添加节点</h2>
      </div>
      <button type="button" aria-label="关闭节点库" @click="emit('close')">
        ×
      </button>
    </header>

    <p class="node-palette__hint">拖入画布指定位置，或点击快速添加。</p>

    <div class="node-palette__list">
      <button
        v-for="item in items"
        :key="item.kind"
        class="node-palette__item"
        :class="`node-palette__item--${item.kind}`"
        type="button"
        draggable="true"
        @dragstart="handleDragStart($event, item.kind)"
        @click="emit('add', item.kind)"
      >
        <span class="node-palette__icon">
          <NodeKindIcon :kind="item.kind" />
        </span>
        <span class="node-palette__copy">
          <strong>{{ item.title }}</strong>
          <small>{{ item.description }}</small>
        </span>
        <span class="node-palette__add" aria-hidden="true">+</span>
      </button>
    </div>

    <div class="node-palette__tip">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v5M12 8h.01" />
      </svg>
      <p>从节点右侧端口拖向另一节点左侧，即可创建数据连接。</p>
    </div>
  </section>
</template>

<style scoped>
.node-palette {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  padding: 20px 16px 16px;
  background: #ffffff;
}

header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}

header span {
  color: #9da8b8;
  font-size: 8px;
  font-weight: 800;
  letter-spacing: 0.14em;
}

h2 {
  margin-top: 4px;
  color: #1c273a;
  font-size: 16px;
  font-weight: 720;
}

header button {
  display: none;
  width: 30px;
  height: 30px;
  color: #718096;
  font-size: 21px;
  background: #f4f6f9;
  border: 0;
  border-radius: 8px;
  cursor: pointer;
}

.node-palette__hint {
  margin-top: 10px;
  color: #8a95a6;
  font-size: 10px;
  line-height: 1.5;
}

.node-palette__list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 17px;
}

.node-palette__item {
  --item-accent: #3c78ff;
  --item-soft: #eef4ff;
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 62px;
  padding: 10px;
  text-align: left;
  background: #ffffff;
  border: 1px solid #e5e9f0;
  border-radius: 11px;
  cursor: grab;
  transition:
    border-color 150ms ease,
    box-shadow 150ms ease,
    transform 150ms ease;
}

.node-palette__item:hover {
  border-color: color-mix(in srgb, var(--item-accent) 48%, #dce3ed);
  box-shadow: 0 7px 18px rgb(31 47 76 / 8%);
  transform: translateY(-1px);
}

.node-palette__item:active {
  cursor: grabbing;
}

.node-palette__item--knowledge {
  --item-accent: #0c9f76;
  --item-soft: #e9f8f3;
}

.node-palette__item--llm {
  --item-accent: #7856e8;
  --item-soft: #f1edff;
}

.node-palette__item--condition {
  --item-accent: #d27a14;
  --item-soft: #fff5e7;
}

.node-palette__item--answer {
  --item-accent: #de526d;
  --item-soft: #fff0f3;
}

.node-palette__icon {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  color: var(--item-accent);
  background: var(--item-soft);
  border-radius: 9px;
}

.node-palette__copy {
  min-width: 0;
}

.node-palette__copy strong,
.node-palette__copy small {
  display: block;
}

.node-palette__copy strong {
  color: #2c374a;
  font-size: 11px;
  font-weight: 700;
}

.node-palette__copy small {
  overflow: hidden;
  margin-top: 4px;
  color: #909aab;
  font-size: 8px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.node-palette__add {
  color: #a5afbd;
  font-size: 17px;
  font-weight: 350;
}

.node-palette__tip {
  display: flex;
  gap: 8px;
  margin-top: auto;
  padding: 11px;
  color: #7a8799;
  background: #f6f8fb;
  border: 1px solid #ebeff4;
  border-radius: 10px;
}

.node-palette__tip svg {
  flex: 0 0 auto;
  width: 15px;
  height: 15px;
  fill: none;
  stroke: #7187a7;
  stroke-linecap: round;
  stroke-width: 1.8;
}

.node-palette__tip p {
  font-size: 8px;
  line-height: 1.55;
}

@media (max-width: 1120px) {
  header button {
    display: block;
  }
}
</style>
