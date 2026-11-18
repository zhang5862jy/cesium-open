# opfs-timeseries-store

浏览器端时序存储包。SQLite WASM 在专用 Web Worker 中运行，使用 OPFS 的 SyncAccessHandle Pool 持久化数据。调用方通过 `ProtocolRegistry` 注册业务编码器，可以使用 MessagePack 或其他二进制格式。

## 在工作区使用

运行 `pnpm --filter opfs-timeseries-store build` 生成 ESM、类型声明和 Worker 资源。其他 pnpm 工作区包可以声明 `"opfs-timeseries-store": "workspace:*"`，然后通过包名导入。需要在工作区之外使用时，可运行 `pnpm --filter opfs-timeseries-store pack` 生成 tarball，再在消费项目中安装。

在 Vite 应用中使用时，将 `opfs-timeseries-store` 加入 `optimizeDeps.exclude`，让 Vite 从包的位置解析相对 Worker URL。如果直接引用工作区源码，则排除 `@sqlite.org/sqlite-wasm` 以保留 WASM 的相对资源路径。

```ts
import { ProtocolRegistry, TimeSeriesStore } from "opfs-timeseries-store";

const registry = new ProtocolRegistry().register<string>({
  protocolId: 1,
  version: 1,
  encode: (value) => new TextEncoder().encode(value),
  decode: (bytes) => new TextDecoder().decode(bytes),
});

const store = await TimeSeriesStore.open(registry, {
  databaseName: "telemetry",
});

try {
  const timestampMs = Date.now();
  await store.appendBatch([
    { sceneId: "scene-1", timestampMs, protocolId: 1, value: "ready" },
  ]);

  const reader = store
    .queryRange({
      sceneId: "scene-1",
      fromInclusive: timestampMs,
      toExclusive: timestampMs + 1,
    })
    .getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const record of value.records) {
        console.log(store.decode<string>(record).value);
      }
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
} finally {
  await store.close();
}
```

## API 与运行条件

- `appendBatch` 写入业务对象。事务以内部批次为单位，失败前已经提交的批次会保留。
- `queryRange` 按场景和 `[fromInclusive, toExclusive)` 流式读取，`recordsPage` 支持跨场景游标分页。两者都可筛选协议，同一时间戳按 `sequence` 排序。
- 新增使用 `appendBatch`，编辑和删除使用 `updateRecord`、`deleteRecord`。编辑保留原 `sequence`。使用 `clearAllData` 清空当前数据库。
- `stats` 提供记录数、Payload 字节数和数据库占用。写入前会检查站点空间，保留至少 2 GiB 或配额的 15%，取两者较大值。
- 使用支持 OPFS、Web Locks、Dedicated Worker 和 WebAssembly 的浏览器，通过 HTTPS 或 localhost 打开。SAH Pool 可在未配置跨源隔离响应头的页面上运行。
- 同一 origin 的 SAH Pool 同时只允许一个活动会话。离开页面时调用 `close()`，释放 Worker、OPFS 访问句柄和浏览器锁。Vue 中用 `shallowRef` 保存实例。
- OPFS 数据归属当前浏览器站点。来源协议、主机或端口变化都会访问另一份存储。

示例入口为 `/examples/web-interaction/opfs-storage`，记录管理视图为 `?view=records`。示例使用 MessagePack 存储遥测和告警，并提供批量写入、范围查询及可配置的持续压测。
