export type StorageErrorCode = "BACKPRESSURE" | "CLOSED" | "CORRUPT_PAYLOAD" | "DATABASE" | "ENCODING" | "INVALID_ARGUMENT" | "LOCK_UNAVAILABLE" | "QUOTA_EXCEEDED" | "UNKNOWN_PROTOCOL" | "UNSUPPORTED";
export interface SerializedStorageError {
    code: StorageErrorCode;
    message: string;
    cause?: string;
}
export declare class TimeSeriesStorageError extends Error {
    readonly code: StorageErrorCode;
    constructor(code: StorageErrorCode, message: string, options?: ErrorOptions);
}
export declare function deserializeStorageError(error: SerializedStorageError): TimeSeriesStorageError;
export declare function serializeUnknownError(error: unknown): SerializedStorageError;
