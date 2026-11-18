<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef } from "vue";
import { formatBytes, type TimeSeriesStore } from "opfs-timeseries-store";
import { BrowserSoakTestRunner } from "./browser-soak-test-runner";
import PerformanceSparkline from "./PerformanceSparkline.vue";
import type { SoakTestSnapshot } from "./types";

const props = defineProps<{ store?: TimeSeriesStore; disabled: boolean }>();
const emit = defineEmits<{ runningChange: [running: boolean] }>();

const durationSeconds = ref(600);
const writeRatePerSecond = ref(100);
const queryRecordLimit = ref(1_000);
const runner = shallowRef<BrowserSoakTestRunner>();
const snapshot = ref<SoakTestSnapshot>({
  status: "idle",
  sceneId: "",
  elapsedSeconds: 0,
  durationSeconds: 600,
  progress: 0,
  insertedRecords: 0,
  targetRecords: 60_000,
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
});

const isRunning = computed(
  () =>
    snapshot.value.status === "running" || snapshot.value.status === "stopping",
);
const progressLabel = computed(
  () => `${Math.round(snapshot.value.progress * 100)}%`,
);
const displayedTargetRecords = computed(() =>
  snapshot.value.status === "idle"
    ? Math.max(10, Math.min(3_600, Math.trunc(durationSeconds.value || 0))) *
      Math.max(1, Math.min(15_000, Math.trunc(writeRatePerSecond.value || 0)))
    : snapshot.value.targetRecords,
);

async function start(): Promise<void> {
  if (!props.store || props.disabled || isRunning.value) return;
  const seconds = Math.max(
    10,
    Math.min(3_600, Math.trunc(durationSeconds.value)),
  );
  const writeRate = Math.max(
    1,
    Math.min(15_000, Math.trunc(writeRatePerSecond.value)),
  );
  const queryLimit = Math.max(
    1,
    Math.min(100_000, Math.trunc(queryRecordLimit.value)),
  );
  durationSeconds.value = seconds;
  writeRatePerSecond.value = writeRate;
  queryRecordLimit.value = queryLimit;
  const testRunner = new BrowserSoakTestRunner(
    props.store,
    {
      durationSeconds: seconds,
      writeRatePerSecond: writeRate,
      queryIntervalSeconds: 10,
      queryRecordLimit: queryLimit,
    },
    (next) => {
      snapshot.value = next;
      emit(
        "runningChange",
        next.status === "running" || next.status === "stopping",
      );
    },
  );
  runner.value = testRunner;
  emit("runningChange", true);
  await testRunner.run();
}

function stop(): void {
  runner.value?.stop();
}

onBeforeUnmount(() => runner.value?.stop());
</script>

<template>
  <section id="live-soak-test" class="panel soak-panel">
    <div class="panel-heading soak-heading">
      <div>
        <h2>页面内持续写入与查询测试</h2>
        <p class="soak-subtitle">
          写入速度和单次查询数量可调；每 10 秒查询并解码一次最近 10 秒的数据。
        </p>
      </div>
    </div>

    <div class="soak-actions">
      <label>
        时长（秒）
        <input
          v-model.number="durationSeconds"
          data-testid="soak-duration"
          type="number"
          min="10"
          max="3600"
          :disabled="isRunning"
        />
      </label>
      <label>
        每秒写入（条）
        <input
          v-model.number="writeRatePerSecond"
          data-testid="soak-write-rate"
          type="number"
          min="1"
          max="15000"
          :disabled="isRunning"
        />
      </label>
      <label>
        每次查询上限（条）
        <input
          v-model.number="queryRecordLimit"
          data-testid="soak-query-limit"
          type="number"
          min="1"
          max="100000"
          :disabled="isRunning"
        />
      </label>
      <button
        data-testid="start-soak"
        class="primary"
        :disabled="disabled || isRunning"
        @click="start"
      >
        开始持续测试
      </button>
      <button
        data-testid="stop-soak"
        class="ghost"
        :disabled="!isRunning"
        @click="stop"
      >
        停止
      </button>
    </div>

    <div class="soak-progress-copy">
      <span
        >{{ snapshot.elapsedSeconds }}s / {{ snapshot.durationSeconds }}s</span
      >
      <b>{{ progressLabel }}</b>
    </div>
    <div
      class="soak-progress"
      role="progressbar"
      aria-label="压力测试进度"
      :aria-valuenow="Math.round(snapshot.progress * 100)"
      aria-valuemin="0"
      aria-valuemax="100"
    >
      <span :style="{ width: progressLabel }"></span>
    </div>

    <div class="soak-metrics" aria-live="polite">
      <article>
        <span>已写入</span
        ><strong data-testid="soak-inserted">{{
          snapshot.insertedRecords.toLocaleString()
        }}</strong
        ><small>/ {{ displayedTargetRecords.toLocaleString() }} 条</small>
      </article>
      <article>
        <span>写入 p95</span
        ><strong>{{ snapshot.writeP95Ms.toFixed(1) }}ms</strong
        ><small>当前 {{ snapshot.currentWriteMs.toFixed(1) }}ms</small>
      </article>
      <article>
        <span>窗口查询</span
        ><strong data-testid="soak-query-count">{{
          snapshot.queryCount
        }}</strong
        ><small>最近 {{ snapshot.lastQueryRecords.toLocaleString() }} 条</small>
      </article>
      <article>
        <span>查询耗时</span
        ><strong>{{ snapshot.lastQueryTotalMs.toFixed(1) }}ms</strong
        ><small>首批 {{ snapshot.lastQueryFirstBatchMs.toFixed(1) }}ms</small>
      </article>
      <article>
        <span>页面 Heap</span
        ><strong>{{ formatBytes(snapshot.pageHeapBytes ?? 0) }}</strong
        ><small>浏览器可见 JS 内存</small>
      </article>
      <article>
        <span>数据库</span
        ><strong>{{ formatBytes(snapshot.databaseBytes) }}</strong
        ><small>Origin {{ formatBytes(snapshot.originUsageBytes) }}</small>
      </article>
      <article>
        <span>最大漂移</span
        ><strong>{{ snapshot.maxSchedulerDriftMs.toFixed(1) }}ms</strong
        ><small>主线程响应指标</small>
      </article>
      <article>
        <span>状态</span
        ><strong
          data-testid="soak-status"
          class="soak-status"
          :class="`soak-${snapshot.status}`"
          >{{ snapshot.status }}</strong
        ><small>{{ snapshot.sceneId || "等待启动" }}</small>
      </article>
    </div>

    <div class="soak-charts">
      <PerformanceSparkline
        title="最近 60 秒写入延迟"
        :values="snapshot.writeLatencySeries"
        tone="write"
      />
      <PerformanceSparkline
        title="最近 60 次查询延迟"
        :values="snapshot.queryLatencySeries"
        tone="query"
      />
    </div>

    <div class="soak-log" data-testid="soak-log">
      <div class="soak-log-heading">
        <span>实时事件</span><span>最新在上</span>
      </div>
      <p v-if="!snapshot.logs.length" class="empty">
        打开数据库并开始测试后，这里每秒更新。
      </p>
      <ol v-else>
        <li
          v-for="entry in snapshot.logs"
          :key="entry.id"
          :class="`log-${entry.kind}`"
        >
          {{ entry.message }}
        </li>
      </ol>
    </div>
  </section>
</template>
