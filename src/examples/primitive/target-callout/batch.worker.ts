import { simulate, type SimulationConfig } from "./simulation";

let config: SimulationConfig;

self.onmessage = (event: MessageEvent) => {
  const data = event.data;
  if (data.type === "init") {
    config = data.config;
    return;
  }
  if (data.type !== "step") return;
  try {
    const result = simulate(config, {
      id: data.id,
      seconds: data.seconds,
      viewProjection: [],
      camera: [],
    });
    self.postMessage(result, { transfer: [result.positions.buffer, result.visible.buffer] });
  } catch (cause) {
    self.postMessage({
      id: data.id,
      error: cause instanceof Error ? cause.message : String(cause),
    });
  }
};
