import { TimeSeriesStorageError } from "./errors";
import { assertProtocolId } from "./validation";
import type { DecodedRecord, ProtocolCodec, StoredRecord } from "./types";

function codecKey(protocolId: number, version: number): string {
  return `${protocolId}:${version}`;
}

export class ProtocolRegistry {
  readonly #byVersion = new Map<string, ProtocolCodec<unknown>>();
  readonly #current = new Map<number, ProtocolCodec<unknown>>();

  register<T>(codec: ProtocolCodec<T>): this {
    assertProtocolId(codec.protocolId);
    if (!Number.isSafeInteger(codec.version) || codec.version <= 0) {
      throw new TimeSeriesStorageError(
        "INVALID_ARGUMENT",
        "协议 version 必须是正安全整数。",
      );
    }

    const key = codecKey(codec.protocolId, codec.version);
    if (this.#byVersion.has(key)) {
      throw new TimeSeriesStorageError(
        "INVALID_ARGUMENT",
        `协议 ${key} 已注册。`,
      );
    }

    const erased = codec as ProtocolCodec<unknown>;
    this.#byVersion.set(key, erased);
    const current = this.#current.get(codec.protocolId);
    if (!current || codec.version > current.version)
      this.#current.set(codec.protocolId, erased);
    return this;
  }

  encode(
    protocolId: number,
    value: unknown,
  ): { codecVersion: number; payload: Uint8Array } {
    const codec = this.#current.get(protocolId);
    if (!codec) {
      throw new TimeSeriesStorageError(
        "UNKNOWN_PROTOCOL",
        `未注册 protocolId=${protocolId} 的编码器。`,
      );
    }

    try {
      return { codecVersion: codec.version, payload: codec.encode(value) };
    } catch (cause) {
      throw new TimeSeriesStorageError(
        "ENCODING",
        `protocolId=${protocolId} 编码失败。`,
        { cause },
      );
    }
  }

  decode<T = unknown>(record: StoredRecord): DecodedRecord<T> {
    const key = codecKey(record.protocolId, record.codecVersion);
    const codec = this.#byVersion.get(key);
    if (!codec) {
      throw new TimeSeriesStorageError(
        "UNKNOWN_PROTOCOL",
        `未注册协议解码器 ${key}。`,
      );
    }

    try {
      const { payload: _payload, ...header } = record;
      return { ...header, value: codec.decode(record.payload) as T };
    } catch (cause) {
      throw new TimeSeriesStorageError(
        "CORRUPT_PAYLOAD",
        `协议 ${key} 的 payload 无法解码。`,
        { cause },
      );
    }
  }
}
