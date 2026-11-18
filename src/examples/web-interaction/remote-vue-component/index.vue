<script setup lang="ts">
import {
  computed,
  onMounted,
  onUnmounted,
  ref,
  shallowRef,
} from "vue";
import RemoteComponentBoundary from "./RemoteComponentBoundary.vue";
import type {
  RemoteAuditSnapshot,
  RemoteSuspensionEvent,
} from "./remoteAudit";
import { REMOTE_COMPONENT_SHADOW_STYLE } from "./remoteComponentTheme";
import {
  loadRemoteVueComponent,
  RemoteVueComponentError,
  type RemoteCapability,
  type RemoteVueLoadResult,
} from "./remoteVueLoader";

const SAFE_COMPONENT_SHA256 =
  "7fb8c49a663395abf745a1cd1f4483393d3255f7570281980e0cd2746ae35d5d";
const publicBase = import.meta.env.BASE_URL;
const safeExampleUrl = `${publicBase}remote-components/safe-counter.vue`;
const blockedExampleUrl = `${publicBase}remote-components/blocked-example.vue`;
const incompatibleExampleUrl =
  `${publicBase}remote-components/incompatible-version.vue`;
const capabilityExampleUrl =
  `${publicBase}remote-components/capability-escalation.vue`;
const behaviorExampleUrl = `${publicBase}remote-components/behavior-limit.vue`;
const allowedOrigins = [window.location.origin] as const;
const hostCapabilities = [
  "counter:read",
  "counter:write",
] as const satisfies readonly RemoteCapability[];

const sourceUrl = ref(safeExampleUrl);
const status = ref<"idle" | "loading" | "ready" | "error" | "suspended">(
  "idle",
);
const errorCode = ref("");
const errorMessage = ref("");
const checkedAt = ref("");
const result = shallowRef<RemoteVueLoadResult | null>(null);
const hostStyleProbe = ref(false);
const suspensionMessage = ref("");
const audit = ref<RemoteAuditSnapshot>({
  managedResources: 0,
  peakDomMutationsPerSecond: 0,
  remoteNetworkRequests: 0,
  remoteTimers: 0,
  startedAt: "",
  state: "idle",
  totalActions: 0,
  totalDomMutations: 0,
});

let activeController: AbortController | null = null;

const statusLabel = computed(() => {
  if (status.value === "loading") return "正在验证";
  if (status.value === "ready") return "已安全挂载";
  if (status.value === "error") return "已拒绝";
  if (status.value === "suspended") return "已熔断";
  return "等待加载";
});

