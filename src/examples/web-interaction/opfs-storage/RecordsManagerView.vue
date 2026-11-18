<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import type {
  ManagedDecodedRecord,
  RecordKey,
  TimeSeriesStore,
} from "opfs-timeseries-store";

const props = defineProps<{
  store?: TimeSeriesStore;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  statsChanged: [];
  notice: [message: string];
}>();

const loading = ref(false);
const rows = ref<Array<ManagedDecodedRecord<unknown>>>([]);
const pageIndex = ref(0);
const cursorHistory = ref<Array<string | undefined>>([undefined]);
const nextCursor = ref<string>();
const done = ref(true);
const errorMessage = ref("");
const editorOpen = ref(false);
const editorMode = ref<"create" | "edit">("create");
const editorKey = ref<RecordKey>();

function toLocalInput(timestampMs: number, withMilliseconds = false): string {
  const date = new Date(timestampMs);
  return new Date(timestampMs - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, withMilliseconds ? -1 : 16);
}

function fromLocalInput(value: string): number {
  const timestamp = new Date(value).getTime();
  if (!Number.isSafeInteger(timestamp)) throw new Error("请输入有效时间。");
  return timestamp;
}

const now = Date.now();
const filters = reactive({
  sceneId: "",
  fromLocal: toLocalInput(now - 60 * 60_000),
  toLocal: toLocalInput(now + 60_000),
  protocolId: "all",
  pageSize: 50,
});

const editor = reactive({
  sceneId: "business-scene",
  timestampLocal: toLocalInput(Date.now()),
  protocolId: 1,
  payloadText: JSON.stringify(
    { x: 0, y: 0, temperature: 25, tags: ["manual"] },
    null,
    2,
  ),
});

const canUseDatabase = computed(() => Boolean(props.store) && !props.disabled);

async function loadPage(
  cursor: string | undefined = cursorHistory.value[pageIndex.value],
): Promise<void> {
  const session = props.store;
  if (!session || props.disabled) return;
  loading.value = true;
  errorMessage.value = "";
  try {
    const page = await session.recordsPage({
      sceneId: filters.sceneId.trim() || undefined,
      fromInclusive: fromLocalInput(filters.fromLocal),
      toExclusive: fromLocalInput(filters.toLocal),
      protocolIds:
        filters.protocolId === "all" ? undefined : [Number(filters.protocolId)],
      pageSize: Math.max(10, Math.min(200, Math.trunc(filters.pageSize))),
      cursor,
    });
    if (props.store !== session) return;
    rows.value = page.records.map((record) => session.decodeManaged(record));
    nextCursor.value = page.nextCursor;
    done.value = page.done;
    emit(
      "notice",
      `数据管理查询完成：第 ${pageIndex.value + 1} 页，共 ${rows.value.length} 条。`,
    );
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
    emit("notice", `数据管理查询失败：${errorMessage.value}`);
  } finally {
    loading.value = false;
  }
}

async function search(): Promise<void> {
  pageIndex.value = 0;
  cursorHistory.value = [undefined];
  nextCursor.value = undefined;
  await loadPage(undefined);
}

async function goNext(): Promise<void> {
  if (!nextCursor.value) return;
  cursorHistory.value = cursorHistory.value.slice(0, pageIndex.value + 1);
  cursorHistory.value.push(nextCursor.value);
  pageIndex.value += 1;
  await loadPage(nextCursor.value);
}

async function goPrevious(): Promise<void> {
  if (pageIndex.value === 0) return;
  pageIndex.value -= 1;
  await loadPage(cursorHistory.value[pageIndex.value]);
}

function useProtocolTemplate(): void {
  editor.payloadText =
    editor.protocolId === 1
      ? JSON.stringify(
          { x: 0, y: 0, temperature: 25, tags: ["manual"] },
          null,
          2,
        )
      : JSON.stringify(
          {
            level: "info",
            message: "手动创建的业务记录",
            source: "records-page",
          },
          null,
          2,
        );
}

