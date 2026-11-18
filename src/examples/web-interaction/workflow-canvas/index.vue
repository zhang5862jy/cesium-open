<script setup lang="ts">
import { Background, BackgroundVariant } from "@vue-flow/background";
import { Controls } from "@vue-flow/controls";
import {
  VueFlow,
  type Connection,
  type NodeMouseEvent,
  type ValidConnectionFunc,
  type VueFlowStore,
  type XYPosition,
} from "@vue-flow/core";
import { MiniMap } from "@vue-flow/minimap";
import {
  computed,
  nextTick,
  onUnmounted,
  ref,
  type Ref,
  watch,
} from "vue";
import "@vue-flow/core/dist/style.css";
import "@vue-flow/core/dist/theme-default.css";
import "@vue-flow/controls/dist/style.css";
import "@vue-flow/minimap/dist/style.css";
import FlowingEdge from "./components/FlowingEdge.vue";
import NodeInspector from "./components/NodeInspector.vue";
import NodePalette from "./components/NodePalette.vue";
import WorkflowNode from "./components/WorkflowNode.vue";
import type {
  WorkflowEdge,
  WorkflowNode as WorkflowGraphNode,
  WorkflowNodeData,
  WorkflowNodeKind,
} from "./types";
import {
  createFlowEdge,
  createInitialEdges,
  createInitialNodes,
  createWorkflowNode,
  isWorkflowConnectionValid,
  nodePalette,
} from "./workflow";

const canvasStage = ref<HTMLElement | null>(null);
const nodes = ref(createInitialNodes()) as Ref<WorkflowGraphNode[]>;
const edges = ref(createInitialEdges(true)) as Ref<WorkflowEdge[]>;
const flowEnabled = ref(true);
const selectedNodeId = ref<string | null>(null);
const paletteOpen = ref(false);
const inspectorOpen = ref(false);
const isDraggingOver = ref(false);
const flowKey = ref(0);

let nextNodeIndex = 20;
let flowInstance: VueFlowStore | null = null;
let shouldFitOnNodesInitialized = true;
let nodesInitialized = false;

const selectedNode = computed<WorkflowGraphNode | null>(
  () => nodes.value.find((node) => node.id === selectedNodeId.value) ?? null,
);

const workflowSummary = computed(
  () => `${nodes.value.length} 个节点 · ${edges.value.length} 条连接`,
);

const isValidConnection: ValidConnectionFunc = (connection) =>
  isWorkflowConnectionValid(connection, nodes.value, edges.value);

function centerNodePosition(): XYPosition {
  const bounds = canvasStage.value?.getBoundingClientRect();
  if (!bounds || !flowInstance) return { x: 80, y: 80 };

  const center = flowInstance.screenToFlowCoordinate({
    x: bounds.left + bounds.width / 2,
    y: bounds.top + bounds.height / 2,
  });

  return { x: center.x - 112, y: center.y - 80 };
}

function addNode(kind: WorkflowNodeKind, position = centerNodePosition()) {
  const node = createWorkflowNode(
    kind,
    `${kind}-${nextNodeIndex++}`,
    position,
  );
  flowInstance?.addNodes(node);
  selectedNodeId.value = node.id;
  inspectorOpen.value = true;
  paletteOpen.value = false;
}

function handleDrop(event: DragEvent) {
  event.preventDefault();
  isDraggingOver.value = false;

  const rawKind =
    event.dataTransfer?.getData("application/x-workflow-node") ||
    event.dataTransfer?.getData("text/plain");
  const kind = nodePalette.find((item) => item.kind === rawKind)?.kind;
  if (!kind) return;

  if (!flowInstance) return;

  const position = flowInstance.screenToFlowCoordinate({
    x: event.clientX,
    y: event.clientY,
  });
  addNode(kind, { x: position.x - 112, y: position.y - 80 });
}

function handleDragOver(event: DragEvent) {
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
  isDraggingOver.value = true;
}

function handleConnect(connection: Connection) {
  if (!isWorkflowConnectionValid(connection, nodes.value, edges.value)) return;
  flowInstance?.addEdges(createFlowEdge(connection, flowEnabled.value));
}

function handleNodeClick({ node }: NodeMouseEvent) {
  selectedNodeId.value = node.id;
  inspectorOpen.value = true;
}

function handlePaneClick() {
  selectedNodeId.value = null;
  if (window.matchMedia("(max-width: 1120px)").matches) {
    inspectorOpen.value = false;
  }
}

function updateNode(id: string, patch: Partial<WorkflowNodeData>) {
  flowInstance?.updateNodeData(id, patch);
}

function removeNode(id: string) {
  flowInstance?.removeNodes(id, true);
  selectedNodeId.value = null;
  inspectorOpen.value = false;
}