async function loadComponent(
  target = sourceUrl.value,
  grantedCapabilities: readonly RemoteCapability[] = hostCapabilities,
) {
  const trimmedTarget = target.trim();
  if (!trimmedTarget) return;

  sourceUrl.value = trimmedTarget;
  activeController?.abort();
  activeController = new AbortController();
  status.value = "loading";
  errorCode.value = "";
  errorMessage.value = "";
  result.value = null;
  suspensionMessage.value = "";
  audit.value = {
    ...audit.value,
    managedResources: 0,
    state: "idle",
    totalActions: 0,
    totalDomMutations: 0,
  };

  try {
    const isTrustedFixture =
      new URL(trimmedTarget, window.location.href).href ===
      new URL(safeExampleUrl, window.location.href).href;
    const loaded = await loadRemoteVueComponent(trimmedTarget, {
      allowedOrigins,
      expectedSha256: isTrustedFixture ? SAFE_COMPONENT_SHA256 : undefined,
      grantedCapabilities,
      maxBytes: 64 * 1024,
      signal: activeController.signal,
      supportedProtocolVersions: ["1.0"],
      timeoutMs: 8_000,
    });

    result.value = loaded;
    status.value = "ready";
  } catch (error) {
    if (error instanceof RemoteVueComponentError) {
      if (error.code === "ABORTED") return;
      errorCode.value = error.code;
      errorMessage.value = error.message;
    } else {
      errorCode.value = "UNKNOWN";
      errorMessage.value =
        error instanceof Error ? error.message : "加载远程组件时发生未知错误。";
    }
    status.value = "error";
  } finally {
    checkedAt.value = new Intl.DateTimeFormat("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date());
  }
}

function loadSafeExample() {
  void loadComponent(safeExampleUrl);
}

function loadBlockedExample() {
  void loadComponent(blockedExampleUrl);
}

function loadIncompatibleExample() {
  void loadComponent(incompatibleExampleUrl);
}

function loadCapabilityExample() {
  void loadComponent(capabilityExampleUrl);
}

function loadBehaviorExample() {
  void loadComponent(behaviorExampleUrl);
}

function handleAudit(snapshot: RemoteAuditSnapshot) {
  audit.value = snapshot;
}

function handleSuspended(event: RemoteSuspensionEvent) {
  suspensionMessage.value = event.reason;
  audit.value = event.snapshot;
  status.value = "suspended";
}

onMounted(loadSafeExample);

onUnmounted(() => {
  activeController?.abort();
});
</script>

<template>
  <main class="remote-demo">
    <div class="ambient ambient--left" aria-hidden="true"></div>
    <div class="ambient ambient--right" aria-hidden="true"></div>

    <header class="demo-header">
      <RouterLink class="back-link" to="/" aria-label="返回示例列表">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m14 6-6 6 6 6" />
        </svg>
      </RouterLink>
      <div class="header-copy">
        <span>VUE RUNTIME LAB</span>
        <h1>远程组件，三层零信任加载</h1>
        <p>Shadow DOM 隔离 · 依赖与能力契约 · 静态扫描与行为审计</p>
      </div>
      <div class="status-pill" :class="`is-${status}`">
        <i aria-hidden="true"></i>
        {{ statusLabel }}
      </div>
    </header>

    <section class="control-bar" aria-label="远程组件加载控制">
      <label for="remote-component-url">组件地址</label>
      <div class="url-field">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1 1" />
          <path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1-1" />
        </svg>
        <input
          id="remote-component-url"
          v-model="sourceUrl"
          type="text"
          autocomplete="off"
          spellcheck="false"
          @keyup.enter="loadComponent()"
        />
      </div>
      <button
        class="load-button"
        type="button"
        :disabled="status === 'loading'"
        @click="loadComponent()"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3v12m0 0 4-4m-4 4-4-4" />
          <path d="M5 20h14" />
        </svg>
        {{ status === "loading" ? "验证中" : "获取并渲染" }}
      </button>
    </section>

    <div class="workspace">
      <section class="preview-panel">
        <div class="panel-heading">
          <div>
            <span class="panel-kicker">RENDER OUTPUT</span>
            <h2>宿主渲染区</h2>
          </div>
          <button
            class="probe-toggle"
            :class="{ 'is-active': hostStyleProbe }"
            type="button"
            :aria-pressed="hostStyleProbe"
            @click="hostStyleProbe = !hostStyleProbe"
          >
            宿主 CSS 污染测试
          </button>
        </div>

        <div
          class="render-canvas"
          :class="{ 'host-style-pollution': hostStyleProbe }"
        >
          <div v-if="status === 'loading'" class="state-view loading-view">
            <span class="loader" aria-hidden="true"></span>
            <strong>正在建立信任链</strong>
            <p>校验来源、响应、哈希、manifest 与模板能力。</p>
          </div>

          <div v-else-if="status === 'error'" class="state-view error-view">
            <span class="error-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M12 8v5m0 3.5v.5" />
                <path d="M10.3 4.2 3.1 17a2 2 0 0 0 1.8 3h14.2a2 2 0 0 0 1.8-3L13.7 4.2a2 2 0 0 0-3.4 0Z" />
              </svg>
            </span>
            <span class="error-code">{{ errorCode }}</span>
            <strong>远程组件已被拒绝</strong>
            <p>{{ errorMessage }}</p>
            <button type="button" @click="loadSafeExample">恢复安全示例</button>
          </div>

          <RemoteComponentBoundary
            v-else-if="result"
            class="remote-boundary"
            :component="result.component"
            :contract="result.contract"
            :style-text="REMOTE_COMPONENT_SHADOW_STYLE"
            @audit="handleAudit"
            @suspended="handleSuspended"
          />
        </div>

        <div class="test-row">
          <div>
            <strong>主动验证三类拒绝路径</strong>
            <span>静态扫描、依赖协商与能力授权均采用失败关闭。</span>
          </div>
          <div class="test-actions">
            <button type="button" @click="loadBlockedExample">
              危险代码
            </button>
            <button type="button" @click="loadIncompatibleExample">
              版本不兼容
            </button>
            <button type="button" @click="loadCapabilityExample">
              越权能力
            </button>
            <button type="button" @click="loadBehaviorExample">
              行为熔断
            </button>
          </div>
        </div>
      </section>

      <aside class="security-panel">
        <div class="panel-heading">
          <div>
            <span class="panel-kicker">TRUST BOUNDARY</span>
            <h2>安全检查</h2>
          </div>
          <span v-if="checkedAt" class="checked-time">{{ checkedAt }}</span>
        </div>

        <ol v-if="result" class="security-list">
          <li
            v-for="check in result.securityChecks"
            :key="check.id"
            :class="check.status === 'passed' ? 'is-pass' : 'is-neutral'"
          >
            <span><i></i></span>
            <div>
              <strong>{{ check.label }}</strong>
              <p>{{ check.detail }}</p>
            </div>
          </li>
        </ol>

        <div v-else class="security-empty">
          加载后展示来源、完整性、AST、依赖、能力和代码执行检查。
        </div>

        <dl v-if="result" class="result-meta">
          <div>
            <dt>组件</dt>
            <dd>{{ result.componentName }}</dd>
          </div>
          <div>
            <dt>大小</dt>
            <dd>{{ result.sourceBytes }} B</dd>
          </div>
          <div>
            <dt>协议</dt>
            <dd>{{ result.contract.protocolVersion }}</dd>
          </div>
          <div>
            <dt>宿主 Vue</dt>
            <dd>{{ result.hostVueVersion }}</dd>
          </div>
        </dl>

        <section v-if="result" class="audit-card" aria-label="远程组件行为审计">
          <div class="audit-heading">
            <div>
              <span>BEHAVIOR AUDIT</span>
              <strong>{{ audit.state === "suspended" ? "已熔断" : "实时审计" }}</strong>
            </div>
            <i :class="{ 'is-alert': audit.state === 'suspended' }"></i>
          </div>
          <dl class="audit-grid">
            <div>
              <dt>DOM 变更</dt>
              <dd>{{ audit.totalDomMutations }}</dd>
            </div>
            <div>
              <dt>能力调用</dt>
              <dd>{{ audit.totalActions }}</dd>
            </div>
            <div>
              <dt>网络请求</dt>
              <dd>{{ audit.remoteNetworkRequests }}</dd>
            </div>
            <div>
              <dt>远程定时器</dt>
              <dd>{{ audit.remoteTimers }}</dd>
            </div>
          </dl>
          <p v-if="suspensionMessage">{{ suspensionMessage }}</p>
          <small>
            行为预算：{{ result.contract.limits.domMutationsPerSecond }} 次 DOM/秒 ·
            {{ result.contract.limits.actionsPerMinute }} 次动作/分钟
          </small>
        </section>
      </aside>
    </div>

    <section class="source-panel">
      <div class="source-heading">
        <div>
          <span class="panel-kicker">REMOTE SOURCE</span>
          <h2>接收到的 .vue 文件</h2>
        </div>
        <span v-if="result" class="hash-label">
          SHA-256 · {{ result.sha256.slice(0, 12) }}…
        </span>
      </div>
      <pre><code>{{ result?.source || "加载并通过校验后，远程源码会显示在这里。" }}</code></pre>
    </section>
  </main>
</template>

<style scoped>
.remote-demo {
  position: relative;
  width: 100%;
  height: 100%;
  padding: 26px clamp(20px, 4vw, 60px) 54px;
  overflow: auto;
  color: #182230;
  background:
    linear-gradient(rgb(255 255 255 / 76%), rgb(248 250 252 / 94%)),
    repeating-linear-gradient(
      90deg,
      transparent 0,
      transparent 79px,
      rgb(111 129 154 / 5%) 80px
    );
}

.ambient {
  position: fixed;
  width: 430px;
  height: 430px;
  border-radius: 50%;
  filter: blur(1px);
  pointer-events: none;
}

.ambient--left {
  top: -260px;
  left: -130px;
  background: radial-gradient(circle, rgb(74 137 255 / 15%), transparent 70%);
}

.ambient--right {
  right: -170px;
  bottom: -260px;
  background: radial-gradient(circle, rgb(23 205 151 / 11%), transparent 70%);
}

.demo-header,
.control-bar,
.workspace,
.source-panel {
  position: relative;
  z-index: 1;
  width: min(1280px, 100%);
  margin-inline: auto;
}

.demo-header {
  display: flex;
  align-items: center;
  gap: 16px;
}

.back-link {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  width: 40px;
  height: 40px;
  color: #65758b;
  background: rgb(255 255 255 / 76%);
  border: 1px solid #e1e7ee;
  border-radius: 12px;
  transition: 150ms ease;
}

.back-link:hover {
  color: #2366d1;
  border-color: #b9cae5;
  transform: translateX(-2px);
}

.back-link svg,
.control-bar svg,
.test-row svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
}

