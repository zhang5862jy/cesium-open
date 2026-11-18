<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef } from "vue";
import { RouterLink, useRoute } from "vue-router";
import {
  alarmCodec,
  telemetryCodec,
  type AlarmPayload,
  type TelemetryPayload,
} from "./demo/protocols";
import SoakTestPanel from "./soak-test/SoakTestPanel.vue";
import RecordsManagerView from "./RecordsManagerView.vue";
import {
  formatBytes,
  ProtocolRegistry,
  TimeSeriesStorageError,
  TimeSeriesStore,
  type DecodedRecord,
  type ClearDataResult,
  type StorageEstimate,
  type StoreStats,
  type WriteRecord,
} from "opfs-timeseries-store";

const registry = new ProtocolRegistry()
  .register(telemetryCodec)
  .register(alarmCodec);
const route = useRoute();
// Service instances use native private fields and must not be wrapped in a Vue Proxy.
const store = shallowRef<TimeSeriesStore>();
let disposed = false;
const status = ref<
  "idle" | "opening" | "ready" | "working" | "error" | "closed"
>("idle");
const message = ref("点击“打开数据库”后，数据将保存在当前站点的 OPFS 中。");
const sceneId = ref("demo-scene");
const sampleCount = ref(5_000);
const protocolFilter = ref<"all" | "1" | "2">("all");
const rangeStart = ref(Date.now() - 60_000);
const rangeEnd = ref(Date.now() + 1);
const preview = ref<Array<DecodedRecord<TelemetryPayload | AlarmPayload>>>([]);
const queryCount = ref(0);
const firstBatchMs = ref(0);
const stats = ref<StoreStats>();
const estimate = ref<StorageEstimate>();
const soakRunning = ref(false);
const clearing = ref(false);

const canOpen = computed(
  () =>
    !store.value &&
    (status.value === "idle" ||
      status.value === "closed" ||
      status.value === "error"),
);
const isDashboard = computed(() => route.query.view !== "records");
const canOperate = computed(
  () =>
    Boolean(store.value) &&
    !soakRunning.value &&
    !clearing.value &&
    status.value === "ready",
);

function describeError(error: unknown): string {
  if (error instanceof TimeSeriesStorageError)
    return `[${error.code}] ${error.message}`;
  return error instanceof Error ? error.message : String(error);
}

async function openDatabase(): Promise<void> {
  if (!canOpen.value) return;
  status.value = "opening";
  message.value = "正在获取单页锁并初始化 SQLite WASM…";
  let session: TimeSeriesStore | undefined;
  try {
    session = await TimeSeriesStore.open(registry, {
      databaseName: "browser-timeseries-v1",
      requestPersistence: true,
    });
    if (disposed) {
      await session.close();
      return;
    }
    const initialStats = await session.stats();
    if (disposed) {
      await session.close();
      return;
    }
    stats.value = initialStats;
    estimate.value = session.storageEstimate;
    status.value = "ready";
    store.value = session;
    message.value =
      "数据库已打开：OPFS + SQLite SAH Pool，当前页面是唯一写入者。";
  } catch (error) {
    await session?.close().catch(() => undefined);
    status.value = "error";
    message.value = describeError(error);
  }
}

function buildSamples(count: number): WriteRecord[] {
  const start = Date.now();
  const records: WriteRecord[] = [];
  for (let index = 0; index < count; index += 1) {
    const timestampMs = start + index - (index % 97 === 0 ? 3 : 0);
    if (index % 2 === 0) {
      records.push({
        sceneId: sceneId.value,
        timestampMs,
        protocolId: 1,
        value: {
          x: Math.sin(index / 100) * 100,
          y: Math.cos(index / 100) * 100,
          temperature: 18 + (index % 170) / 10,
          tags: ["demo", `group-${index % 8}`],
        } satisfies TelemetryPayload,
      });
    } else {
      records.push({
        sceneId: sceneId.value,
        timestampMs,
        protocolId: 2,
        value: {
          level:
            index % 23 === 0
              ? "critical"
              : index % 7 === 0
                ? "warning"
                : "info",
          message: `模拟告警 #${index}`,
          source: `device-${index % 32}`,
        } satisfies AlarmPayload,
      });
    }
  }
  rangeStart.value = start - 10;
  rangeEnd.value = start + count + 10;
  return records;
}

async function appendSamples(): Promise<void> {
  const session = store.value;
  if (!session || !canOperate.value) return;
  status.value = "working";
  const count = Math.max(1, Math.min(100_000, Math.trunc(sampleCount.value)));
  const started = performance.now();
  try {
    const result = await session.appendBatch(buildSamples(count));
    const elapsed = performance.now() - started;
    message.value = `已持久化 ${result.committedCount.toLocaleString()} 条，序号 ${result.firstSequence}–${result.lastSequence}，耗时 ${elapsed.toFixed(1)}ms。`;
    await refreshStats();
  } catch (error) {
    message.value = describeError(error);
  } finally {
    status.value = "ready";
  }
}

