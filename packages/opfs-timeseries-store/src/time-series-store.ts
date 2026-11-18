import { ByteCapacityGate } from "./byte-capacity-gate";
import { deserializeStorageError, TimeSeriesStorageError } from "./errors";
import { ProtocolRegistry } from "./protocol-registry";
import { SingleTabLock } from "./single-tab-lock";
import { StorageBudgetGuard } from "./storage-budget";
import {
  assertProtocolId,
  assertRecordKey,
  assertSceneId,
  assertTimestamp,
  MAX_BATCH_BYTES,
  MAX_BATCH_SIZE,
  MAX_PENDING_BYTES,
  normalizeRangeQuery,
  normalizeRecordsPageQuery,
} from "./validation";
import type {
  AppendResult,
  ClearDataResult,
  DecodedRecord,
  ManagedDecodedRecord,
  ManagedStoredRecord,
  OpenStoreOptions,
  RangeBatch,
  RangeQuery,
  RecordKey,
  RecordMutationResult,
  RecordsPage,
  RecordsPageQuery,
  StorageEstimate,
  StoreStats,
  UpdateRecord,
  WriteRecord,
} from "./types";
import {
  OPFS_POOL_DIRECTORY,
  type EncodedWriteRecord,
  type WorkerRequest,
  type WorkerResponse,
  type WorkerSuccessResult,
} from "./worker-messages";

type RequestWithoutId = WorkerRequest extends infer Request
  ? Request extends { id: string }
    ? Omit<Request, "id">
    : never
  : never;

interface PendingRpc {
  resolve: (value: WorkerSuccessResult) => void;
  reject: (reason: unknown) => void;
}

export class TimeSeriesStore {
  readonly #registry: ProtocolRegistry;
  readonly #worker: Worker;
  readonly #lock: SingleTabLock;
  readonly #budget = new StorageBudgetGuard();
  readonly #capacity = new ByteCapacityGate(MAX_PENDING_BYTES);
  readonly #pending = new Map<string, PendingRpc>();
  #closePromise?: Promise<void>;
  #workerError?: Error;
  #estimate?: StorageEstimate;

  private constructor(
    registry: ProtocolRegistry,
    worker: Worker,
    lock: SingleTabLock,
  ) {
    this.#registry = registry;
    this.#worker = worker;
    this.#lock = lock;
    worker.onmessage = (event: MessageEvent<WorkerResponse>) =>
      this.#onMessage(event.data);
    worker.onerror = (event) =>
      this.#failWorker(new Error(event.message || "无法加载存储 Worker。"));
    worker.onmessageerror = () =>
      this.#failWorker(new Error("Worker message could not be decoded"));
  }

