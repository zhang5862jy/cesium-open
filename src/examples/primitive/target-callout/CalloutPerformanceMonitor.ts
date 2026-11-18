export interface PerformanceStats {
  visible: number;
  worker: number;
  paint: number;
  apply: number;
  latency: number;
  fps: number;
  p95: number;
  heap: string;
  longTasks: number;
}
export interface PerformanceSample {
  seconds: number;
  fps: number;
  p95: number;
  heapMB: number | null;
  worker: number;
  paint: number;
  latency: number;
  visible: number;
  foreground: boolean;
}
/** 管理帧率、长任务和采样导出；只保存最近 120 条数据，不持有场景资源。 */
export class CalloutPerformanceMonitor {
  readonly samples: PerformanceSample[] = [];
  private raf = 0;
  private observer: PerformanceObserver | undefined;
  private disposed = false;
  private readonly stats: PerformanceStats;
  constructor(stats: PerformanceStats) { this.stats = stats; }
  start(): void {
    if(this.raf || this.disposed) return;
    // 每秒记录一条，最多保留 120 条；不保存 PerformanceEntry 历史对象。
    const began = performance.now();
    let last = began,
      windowStart = began;
    let intervals: number[] = [];
    const monitor = (now: number) => {
      if(this.disposed) return;
      if(!document.hidden) intervals.push(now - last);
      last = now;
      if(now - windowStart >= 1000) {
        const ordered = intervals.sort((a, b) => a - b);
        this.stats.fps = Math.round(
          (intervals.length * 1000) / (now - windowStart),
        );
        this.stats.p95 =
          Math.round((ordered[Math.floor(ordered.length * 0.95)] ?? 0) * 10) /
          10;
        const memory = (
          performance as Performance & { memory?: { usedJSHeapSize: number } }
        ).memory;
        const heapMB = memory
          ? Math.round(memory.usedJSHeapSize / 1048576)
          : null;
        this.stats.heap = heapMB === null ? "不可用" : heapMB + " MB";
        this.samples.push({
          seconds: Math.round((now - began) / 1000),
          fps: this.stats.fps,
          p95: this.stats.p95,
          heapMB,
          worker: this.stats.worker,
          paint: this.stats.paint,
          latency: this.stats.latency,
          visible: this.stats.visible,
          foreground: !document.hidden,
        });
        if(this.samples.length > 120) this.samples.shift();
        intervals = [];
        windowStart = now;
      }
      this.raf = requestAnimationFrame(monitor);
    };
    this.raf = requestAnimationFrame(monitor);
    if(typeof PerformanceObserver !== "undefined" && PerformanceObserver.supportedEntryTypes.includes("longtask")) {
      this.observer = new PerformanceObserver((list) => {
        this.stats.longTasks += list.getEntries().length;
      });
      this.observer.observe({ type: "longtask" });
    }
  }
  export(): void {
    const url = URL.createObjectURL(new Blob([JSON.stringify(this.samples, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "callout-performance.json";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  destroy(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.observer?.disconnect();
    this.samples.length = 0;
  }
}
