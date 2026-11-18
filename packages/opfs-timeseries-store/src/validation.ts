import { TimeSeriesStorageError } from "./errors";
import type { RangeQuery, RecordKey, RecordsPageQuery } from "./types";

export const DEFAULT_BATCH_SIZE = 2_000;
export const MAX_BATCH_SIZE = 5_000;
export const MAX_BATCH_BYTES = 4 * 1024 * 1024;
export const MAX_PENDING_BYTES = 64 * 1024 * 1024;
export const MAX_RESULT_BYTES = 4 * 1024 * 1024;
export const WRITE_FLUSH_MS = 50;
export const DEFAULT_ADMIN_PAGE_SIZE = 50;
export const MAX_ADMIN_PAGE_SIZE = 200;

export function assertSceneId(sceneId: string): void {
  if (!sceneId || sceneId.length > 256) {
    throw new TimeSeriesStorageError(
      "INVALID_ARGUMENT",
      "sceneId 必须是 1–256 个字符。",
    );
  }
}

export function assertTimestamp(value: number, label = "timestampMs"): void {
  if (!Number.isSafeInteger(value)) {
    throw new TimeSeriesStorageError(
      "INVALID_ARGUMENT",
      `${label} 必须是安全整数毫秒时间戳。`,
    );
  }
}

export function assertProtocolId(protocolId: number): void {
  if (!Number.isSafeInteger(protocolId) || protocolId <= 0) {
    throw new TimeSeriesStorageError(
      "INVALID_ARGUMENT",
      "protocolId 必须是正安全整数。",
    );
  }
}

export function normalizeRangeQuery(
  query: RangeQuery,
): Required<Omit<RangeQuery, "cursor">> & Pick<RangeQuery, "cursor"> {
  assertSceneId(query.sceneId);
  assertTimestamp(query.fromInclusive, "fromInclusive");
  assertTimestamp(query.toExclusive, "toExclusive");

  if (query.fromInclusive >= query.toExclusive) {
    throw new TimeSeriesStorageError(
      "INVALID_ARGUMENT",
      "时间范围必须满足 fromInclusive < toExclusive。",
    );
  }

  const protocolIds = [...new Set(query.protocolIds ?? [])].sort(
    (a, b) => a - b,
  );
  protocolIds.forEach(assertProtocolId);
  const batchSize = query.batchSize ?? DEFAULT_BATCH_SIZE;
  if (
    !Number.isInteger(batchSize) ||
    batchSize < 1 ||
    batchSize > MAX_BATCH_SIZE
  ) {
    throw new TimeSeriesStorageError(
      "INVALID_ARGUMENT",
      `batchSize 必须在 1–${MAX_BATCH_SIZE} 之间。`,
    );
  }

  return { ...query, protocolIds, batchSize };
}

export function assertRecordKey(key: RecordKey): void {
  assertSceneId(key.sceneId);
  assertTimestamp(key.timestampMs);
  if (!Number.isSafeInteger(key.sequence) || key.sequence <= 0) {
    throw new TimeSeriesStorageError(
      "INVALID_ARGUMENT",
      "sequence 必须是正安全整数。",
    );
  }
}

export function normalizeRecordsPageQuery(
  query: RecordsPageQuery,
): Required<Omit<RecordsPageQuery, "cursor" | "sceneId">> &
  Pick<RecordsPageQuery, "cursor" | "sceneId"> {
  if (query.sceneId !== undefined && query.sceneId !== "")
    assertSceneId(query.sceneId);
  assertTimestamp(query.fromInclusive, "fromInclusive");
  assertTimestamp(query.toExclusive, "toExclusive");
  if (query.fromInclusive >= query.toExclusive) {
    throw new TimeSeriesStorageError(
      "INVALID_ARGUMENT",
      "时间范围必须满足 fromInclusive < toExclusive。",
    );
  }

  const protocolIds = [...new Set(query.protocolIds ?? [])].sort(
    (a, b) => a - b,
  );
  protocolIds.forEach(assertProtocolId);
  const pageSize = query.pageSize ?? DEFAULT_ADMIN_PAGE_SIZE;
  if (
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > MAX_ADMIN_PAGE_SIZE
  ) {
    throw new TimeSeriesStorageError(
      "INVALID_ARGUMENT",
      `pageSize 必须在 1–${MAX_ADMIN_PAGE_SIZE} 之间。`,
    );
  }

  return {
    ...query,
    sceneId: query.sceneId || undefined,
    protocolIds,
    pageSize,
  };
}
