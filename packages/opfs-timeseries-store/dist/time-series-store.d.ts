import { ProtocolRegistry } from "./protocol-registry";
import type { AppendResult, ClearDataResult, DecodedRecord, ManagedDecodedRecord, ManagedStoredRecord, OpenStoreOptions, RangeBatch, RangeQuery, RecordKey, RecordMutationResult, RecordsPage, RecordsPageQuery, StorageEstimate, StoreStats, UpdateRecord, WriteRecord } from "./types";
export declare class TimeSeriesStore {
    #private;
    private constructor();
    static open(registry: ProtocolRegistry, options?: OpenStoreOptions): Promise<TimeSeriesStore>;
    get storageEstimate(): StorageEstimate | undefined;
    appendBatch(records: WriteRecord[]): Promise<AppendResult>;
    queryRange(queryInput: RangeQuery): ReadableStream<RangeBatch>;
    recordsPage(queryInput: RecordsPageQuery): Promise<RecordsPage>;
    updateRecord(record: UpdateRecord): Promise<RecordMutationResult>;
    deleteRecord(key: RecordKey): Promise<RecordMutationResult>;
    decode<T = unknown>(record: RangeBatch["records"][number]): DecodedRecord<T>;
    decodeManaged<T = unknown>(record: ManagedStoredRecord): ManagedDecodedRecord<T>;
    stats(): Promise<StoreStats>;
    clearAllData(): Promise<ClearDataResult>;
    refreshStorageEstimate(): Promise<StorageEstimate>;
    close(): Promise<void>;
}
