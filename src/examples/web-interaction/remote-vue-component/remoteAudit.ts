export interface RemoteAuditSnapshot {
  managedResources: number;
  peakDomMutationsPerSecond: number;
  remoteNetworkRequests: number;
  remoteTimers: number;
  startedAt: string;
  state: "idle" | "running" | "suspended" | "unmounted";
  totalActions: number;
  totalDomMutations: number;
}

export interface RemoteSuspensionEvent {
  reason: string;
  snapshot: RemoteAuditSnapshot;
}
