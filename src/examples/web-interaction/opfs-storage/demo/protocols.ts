import { decode, encode } from "@msgpack/msgpack";
import type { ProtocolCodec } from "opfs-timeseries-store";

export interface TelemetryPayload {
  x: number;
  y: number;
  temperature: number;
  tags: string[];
}

export interface AlarmPayload {
  level: "info" | "warning" | "critical";
  message: string;
  source: string;
}

function createMessagePackCodec<T>(protocolId: number): ProtocolCodec<T> {
  return {
    protocolId,
    version: 1,
    encode,
    decode: (bytes) => decode(bytes) as T,
  };
}

export const telemetryCodec = createMessagePackCodec<TelemetryPayload>(1);
export const alarmCodec = createMessagePackCodec<AlarmPayload>(2);