.header-copy {
  min-width: 0;
}

.header-copy > span,
.panel-kicker {
  color: #3773d6;
  font-size: 10px;
  font-weight: 760;
  letter-spacing: 0.14em;
}

.header-copy h1 {
  margin-top: 5px;
  font-size: clamp(24px, 3vw, 34px);
  font-weight: 720;
  letter-spacing: -0.035em;
}

.header-copy p {
  margin-top: 5px;
  color: #8290a3;
  font-size: 12px;
}

.status-pill {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-left: auto;
  padding: 8px 11px;
  color: #718096;
  font-size: 10px;
  font-weight: 700;
  background: #ffffff;
  border: 1px solid #e2e7ed;
  border-radius: 999px;
  box-shadow: 0 5px 18px rgb(46 68 98 / 6%);
}

.status-pill i {
  width: 7px;
  height: 7px;
  background: #a5afbd;
  border-radius: 50%;
}

.status-pill.is-ready {
  color: #178560;
  background: #f4fffb;
  border-color: #c7eadc;
}

.status-pill.is-ready i {
  background: #24b986;
  box-shadow: 0 0 0 4px rgb(36 185 134 / 12%);
}

.status-pill.is-error,
.status-pill.is-suspended {
  color: #bc4b55;
  background: #fff8f8;
  border-color: #f1cdd1;
}

