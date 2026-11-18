/// <reference lib="webworker" />

import sqlite3InitModule, {
  type Database,
  type SAHPoolUtil,
} from "@sqlite.org/sqlite-wasm";
import {
  decodeCursor,
  decodeRecordsPageCursor,
  encodeCursor,
  encodeRecordsPageCursor,
  type QueryCursor,
  type RecordsPageCursor,
} from "../cursor";
import {
  serializeUnknownError,
  TimeSeriesStorageError,
  type SerializedStorageError,
} from "../errors";
import {
  normalizeRangeQuery,
  normalizeRecordsPageQuery,
  MAX_PENDING_BYTES,
  MAX_RESULT_BYTES,
  WRITE_FLUSH_MS,
} from "../validation";
import {
  OPFS_POOL_DIRECTORY,
  type EncodedUpdateRecord,
  type EncodedWriteRecord,
  type WorkerRangeBatch,
  type WorkerRequest,
  type WorkerResponse,
  type WorkerStoredRecord,
  type WorkerSuccessResult,
} from "../worker-messages";
import type {
  AppendResult,
  ClearDataResult,
  ManagedStoredRecord,
  RecordKey,
  RecordMutationResult,
  RecordsPage,
  RecordsPageQuery,
  RangeQuery,
  StoreStats,
} from "../types";

const workerScope = self as DedicatedWorkerGlobalScope;
const DATABASE_NAME_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;
const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS scenes (
    scene_key INTEGER PRIMARY KEY,
    scene_id TEXT NOT NULL UNIQUE
  );

  CREATE TABLE IF NOT EXISTS records (
    scene_key INTEGER NOT NULL,
    timestamp_ms INTEGER NOT NULL,
    sequence INTEGER NOT NULL,
    protocol_id INTEGER NOT NULL,
    codec_version INTEGER NOT NULL,
    payload BLOB NOT NULL,
    PRIMARY KEY (scene_key, timestamp_ms, sequence),
    FOREIGN KEY (scene_key) REFERENCES scenes(scene_key) ON DELETE CASCADE
  ) WITHOUT ROWID;

  CREATE INDEX IF NOT EXISTS idx_records_protocol_time
  ON records(scene_key, protocol_id, timestamp_ms, sequence);

  CREATE INDEX IF NOT EXISTS idx_records_time
  ON records(timestamp_ms, sequence);

  CREATE TABLE IF NOT EXISTS sequence_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    next_sequence INTEGER NOT NULL
  );
  INSERT OR IGNORE INTO sequence_state(id, next_sequence) VALUES (1, 1);

  CREATE TABLE IF NOT EXISTS store_stats (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    record_count INTEGER NOT NULL,
    payload_bytes INTEGER NOT NULL
  );
  INSERT OR IGNORE INTO store_stats(id, record_count, payload_bytes) VALUES (1, 0, 0);
  PRAGMA user_version=1;
