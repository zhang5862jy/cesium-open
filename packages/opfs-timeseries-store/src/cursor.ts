import { TimeSeriesStorageError } from "./errors";

export interface QueryCursor {
  version: 1;
  sceneId: string;
  fromInclusive: number;
  toExclusive: number;
  protocolIds: number[];
  snapshotSequence: number;
  lastTimestampMs: number;
  lastSequence: number;
}

export interface RecordsPageCursor {
  version: 1;
  kind: "records-page";
  sceneId?: string;
  fromInclusive: number;
  toExclusive: number;
  protocolIds: number[];
  snapshotSequence: number;
  lastTimestampMs: number;
  lastSequence: number;
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function fromBase64Url(value: string): string {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeCursor(cursor: QueryCursor): string {
  return toBase64Url(JSON.stringify(cursor));
}

export function decodeCursor(value: string): QueryCursor {
  try {
    const parsed = JSON.parse(fromBase64Url(value)) as Partial<QueryCursor>;
    if (
      parsed.version !== 1 ||
      typeof parsed.sceneId !== "string" ||
      !Number.isSafeInteger(parsed.fromInclusive) ||
      !Number.isSafeInteger(parsed.toExclusive) ||
      !Array.isArray(parsed.protocolIds) ||
      !Number.isSafeInteger(parsed.snapshotSequence) ||
      !Number.isSafeInteger(parsed.lastTimestampMs) ||
      !Number.isSafeInteger(parsed.lastSequence)
    ) {
      throw new Error("cursor shape is invalid");
    }
    return parsed as QueryCursor;
  } catch (cause) {
    throw new TimeSeriesStorageError(
      "INVALID_ARGUMENT",
      "查询 cursor 无效或已损坏。",
      { cause },
    );
  }
}

export function encodeRecordsPageCursor(cursor: RecordsPageCursor): string {
  return toBase64Url(JSON.stringify(cursor));
}

export function decodeRecordsPageCursor(value: string): RecordsPageCursor {
  try {
    const parsed = JSON.parse(
      fromBase64Url(value),
    ) as Partial<RecordsPageCursor>;
    if (
      parsed.version !== 1 ||
      parsed.kind !== "records-page" ||
      (parsed.sceneId !== undefined && typeof parsed.sceneId !== "string") ||
      !Number.isSafeInteger(parsed.fromInclusive) ||
      !Number.isSafeInteger(parsed.toExclusive) ||
      !Array.isArray(parsed.protocolIds) ||
      !parsed.protocolIds.every(
        (value) => Number.isSafeInteger(value) && value > 0,
      ) ||
      !Number.isSafeInteger(parsed.snapshotSequence) ||
      !Number.isSafeInteger(parsed.lastTimestampMs) ||
      !Number.isSafeInteger(parsed.lastSequence)
    ) {
      throw new Error("records page cursor shape is invalid");
    }
    return parsed as RecordsPageCursor;
  } catch (cause) {
    throw new TimeSeriesStorageError(
      "INVALID_ARGUMENT",
      "管理页 cursor 无效或已损坏。",
      { cause },
    );
  }
}
