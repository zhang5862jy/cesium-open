export interface SoakTestConfig {
  durationSeconds: number;
  writeRatePerSecond: number;
  queryIntervalSeconds: number;
  queryRecordLimit: number;
}

export interface SoakQuerySample {
  second: number;
  records: number;
  expectedRecords: number;
  firstBatchMs: number;
  totalMs: number;
}

export interface SoakLogEntry {
  id: number;
  kind: "write" | "query" | "system" | "error";
  message: string;
}

export interface SoakTestSnapshot {
  status: "idle" | "running" | "stopping" | "stopped" | "completed" | "error";
  sceneId: string;
  elapsedSeconds: number;
  durationSeconds: number;
  progress: number;
  insertedRecords: number;
  targetRecords: number;
  writeBatches: number;
  currentWriteMs: number;
  writeP95Ms: number;
  maxSchedulerDriftMs: number;
  queryCount: number;
  lastQueryRecords: number;
  lastQueryFirstBatchMs: number;
  lastQueryTotalMs: number;
  pageHeapBytes?: number;
  originUsageBytes: number;
  databaseBytes: number;
  writeLatencySeries: number[];
  queryLatencySeries: number[];
  querySamples: SoakQuerySample[];
  logs: SoakLogEntry[];
  error?: string;
}
