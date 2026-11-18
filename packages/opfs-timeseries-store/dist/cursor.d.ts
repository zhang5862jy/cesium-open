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
export declare function encodeCursor(cursor: QueryCursor): string;
export declare function decodeCursor(value: string): QueryCursor;
export declare function encodeRecordsPageCursor(cursor: RecordsPageCursor): string;
export declare function decodeRecordsPageCursor(value: string): RecordsPageCursor;
