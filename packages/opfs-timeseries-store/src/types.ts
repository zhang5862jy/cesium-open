export interface ProtocolCodec<T> {
  readonly protocolId: number;
  readonly version: number;
  encode(value: T): Uint8Array;
  decode(bytes: Uint8Array): T;
}

export interface WriteRecord<T = unknown> {
  sceneId: string;
  timestampMs: number;
  protocolId: number;
  value: T;
}

export interface AppendResult {
  firstSequence: number;
  lastSequence: number;
  committedCount: number;
}

export interface ClearDataResult {
  removedRecords: number;
  removedPayloadBytes: number;
  databaseBytes: number;
  compacted: boolean;
}

export interface RangeQuery {
  sceneId: string;
  fromInclusive: number;
  toExclusive: number;
  protocolIds?: number[];
  cursor?: string;
  batchSize?: number;
}

export interface StoredRecord {
  timestampMs: number;
  sequence: number;
  protocolId: number;
  codecVersion: number;
  payload: Uint8Array;
}

export interface RecordKey {
  sceneId: string;
  timestampMs: number;
  sequence: number;
}

export interface ManagedStoredRecord extends StoredRecord {
  sceneId: string;
}

export interface RecordsPageQuery {
  sceneId?: string;
  fromInclusive: number;
  toExclusive: number;
  protocolIds?: number[];
  cursor?: string;
  pageSize?: number;
}

export interface RecordsPage {
  records: ManagedStoredRecord[];
  nextCursor?: string;
  done: boolean;
}

export interface UpdateRecord<T = unknown> {
  key: RecordKey;
  sceneId: string;
  timestampMs: number;
  protocolId: number;
  value: T;
}

export interface RecordMutationResult {
  changed: boolean;
}

export interface DecodedRecord<T = unknown> extends Omit<
  StoredRecord,
  "payload"
> {
  value: T;
}

export interface ManagedDecodedRecord<T = unknown> extends Omit<
  ManagedStoredRecord,
  "payload"
> {
  value: T;
}

export interface RangeBatch {
  records: StoredRecord[];
  nextCursor?: string;
  done: boolean;
}

export interface StorageEstimate {
  usage: number;
  quota: number;
  available: number;
  reserve: number;
  writable: boolean;
  persisted: boolean;
}

export interface StoreStats {
  recordCount: number;
  payloadBytes: number;
  databaseBytes: number;
  sqliteVersion: string;
  storageMode: "opfs-sahpool";
}

export interface OpenStoreOptions {
  databaseName?: string;
  requestPersistence?: boolean;
}
