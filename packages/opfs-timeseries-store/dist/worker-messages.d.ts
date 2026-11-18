import type { AppendResult, ClearDataResult, RecordKey, RecordMutationResult, RecordsPage, RecordsPageQuery, StoreStats, RangeQuery } from "./types";
import type { SerializedStorageError } from "./errors";
export declare const OPFS_POOL_DIRECTORY = "/browser-timeseries-store-v1";
export interface EncodedWriteRecord {
    sceneId: string;
    timestampMs: number;
    protocolId: number;
    codecVersion: number;
    payload: ArrayBuffer;
}
export interface WorkerStoredRecord {
    timestampMs: number;
    sequence: number;
    protocolId: number;
    codecVersion: number;
    payload: ArrayBuffer;
}
export interface WorkerRangeBatch {
    records: WorkerStoredRecord[];
    nextCursor?: string;
    done: boolean;
}
export interface EncodedUpdateRecord {
    key: RecordKey;
    sceneId: string;
    timestampMs: number;
    protocolId: number;
    codecVersion: number;
    payload: ArrayBuffer;
}
export type WorkerRequest = {
    id: string;
    kind: "initialize";
    databaseName: string;
} | {
    id: string;
    kind: "append";
    records: EncodedWriteRecord[];
    byteLength: number;
} | {
    id: string;
    kind: "query-open";
    query: RangeQuery;
} | {
    id: string;
    kind: "query-next";
    queryId: string;
} | {
    id: string;
    kind: "query-close";
    queryId: string;
} | {
    id: string;
    kind: "records-page";
    query: RecordsPageQuery;
} | {
    id: string;
    kind: "update-record";
    record: EncodedUpdateRecord;
} | {
    id: string;
    kind: "delete-record";
    key: RecordKey;
} | {
    id: string;
    kind: "clear-all";
} | {
    id: string;
    kind: "stats";
} | {
    id: string;
    kind: "close";
};
export type WorkerSuccessResult = {
    kind: "initialize";
    storageMode: "opfs-sahpool";
    sqliteVersion: string;
} | {
    kind: "append";
    value: AppendResult;
} | {
    kind: "query-open";
    queryId: string;
} | {
    kind: "query-next";
    batch: WorkerRangeBatch;
} | {
    kind: "query-close";
} | {
    kind: "records-page";
    value: RecordsPage;
} | {
    kind: "update-record";
    value: RecordMutationResult;
} | {
    kind: "delete-record";
    value: RecordMutationResult;
} | {
    kind: "clear-all";
    value: ClearDataResult;
} | {
    kind: "stats";
    value: StoreStats;
} | {
    kind: "close";
};
export type WorkerResponse = {
    id: string;
    ok: true;
    result: WorkerSuccessResult;
} | {
    id: string;
    ok: false;
    error: SerializedStorageError;
};
