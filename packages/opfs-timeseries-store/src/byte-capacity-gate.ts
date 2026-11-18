import { TimeSeriesStorageError } from "./errors";

interface Waiter {
  bytes: number;
  resolve: () => void;
}

export class ByteCapacityGate {
  readonly #capacity: number;
  readonly #waiters: Waiter[] = [];
  #used = 0;

  constructor(capacity: number) {
    this.#capacity = capacity;
  }

  get used(): number {
    return this.#used;
  }

  async acquire(bytes: number): Promise<void> {
    if (!Number.isFinite(bytes) || bytes < 0 || bytes > this.#capacity) {
      throw new TimeSeriesStorageError(
        "BACKPRESSURE",
        `单批数据不能超过 ${this.#capacity} 字节。`,
      );
    }

    if (this.#waiters.length === 0 && this.#used + bytes <= this.#capacity) {
      this.#used += bytes;
      return;
    }

    await new Promise<void>((resolve) => {
      this.#waiters.push({ bytes, resolve });
      this.#drain();
    });
  }

  release(bytes: number): void {
    this.#used = Math.max(0, this.#used - bytes);
    this.#drain();
  }

  #drain(): void {
    while (this.#waiters.length > 0) {
      const next = this.#waiters[0];
      if (!next || this.#used + next.bytes > this.#capacity) return;
      this.#waiters.shift();
      this.#used += next.bytes;
      next.resolve();
    }
  }
}