function openCreate(): void {
  editorMode.value = "create";
  editorKey.value = undefined;
  editor.sceneId = filters.sceneId.trim() || "business-scene";
  editor.timestampLocal = toLocalInput(Date.now(), true);
  editor.protocolId = 1;
  useProtocolTemplate();
  editorOpen.value = true;
}

function openEdit(row: ManagedDecodedRecord<unknown>): void {
  editorMode.value = "edit";
  editorKey.value = {
    sceneId: row.sceneId,
    timestampMs: row.timestampMs,
    sequence: row.sequence,
  };
  editor.sceneId = row.sceneId;
  editor.timestampLocal = toLocalInput(row.timestampMs, true);
  editor.protocolId = row.protocolId;
  editor.payloadText = JSON.stringify(row.value, null, 2);
  editorOpen.value = true;
}

async function saveEditor(): Promise<void> {
  if (!props.store || !canUseDatabase.value) return;
  loading.value = true;
  errorMessage.value = "";
  try {
    const value = JSON.parse(editor.payloadText) as unknown;
    const timestampMs = fromLocalInput(editor.timestampLocal);
    if (editorMode.value === "create") {
      await props.store.appendBatch([
        {
          sceneId: editor.sceneId.trim(),
          timestampMs,
          protocolId: editor.protocolId,
          value,
        },
      ]);
      emit("notice", "记录创建成功。");
    } else if (editorKey.value) {
      const result = await props.store.updateRecord({
        key: editorKey.value,
        sceneId: editor.sceneId.trim(),
        timestampMs,
        protocolId: editor.protocolId,
        value,
      });
      if (!result.changed) throw new Error("原记录已不存在，请刷新表格。");
      emit("notice", `记录 #${editorKey.value.sequence} 更新成功。`);
    }
    editorOpen.value = false;
    emit("statsChanged");
    await search();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  } finally {
    loading.value = false;
  }
}

async function deleteRow(row: ManagedDecodedRecord<unknown>): Promise<void> {
  if (!props.store || !canUseDatabase.value) return;
  const confirmed = window.confirm(
    `确定删除序号 #${row.sequence} 的记录吗？此操作不可撤销。`,
  );
  if (!confirmed) return;
  loading.value = true;
  try {
    const result = await props.store.deleteRecord({
      sceneId: row.sceneId,
      timestampMs: row.timestampMs,
      sequence: row.sequence,
    });
    if (!result.changed) throw new Error("记录已不存在。");
    emit("notice", `记录 #${row.sequence} 已删除。`);
    emit("statsChanged");
    await loadPage();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  } finally {
    loading.value = false;
  }
}

watch(
  canUseDatabase,
  (available) => {
    if (available) void search();
    else if (!props.store) rows.value = [];
  },
  { immediate: true },
);
</script>

