import type { DecodedRecord, ProtocolCodec, StoredRecord } from "./types";
export declare class ProtocolRegistry {
    #private;
    register<T>(codec: ProtocolCodec<T>): this;
    encode(protocolId: number, value: unknown): {
        codecVersion: number;
        payload: Uint8Array;
    };
    decode<T = unknown>(record: StoredRecord): DecodedRecord<T>;
}
