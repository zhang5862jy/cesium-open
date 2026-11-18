import type { TimeSeriesStore, WriteRecord } from "opfs-timeseries-store";
import type { TelemetryPayload } from "../demo/protocols";
import type {
  SoakLogEntry,
  SoakQuerySample,
  SoakTestConfig,
  SoakTestSnapshot,
} from "./types";

interface PerformanceWithMemory extends Performance {
  memory?: { usedJSHeapSize: number };
}

const MAX_SERIES_POINTS = 60;
const MAX_LOG_ENTRIES = 14;

function percentile(values: number[], quantile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * quantile) - 1),
  );
  return sorted[index] ?? 0;
}

function boundedPush<T>(target: T[], value: T, max: number): void {
  target.push(value);
  if (target.length > max) target.splice(0, target.length - max);
}

function waitUntil(target: number, signal: AbortSignal): Promise<void> {
  const remaining = target - performance.now();
  if (remaining <= 0 || signal.aborted) return Promise.resolve();

  return new Promise((resolve) => {
    const timer = window.setTimeout(done, remaining);
    signal.addEventListener("abort", done, { once: true });

    function done() {
      window.clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    }
  });
}

export class BrowserSoakTestRunner {
  readonly #store: TimeSeriesStore;
  readonly #config: SoakTestConfig;
  readonly #onSnapshot: (snapshot: SoakTestSnapshot) => void;
  readonly #abortController = new AbortController();
  readonly #writeLatencies: number[] = [];
  readonly #querySamples: SoakQuerySample[] = [];
  readonly #logs: SoakLogEntry[] = [];
  readonly #writeSeries: number[] = [];
  readonly #querySeries: number[] = [];
  #logId = 0;
  #snapshot: SoakTestSnapshot;