<template>
  <section class="records-page">
    <div class="records-title-row">
      <div>
        <h2>全部时序数据管理</h2>
        <p>按时间、场景和协议查询；提供记录级新增、编辑和删除。</p>
      </div>
      <button
        data-testid="create-record"
        class="primary"
        :disabled="!canUseDatabase || loading"
        @click="openCreate"
      >
        新增记录
      </button>
    </div>

    <section class="panel records-filter-panel">
      <label
        >场景 ID（空表示全部）<input
          v-model.trim="filters.sceneId"
          data-testid="records-scene-filter"
      /></label>
      <label
        >开始时间<input
          v-model="filters.fromLocal"
          data-testid="records-from"
          type="datetime-local"
      /></label>
      <label
        >结束时间<input
          v-model="filters.toLocal"
          data-testid="records-to"
          type="datetime-local"
      /></label>
      <label
        >协议
        <select
          v-model="filters.protocolId"
          data-testid="records-protocol-filter"
        >
          <option value="all">全部协议</option>
          <option value="1">Telemetry / 1</option>
          <option value="2">Alarm / 2</option>
        </select>
      </label>
      <label
        >每页条数<input
          v-model.number="filters.pageSize"
          data-testid="records-page-size"
          type="number"
          min="10"
          max="200"
      /></label>
      <button
        data-testid="records-search"
        class="primary"
        :disabled="!canUseDatabase || loading"
        @click="search"
      >
        {{ loading ? "处理中…" : "查询" }}
      </button>
    </section>

    <p v-if="errorMessage" class="records-error" role="alert">
      {{ errorMessage }}
    </p>

    <section class="panel records-table-panel">
      <div class="records-table-scroll">
        <table data-testid="records-table">
          <thead>
            <tr>
              <th>序号</th>
              <th>场景</th>
              <th>时间</th>
              <th>协议</th>
              <th>业务数据（已解码）</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in rows"
              :key="`${row.sceneId}-${row.timestampMs}-${row.sequence}`"
            >
              <td class="mono">#{{ row.sequence }}</td>
              <td>{{ row.sceneId }}</td>
              <td>
                <time>{{ new Date(row.timestampMs).toLocaleString() }}</time
                ><small>{{ row.timestampMs }}</small>
              </td>
              <td>
                <span class="protocol"
                  >P{{ row.protocolId }} / V{{ row.codecVersion }}</span
                >
              </td>
              <td>
                <code>{{ JSON.stringify(row.value) }}</code>
              </td>
              <td>
                <div class="row-actions">
                  <button
                    class="table-action"
                    :disabled="loading"
                    @click="openEdit(row)"
                  >
                    编辑</button
                  ><button
                    class="table-action delete"
                    :disabled="loading"
                    @click="deleteRow(row)"
                  >
                    删除
                  </button>
                </div>
              </td>
            </tr>
            <tr v-if="!rows.length">
              <td colspan="6" class="table-empty">
                {{ store ? "当前范围内没有数据" : "请先打开数据库" }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <footer class="pagination">
        <span>第 {{ pageIndex + 1 }} 页，本页 {{ rows.length }} 条</span>
        <div>
          <button
            class="ghost"
            :disabled="pageIndex === 0 || loading"
            @click="goPrevious"
          >
            上一页</button
          ><button
            class="ghost"
            :disabled="done || !nextCursor || loading"
            @click="goNext"
          >
            下一页
          </button>
        </div>
      </footer>
    </section>

    <div
      v-if="editorOpen"
      class="modal-backdrop"
      @click.self="editorOpen = false"
    >
      <section
        class="record-editor"
        role="dialog"
        aria-modal="true"
        aria-labelledby="record-editor-title"
      >
        <div class="panel-heading">
          <h2 id="record-editor-title">
            {{
              editorMode === "create"
                ? "新增记录"
                : `编辑记录 #${editorKey?.sequence}`
            }}
          </h2>
          <button
            class="modal-close"
            aria-label="关闭"
            @click="editorOpen = false"
          >
            ×
          </button>
        </div>
        <label
          >场景 ID<input
            v-model.trim="editor.sceneId"
            data-testid="editor-scene-id"
            maxlength="256"
        /></label>
        <label
          >时间<input
            v-model="editor.timestampLocal"
            data-testid="editor-timestamp"
            type="datetime-local"
            step="0.001"
        /></label>
        <label
          >协议类型
          <select
            v-model.number="editor.protocolId"
            data-testid="editor-protocol"
            @change="editorMode === 'create' && useProtocolTemplate()"
          >
            <option :value="1">Telemetry / 1</option>
            <option :value="2">Alarm / 2</option>
          </select>
        </label>
        <label
          >业务数据 JSON<textarea
            v-model="editor.payloadText"
            data-testid="editor-payload"
            rows="10"
          ></textarea>
        </label>
        <div class="editor-actions">
          <button class="ghost" @click="editorOpen = false">取消</button
          ><button
            data-testid="save-record"
            class="primary"
            :disabled="loading"
            @click="saveEditor"
          >
            {{ loading ? "保存中…" : "保存" }}
          </button>
        </div>
      </section>
    </div>
  </section>
</template>
