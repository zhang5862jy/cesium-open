import { TimeSeriesStorageError } from "./errors";
import type { StorageEstimate } from "./types";

const GIB = 1024 ** 3;
const CHECK_INTERVAL_MS = 30_000;
const CHECK_AFTER_WRITTEN_BYTES = GIB;

export class StorageBudgetGuard {
  #lastEstimate?: StorageEstimate;
  #lastCheckedAt = 0;
  #writtenSinceCheck = 0;

  async initialize(requestPersistence: boolean): Promise<StorageEstimate> {
    if (!navigator.storage?.estimate) {
      throw new TimeSeriesStorageError(
        "UNSUPPORTED",
        "当前浏览器不支持 StorageManager。",
      );
    }
    if (requestPersistence && navigator.storage.persist)
      await navigator.storage.persist();
    return this.refresh();
  }

  async beforeWrite(byteLength: number): Promise<StorageEstimate> {
    this.#writtenSinceCheck += byteLength;
    const stale = performance.now() - this.#lastCheckedAt >= CHECK_INTERVAL_MS;
    if (
      !this.#lastEstimate ||
      stale ||
      this.#writtenSinceCheck >= CHECK_AFTER_WRITTEN_BYTES
    ) {
      await this.refresh();
    }

    const estimate = this.#lastEstimate;
    if (!estimate || estimate.available - byteLength < estimate.reserve) {
      throw new TimeSeriesStorageError(
        "QUOTA_EXCEEDED",
        `剩余空间必须保留至少 ${formatBytes(estimate?.reserve ?? 2 * GIB)}。`,
      );
    }
    return estimate;
  }

  async refresh(): Promise<StorageEstimate> {
    const raw = await navigator.storage.estimate();
    const persisted = navigator.storage.persisted
      ? await navigator.storage.persisted()
      : false;
    const usage = raw.usage ?? 0;
    const quota = raw.quota ?? 0;
    const reserve = Math.max(2 * GIB, quota * 0.15);
    const available = Math.max(0, quota - usage);

    this.#lastEstimate = {
      usage,
      quota,
      available,
      reserve,
      writable: quota > 0 && available >= reserve,
      persisted,
    };
    this.#lastCheckedAt = performance.now();
    this.#writtenSinceCheck = 0;
    return this.#lastEstimate;
  }
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  return `${(bytes / 1024 ** exponent).toFixed(exponent === 0 ? 0 : 2)} ${units[exponent]}`;
}
