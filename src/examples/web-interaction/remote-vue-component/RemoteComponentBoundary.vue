<script setup lang="ts">
import {
  createApp,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  type App,
  type Component,
} from "vue";
import type {
  RemoteAuditSnapshot,
  RemoteSuspensionEvent,
} from "./remoteAudit";
import {
  REMOTE_RUNTIME_KEY,
  type RemoteComponentContract,
  type RemoteRuntimeAction,
  type RemoteRuntimeBridge,
} from "./remoteVueLoader";

const props = defineProps<{
  component: Component;
  contract: RemoteComponentContract;
  styleText: string;
}>();

const emit = defineEmits<{
  audit: [snapshot: RemoteAuditSnapshot];
  ready: [];
  suspended: [event: RemoteSuspensionEvent];
}>();

const hostElement = ref<HTMLElement | null>(null);

let shadowRoot: ShadowRoot | null = null;
let remoteApp: App<Element> | null = null;
let mutationObserver: MutationObserver | null = null;
let auditTimer: number | null = null;
const state = ref<RemoteAuditSnapshot["state"]>("idle");
let startedAt = "";
let totalActions = 0;
let totalDomMutations = 0;
let mutationsInWindow = 0;
let mutationWindowStartedAt = 0;
let peakDomMutationsPerSecond = 0;
let actionTimestamps: number[] = [];

function createSnapshot(): RemoteAuditSnapshot {
  return {
    managedResources: state.value === "running" ? 2 : 0,
    peakDomMutationsPerSecond,
    remoteNetworkRequests: 0,
    remoteTimers: 0,
    startedAt,
    state: state.value,
    totalActions,
    totalDomMutations,
  };
}

function publishAudit() {
  emit("audit", createSnapshot());
}

function resetCounters() {
  startedAt = new Date().toISOString();
  totalActions = 0;
  totalDomMutations = 0;
  mutationsInWindow = 0;
  mutationWindowStartedAt = performance.now();
  peakDomMutationsPerSecond = 0;
  actionTimestamps = [];
}

function finishMutationWindow(now = performance.now()) {
  if (now - mutationWindowStartedAt < 1_000) return;
  peakDomMutationsPerSecond = Math.max(
    peakDomMutationsPerSecond,
    mutationsInWindow,
  );
  mutationsInWindow = 0;
  mutationWindowStartedAt = now;
  publishAudit();
}

function cleanupManagedResources() {
  if (auditTimer !== null) {
    window.clearInterval(auditTimer);
    auditTimer = null;
  }
  mutationObserver?.disconnect();
  mutationObserver = null;
  remoteApp?.unmount();
  remoteApp = null;
}

function suspend(reason: string) {
  if (state.value !== "running") return;
  state.value = "suspended";
  cleanupManagedResources();

  if (shadowRoot) {
    const fallback = document.createElement("div");
    fallback.className = "boundary-fallback";
    fallback.textContent = `组件已熔断：${reason}`;
    shadowRoot.querySelector(".remote-mount")?.replaceWith(fallback);
  }

  const snapshot = createSnapshot();
  emit("audit", snapshot);
  emit("suspended", { reason, snapshot });
}

const runtimeBridge: RemoteRuntimeBridge = {
  authorizeAction(action: RemoteRuntimeAction) {
    if (state.value !== "running") return false;

    const now = Date.now();
    actionTimestamps = actionTimestamps.filter(
      (timestamp) => now - timestamp < 60_000,
    );
    if (actionTimestamps.length >= props.contract.limits.actionsPerMinute) {
      suspend(
        `每分钟动作数超过 ${props.contract.limits.actionsPerMinute} 次预算`,
      );
      return false;
    }

    actionTimestamps.push(now);
    totalActions += 1;
    void action;
    publishAudit();
    return true;
  },
  isSuspended() {
    return state.value === "suspended";
  },
};

function mountRemoteComponent() {
  const host = hostElement.value;
  if (!host) return;

  cleanupManagedResources();
  shadowRoot ??= host.attachShadow({ mode: "open", delegatesFocus: true });
  shadowRoot.replaceChildren();

  const style = document.createElement("style");
  style.textContent = props.styleText;
  const mountPoint = document.createElement("div");
  mountPoint.className = "remote-mount";
  shadowRoot.append(style, mountPoint);

  resetCounters();
  state.value = "running";
  mutationObserver = new MutationObserver((records) => {
    const mutationCount = records.length;
    totalDomMutations += mutationCount;
    mutationsInWindow += mutationCount;
    peakDomMutationsPerSecond = Math.max(
      peakDomMutationsPerSecond,
      mutationsInWindow,
    );
    if (
      mutationsInWindow > props.contract.limits.domMutationsPerSecond
    ) {
      suspend(
        `DOM 变更超过 ${props.contract.limits.domMutationsPerSecond} 次/秒预算`,
      );
      return;
    }
    publishAudit();
  });
  mutationObserver.observe(mountPoint, {
    attributes: true,
    characterData: true,
    childList: true,
    subtree: true,
  });

  remoteApp = createApp(props.component);
  remoteApp.provide(REMOTE_RUNTIME_KEY, runtimeBridge);
  remoteApp.config.errorHandler = (error) => {
    suspend(error instanceof Error ? error.message : "远程组件运行异常");
  };

  try {
    remoteApp.mount(mountPoint);
    auditTimer = window.setInterval(() => finishMutationWindow(), 250);
    publishAudit();
    emit("ready");
  } catch (error) {
    suspend(error instanceof Error ? error.message : "远程组件挂载失败");
  }
}

onMounted(mountRemoteComponent);

watch(
  () => props.component,
  () => mountRemoteComponent(),
);

onBeforeUnmount(() => {
  cleanupManagedResources();
  state.value = "unmounted";
  publishAudit();
  shadowRoot?.replaceChildren();
});
</script>

<template>
  <div
    ref="hostElement"
    class="remote-component-host"
    :data-sandbox-state="state"
  ></div>
</template>

<style scoped>
.remote-component-host {
  display: block;
  width: min(510px, 100%);
}
</style>
