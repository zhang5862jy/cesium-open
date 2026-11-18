import {
  MarkerType,
  type Connection,
  type XYPosition,
} from "@vue-flow/core";
import type {
  NodePaletteItem,
  WorkflowEdge,
  WorkflowNode,
  WorkflowNodeKind,
} from "./types";

export const nodePalette: NodePaletteItem[] = [
  {
    kind: "start",
    title: "开始",
    description: "接收用户问题与初始变量",
    configLabel: "输入变量",
    configValue: "query",
  },
  {
    kind: "knowledge",
    title: "知识检索",
    description: "从指定知识库召回相关内容",
    configLabel: "知识库",
    configValue: "产品帮助中心",
  },
  {
    kind: "llm",
    title: "LLM",
    description: "理解上下文并生成结构化结果",
    configLabel: "模型",
    configValue: "GPT-5 mini",
  },
  {
    kind: "condition",
    title: "条件分支",
    description: "根据表达式选择后续路径",
    configLabel: "判断表达式",
    configValue: "score >= 0.8",
  },
  {
    kind: "answer",
    title: "回答",
    description: "将处理结果返回给用户",
    configLabel: "回复模板",
    configValue: "{{result}}",
  },
];

const paletteByKind = new Map(
  nodePalette.map((item) => [item.kind, item]),
);

export function getPaletteItem(kind: WorkflowNodeKind): NodePaletteItem {
  const item = paletteByKind.get(kind);
  if (!item) throw new Error(`未知工作流节点类型：${kind}`);
  return item;
}

export function createWorkflowNode(
  kind: WorkflowNodeKind,
  id: string,
  position: XYPosition,
  overrides: Partial<WorkflowNode["data"]> = {},
): WorkflowNode {
  const item = getPaletteItem(kind);

  return {
    id,
    type: "workflow",
    position,
    dragHandle: ".workflow-node__drag",
    data: {
      kind,
      title: item.title,
      description: item.description,
      configLabel: item.configLabel,
      configValue: item.configValue,
      ...overrides,
    },
  };
}

export function createFlowEdge(
  connection: Connection,
  flowEnabled: boolean,
  branchLabel?: string,
): WorkflowEdge {
  const sourceHandle = connection.sourceHandle ?? "source";
  const targetHandle = connection.targetHandle ?? "target";

  return {
    id: `edge-${connection.source}-${sourceHandle}-${connection.target}-${targetHandle}`,
    type: "flowing",
    source: connection.source,
    target: connection.target,
    sourceHandle,
    targetHandle,
    interactionWidth: 24,
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: "#6f7f98",
      width: 18,
      height: 18,
    },
    data: {
      flowEnabled,
      branchLabel,
    },
  };
}

export function createInitialNodes(): WorkflowNode[] {
  return [
    createWorkflowNode("start", "start-1", { x: 0, y: 105 }),
    createWorkflowNode("knowledge", "knowledge-1", { x: 280, y: 105 }),
    createWorkflowNode("llm", "llm-1", { x: 560, y: 105 }),
    createWorkflowNode("condition", "condition-1", { x: 840, y: 105 }),
    createWorkflowNode(
      "answer",
      "answer-success",
      { x: 1140, y: 0 },
      {
        title: "直接回答",
        description: "置信度充足，返回生成结果",
      },
    ),
    createWorkflowNode(
      "answer",
      "answer-fallback",
      { x: 1140, y: 220 },
      {
        title: "转人工",
        description: "置信度不足，返回兜底回复",
        configValue: "暂时无法确认，我来为你转接人工服务。",
      },
    ),
  ];
}

export function createInitialEdges(flowEnabled: boolean): WorkflowEdge[] {
  return [
    createFlowEdge(
      { source: "start-1", target: "knowledge-1" },
      flowEnabled,
    ),
    createFlowEdge(
      { source: "knowledge-1", target: "llm-1" },
      flowEnabled,
    ),
    createFlowEdge(
      { source: "llm-1", target: "condition-1" },
      flowEnabled,
    ),
    createFlowEdge(
      {
        source: "condition-1",
        sourceHandle: "true",
        target: "answer-success",
      },
      flowEnabled,
      "YES",
    ),
    createFlowEdge(
      {
        source: "condition-1",
        sourceHandle: "false",
        target: "answer-fallback",
      },
      flowEnabled,
      "NO",
    ),
  ];
}

function createsCycle(
  sourceId: string,
  targetId: string,
  edges: WorkflowEdge[],
): boolean {
  const outgoing = new Map<string, string[]>();

  for (const edge of edges) {
    const targets = outgoing.get(edge.source) ?? [];
    targets.push(edge.target);
    outgoing.set(edge.source, targets);
  }

  const pending = [targetId];
  const visited = new Set<string>();

  while (pending.length > 0) {
    const current = pending.pop();
    if (!current || visited.has(current)) continue;
    if (current === sourceId) return true;

    visited.add(current);
    pending.push(...(outgoing.get(current) ?? []));
  }

  return false;
}

export function isWorkflowConnectionValid(
  connection: Connection,
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
): boolean {
  if (!connection.source || !connection.target) return false;
  if (connection.source === connection.target) return false;

  const sourceNode = nodes.find((node) => node.id === connection.source);
  const targetNode = nodes.find((node) => node.id === connection.target);
  if (!sourceNode || !targetNode) return false;
  if (sourceNode.data.kind === "answer") return false;
  if (targetNode.data.kind === "start") return false;

  const sourceHandle = connection.sourceHandle ?? "source";
  const targetHandle = connection.targetHandle ?? "target";
  const connectionId =
    "id" in connection && typeof connection.id === "string"
      ? connection.id
      : undefined;

  const duplicate = edges.some(
    (edge) =>
      edge.id !== connectionId &&
      edge.source === connection.source &&
      edge.target === connection.target &&
      (edge.sourceHandle ?? "source") === sourceHandle &&
      (edge.targetHandle ?? "target") === targetHandle,
  );
  if (duplicate) return false;

  const occupiedTarget = edges.some(
    (edge) =>
      edge.id !== connectionId &&
      edge.target === connection.target &&
      (edge.targetHandle ?? "target") === targetHandle,
  );
  if (occupiedTarget) return false;

  return !createsCycle(connection.source, connection.target, edges);
}