  static async open(
    registry: ProtocolRegistry,
    options: OpenStoreOptions = {},
  ): Promise<TimeSeriesStore> {
    if (
      !globalThis.isSecureContext ||
      !globalThis.navigator?.storage?.getDirectory ||
      typeof Worker === "undefined"
    ) {
      throw new TimeSeriesStorageError(
        "UNSUPPORTED",
        "OPFS 需要 HTTPS 或 localhost 安全上下文。",
      );
    }

    const databaseName = options.databaseName ?? "timeseries-v1";
    // All database files in the SAH pool share exclusive access handles.
    const lock = new SingleTabLock(
      `browser-timeseries-store:${OPFS_POOL_DIRECTORY}`,
    );
    await lock.acquire();

    let worker: Worker | undefined;
    try {
      worker = new Worker(
        new URL("./sqlite/storage.worker.ts", import.meta.url),
        {
          type: "module",
          name: "browser-timeseries-storage",
        },
      );
      const store = new TimeSeriesStore(registry, worker, lock);
      store.#estimate = await store.#budget.initialize(
        options.requestPersistence ?? true,
      );
      const result = await store.#rpc({ kind: "initialize", databaseName });
      if (result.kind !== "initialize")
        throw new Error("unexpected initialize response");
      return store;
    } catch (error) {
      worker?.terminate();
      await lock.release();
      throw error;
    }
  }

  get storageEstimate(): StorageEstimate | undefined {
    return this.#estimate;
  }

  async appendBatch(records: WriteRecord[]): Promise<AppendResult> {
    this.#affirmOpen();
    if (records.length === 0) {
      throw new TimeSeriesStorageError(
        "INVALID_ARGUMENT",
        "appendBatch 至少需要一条记录。",
      );
    }

    const chunks: EncodedWriteRecord[][] = [];
    let current: EncodedWriteRecord[] = [];
    let currentBytes = 0;

    for (const record of records) {
      assertSceneId(record.sceneId);
      assertTimestamp(record.timestampMs);
      assertProtocolId(record.protocolId);
      const encoded = this.#registry.encode(record.protocolId, record.value);
      const payload = Uint8Array.from(encoded.payload).buffer;

      if (
        current.length > 0 &&
        (current.length >= MAX_BATCH_SIZE ||
          currentBytes + payload.byteLength > MAX_BATCH_BYTES)
      ) {
        chunks.push(current);
        current = [];
        currentBytes = 0;
      }
      current.push({
        sceneId: record.sceneId,
        timestampMs: record.timestampMs,
        protocolId: record.protocolId,
        codecVersion: encoded.codecVersion,
        payload,
      });
      currentBytes += payload.byteLength;
    }
    if (current.length > 0) chunks.push(current);

    let firstSequence = 0;
    let lastSequence = 0;
    let committedCount = 0;
    for (const chunk of chunks) {
      const byteLength = chunk.reduce(
        (sum, record) => sum + record.payload.byteLength,
        0,
      );
      this.#estimate = await this.#budget.beforeWrite(byteLength);
      await this.#capacity.acquire(byteLength);
      try {
        const transfer = chunk.map((record) => record.payload);
        const result = await this.#rpc(
          { kind: "append", records: chunk, byteLength },
          transfer,
        );
        if (result.kind !== "append")
          throw new Error("unexpected append response");
        if (committedCount === 0) firstSequence = result.value.firstSequence;
        lastSequence = result.value.lastSequence;
        committedCount += result.value.committedCount;
      } finally {
        this.#capacity.release(byteLength);
      }
    }
    return { firstSequence, lastSequence, committedCount };
  }

  queryRange(queryInput: RangeQuery): ReadableStream<RangeBatch> {
    this.#affirmOpen();
    const query = normalizeRangeQuery(queryInput);
    let queryId: string | undefined;
    return new ReadableStream<RangeBatch>({
      start: async () => {
        const result = await this.#rpc({ kind: "query-open", query });
        if (result.kind !== "query-open")
          throw new Error("unexpected query-open response");
        queryId = result.queryId;
      },
      pull: async (controller) => {
        if (!queryId) return;
        try {
          const result = await this.#rpc({ kind: "query-next", queryId });
          if (result.kind !== "query-next")
            throw new Error("unexpected query-next response");
          const batch: RangeBatch = {
            records: result.batch.records.map((record) => ({
              ...record,
              payload: new Uint8Array(record.payload),
            })),
            nextCursor: result.batch.nextCursor,
            done: result.batch.done,
          };
          controller.enqueue(batch);
          if (batch.done) {
            queryId = undefined;
            controller.close();
          }
        } catch (error) {
          controller.error(error);
        }
      },
      cancel: async () => {
        if (!queryId || this.#closePromise) return;
        const closingQueryId = queryId;
        queryId = undefined;
        const result = await this.#rpc({
          kind: "query-close",
          queryId: closingQueryId,
        });
        if (result.kind !== "query-close")
          throw new Error("unexpected query-close response");
      },
    });
  }

  async recordsPage(queryInput: RecordsPageQuery): Promise<RecordsPage> {
    this.#affirmOpen();
    const query = normalizeRecordsPageQuery(queryInput);
    const result = await this.#rpc({ kind: "records-page", query });
    if (result.kind !== "records-page")
      throw new Error("unexpected records-page response");
    return {
      ...result.value,
      records: result.value.records.map((record) => ({
        ...record,
        payload: new Uint8Array(record.payload),
      })),
    };
  }

  async updateRecord(record: UpdateRecord): Promise<RecordMutationResult> {
    this.#affirmOpen();
    assertRecordKey(record.key);
    assertSceneId(record.sceneId);
    assertTimestamp(record.timestampMs);
    assertProtocolId(record.protocolId);
    const encoded = this.#registry.encode(record.protocolId, record.value);
    const payload = Uint8Array.from(encoded.payload).buffer;
    const payloadBytes = payload.byteLength;
    this.#estimate = await this.#budget.beforeWrite(payloadBytes);
    await this.#capacity.acquire(payloadBytes);
    try {
      const result = await this.#rpc(
        {
          kind: "update-record",
          record: {
            key: { ...record.key },
            sceneId: record.sceneId,
            timestampMs: record.timestampMs,
            protocolId: record.protocolId,
            codecVersion: encoded.codecVersion,
            payload,
          },
        },
        [payload],
      );
      if (result.kind !== "update-record")
        throw new Error("unexpected update-record response");
      return result.value;
    } finally {
      this.#capacity.release(payloadBytes);
    }
  }

  async deleteRecord(key: RecordKey): Promise<RecordMutationResult> {
    this.#affirmOpen();
    assertRecordKey(key);
    const result = await this.#rpc({ kind: "delete-record", key });
    if (result.kind !== "delete-record")
      throw new Error("unexpected delete-record response");
    return result.value;
  }

  decode<T = unknown>(record: RangeBatch["records"][number]): DecodedRecord<T> {
    return this.#registry.decode<T>(record);
  }

  decodeManaged<T = unknown>(
    record: ManagedStoredRecord,
  ): ManagedDecodedRecord<T> {
    return this.#registry.decode<T>(record) as ManagedDecodedRecord<T>;
  }

  async stats(): Promise<StoreStats> {
    this.#affirmOpen();
    const result = await this.#rpc({ kind: "stats" });
    if (result.kind !== "stats") throw new Error("unexpected stats response");
    return result.value;
  }

  async clearAllData(): Promise<ClearDataResult> {
    this.#affirmOpen();
    const result = await this.#rpc({ kind: "clear-all" });
    if (result.kind !== "clear-all")
      throw new Error("unexpected clear-all response");
    this.#estimate = await this.#budget.refresh();
    return result.value;
  }

  async refreshStorageEstimate(): Promise<StorageEstimate> {
    this.#affirmOpen();
    this.#estimate = await this.#budget.refresh();
    return this.#estimate;
  }

  close(): Promise<void> {
    return (this.#closePromise ??= this.#close());
  }

  async #close(): Promise<void> {
    try {
      const result = await this.#rpc({ kind: "close" });
      if (result.kind !== "close") throw new Error("unexpected close response");
    } finally {
      this.#worker.terminate();
      this.#failAll(
        new TimeSeriesStorageError("CLOSED", "数据库客户端已关闭。"),
      );
      await this.#lock.release();
    }
  }

  async #rpc(
    request: RequestWithoutId,
    transfer: Transferable[] = [],
  ): Promise<WorkerSuccessResult> {
    this.#affirmOpen();
    const id = crypto.randomUUID();
    const message = { ...request, id } as WorkerRequest;
    return new Promise<WorkerSuccessResult>((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      try {
        this.#worker.postMessage(message, transfer);
      } catch (error) {
        this.#pending.delete(id);
        reject(error);
      }
    });
  }

  #onMessage(response: WorkerResponse): void {
    const pending = this.#pending.get(response.id);
    if (!pending) return;
    this.#pending.delete(response.id);
    if (response.ok) pending.resolve(response.result);
    else pending.reject(deserializeStorageError(response.error));
  }

  #failAll(error: Error): void {
    for (const pending of this.#pending.values()) pending.reject(error);
    this.#pending.clear();
  }

  #failWorker(error: Error): void {
    this.#workerError ??= error;
    this.#failAll(error);
  }

  #affirmOpen(): void {
    if (this.#closePromise)
      throw new TimeSeriesStorageError("CLOSED", "数据库客户端已关闭。");
    if (this.#workerError) throw this.#workerError;
  }
}