.status-pill.is-error i,
.status-pill.is-suspended i {
  background: #db5864;
}

.status-pill.is-loading i {
  background: #4982df;
  animation: pulse 900ms ease-in-out infinite alternate;
}

.control-bar {
  display: grid;
  grid-template-columns: auto minmax(220px, 1fr) auto;
  align-items: center;
  gap: 13px;
  margin-top: 26px;
  padding: 13px;
  background: rgb(255 255 255 / 86%);
  border: 1px solid #e0e6ed;
  border-radius: 16px;
  box-shadow: 0 12px 38px rgb(36 57 84 / 7%);
  backdrop-filter: blur(14px);
}

.control-bar > label {
  padding-left: 4px;
  color: #5b6b80;
  font-size: 11px;
  font-weight: 700;
}

.url-field {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  height: 42px;
  padding: 0 13px;
  color: #7b8ca3;
  background: #f6f8fb;
  border: 1px solid #e3e8ef;
  border-radius: 10px;
}

.url-field input {
  width: 100%;
  min-width: 0;
  color: #29384b;
  font-family: "SFMono-Regular", Consolas, monospace;
  font-size: 11px;
  background: transparent;
  border: 0;
  outline: 0;
}

.load-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 42px;
  padding: 0 16px;
  color: #ffffff;
  font-size: 11px;
  font-weight: 720;
  background: linear-gradient(135deg, #235fc4, #4c86e5);
  border: 0;
  border-radius: 10px;
  box-shadow: 0 8px 18px rgb(50 104 197 / 20%);
  cursor: pointer;
}

.load-button:disabled {
  opacity: 0.65;
  cursor: wait;
}

.workspace {
  display: grid;
  grid-template-columns: minmax(0, 1.65fr) minmax(300px, 0.75fr);
  gap: 18px;
  margin-top: 18px;
}

.preview-panel,
.security-panel,
.source-panel {
  background: rgb(255 255 255 / 90%);
  border: 1px solid #e0e6ed;
  border-radius: 18px;
  box-shadow: 0 14px 44px rgb(37 57 83 / 7%);
  backdrop-filter: blur(14px);
}