function toggleFlow() {
  flowEnabled.value = !flowEnabled.value;
  for (const edge of edges.value) {
    flowInstance?.updateEdgeData(edge.id, {
      ...edge.data,
      flowEnabled: flowEnabled.value,
    });
  }
}

async function resetWorkflow() {
  nodes.value = createInitialNodes();
  edges.value = createInitialEdges(flowEnabled.value);
  selectedNodeId.value = null;
  inspectorOpen.value = false;
  nextNodeIndex = 20;
  flowInstance = null;
  nodesInitialized = false;
  shouldFitOnNodesInitialized = true;
  flowKey.value += 1;
}

function handleInit(instance: VueFlowStore) {
  flowInstance = instance;
  void fitInitialView();
}

async function handleNodesInitialized() {
  nodesInitialized = true;
  await fitInitialView();
}

async function fitInitialView() {
  if (
    !flowInstance ||
    !nodesInitialized ||
    !shouldFitOnNodesInitialized
  ) {
    return;
  }

  shouldFitOnNodesInitialized = false;
  await nextTick();
  await flowInstance.fitView({ padding: 0.16, maxZoom: 0.9, duration: 520 });
}

function closeDrawers() {
  paletteOpen.value = false;
  inspectorOpen.value = false;
}

watch(
  nodes,
  () => {
    if (
      selectedNodeId.value &&
      !nodes.value.some((node) => node.id === selectedNodeId.value)
    ) {
      selectedNodeId.value = null;
      inspectorOpen.value = false;
    }
  },
  { deep: true },
);

onUnmounted(() => {
  isDraggingOver.value = false;
});
</script>

<template>
  <div class="workflow-workbench">
    <header class="workbench-toolbar">
      <div class="toolbar-identity">
        <span class="toolbar-logo" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <rect x="4" y="4" width="6" height="6" rx="2" />
            <rect x="14" y="14" width="6" height="6" rx="2" />
            <path d="M10 7h3a4 4 0 0 1 4 4v3" />
          </svg>
        </span>
        <div>
          <div class="toolbar-title-row">
            <h1>智能客服工作流</h1>
            <span>草稿</span>
          </div>
          <p>{{ workflowSummary }}</p>
        </div>
      </div>

      <div class="toolbar-actions">
        <button
          class="drawer-toggle drawer-toggle--palette"
          type="button"
          aria-label="打开节点库"
          @click="paletteOpen = !paletteOpen"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 5h16M4 12h16M4 19h16" />
          </svg>
          节点
        </button>
        <button
          class="drawer-toggle drawer-toggle--inspector"
          type="button"
          aria-label="打开节点配置"
          @click="inspectorOpen = !inspectorOpen"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
            <circle cx="12" cy="12" r="4" />
          </svg>
          配置
        </button>
        <button
          class="flow-toggle"
          :class="{ 'is-active': flowEnabled }"
          type="button"
          :aria-pressed="flowEnabled"
          @click="toggleFlow"
        >
          <span aria-hidden="true"><i></i></span>
          数据流{{ flowEnabled ? "开启" : "暂停" }}
        </button>
        <button class="reset-button" type="button" @click="resetWorkflow">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 8V4m0 0h4M5 4l3 3a7 7 0 1 1-2 8" />
          </svg>
          恢复示例
        </button>
      </div>
    </header>

    <div class="workbench-body">
      <aside class="palette-shell" :class="{ 'is-open': paletteOpen }">
        <NodePalette
          :items="nodePalette"
          @add="addNode"
          @close="paletteOpen = false"
        />
      </aside>

      <main
        ref="canvasStage"
        class="canvas-stage"
        :class="{ 'is-dragging-over': isDraggingOver }"
        @dragenter.prevent="isDraggingOver = true"
        @dragover="handleDragOver"
        @dragleave.self="isDraggingOver = false"
        @drop="handleDrop"
      >
        <VueFlow
          :key="flowKey"
          :id="`workflow-canvas-${flowKey}`"
          v-model:nodes="nodes"
          v-model:edges="edges"
          class="workflow-flow"
          :is-valid-connection="isValidConnection"
          :connection-radius="28"
          :min-zoom="0.28"
          :max-zoom="1.6"
          :pan-on-drag="true"
          :zoom-on-scroll="true"
          :zoom-on-double-click="false"
          :connect-on-click="true"
          :elevate-nodes-on-select="true"
          :elevate-edges-on-select="true"
          :connection-line-style="{
            stroke: '#6688df',
            strokeWidth: 2,
            strokeDasharray: '5 6',
          }"
          @connect="handleConnect"
          @node-click="handleNodeClick"
          @nodes-initialized="handleNodesInitialized"
          @pane-click="handlePaneClick"
          @init="handleInit"
          @dragenter.prevent
          @dragover.prevent
          @drop.prevent
        >
          <template #node-workflow="nodeProps">
            <WorkflowNode v-bind="nodeProps" />
          </template>

          <template #edge-flowing="edgeProps">
            <FlowingEdge v-bind="edgeProps" />
          </template>

          <Background
            :variant="BackgroundVariant.Dots"
            :gap="22"
            :size="1.15"
            pattern-color="#c6cfdb"
            bg-color="#f5f7fb"
          />

          <div class="canvas-guide">
            <span>按住空白拖动画布</span>
            <i></i>
            <span>滚轮缩放</span>
            <i></i>
            <span>拖动端口连接</span>
          </div>

          <Controls
            position="bottom-left"
            :show-zoom="true"
            :show-fit-view="true"
            :show-interactive="true"
          />

          <MiniMap
            position="bottom-right"
            :pannable="true"
            :zoomable="true"
            node-color="#8fa4c7"
            node-stroke-color="#ffffff"
            :node-border-radius="8"
            mask-color="rgb(237 241 247 / 72%)"
          />
        </VueFlow>

        <div v-if="isDraggingOver" class="drop-indicator">
          <span>释放以添加节点</span>
        </div>
      </main>

      <aside class="inspector-shell" :class="{ 'is-open': inspectorOpen }">
        <NodeInspector
          :node="selectedNode"
          @close="inspectorOpen = false"
          @remove="removeNode"
          @update="updateNode"
        />
      </aside>

      <button
        v-if="paletteOpen || inspectorOpen"
        class="drawer-backdrop"
        type="button"
        aria-label="关闭侧面板"
        @click="closeDrawers"
      ></button>
    </div>
  </div>
