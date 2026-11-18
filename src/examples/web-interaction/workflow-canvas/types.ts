import type { Edge, Node, XYPosition } from "@vue-flow/core";

export type WorkflowNodeKind =
  | "start"
  | "knowledge"
  | "llm"
  | "condition"
  | "answer";

export interface WorkflowNodeData {
  kind: WorkflowNodeKind;
  title: string;
  description: string;
  configLabel: string;
  configValue: string;
}

export interface WorkflowEdgeData {
  flowEnabled: boolean;
  branchLabel?: string;
}

export interface NodePaletteItem {
  kind: WorkflowNodeKind;
  title: string;
  description: string;
  configLabel: string;
  configValue: string;
}

export type WorkflowNode = Node<WorkflowNodeData> & {
  type: "workflow";
  data: WorkflowNodeData;
  position: XYPosition;
};

export type WorkflowEdge = Edge<WorkflowEdgeData> & {
  type: "flowing";
  data: WorkflowEdgeData;
};