.preview-panel,
.security-panel {
  padding: 20px;
}

.panel-heading,
.source-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}

.panel-heading h2,
.source-heading h2 {
  margin-top: 5px;
  color: #253347;
  font-size: 15px;
  font-weight: 720;
}

.checked-time,
.hash-label {
  color: #94a0af;
  font-family: "SFMono-Regular", Consolas, monospace;
  font-size: 9px;
}

.probe-toggle {
  padding: 7px 9px;
  color: #738196;
  font-size: 9px;
  font-weight: 700;
  background: #f7f9fb;
  border: 1px solid #dfe5ec;
  border-radius: 8px;
  cursor: pointer;
}

.probe-toggle.is-active {
  color: #a44851;
  background: #fff5f6;
  border-color: #edcdd0;
}

.render-canvas {
  display: grid;
  min-height: 375px;
  margin-top: 17px;
  padding: clamp(18px, 4vw, 38px);
  place-items: center;
  overflow: hidden;
  background:
    radial-gradient(circle at 50% 30%, rgb(79 129 210 / 10%), transparent 45%),
    #f4f7fa;
  border: 1px solid #e3e8ee;
  border-radius: 14px;
}

.state-view {
  display: flex;
  flex-direction: column;
  align-items: center;
  max-width: 420px;
  text-align: center;
}

.state-view strong {
  margin-top: 15px;
  color: #354357;
  font-size: 14px;
}

.state-view p {
  margin-top: 7px;
  color: #8a97a8;
  font-size: 11px;
  line-height: 1.7;
}

.loader {
  width: 33px;
  height: 33px;
  border: 2px solid #d8e1ed;
  border-top-color: #3876d5;
  border-radius: 50%;
  animation: spin 720ms linear infinite;
}

.error-icon {
  display: grid;
  place-items: center;
  width: 46px;
  height: 46px;
  color: #d75b65;
  background: #fff1f2;
  border-radius: 14px;
}

.error-icon svg {
  width: 25px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.7;
}

.error-code {
  margin-top: 13px;
  padding: 4px 7px;
  color: #bd4c56;
  font-family: Consolas, monospace;
  font-size: 9px;
  background: #fff0f1;
  border-radius: 5px;
}

.error-view button {
  margin-top: 16px;
  padding: 8px 11px;
  color: #315f9f;
  font-size: 10px;
  font-weight: 700;
  background: #ffffff;
  border: 1px solid #ccd8e8;
  border-radius: 8px;
  cursor: pointer;
}

.test-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  margin-top: 15px;
  padding: 0 2px;
}

.test-row strong,
.test-row span {
  display: block;
}

.test-row strong {
  color: #566579;
  font-size: 10px;
}

.test-row span {
  margin-top: 4px;
  color: #9aa5b3;
  font-size: 9px;
}

.test-row button {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 5px;
  padding: 7px 9px;
  color: #a35359;
  font-size: 9px;
  font-weight: 680;
  background: #fffafa;
  border: 1px solid #efd7d9;
  border-radius: 8px;
  cursor: pointer;
}

.test-row button svg {
  width: 13px;
  height: 13px;
}

.test-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
}

.security-list {
  display: grid;
  gap: 0;
  margin-top: 20px;
  list-style: none;
}

.security-list li {
  position: relative;
  display: grid;
  grid-template-columns: 26px 1fr;
  gap: 11px;
  padding-bottom: 19px;
}

.security-list li:not(:last-child)::before {
  position: absolute;
  top: 25px;
  bottom: 0;
  left: 12px;
  width: 1px;
  content: "";
  background: #dce5e2;
}

.security-list li > span {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  background: #eef9f5;
  border: 1px solid #cae9de;
  border-radius: 50%;
}

.security-list li > span i {
  width: 7px;
  height: 7px;
  background: #2eb386;
  border-radius: 50%;
}

.security-list li.is-neutral > span {
  background: #f5f7fa;
  border-color: #dfe5ec;
}

.security-list li.is-neutral > span i {
  background: #9aa6b5;
}

.security-list strong {
  display: block;
  color: #344358;
  font-size: 11px;
  font-weight: 720;
}

