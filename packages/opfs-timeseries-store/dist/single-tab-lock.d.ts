export declare class SingleTabLock {
    #private;
    constructor(name: string);
    acquire(): Promise<void>;
    release(): Promise<void>;
}
