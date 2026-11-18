export type StorageErrorCode =
  | "BACKPRESSURE"
  | "CLOSED"
  | "CORRUPT_PAYLOAD"
  | "DATABASE"
  | "ENCODING"
  | "INVALID_ARGUMENT"
  | "LOCK_UNAVAILABLE"
  | "QUOTA_EXCEEDED"
  | "UNKNOWN_PROTOCOL"
  | "UNSUPPORTED";

export interface SerializedStorageError {
  code: StorageErrorCode;
  message: string;
  cause?: string;
}

export class TimeSeriesStorageError extends Error {
  readonly code: StorageErrorCode;

  constructor(code: StorageErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "TimeSeriesStorageError";
    this.code = code;
  }
}

export function deserializeStorageError(
  error: SerializedStorageError,
): TimeSeriesStorageError {
  return new TimeSeriesStorageError(error.code, error.message, {
    cause: error.cause ? new Error(error.cause) : undefined,
  });
}

export function serializeUnknownError(error: unknown): SerializedStorageError {
  if (error instanceof TimeSeriesStorageError) {
    return {
      code: error.code,
      message: error.message,
      cause: error.cause instanceof Error ? error.cause.message : undefined,
    };
  }
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  if (
    lower.includes("sqlite_full") ||
    lower.includes("database or disk is full") ||
    lower.includes("quotaexceeded") ||
    lower.includes("quota exceeded")
  ) {
    return {
      code: "QUOTA_EXCEEDED",
      message: "浏览器存储空间不足，写入已停止。",
      cause: message,
    };
  }

  if (
    lower.includes("opfs requires") ||
    lower.includes("secure browser context")
  ) {
    return {
      code: "UNSUPPORTED",
      message: "当前环境不支持持久化 OPFS。",
      cause: message,
    };
  }

  return { code: "DATABASE", message: "SQLite 存储操作失败。", cause: message };
}