`;

interface QuerySession {
  query: ReturnType<typeof normalizeRangeQuery>;
  sceneKey?: number;
  snapshotSequence: number;
  lastTimestampMs: number;
  lastSequence: number;
}

interface PendingAppend {
  requestId: string;
  records: EncodedWriteRecord[];
  byteLength: number;
}

let database: Database | undefined;
let pool: SAHPoolUtil | undefined;
let sqliteVersion = "";
let closing = false;
let pendingBytes = 0;
let flushTimer: ReturnType<typeof setTimeout> | undefined;
let flushing = false;
const pendingAppends: PendingAppend[] = [];
const querySessions = new Map<string, QuerySession>();
const sceneKeyCache = new Map<string, number>();

function postSuccess(
  id: string,
  result: WorkerSuccessResult,
  transfer: Transferable[] = [],
): void {
  const response: WorkerResponse = { id, ok: true, result };
  workerScope.postMessage(response, transfer);
}

function postFailure(id: string, error: SerializedStorageError): void {
  const response: WorkerResponse = { id, ok: false, error };
  workerScope.postMessage(response);
}

function assertDatabase(): Database {
  if (!database || !database.isOpen())
    throw new Error("database is not initialized");
  return database;
}

function normalizeDatabaseName(name: string): string {
  if (!DATABASE_NAME_PATTERN.test(name)) {
    throw new TimeSeriesStorageError(
      "INVALID_ARGUMENT",
      "databaseName 只允许字母、数字、点、下划线和连字符。",
    );
  }
  return name.endsWith(".sqlite3") ? name : `${name}.sqlite3`;
}

async function initialize(databaseName: string): Promise<WorkerSuccessResult> {
  if (database) {
    return { kind: "initialize", storageMode: "opfs-sahpool", sqliteVersion };
  }
  if (!workerScope.isSecureContext || !navigator.storage?.getDirectory) {
    throw new Error(
      "OPFS requires a secure browser context with StorageManager.getDirectory()",
    );
  }

  const filename = `/${normalizeDatabaseName(databaseName)}`;
  const sqlite3 = await sqlite3InitModule();
  pool = await sqlite3.installOpfsSAHPoolVfs({
    directory: OPFS_POOL_DIRECTORY,
    initialCapacity: 12,
  });

  let db: Database | undefined;
  try {
    db = new pool.OpfsSAHPoolDb(filename);
    db.exec("PRAGMA locking_mode=EXCLUSIVE;");
    db.exec("PRAGMA page_size=16384;");
    db.exec("PRAGMA journal_mode=WAL;");
    db.exec(`
      PRAGMA synchronous=FULL;
      PRAGMA wal_autocheckpoint=4096;
      PRAGMA temp_store=MEMORY;
      PRAGMA cache_size=-131072;
      PRAGMA foreign_keys=ON;
    `);
    db.exec(SCHEMA_SQL);
    database = db;
    sqliteVersion = sqlite3.version.libVersion;
  } catch (error) {
    db?.close();
    pool.pauseVfs();
    throw error;
  }

  return { kind: "initialize", storageMode: "opfs-sahpool", sqliteVersion };
}

function getOrCreateSceneKey(db: Database, sceneId: string): number {
  const cached = sceneKeyCache.get(sceneId);
  if (cached !== undefined) return cached;

  db.exec("INSERT OR IGNORE INTO scenes(scene_id) VALUES (?);", {
    bind: [sceneId],
  });
  const value = db.selectValue(
    "SELECT scene_key FROM scenes WHERE scene_id = ?;",
    [sceneId],
  );
  if (typeof value !== "number")
    throw new Error(`failed to resolve scene key for ${sceneId}`);
  sceneKeyCache.set(sceneId, value);
  return value;
}

function lookupSceneKey(db: Database, sceneId: string): number | undefined {
  const cached = sceneKeyCache.get(sceneId);
  if (cached !== undefined) return cached;
  const value = db.selectValue(
    "SELECT scene_key FROM scenes WHERE scene_id = ?;",
    [sceneId],
  );
  if (typeof value !== "number") return undefined;
  sceneKeyCache.set(sceneId, value);
  return value;
}

function appendGroup(group: PendingAppend[]): Map<string, AppendResult> {
  const db = assertDatabase();
  const flattened = group.flatMap((request) => request.records);
  const totalPayloadBytes = flattened.reduce(
    (sum, record) => sum + record.payload.byteLength,
    0,
  );
  const results = new Map<string, AppendResult>();

  try {
    db.transaction("IMMEDIATE", () => {
      const next = db.selectValue(
        "SELECT next_sequence FROM sequence_state WHERE id = 1;",
      );
      if (typeof next !== "number" || !Number.isSafeInteger(next))
        throw new Error("invalid sequence state");
      const finalNext = next + flattened.length;
      if (!Number.isSafeInteger(finalNext))
        throw new Error("sequence exceeds JavaScript safe integer range");

      const statement = db.prepare(`
        INSERT INTO records(
          scene_key, timestamp_ms, sequence, protocol_id, codec_version, payload
        ) VALUES (?, ?, ?, ?, ?, ?);
      `);

      try {
        let sequence = next;
        for (const request of group) {
          const firstSequence = sequence;
          for (const record of request.records) {
            const sceneKey = getOrCreateSceneKey(db, record.sceneId);
            statement
              .bind([
                sceneKey,
                record.timestampMs,
                sequence,
                record.protocolId,
                record.codecVersion,
                record.payload,
              ])
              .stepReset();
            sequence += 1;
          }
          results.set(request.requestId, {
            firstSequence,
            lastSequence: sequence - 1,
            committedCount: request.records.length,
          });
        }
      } finally {
        statement.finalize();
      }

      db.exec("UPDATE sequence_state SET next_sequence = ? WHERE id = 1;", {
        bind: [finalNext],
      });
      db.exec(
        `UPDATE store_stats
         SET record_count = record_count + ?, payload_bytes = payload_bytes + ?
         WHERE id = 1;`,
        { bind: [flattened.length, totalPayloadBytes] },
      );
    });
  } catch (error) {
    for (const record of flattened) sceneKeyCache.delete(record.sceneId);
    throw error;
  }

  return results;
}

function scheduleFlush(delay = WRITE_FLUSH_MS): void {
  if (flushTimer || flushing) return;
  flushTimer = setTimeout(() => {
    flushTimer = undefined;
    flushWrites();
  }, delay);
}

function flushWrites(): void {
  if (flushing || pendingAppends.length === 0) return;
  flushing = true;
  const group = pendingAppends.splice(0);
  pendingBytes = 0;

  try {
    const results = appendGroup(group);
    for (const request of group) {
      const value = results.get(request.requestId);
      if (!value) throw new Error("missing append result");
      postSuccess(request.requestId, { kind: "append", value });
    }
  } catch (error) {
    const serialized = serializeUnknownError(error);
    for (const request of group) postFailure(request.requestId, serialized);
  } finally {
    flushing = false;
    if (pendingAppends.length > 0) scheduleFlush(0);
  }
}

function enqueueAppend(
  request: Extract<WorkerRequest, { kind: "append" }>,
): void {
  if (request.records.length === 0) {
    postFailure(request.id, {
      code: "INVALID_ARGUMENT",
      message: "append records 不能为空。",
    });
    return;
  }
  if (pendingBytes + request.byteLength > MAX_PENDING_BYTES) {
    postFailure(request.id, {
      code: "BACKPRESSURE",
      message: "Worker 待写队列已达到 64MiB。",
    });
    return;
  }

  pendingAppends.push({
    requestId: request.id,
    records: request.records,
    byteLength: request.byteLength,
  });
  pendingBytes += request.byteLength;
  const recordCount = pendingAppends.reduce(
    (sum, item) => sum + item.records.length,
    0,
  );
  if (pendingBytes >= 4 * 1024 * 1024 || recordCount >= 5_000) {
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = undefined;
    flushWrites();
  } else {
    scheduleFlush();
  }
}

function assertCursorMatches(
  query: ReturnType<typeof normalizeRangeQuery>,
  cursor: QueryCursor,
): void {
  const sameProtocols =
    query.protocolIds.length === cursor.protocolIds.length &&
    query.protocolIds.every(
      (value, index) => value === cursor.protocolIds[index],
    );
  if (
    cursor.sceneId !== query.sceneId ||
    cursor.fromInclusive !== query.fromInclusive ||
    cursor.toExclusive !== query.toExclusive ||
    !sameProtocols
  ) {
    throw new TimeSeriesStorageError(
      "INVALID_ARGUMENT",
      "cursor 与当前查询条件不匹配。",
    );
  }
}

function openQuery(queryInput: RangeQuery): string {
  const db = assertDatabase();
  const query = normalizeRangeQuery(queryInput);
  const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;
  if (cursor) assertCursorMatches(query, cursor);
  const currentMax = db.selectValue(
    "SELECT next_sequence - 1 FROM sequence_state WHERE id = 1;",
  );
  const snapshotSequence =
    cursor?.snapshotSequence ??
    (typeof currentMax === "number" ? currentMax : 0);
  const queryId = crypto.randomUUID();

  querySessions.set(queryId, {
    query,
    sceneKey: lookupSceneKey(db, query.sceneId),
    snapshotSequence,
    lastTimestampMs: cursor?.lastTimestampMs ?? query.fromInclusive,
    lastSequence: cursor?.lastSequence ?? -1,
  });
  return queryId;
}

function readNextBatch(queryId: string): {
  batch: WorkerRangeBatch;
  transfer: Transferable[];
} {
  const session = querySessions.get(queryId);
  if (!session) throw new Error("query session does not exist");
  if (session.sceneKey === undefined) {
    querySessions.delete(queryId);
    return { batch: { records: [], done: true }, transfer: [] };
  }

  const db = assertDatabase();
  const protocolClause = session.query.protocolIds.length
    ? `AND protocol_id IN (${session.query.protocolIds.map(() => "?").join(", ")})`
    : "";
  const sql = `
    SELECT timestamp_ms, sequence, protocol_id, codec_version, payload
    FROM records
    WHERE scene_key = ?
      AND timestamp_ms >= ?
      AND timestamp_ms < ?
      AND sequence <= ?
      AND (timestamp_ms > ? OR (timestamp_ms = ? AND sequence > ?))
      ${protocolClause}
    ORDER BY timestamp_ms, sequence
    LIMIT ?;
  `;
  const bind = [
    session.sceneKey,
    session.query.fromInclusive,
    session.query.toExclusive,
    session.snapshotSequence,
    session.lastTimestampMs,
    session.lastTimestampMs,
    session.lastSequence,
    ...session.query.protocolIds,
    session.query.batchSize + 1,
  ];
  const statement = db.prepare(sql).bind(bind);
  const records: WorkerStoredRecord[] = [];
  const transfer: Transferable[] = [];
  let totalBytes = 0;
  let hasMore = false;

  try {
    while (statement.step()) {
      const payloadView = statement.getBlob(4);
      if (!payloadView) throw new Error("payload is unexpectedly NULL");
      if (
        records.length >= session.query.batchSize ||
        (records.length > 0 &&
          totalBytes + payloadView.byteLength > MAX_RESULT_BYTES)
      ) {
        hasMore = true;
        break;
      }

      const payload = Uint8Array.from(payloadView).buffer;
      const timestampMs = statement.getInt(0);
      const sequence = statement.getInt(1);
      const protocolId = statement.getInt(2);
      const codecVersion = statement.getInt(3);
      if (
        timestampMs === null ||
        sequence === null ||
        protocolId === null ||
        codecVersion === null
      ) {
        throw new Error("record header contains NULL");
      }
      records.push({
        timestampMs,
        sequence,
        protocolId,
        codecVersion,
        payload,
      });
      transfer.push(payload);
      totalBytes += payload.byteLength;
    }
  } finally {
    statement.finalize();
  }

  const last = records.at(-1);
  if (last) {
    session.lastTimestampMs = last.timestampMs;
    session.lastSequence = last.sequence;
  }
  const done = !hasMore;
  if (done) querySessions.delete(queryId);

  const nextCursor =
    !done && last
      ? encodeCursor({
          version: 1,
          sceneId: session.query.sceneId,
          fromInclusive: session.query.fromInclusive,
          toExclusive: session.query.toExclusive,
          protocolIds: session.query.protocolIds,
          snapshotSequence: session.snapshotSequence,
          lastTimestampMs: last.timestampMs,
          lastSequence: last.sequence,
        })
      : undefined;

  return { batch: { records, nextCursor, done }, transfer };
}

function assertRecordsPageCursorMatches(
  query: ReturnType<typeof normalizeRecordsPageQuery>,
  cursor: RecordsPageCursor,
): void {
  const sameProtocols =
    query.protocolIds.length === cursor.protocolIds.length &&
    query.protocolIds.every(
      (value, index) => value === cursor.protocolIds[index],
    );
  if (
    cursor.sceneId !== query.sceneId ||
    cursor.fromInclusive !== query.fromInclusive ||
    cursor.toExclusive !== query.toExclusive ||
    !sameProtocols
  ) {
    throw new TimeSeriesStorageError(
      "INVALID_ARGUMENT",
      "管理页 cursor 与当前查询条件不匹配。",
    );
  }
}

function readRecordsPage(queryInput: RecordsPageQuery): {
  page: RecordsPage;
  transfer: Transferable[];
} {
  const db = assertDatabase();
  const query = normalizeRecordsPageQuery(queryInput);
  const cursor = query.cursor
    ? decodeRecordsPageCursor(query.cursor)
    : undefined;
  if (cursor) assertRecordsPageCursorMatches(query, cursor);
  const currentMax = db.selectValue(
    "SELECT next_sequence - 1 FROM sequence_state WHERE id = 1;",
  );
  const snapshotSequence =
    cursor?.snapshotSequence ??
    (typeof currentMax === "number" ? currentMax : 0);
  const lastTimestampMs = cursor?.lastTimestampMs ?? query.fromInclusive;
  const lastSequence = cursor?.lastSequence ?? -1;
  const sceneKey = query.sceneId
    ? lookupSceneKey(db, query.sceneId)
    : undefined;

  if (query.sceneId && sceneKey === undefined) {
    return { page: { records: [], done: true }, transfer: [] };
  }

  const sceneClause = sceneKey === undefined ? "" : "AND r.scene_key = ?";
  const protocolClause = query.protocolIds.length
    ? `AND r.protocol_id IN (${query.protocolIds.map(() => "?").join(", ")})`
    : "";
  const statement = db
    .prepare(`
    SELECT s.scene_id, r.timestamp_ms, r.sequence, r.protocol_id, r.codec_version, r.payload
    FROM records r
    INNER JOIN scenes s ON s.scene_key = r.scene_key
    WHERE r.timestamp_ms >= ?
      AND r.timestamp_ms < ?
      AND r.sequence <= ?
      AND (r.timestamp_ms > ? OR (r.timestamp_ms = ? AND r.sequence > ?))
      ${sceneClause}
      ${protocolClause}
    ORDER BY r.timestamp_ms, r.sequence
    LIMIT ?;
  `)
    .bind([
      query.fromInclusive,
      query.toExclusive,
      snapshotSequence,
      lastTimestampMs,
      lastTimestampMs,
      lastSequence,
      ...(sceneKey === undefined ? [] : [sceneKey]),
      ...query.protocolIds,
      query.pageSize + 1,
    ]);

  const records: ManagedStoredRecord[] = [];
  const transfer: Transferable[] = [];
  let totalBytes = 0;
  let hasMore = false;
  try {
    while (statement.step()) {
      const payloadView = statement.getBlob(5);
      if (!payloadView) throw new Error("payload is unexpectedly NULL");
      if (
        records.length >= query.pageSize ||
        (records.length > 0 &&
          totalBytes + payloadView.byteLength > MAX_RESULT_BYTES)
      ) {
        hasMore = true;
        break;
      }
      const sceneId = statement.getString(0);
      const timestampMs = statement.getInt(1);
      const sequence = statement.getInt(2);
      const protocolId = statement.getInt(3);
      const codecVersion = statement.getInt(4);
      if (
        sceneId === null ||
        timestampMs === null ||
        sequence === null ||
        protocolId === null ||
        codecVersion === null
      ) {
        throw new Error("managed record header contains NULL");
      }
      const payload = Uint8Array.from(payloadView);
      records.push({
        sceneId,
        timestampMs,
        sequence,
        protocolId,
        codecVersion,
        payload,
      });
      transfer.push(payload.buffer);
      totalBytes += payload.byteLength;
    }
  } finally {
    statement.finalize();
  }

  const last = records.at(-1);
  const done = !hasMore;
  const nextCursor =
    !done && last
      ? encodeRecordsPageCursor({
          version: 1,
          kind: "records-page",
          sceneId: query.sceneId,
          fromInclusive: query.fromInclusive,
          toExclusive: query.toExclusive,
          protocolIds: query.protocolIds,
          snapshotSequence,
          lastTimestampMs: last.timestampMs,
          lastSequence: last.sequence,
        })
      : undefined;
  return { page: { records, nextCursor, done }, transfer };
}

function updateStoredRecord(record: EncodedUpdateRecord): RecordMutationResult {
  const db = assertDatabase();
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = undefined;
  flushWrites();
  querySessions.clear();

  const existing = db.selectArray(
    `SELECT r.scene_key, length(r.payload)
     FROM records r INNER JOIN scenes s ON s.scene_key = r.scene_key
     WHERE s.scene_id = ? AND r.timestamp_ms = ? AND r.sequence = ?;`,
    [record.key.sceneId, record.key.timestampMs, record.key.sequence],
  );
  const sourceSceneKey = existing?.[0];
  const previousBytes = existing?.[1];
  if (typeof sourceSceneKey !== "number" || typeof previousBytes !== "number")
    return { changed: false };

  db.transaction("IMMEDIATE", () => {
    const targetSceneKey = getOrCreateSceneKey(db, record.sceneId);
    db.exec(
      "DELETE FROM records WHERE scene_key = ? AND timestamp_ms = ? AND sequence = ?;",
      { bind: [sourceSceneKey, record.key.timestampMs, record.key.sequence] },
    );
    db.exec(
      `INSERT INTO records(
        scene_key, timestamp_ms, sequence, protocol_id, codec_version, payload
      ) VALUES (?, ?, ?, ?, ?, ?);`,
      {
        bind: [
          targetSceneKey,
          record.timestampMs,
          record.key.sequence,
          record.protocolId,
          record.codecVersion,
          record.payload,
        ],
      },
    );
    db.exec(
      "UPDATE store_stats SET payload_bytes = payload_bytes + ? WHERE id = 1;",
      {
        bind: [record.payload.byteLength - previousBytes],
      },
    );
    db.exec(
      "DELETE FROM scenes WHERE scene_key = ? AND NOT EXISTS (SELECT 1 FROM records WHERE scene_key = ?);",
      {
        bind: [sourceSceneKey, sourceSceneKey],
      },
    );
  });
  sceneKeyCache.clear();
  return { changed: true };
}

function deleteStoredRecord(key: RecordKey): RecordMutationResult {
  const db = assertDatabase();
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = undefined;
  flushWrites();
  querySessions.clear();

  const existing = db.selectArray(
    `SELECT r.scene_key, length(r.payload)
     FROM records r INNER JOIN scenes s ON s.scene_key = r.scene_key
     WHERE s.scene_id = ? AND r.timestamp_ms = ? AND r.sequence = ?;`,
    [key.sceneId, key.timestampMs, key.sequence],
  );
  const sceneKey = existing?.[0];
  const payloadBytes = existing?.[1];
  if (typeof sceneKey !== "number" || typeof payloadBytes !== "number")
    return { changed: false };

  db.transaction("IMMEDIATE", () => {
    db.exec(
      "DELETE FROM records WHERE scene_key = ? AND timestamp_ms = ? AND sequence = ?;",
      {
        bind: [sceneKey, key.timestampMs, key.sequence],
      },
    );
    db.exec(
      `UPDATE store_stats
       SET record_count = record_count - 1, payload_bytes = payload_bytes - ?
       WHERE id = 1;`,
      { bind: [payloadBytes] },
    );
    db.exec(
      "DELETE FROM scenes WHERE scene_key = ? AND NOT EXISTS (SELECT 1 FROM records WHERE scene_key = ?);",
      {
        bind: [sceneKey, sceneKey],
      },
    );
  });
  sceneKeyCache.clear();
  return { changed: true };
}

function readStats(): StoreStats {
  const db = assertDatabase();
  const row = db.selectArray(
    "SELECT record_count, payload_bytes FROM store_stats WHERE id = 1;",
  );
  const pageCount = db.selectValue("PRAGMA page_count;");
  const pageSize = db.selectValue("PRAGMA page_size;");
  return {
    recordCount: typeof row?.[0] === "number" ? row[0] : 0,
    payloadBytes: typeof row?.[1] === "number" ? row[1] : 0,
    databaseBytes:
      (typeof pageCount === "number" ? pageCount : 0) *
      (typeof pageSize === "number" ? pageSize : 0),
    sqliteVersion,
    storageMode: "opfs-sahpool",
  };
}

function clearAllData(): ClearDataResult {
  const db = assertDatabase();
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = undefined;
  flushWrites();
  querySessions.clear();

  const previous = db.selectArray(
    "SELECT record_count, payload_bytes FROM store_stats WHERE id = 1;",
  );
  const removedRecords = typeof previous?.[0] === "number" ? previous[0] : 0;
  const removedPayloadBytes =
    typeof previous?.[1] === "number" ? previous[1] : 0;

  db.transaction("IMMEDIATE", () => {
    db.exec(`
      DROP TABLE IF EXISTS records;
      DROP TABLE IF EXISTS scenes;
      DROP TABLE IF EXISTS sequence_state;
      DROP TABLE IF EXISTS store_stats;
    `);
    db.exec(SCHEMA_SQL);
  });
  sceneKeyCache.clear();

  let compacted = true;
  try {
    db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
    db.exec("VACUUM;");
  } catch {
    // Clearing succeeded even if the browser cannot compact the backing file immediately.
    compacted = false;
  }

  return {
    removedRecords,
    removedPayloadBytes,
    databaseBytes: readStats().databaseBytes,
    compacted,
  };
}

async function handleRequest(request: WorkerRequest): Promise<void> {
  if (closing && request.kind !== "close") {
    postFailure(request.id, { code: "CLOSED", message: "数据库正在关闭。" });
    return;
  }

  try {
    switch (request.kind) {
      case "initialize":
        postSuccess(request.id, await initialize(request.databaseName));
        break;
      case "append":
        assertDatabase();
        enqueueAppend(request);
        break;
      case "query-open": {
        const queryId = openQuery(request.query);
        postSuccess(request.id, { kind: "query-open", queryId });
        break;
      }
      case "query-next": {
        const { batch, transfer } = readNextBatch(request.queryId);
        postSuccess(request.id, { kind: "query-next", batch }, transfer);
        break;
      }
      case "query-close":
        querySessions.delete(request.queryId);
        postSuccess(request.id, { kind: "query-close" });
        break;
      case "records-page": {
        const { page, transfer } = readRecordsPage(request.query);
        postSuccess(
          request.id,
          { kind: "records-page", value: page },
          transfer,
        );
        break;
      }
      case "update-record":
        postSuccess(request.id, {
          kind: "update-record",
          value: updateStoredRecord(request.record),
        });
        break;
      case "delete-record":
        postSuccess(request.id, {
          kind: "delete-record",
          value: deleteStoredRecord(request.key),
        });
        break;
      case "clear-all":
        postSuccess(request.id, { kind: "clear-all", value: clearAllData() });
        break;
      case "stats":
        postSuccess(request.id, { kind: "stats", value: readStats() });
        break;
      case "close":
        closing = true;
        if (flushTimer) clearTimeout(flushTimer);
        flushTimer = undefined;
        flushWrites();
        querySessions.clear();
        database?.close();
        database = undefined;
        pool?.pauseVfs();
        postSuccess(request.id, { kind: "close" });
        workerScope.close();
        break;
    }
  } catch (error) {
    postFailure(request.id, serializeUnknownError(error));
  }
}

workerScope.onmessage = (event: MessageEvent<WorkerRequest>) => {
  void handleRequest(event.data);
};
