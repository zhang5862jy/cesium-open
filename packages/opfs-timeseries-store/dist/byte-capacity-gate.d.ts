export declare class ByteCapacityGate {
    #private;
    constructor(capacity: number);
    get used(): number;
    acquire(bytes: number): Promise<void>;
    release(bytes: number): void;
}
