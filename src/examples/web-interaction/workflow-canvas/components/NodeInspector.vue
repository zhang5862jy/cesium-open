<script setup lang="ts">
import type { WorkflowNode, WorkflowNodeData } from "../types";
import NodeKindIcon from "./NodeKindIcon.vue";

defineProps<{
  node: WorkflowNode | null;
}>();

const emit = defineEmits<{
  close: [];
  remove: [id: string];
  update: [id: string, patch: Partial<WorkflowNodeData>];
}>();

function readInput(event: Event): string {
  return (event.target as HTMLInputElement | HTMLTextAreaElement).value;
}
</script>

<template>
  <section class="node-inspector">
    <header>
      <div>
        <span>INSPECTOR</span>
        <h2>节点配置</h2>
      </div>
      <button type="button" aria-label="关闭配置面板" @click="emit('close')">
        ×
      </button>
    </header>

    <template v-if="node">
      <div class="node-inspector__identity" :class="`kind-${node.data.kind}`">
        <span class="node-inspector__icon">
          <NodeKindIcon :kind="node.data.kind" />
        </span>
        <div>
          <strong>{{ node.data.title }}</strong>
          <small>{{ node.id }}</small>
        </div>
        <i>READY</i>
      </div>

      <div class="node-inspector__form">
        <label>
          <span>节点名称</span>
          <input
            :value="node.data.title"
            maxlength="40"
            @input="emit('update', node.id, { title: readInput($event) })"
          />
        </label>

        <label>
          <span>节点说明</span>
          <textarea
            :value="node.data.description"
            maxlength="120"
            rows="3"
            @input="emit('update', node.id, { description: readInput($event) })"
          ></textarea>
        </label>

        <label>
          <span>{{ node.data.configLabel }}</span>
          <textarea
            v-if="node.data.kind === 'answer'"
            :value="node.data.configValue"
            maxlength="180"
            rows="4"
            @input="emit('update', node.id, { configValue: readInput($event) })"
          ></textarea>
          <input
            v-else
            :value="node.data.configValue"
            maxlength="80"
            @input="emit('update', node.id, { configValue: readInput($event) })"
          />
        </label>
      </div>

      <div class="node-inspector__meta">
        <div>
          <span>节点类型</span>
          <strong>{{ node.data.kind.toUpperCase() }}</strong>
        </div>
        <div>
          <span>连接状态</span>
          <strong class="status">可连接</strong>
        </div>
      </div>

      <button
        class="node-inspector__delete"
        type="button"
        @click="emit('remove', node.id)"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 7h14M9 7V4h6v3M8 10v8M12 10v8M16 10v8M7 7l1 14h8l1-14" />
        </svg>
        删除节点
      </button>
    </template>

    <div v-else class="node-inspector__empty">
      <div>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m5 4 14 7-6 2-2 6L5 4Z" />
        </svg>
      </div>
      <strong>选择一个节点</strong>
      <p>点击画布中的节点，在这里编辑名称、说明和运行参数。</p>
    </div>
  </section>
</template>

<style scoped>
.node-inspector {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  padding: 20px 17px 16px;
  background: #ffffff;
}

header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding-bottom: 17px;
  border-bottom: 1px solid #edf0f4;
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

.node-inspector__identity {
  --identity-accent: #3c78ff;
  --identity-soft: #eef4ff;
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  margin-top: 18px;
}

.node-inspector__identity.kind-knowledge {
  --identity-accent: #0c9f76;
  --identity-soft: #e9f8f3;
}

.node-inspector__identity.kind-llm {
  --identity-accent: #7856e8;
  --identity-soft: #f1edff;
}

.node-inspector__identity.kind-condition {
  --identity-accent: #d27a14;
  --identity-soft: #fff5e7;
}

.node-inspector__identity.kind-answer {
  --identity-accent: #de526d;
  --identity-soft: #fff0f3;
}

.node-inspector__icon {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  color: var(--identity-accent);
  background: var(--identity-soft);
  border-radius: 10px;
}

.node-inspector__identity strong,
.node-inspector__identity small {
  display: block;
}

.node-inspector__identity strong {
  overflow: hidden;
  color: #2a3548;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.node-inspector__identity small {
  margin-top: 3px;
  color: #a0a9b8;
  font-size: 8px;
}

.node-inspector__identity i {
  padding: 4px 6px;
  color: #208a67;
  font-size: 7px;
  font-style: normal;
  font-weight: 800;
  letter-spacing: 0.08em;
  background: #eaf8f2;
  border-radius: 5px;
}

.node-inspector__form {
  display: flex;
  flex-direction: column;
  gap: 15px;
  margin-top: 22px;
}

label > span {
  display: block;
  margin-bottom: 7px;
  color: #667388;
  font-size: 9px;
  font-weight: 680;
}

input,
textarea {
  display: block;
  width: 100%;
  padding: 10px 11px;
  color: #354156;
  font-size: 10px;
  line-height: 1.5;
  background: #fafbfc;
  border: 1px solid #dfe5ed;
  border-radius: 8px;
  outline: none;
  resize: vertical;
  transition:
    border-color 140ms ease,
    box-shadow 140ms ease;
}

input:focus,
textarea:focus {
  background: #ffffff;
  border-color: #6f93e9;
  box-shadow: 0 0 0 3px rgb(87 126 221 / 11%);
}

.node-inspector__meta {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 18px;
}

.node-inspector__meta div {
  padding: 10px;
  background: #f7f9fb;
  border: 1px solid #edf0f4;
  border-radius: 8px;
}

.node-inspector__meta span,
.node-inspector__meta strong {
  display: block;
}

.node-inspector__meta span {
  color: #9aa5b5;
  font-size: 8px;
}

.node-inspector__meta strong {
  margin-top: 5px;
  color: #5b687c;
  font-size: 8px;
}

.node-inspector__meta .status {
  color: #218965;
}

.node-inspector__delete {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  width: 100%;
  min-height: 36px;
  margin-top: auto;
  color: #c24c62;
  font-size: 10px;
  font-weight: 650;
  background: #fff6f7;
  border: 1px solid #f2d8dd;
  border-radius: 8px;
  cursor: pointer;
}

.node-inspector__delete:hover {
  background: #ffedef;
}

.node-inspector__delete svg {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.7;
}

.node-inspector__empty {
  display: grid;
  justify-items: center;
  margin: auto 10px;
  color: #8793a5;
  text-align: center;
}

.node-inspector__empty > div {
  display: grid;
  place-items: center;
  width: 55px;
  height: 55px;
  color: #8ca0bd;
  background: #f2f5f9;
  border: 1px solid #e4e9ef;
  border-radius: 17px;
}

.node-inspector__empty svg {
  width: 23px;
  height: 23px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.6;
}

.node-inspector__empty strong {
  margin-top: 17px;
  color: #536075;
  font-size: 12px;
}

.node-inspector__empty p {
  max-width: 190px;
  margin-top: 7px;
  font-size: 9px;
  line-height: 1.6;
}

@media (max-width: 1120px) {
  header button {
    display: block;
  }
}
</style>
