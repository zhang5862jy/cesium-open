import type { StorageEstimate } from "./types";
export declare class StorageBudgetGuard {
    #private;
    initialize(requestPersistence: boolean): Promise<StorageEstimate>;
    beforeWrite(byteLength: number): Promise<StorageEstimate>;
    refresh(): Promise<StorageEstimate>;
}
export declare function formatBytes(bytes: number): string;