  constructor(
    store: TimeSeriesStore,
    config: SoakTestConfig,
    onSnapshot: (snapshot: SoakTestSnapshot) => void,
  ) {
    this.#store = store;
    this.#config = config;
    this.#onSnapshot = onSnapshot;
    this.#snapshot = {
      status: "idle",
      sceneId: `ui-soak-${Date.now()}`,
      elapsedSeconds: 0,
      durationSeconds: config.durationSeconds,
      progress: 0,
      insertedRecords: 0,
      targetRecords: config.durationSeconds * config.writeRatePerSecond,
      writeBatches: 0,
      currentWriteMs: 0,
      writeP95Ms: 0,
      maxSchedulerDriftMs: 0,
      queryCount: 0,
      lastQueryRecords: 0,
      lastQueryFirstBatchMs: 0,
      lastQueryTotalMs: 0,
      originUsageBytes: 0,
      databaseBytes: 0,
      writeLatencySeries: [],
      queryLatencySeries: [],
      querySamples: [],
      logs: [],
    };
  }

  stop(): void {
    if (this.#snapshot.status !== "running") return;
    this.#snapshot.status = "stopping";
    this.#addLog("system", "收到停止请求，正在等待当前数据库操作完成。");
    this.#emit();
    this.#abortController.abort();
  }

  async run(): Promise<void> {
    if (this.#snapshot.status !== "idle") throw new Error("测试已经启动。");
    this.#snapshot.status = "running";
    this.#addLog(
      "system",
      `开始：${this.#config.durationSeconds}s，每秒 ${this.#config.writeRatePerSecond} 条，每 ${this.#config.queryIntervalSeconds}s 查询最多 ${this.#config.queryRecordLimit} 条。`,
    );
    this.#emit();

    const started = performance.now();
    const baseTimestamp = Date.now();

    try {
      await this.#refreshResourceStats();
      for (let second = 0; second < this.#config.durationSeconds; second += 1) {
        await waitUntil(started + second * 1_000, this.#abortController.signal);
        if (this.#abortController.signal.aborted) break;

        const drift = Math.max(
          0,
          performance.now() - (started + second * 1_000),
        );
        this.#snapshot.maxSchedulerDriftMs = Math.max(
          this.#snapshot.maxSchedulerDriftMs,
          drift,
        );
        const records = this.#buildRecords(baseTimestamp, second);
        const writeStarted = performance.now();
        const result = await this.#store.appendBatch(records);
        const writeMs = performance.now() - writeStarted;

        this.#writeLatencies.push(writeMs);
        boundedPush(this.#writeSeries, writeMs, MAX_SERIES_POINTS);
        this.#snapshot.insertedRecords += result.committedCount;
        this.#snapshot.writeBatches += 1;
        this.#snapshot.currentWriteMs = writeMs;
        this.#snapshot.writeP95Ms = percentile(this.#writeLatencies, 0.95);
        this.#snapshot.elapsedSeconds = second + 1;
        this.#snapshot.progress = Math.min(
          1,
          (second + 1) / this.#config.durationSeconds,
        );
        this.#snapshot.pageHeapBytes = (
          performance as PerformanceWithMemory
        ).memory?.usedJSHeapSize;
        this.#addLog(
          "write",
          `第 ${second + 1}s：提交 ${result.committedCount} 条，${writeMs.toFixed(1)}ms。`,
        );

        if ((second + 1) % this.#config.queryIntervalSeconds === 0) {
          await this.#queryWindow(baseTimestamp, second + 1);
          await this.#refreshResourceStats();
        }
        this.#emit();
      }

      if (this.#abortController.signal.aborted) {
        this.#snapshot.status = "stopped";
        this.#addLog(
          "system",
          `测试已停止，已持久化 ${this.#snapshot.insertedRecords} 条。`,
        );
      } else {
        await waitUntil(
          started + this.#config.durationSeconds * 1_000,
          this.#abortController.signal,
        );
        this.#snapshot.elapsedSeconds = this.#config.durationSeconds;
        this.#snapshot.progress = 1;
        this.#snapshot.status = "completed";
        this.#addLog(
          "system",
          `测试完成，共持久化 ${this.#snapshot.insertedRecords} 条。`,
        );
      }
    } catch (error) {
      this.#snapshot.status = "error";
      this.#snapshot.error =
        error instanceof Error ? error.message : String(error);
      this.#addLog("error", this.#snapshot.error);
    }
    await this.#refreshResourceStats().catch(() => undefined);
    this.#emit();
  }

  #buildRecords(
    baseTimestamp: number,
    second: number,
  ): WriteRecord<TelemetryPayload>[] {
    return Array.from(
      { length: this.#config.writeRatePerSecond },
      (_, offset) => ({
        sceneId: this.#snapshot.sceneId,
        timestampMs:
          baseTimestamp +
          second * 1_000 +
          Math.floor((offset * 1_000) / this.#config.writeRatePerSecond),
        protocolId: 1,
        value: {
          x: second,
          y: offset,
          temperature: 18 + ((second + offset) % 170) / 10,
          tags: ["page-soak", `second-${second}`, `slot-${offset}`],
        },
      }),
    );
  }

  async #queryWindow(
    baseTimestamp: number,
    elapsedSeconds: number,
  ): Promise<void> {
    const started = performance.now();
    const reader = this.#store
      .queryRange({
        sceneId: this.#snapshot.sceneId,
        fromInclusive:
          baseTimestamp +
          (elapsedSeconds - this.#config.queryIntervalSeconds) * 1_000,
        toExclusive: baseTimestamp + elapsedSeconds * 1_000,
        protocolIds: [1],
        batchSize: Math.min(2_000, this.#config.queryRecordLimit),
      })
      .getReader();
    let records = 0;
    let batches = 0;
    let firstBatchMs = 0;

    while (true) {
      const result = await reader.read();
      if (result.done) break;
      if (batches === 0) firstBatchMs = performance.now() - started;
      const remaining = this.#config.queryRecordLimit - records;
      for (const record of result.value.records.slice(0, remaining)) {
        this.#store.decode<TelemetryPayload>(record);
        records += 1;
      }
      batches += 1;
      if (records >= this.#config.queryRecordLimit) {
        await reader.cancel("已达到本次查询数量上限");
        break;
      }
    }

    const totalMs = performance.now() - started;
    const expectedRecords = Math.min(
      this.#config.writeRatePerSecond * this.#config.queryIntervalSeconds,
      this.#config.queryRecordLimit,
    );
    const sample: SoakQuerySample = {
      second: elapsedSeconds,
      records,
      expectedRecords,
      firstBatchMs,
      totalMs,
    };
    this.#querySamples.push(sample);
    boundedPush(this.#querySeries, totalMs, MAX_SERIES_POINTS);
    this.#snapshot.queryCount += 1;
    this.#snapshot.lastQueryRecords = records;
    this.#snapshot.lastQueryFirstBatchMs = firstBatchMs;
    this.#snapshot.lastQueryTotalMs = totalMs;
    const state =
      records === expectedRecords ? "正确" : `异常，期望 ${expectedRecords}`;
    this.#addLog(
      "query",
      `查询最近 ${this.#config.queryIntervalSeconds}s：${records} 条（${state}），${totalMs.toFixed(1)}ms。`,
    );
  }

  async #refreshResourceStats(): Promise<void> {
    const [stats, estimate] = await Promise.all([
      this.#store.stats(),
      this.#store.refreshStorageEstimate(),
    ]);
    this.#snapshot.databaseBytes = stats.databaseBytes;
    this.#snapshot.originUsageBytes = estimate.usage;
    this.#snapshot.pageHeapBytes = (
      performance as PerformanceWithMemory
    ).memory?.usedJSHeapSize;
  }

  #addLog(kind: SoakLogEntry["kind"], message: string): void {
    this.#logId += 1;
    this.#logs.unshift({ id: this.#logId, kind, message });
    if (this.#logs.length > MAX_LOG_ENTRIES)
      this.#logs.length = MAX_LOG_ENTRIES;
  }

  #emit(): void {
    this.#onSnapshot({
      ...this.#snapshot,
      writeLatencySeries: [...this.#writeSeries],
      queryLatencySeries: [...this.#querySeries],
      querySamples: [...this.#querySamples],
      logs: [...this.#logs],
    });
  }
}