.security-list p {
  margin-top: 5px;
  color: #8794a6;
  font-size: 9px;
  line-height: 1.65;
}

.security-empty {
  margin-top: 20px;
  padding: 18px;
  color: #8d99a9;
  font-size: 9px;
  line-height: 1.7;
  background: #f7f9fb;
  border: 1px dashed #dce3eb;
  border-radius: 10px;
}

.result-meta {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1px;
  overflow: hidden;
  background: #e5eaf0;
  border: 1px solid #e5eaf0;
  border-radius: 10px;
}

.result-meta div {
  min-width: 0;
  padding: 10px;
  background: #f8fafc;
}

.result-meta dt {
  color: #9aa5b3;
  font-size: 8px;
}

.result-meta dd {
  overflow: hidden;
  margin-top: 4px;
  color: #4b5a6d;
  font-family: Consolas, monospace;
  font-size: 9px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.audit-card {
  margin-top: 12px;
  padding: 12px;
  background: #152235;
  border: 1px solid #26384f;
  border-radius: 11px;
}

.audit-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.audit-heading span,
.audit-heading strong {
  display: block;
}

.audit-heading span {
  color: #6e8aaa;
  font-size: 7px;
  font-weight: 750;
  letter-spacing: 0.14em;
}

.audit-heading strong {
  margin-top: 3px;
  color: #dbe8f6;
  font-size: 10px;
}

.audit-heading i {
  width: 7px;
  height: 7px;
  background: #42d3a0;
  border-radius: 50%;
  box-shadow: 0 0 0 4px rgb(66 211 160 / 12%);
}

.audit-heading i.is-alert {
  background: #ff7180;
  box-shadow: 0 0 0 4px rgb(255 113 128 / 12%);
}

.audit-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1px;
  margin-top: 11px;
  overflow: hidden;
  background: #283a50;
  border: 1px solid #283a50;
  border-radius: 7px;
}

.audit-grid div {
  padding: 8px 6px;
  text-align: center;
  background: #1b2b3f;
}

.audit-grid dt {
  color: #71869d;
  font-size: 7px;
}

.audit-grid dd {
  margin-top: 3px;
  color: #f3f8ff;
  font: 700 12px Consolas, monospace;
}

.audit-card p {
  margin-top: 9px;
  color: #ff9eaa;
  font-size: 8px;
  line-height: 1.5;
}

.audit-card small {
  display: block;
  margin-top: 9px;
  color: #688098;
  font-size: 7px;
}

.remote-boundary::part(container) {
  outline: 1px solid rgb(94 178 255 / 8%);
  outline-offset: -3px;
}

:global(.render-canvas.host-style-pollution h2) {
  color: #ff304d !important;
  font-size: 8px !important;
  text-transform: uppercase !important;
}

.source-panel {
  margin-top: 18px;
  padding: 20px;
}

.source-panel pre {
  max-height: 310px;
  margin-top: 16px;
  padding: 18px;
  overflow: auto;
  color: #b9c8db;
  font: 10px/1.7 "SFMono-Regular", Consolas, monospace;
  background: #152235;
  border: 1px solid #26364c;
  border-radius: 12px;
  box-shadow: inset 0 1px 12px rgb(0 0 0 / 18%);
  white-space: pre-wrap;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes pulse {
  to {
    opacity: 0.35;
  }
}

@media (max-width: 920px) {
  .workspace {
    grid-template-columns: 1fr;
  }

  .security-list {
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }

  .security-list li {
    padding-bottom: 0;
  }

  .security-list li::before {
    display: none;
  }
}

@media (max-width: 680px) {
  .remote-demo {
    padding-inline: 14px;
  }

  .control-bar {
    grid-template-columns: 1fr;
  }

  .control-bar > label {
    display: none;
  }

  .status-pill {
    padding-inline: 9px;
  }

  .header-copy p,
  .checked-time {
    display: none;
  }

  .preview-panel,
  .security-panel,
  .source-panel {
    padding: 15px;
  }

  .render-canvas {
    min-height: 420px;
    padding: 14px;
  }

  .security-list {
    grid-template-columns: 1fr;
  }

  .test-row {
    align-items: flex-start;
    flex-direction: column;
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
</style>
