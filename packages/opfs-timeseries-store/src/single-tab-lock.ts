import { TimeSeriesStorageError } from "./errors";

export class SingleTabLock {
  readonly #name: string;
  #releaseHold?: () => void;
  #requestPromise?: Promise<void>;

  constructor(name: string) {
    this.#name = name;
  }

  async acquire(): Promise<void> {
    if (!("locks" in navigator)) {
      throw new TimeSeriesStorageError(
        "UNSUPPORTED",
        "当前浏览器不支持 Web Locks API。",
      );
    }

    let signalAcquired!: (value: boolean) => void;
    let rejectAcquisition!: (reason: unknown) => void;
    const acquired = new Promise<boolean>((resolve, reject) => {
      signalAcquired = resolve;
      rejectAcquisition = reject;
    });
    const hold = new Promise<void>((resolve) => {
      this.#releaseHold = resolve;
    });

    this.#requestPromise = navigator.locks
      .request(
        this.#name,
        { mode: "exclusive", ifAvailable: true },
        async (lock) => {
          signalAcquired(Boolean(lock));
          if (lock) await hold;
        },
      )
      .catch(rejectAcquisition);

    if (!(await acquired)) {
      this.#releaseHold = undefined;
      throw new TimeSeriesStorageError(
        "LOCK_UNAVAILABLE",
        "另一个标签页正在使用时序数据库。",
      );
    }
  }

  async release(): Promise<void> {
    this.#releaseHold?.();
    this.#releaseHold = undefined;
    await this.#requestPromise;
    this.#requestPromise = undefined;
  }
}
