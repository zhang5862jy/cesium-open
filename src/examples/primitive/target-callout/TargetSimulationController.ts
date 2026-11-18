import type { SimulationConfig, SimulationResult } from "./simulation";
interface SimulationOptions {
  interval: () => number;
  running: () => boolean;
  onResult: (result: SimulationResult) => void;
  onError: (message: string) => void;
}
/** 调度业务模拟 Worker，保证只有一个请求在途，暂停时冻结业务时间。 */
export class TargetSimulationController {
  private worker: Worker | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private seconds = 0;
  private lastTime: number | undefined;
  private disposed = false;
  tick: () => void = () => { };
  private readonly options: SimulationOptions;
  constructor(options: SimulationOptions) { this.options = options; }
  /** 切换运行状态前累计上一段时间。 */
  advance(): void {
    const now = performance.now();
    if(this.options.running() && this.lastTime !== undefined) this.seconds += (now - this.lastTime) / 1000;
    this.lastTime = now;
  }
  start(config: SimulationConfig): void {
    if(this.worker || this.disposed) return;
    this.lastTime = performance.now();
    let requestId = 0, nextData = 0, seconds = -1;
    let scheduledInterval = this.options.interval();
    let busy = false;
    const worker = new Worker(new URL("./batch.worker.ts", import.meta.url), { type: "module" });
    this.worker = worker;
    // 此 Worker 只生成业务位置与文字，字形布局由工具包内部 Worker 负责。
    const dispatch = () => {
      if(this.disposed || this.worker !== worker || busy) return;
      const now = performance.now();
      if(scheduledInterval !== this.options.interval()) { scheduledInterval = this.options.interval(); nextData = 0; }
      if(now < nextData) return;
      this.advance();
      if(now >= nextData) {
        if(seconds === this.seconds) return;
        seconds = this.seconds;
        nextData = now + scheduledInterval;
      }
      busy = true;
      worker.postMessage({ type: "step", id: ++requestId, seconds });
    };
    worker.onmessage = (event: MessageEvent<SimulationResult & { error?: string }>) => {
      const result = event.data;
      if(this.disposed || this.worker !== worker || result.id !== requestId) return;
      busy = false;
      if(result.error) { this.stop(); this.options.onError(result.error); return; }
      try { this.options.onResult(result); }
      catch (cause) {
        this.stop();
        this.options.onError(cause instanceof Error ? cause.message : String(cause));
      }
    };
    worker.onerror = (event) => {
      if(this.disposed || this.worker !== worker) return;
      this.stop();
      this.options.onError("模拟 Worker 出错：" + event.message);
    };

    this.tick = dispatch;
    // 定时器兜底；postRender 也可以调用 tick，busy 会阻止重复请求。
    const pump = () => {
      dispatch();
      if(!this.disposed && this.worker === worker) this.timer = setTimeout(pump, Math.min(50, this.options.interval()));
    };
    try {
      worker.postMessage({ type: "init", config });
      pump();
    } catch(error) {
      this.stop();
      throw error;
    }
  }
  destroy(): void {
    this.disposed = true;
    this.stop();
  }
  /** 先清理旧调度，再通知调用方；允许错误回调安全地重新启动。 */
  private stop(): void {
    if(this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    if(this.worker) { this.worker.onmessage = null; this.worker.onerror = null; }
    this.worker?.terminate();
    this.worker = undefined;
    this.tick = () => { };
  }
}