</template>

<style scoped>
.workflow-workbench {
  --toolbar-height: 64px;
  width: 100%;
  height: 100%;
  overflow: hidden;
  color: #263247;
  background: #eef2f7;
}

.workbench-toolbar {
  position: relative;
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  height: var(--toolbar-height);
  padding: 0 16px 0 18px;
  background: rgb(255 255 255 / 96%);
  border-bottom: 1px solid #dfe5ed;
  box-shadow: 0 2px 12px rgb(29 45 70 / 4%);
}

.toolbar-identity {
  display: flex;
  align-items: center;
  gap: 11px;
  min-width: 0;
}

.toolbar-logo {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  width: 34px;
  height: 34px;
  color: #ffffff;
  background: linear-gradient(145deg, #345fd6, #6c8deb);
  border-radius: 10px;
  box-shadow: 0 5px 14px rgb(63 99 198 / 25%);
}

.toolbar-logo svg {
  width: 19px;
  height: 19px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.7;
}

.toolbar-title-row {
  display: flex;
  align-items: center;
  gap: 7px;
}

.toolbar-title-row h1 {
  overflow: hidden;
  color: #182337;
  font-size: 13px;
  font-weight: 730;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.toolbar-title-row span {
  padding: 3px 6px;
  color: #78869a;
  font-size: 7px;
  font-weight: 700;
  background: #f0f3f7;
  border-radius: 4px;
}

.toolbar-identity p {
  margin-top: 4px;
  color: #9aa5b4;
  font-size: 8px;
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 7px;
}

.toolbar-actions button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 34px;
  padding: 0 11px;
  color: #647187;
  font-size: 9px;
  font-weight: 650;
  background: #ffffff;
  border: 1px solid #dfe4ec;
  border-radius: 8px;
  cursor: pointer;
  transition:
    color 140ms ease,
    border-color 140ms ease,
    background 140ms ease;
}

.toolbar-actions button:hover {
  color: #385eae;
  background: #f6f8fc;
  border-color: #c3cde0;
}

.toolbar-actions svg {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
}

.toolbar-actions .flow-toggle {
  color: #718097;
  background: #f8f9fb;
}

.toolbar-actions .flow-toggle.is-active {
  color: #3562c8;
  background: #eef3ff;
  border-color: #cedafb;
}

.flow-toggle > span {
  position: relative;
  display: block;
  width: 22px;
  height: 12px;
  background: #c7ced9;
  border-radius: 999px;
  transition: background 150ms ease;
}

.flow-toggle > span i {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 8px;
  height: 8px;
  background: #ffffff;
  border-radius: 50%;
  box-shadow: 0 1px 2px rgb(30 44 69 / 25%);
  transition: transform 150ms ease;
}

.flow-toggle.is-active > span {
  background: #5f82dc;
}

.flow-toggle.is-active > span i {
  transform: translateX(10px);
}

.drawer-toggle {
  display: none !important;
}

.workbench-body {
  position: relative;
  display: grid;
  grid-template-columns: 232px minmax(0, 1fr) 286px;
  height: calc(100% - var(--toolbar-height));
  overflow: hidden;
}

.palette-shell,
.inspector-shell {
  position: relative;
  z-index: 12;
  min-width: 0;
  height: 100%;
  overflow: hidden;
}

.palette-shell {
  border-right: 1px solid #e0e5ec;
  box-shadow: 4px 0 16px rgb(25 41 67 / 3%);
}

.inspector-shell {
  border-left: 1px solid #e0e5ec;
  box-shadow: -4px 0 16px rgb(25 41 67 / 3%);
}

.canvas-stage {
  position: relative;
  z-index: 1;
  min-width: 0;
  height: 100%;
  overflow: hidden;
  background: #f5f7fb;
}

.workflow-flow {
  width: 100%;
  height: 100%;
}

.canvas-guide {
  position: absolute;
  top: 14px;
  left: 50%;
  z-index: 6;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  color: #8793a5;
  font-size: 8px;
  background: rgb(255 255 255 / 84%);
  border: 1px solid rgb(219 225 234 / 82%);
  border-radius: 999px;
  box-shadow: 0 4px 14px rgb(31 46 73 / 6%);
  backdrop-filter: blur(8px);
  transform: translateX(-50%);
  pointer-events: none;
}

.canvas-guide i {
  width: 2px;
  height: 2px;
  background: #b2bbc8;
  border-radius: 50%;
}

.drop-indicator {
  position: absolute;
  inset: 12px;
  z-index: 20;
  display: grid;
  place-items: center;
  color: #3f69c6;
  background: rgb(232 239 255 / 50%);
  border: 2px dashed #7998dd;
  border-radius: 16px;
  pointer-events: none;
}

.drop-indicator span {
  padding: 9px 14px;
  font-size: 10px;
  font-weight: 700;
  background: #ffffff;
  border: 1px solid #d6e0f5;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgb(43 69 124 / 12%);
}

.drawer-backdrop {
  display: none;
}

:deep(.vue-flow__controls) {
  overflow: hidden;
  margin: 14px;
  background: rgb(255 255 255 / 94%);
  border: 1px solid #dce2ea;
  border-radius: 10px;
  box-shadow: 0 6px 18px rgb(31 46 73 / 9%);
}

:deep(.vue-flow__controls-button) {
  width: 30px;
  height: 30px;
  color: #66748a;
  background: transparent;
  border-bottom-color: #e8ecf1;
}

:deep(.vue-flow__controls-button:hover) {
  color: #3d62b7;
  background: #f3f6fb;
}

:deep(.vue-flow__minimap) {
  width: 132px;
  height: 84px;
  margin: 14px;
  overflow: hidden;
  background: rgb(255 255 255 / 92%);
  border: 1px solid #dce2ea;
  border-radius: 10px;
  box-shadow: 0 6px 18px rgb(31 46 73 / 9%);
}

:deep(.vue-flow__connection-path) {
  stroke-linecap: round;
}

:deep(.vue-flow__edge.selected .vue-flow__edge-path) {
  stroke: #5b7dd2;
  stroke-width: 2.2;
}

@media (max-width: 1120px) {
  .workbench-body {
    grid-template-columns: minmax(0, 1fr);
  }

  .drawer-toggle {
    display: flex !important;
  }

  .palette-shell,
  .inspector-shell {
    position: absolute;
    top: 0;
    bottom: 0;
    z-index: 26;
    width: min(270px, calc(100% - 38px));
    transition: transform 190ms ease;
  }

  .palette-shell {
    left: 0;
    transform: translateX(-103%);
  }

  .inspector-shell {
    right: 0;
    transform: translateX(103%);
  }

  .palette-shell.is-open,
  .inspector-shell.is-open {
    transform: translateX(0);
  }

  .drawer-backdrop {
    position: absolute;
    inset: 0;
    z-index: 24;
    display: block;
    background: rgb(29 40 61 / 18%);
    border: 0;
    backdrop-filter: blur(1px);
  }
}

@media (max-width: 760px) {
  .workbench-toolbar {
    padding-inline: 10px;
  }

  .toolbar-logo {
    display: none;
  }

  .toolbar-title-row span,
  .toolbar-identity p,
  .flow-toggle,
  .reset-button {
    display: none !important;
  }

  .toolbar-title-row h1 {
    max-width: 120px;
    font-size: 11px;
  }

  .toolbar-actions button {
    padding-inline: 8px;
  }

  .canvas-guide {
    display: none;
  }

  :deep(.vue-flow__minimap) {
    width: 100px;
    height: 66px;
    margin: 10px;
  }

  :deep(.vue-flow__controls) {
    margin: 10px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .palette-shell,
  .inspector-shell,
  .flow-toggle > span,
  .flow-toggle > span i {
    transition-duration: 0.01ms;
  }
}
</style>