async function runQuery(): Promise<void> {
  const session = store.value;
  if (!session || !canOperate.value) return;
  status.value = "working";
  preview.value = [];
  queryCount.value = 0;
  firstBatchMs.value = 0;
  const started = performance.now();

  try {
    const stream = session.queryRange({
      sceneId: sceneId.value,
      fromInclusive: Math.trunc(rangeStart.value),
      toExclusive: Math.trunc(rangeEnd.value),
      protocolIds:
        protocolFilter.value === "all"
          ? undefined
          : [Number(protocolFilter.value)],
      batchSize: 2_000,
    });
    const reader = stream.getReader();
    try {
      let firstBatch = true;
      while (true) {
        const result = await reader.read();
        if (result.done) break;
        if (firstBatch) {
          firstBatchMs.value = performance.now() - started;
          firstBatch = false;
        }
        queryCount.value += result.value.records.length;
        const remaining = 24 - preview.value.length;
        if (remaining > 0) {
          preview.value.push(
            ...result.value.records
              .slice(0, remaining)
              .map((record) =>
                session.decode<TelemetryPayload | AlarmPayload>(record),
              ),
          );
        }
      }
    } finally {
      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
    const elapsed = performance.now() - started;
    message.value = `查询完成：${queryCount.value.toLocaleString()} 条，首批 ${firstBatchMs.value.toFixed(1)}ms，总计 ${elapsed.toFixed(1)}ms。`;
  } catch (error) {
    message.value = describeError(error);
  } finally {
    status.value = "ready";
  }
}

async function refreshStats(): Promise<void> {
  const session = store.value;
  if (!session) return;
  const [newStats, newEstimate] = await Promise.all([
    session.stats(),
    session.refreshStorageEstimate(),
  ]);
  if (store.value === session) {
    stats.value = newStats;
    estimate.value = newEstimate;
  }
}

async function updateStats(): Promise<void> {
  try {
    await refreshStats();
  } catch (error) {
    if (store.value && !disposed) message.value = describeError(error);
  }
}

async function clearAllData(): Promise<void> {
  const session = store.value;
  if (!session || !canOperate.value) return;
  const confirmed = window.confirm(
    "确定清除当前站点数据库中的全部场景和时序记录吗？此操作不可撤销，但不会释放当前页面持有的数据库锁。",
  );
  if (!confirmed) return;

  clearing.value = true;
  status.value = "working";
  message.value = "正在清除全部记录并压缩 SQLite 数据库文件…";
  try {
    const result: ClearDataResult = await session.clearAllData();
    preview.value = [];
    queryCount.value = 0;
    firstBatchMs.value = 0;
    await refreshStats();
    message.value = `已清除 ${result.removedRecords.toLocaleString()} 条记录（${formatBytes(result.removedPayloadBytes)} Payload）${result.compacted ? "，数据库空间已回收。" : "；记录已删除，文件空间将在后续维护时回收。"}`;
  } catch (error) {
    message.value = describeError(error);
  } finally {
    clearing.value = false;
    status.value = "ready";
  }
}

async function handleSoakRunningChange(running: boolean): Promise<void> {
  soakRunning.value = running;
  if (!running && !disposed) await updateStats();
}

async function closeDatabase(): Promise<void> {
  const session = store.value;
  if (!session || !canOperate.value) return;
  status.value = "working";
  try {
    await session.close();
    message.value = "数据库已关闭并释放单页锁。";
  } catch (error) {
    message.value = describeError(error);
  } finally {
    store.value = undefined;
    status.value = "closed";
  }
}

onBeforeUnmount(() => {
  disposed = true;
  void store.value?.close().catch(() => undefined);
});
</script>

<template>
  <div class="opfs-demo">
    <div class="shell">
      <header class="hero">
        <div>
          <h1>大数据存储方案(OPFS)</h1>
          <p class="intro">
            使用 SQLite WASM
            在浏览器本地保存时序数据，按场景、时间和协议流式读取。
          </p>
        </div>
        <div class="hero-actions">
          <div class="status-orb" :class="`status-${status}`">
            <span></span>
            {{ status }}
          </div>
          <a
            v-if="isDashboard"
            class="jump-soak"
            data-testid="jump-soak"
            href="#live-soak-test"
            >页面持续测试 ↓</a
          >
        </div>
      </header>

      <nav class="route-nav" aria-label="主要页面">
        <RouterLink
          :to="{ query: {} }"
          :aria-current-value="isDashboard ? 'page' : 'false'"
          >运行与压测</RouterLink
        >
        <RouterLink
          :to="{ query: { view: 'records' } }"
          :aria-current-value="isDashboard ? 'false' : 'page'"
          >数据管理</RouterLink
        >
      </nav>

      <section class="notice" role="status" data-testid="status-message">
        {{ message }}
      </section>

      <section class="metrics">
        <article>
          <span>持久化记录</span>
          <strong data-testid="record-count">{{
            (stats?.recordCount ?? 0).toLocaleString()
          }}</strong>
        </article>
        <article>
          <span>Payload</span>
          <strong>{{ formatBytes(stats?.payloadBytes ?? 0) }}</strong>
        </article>
        <article>
          <span>数据库文件</span>
          <strong>{{ formatBytes(stats?.databaseBytes ?? 0) }}</strong>
        </article>
        <article>
          <span>Origin 可用</span>
          <strong>{{ formatBytes(estimate?.available ?? 0) }}</strong>
        </article>
      </section>

      <section class="panel controls-panel">
        <div class="panel-heading">
          <div>
            <h2>建立独占存储会话</h2>
          </div>
          <div class="database-actions">
            <button
              v-if="!store"
              data-testid="open-database"
              class="primary"
              :disabled="!canOpen"
              @click="openDatabase"
            >
              打开数据库
            </button>
            <button
              v-else
              data-testid="close-database"
              class="ghost"
              :disabled="!canOperate"
              @click="closeDatabase"
            >
              关闭并释放锁
            </button>
            <button
              data-testid="clear-all-data"
              class="danger"
              :disabled="!isDashboard || !canOperate"
              @click="clearAllData"
            >
              {{ clearing ? "正在清除…" : "清除全部数据" }}
            </button>
          </div>
        </div>
        <dl class="facts">
          <div>
            <dt>SQLite</dt>
            <dd>{{ stats?.sqliteVersion ?? "—" }}</dd>
          </div>
          <div>
            <dt>后端</dt>
            <dd>{{ stats?.storageMode ?? "—" }}</dd>
          </div>
          <div>
            <dt>持久权限</dt>
            <dd>{{ estimate?.persisted ? "已授予" : "未授予 / 待确认" }}</dd>
          </div>
          <div>
            <dt>安全水位</dt>
            <dd>{{ formatBytes(estimate?.reserve ?? 0) }}</dd>
          </div>
        </dl>
      </section>

      <div v-show="isDashboard">
        <SoakTestPanel
          :store="store"
          :disabled="!canOperate"
          @running-change="handleSoakRunningChange"
        />

        <div class="work-grid">
          <section class="panel">
            <h2>批量追加</h2>
            <label>
              场景 ID
              <input
                v-model.trim="sceneId"
                data-testid="scene-id"
                maxlength="256"
              />
            </label>
            <label>
              本次生成条数
              <input
                v-model.number="sampleCount"
                data-testid="sample-count"
                type="number"
                min="1"
                max="100000"
              />
            </label>
            <button
              data-testid="append-samples"
              class="primary wide"
              :disabled="!canOperate"
              @click="appendSamples"
            >
              生成并持久化
            </button>
            <p class="hint">
              两种 MessagePack 协议交替写入；每 97 条模拟一次轻度乱序。
            </p>
          </section>

          <section class="panel">
            <h2>流式范围查询</h2>
            <div class="time-row">
              <label
                >开始（ms）<input
                  v-model.number="rangeStart"
                  data-testid="range-start"
                  type="number"
              /></label>
              <label
                >结束（ms）<input
                  v-model.number="rangeEnd"
                  data-testid="range-end"
                  type="number"
              /></label>
            </div>
            <label>
              协议过滤
              <select v-model="protocolFilter" data-testid="protocol-filter">
                <option value="all">全部协议</option>
                <option value="1">Telemetry / 1</option>
                <option value="2">Alarm / 2</option>
              </select>
            </label>
            <button
              data-testid="run-query"
              class="primary wide"
              :disabled="!canOperate"
              @click="runQuery"
            >
              查询并消费全部批次
            </button>
            <div class="query-result">
              <span
                >命中
                <b data-testid="query-count">{{
                  queryCount.toLocaleString()
                }}</b></span
              >
              <span
                >首批 <b>{{ firstBatchMs.toFixed(1) }}ms</b></span
              >
            </div>
          </section>
        </div>

        <section class="panel preview-panel">
          <div class="panel-heading">
            <div>
              <h2>解码预览（最多 24 条）</h2>
            </div>
          </div>
          <div
            v-if="preview.length"
            class="record-list"
            data-testid="record-preview"
          >
            <article v-for="record in preview" :key="record.sequence">
              <div>
                <span class="protocol"
                  >P{{ record.protocolId }} / V{{ record.codecVersion }}</span
                >
                <time>{{ new Date(record.timestampMs).toISOString() }}</time>
              </div>
              <code>{{ JSON.stringify(record.value) }}</code>
            </article>
          </div>
          <p v-else class="empty">查询后在这里显示已按协议解码的对象。</p>
        </section>
      </div>

      <RecordsManagerView
        v-if="!isDashboard"
        :store="store"
        :disabled="!canOperate"
        @stats-changed="updateStats"
        @notice="message = $event"
      />
    </div>
  </div>
</template>

<style src="./styles.css"></style>
