<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import { useMovingTargetLod } from "./useMovingTargetLod";

const container = ref<HTMLDivElement>();
const controlsOpen = ref(false);
const settingsButton = ref<HTMLButtonElement>();
const closeButton = ref<HTMLButtonElement>();

function setControlsOpen(open: boolean): void {
  controlsOpen.value = open;
  // 等待抽屉可见性更新后再移动焦点，关闭时回到触发按钮。
  void nextTick(() => {
    if (open) closeButton.value?.focus();
    else settingsButton.value?.focus();
  });
}

function trapControlsFocus(event: KeyboardEvent): void {
  // 仅窄屏抽屉限制 Tab 焦点范围；宽屏关闭按钮不可见，侧栏沿用正常焦点顺序。
  if (!controlsOpen.value || !closeButton.value?.getClientRects().length)
    return;
  const panel = event.currentTarget as HTMLElement;
  const controls = panel.querySelectorAll<HTMLElement>(
    "button:not(:disabled), input:not(:disabled)",
  );
  const first = controls[0];
  const last = controls[controls.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
}
const {
  metric,
  paused,
  enabled,
  speed,
  cameraHeight,
  stats,
  error,
  setCameraHeight,
  reset,
  targetCount,
} = useMovingTargetLod(container);

const focusLabel = computed(() => {
  if (stats.focusLevel === 0) return "飞机模型";
  if (stats.focusLevel === 1) return "Billboard";
  return "已隐藏";
});
</script>

<template>
  <div class="lod-example" @keydown.esc="setControlsOpen(false)">
    <div class="lod-layout" :class="{ 'controls-open': controlsOpen }">
      <aside
        id="lod-controls"
        class="panel"
        aria-labelledby="panel-title"
        @keydown.tab="trapControlsFocus"
      >
        <button
          ref="closeButton"
          class="panel-close"
          type="button"
          aria-label="关闭参数面板"
          @click="setControlsOpen(false)"
        >
          关闭
        </button>
        <div class="eyebrow">PRIMITIVE / LOD</div>
        <h1 id="panel-title">移动目标 LOD</h1>
        <p class="intro">
          注册一次，持续移动。已有模型与图标由同一个管理器切换。
        </p>

        <div class="loading" role="status">
          <span
            class="status-dot"
            :class="{ ready: stats.loaded === targetCount }"
          ></span>
          {{
            stats.loaded === targetCount ? "全部目标已注册" : "正在准备本地模型"
          }}
          <strong>{{ stats.loaded }} / {{ targetCount }}</strong>
        </div>

        <section aria-labelledby="metric-title">
          <h2 id="metric-title">01 / 切换依据</h2>
          <div class="segmented">
            <button
              type="button"
              :aria-pressed="metric === 'distance'"
              @click="metric = 'distance'"
            >
              到目标的距离
            </button>
            <button
              type="button"
              :aria-pressed="metric === 'cameraHeight'"
              @click="metric = 'cameraHeight'"
            >
              相机高度
            </button>
          </div>
          <p class="help">
            {{
              metric === "distance"
                ? "每个目标独立判断。相机不动，目标移动也会切换。"
                : "所有目标按同一相机椭球高度切换；与离地高度不同。"
            }}
          </p>
          <div class="levels">
            <div>
              <i class="model-dot"></i><span>0—12 km</span
              ><strong>飞机模型</strong>
            </div>
            <div>
              <i class="billboard-dot"></i><span>12—24 km</span
              ><strong>Billboard</strong>
            </div>
            <div>
              <i class="hidden-dot"></i><span>24 km 以上</span
              ><strong>全部隐藏</strong>
            </div>
          </div>
          <p class="help small">边界设有 ±400 m 滞回，避免往返抖动。</p>
        </section>

        <section aria-labelledby="camera-title">
          <h2 id="camera-title">02 / 调整相机</h2>
          <label class="range-label" for="camera-height"
            >定位高度 <output>{{ cameraHeight }} km</output></label
          >
          <input
            id="camera-height"
            v-model.number="cameraHeight"
            type="range"
            min="3"
            max="40"
            step="0.5"
            @input="setCameraHeight(cameraHeight)"
          />
          <div class="camera-buttons">
            <button type="button" @click="setCameraHeight(6)">近景 6 km</button>
            <button type="button" @click="setCameraHeight(18)">
              远景 18 km
            </button>
            <button type="button" @click="setCameraHeight(32)">
              超距 32 km
            </button>
          </div>
          <p class="help small">滚轮缩放 · 右键拖动旋转 · 按钮返回中心视角</p>
        </section>

        <section aria-labelledby="motion-title">
          <h2 id="motion-title">03 / 目标运动</h2>
          <label class="range-label" for="motion-speed"
            >移动速度 <output>{{ speed.toFixed(1) }}×</output></label
          >
          <input
            id="motion-speed"
            v-model.number="speed"
            type="range"
            min="0.2"
            max="3"
            step="0.2"
          />
          <div class="actions">
            <button type="button" @click="paused = !paused">
              {{ paused ? "继续运动" : "暂停运动" }}
            </button>
            <button
              type="button"
              :aria-pressed="!enabled"
              @click="enabled = !enabled"
            >
              {{ enabled ? "隐藏所有目标" : "显示所有目标" }}
            </button>
            <button class="reset" type="button" @click="reset">重置演示</button>
          </div>
        </section>

        <div class="api-note">
          <code>add() <span>一次注册</span></code>
          <code>setPosition() <span>持续更新位置</span></code>
          <code>update() <span>统一选择层级</span></code>
          <p>隐藏保留资源；已有对象不会因切换而重建。</p>
        </div>
      </aside>

      <button
        v-if="controlsOpen"
        class="panel-backdrop"
        type="button"
        tabindex="-1"
        aria-label="关闭参数面板遮罩"
        @click="setControlsOpen(false)"
      ></button>

      <div class="scene-area" role="region" aria-label="场景预览">
        <header class="scene-toolbar">
          <div class="scene-heading">
            <strong class="scene-title">移动目标 LOD</strong>
            <span class="live-dot" :class="{ paused }"></span>
            <span>{{ paused ? "已暂停" : "实时运动" }}</span>
            <span class="mode-badge">{{
              metric === "distance" ? "距离 LOD" : "高度 LOD"
            }}</span>
          </div>
          <button
            ref="settingsButton"
            class="settings-button"
            type="button"
            aria-controls="lod-controls"
            :aria-expanded="controlsOpen"
            @click="setControlsOpen(!controlsOpen)"
          >
            参数设置
          </button>
        </header>
        <div class="scene-summary">
          <div class="metrics" aria-label="当前层级数量">
            <div class="model-count">
              <strong>{{ stats.models }}</strong
              ><span>模型</span>
            </div>
            <div class="billboard-count">
              <strong>{{ stats.billboards }}</strong
              ><span>图标</span>
            </div>
            <div>
              <strong>{{ stats.hidden }}</strong
              ><span>隐藏</span>
            </div>
            <p>按规则统计，包含视野外目标</p>
          </div>
          <div class="focus-card">
            <div class="focus-title">
              观察目标 001 <span>{{ focusLabel }}</span>
            </div>
            <p>
              到相机 <strong>{{ stats.focusDistance.toFixed(2) }} km</strong>
            </p>
            <p class="help">保持相机不动，观察它自己穿越切换边界。</p>
          </div>
        </div>
        <div class="scene-viewport">
          <div ref="container" class="cesium-container"></div>
          <div v-if="error" class="error" role="alert">{{ error }}</div>
        </div>
        <footer class="scene-footer">
          <span
            >相机高度 <strong>{{ stats.height.toFixed(1) }} km</strong></span
          >
          <span
            >层级变更 <strong>{{ stats.switches }}</strong></span
          >
          <span
            >LOD 判断
            <strong>{{ stats.milliseconds.toFixed(2) }} ms</strong></span
          >
          <span
            ><strong>{{ stats.fps }}</strong> FPS</span
          >
        </footer>
      </div>
    </div>
  </div>
</template>

<style scoped>
.lod-example {
  position: relative;
  /* 依据示例实际可用宽度切换布局，兼容外层目录栏或应用侧边面板。 */
  container: lod / inline-size;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  color: #dce8f1;
  background: #0a1520;
  font-size: 13px;
}
.lod-layout {
  display: grid;
  /* 允许网格和子项收缩到容器内，避免 Cesium 画布或长内容撑开页面。 */
  grid-template-columns: 292px minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr);
  height: 100%;
  min-height: 0;
}
.panel {
  position: relative;
  z-index: 1;
  min-width: 0;
  min-height: 0;
  padding: 24px 20px;
  /* 参数较多时只滚动侧栏，保持地图区域的位置与尺寸稳定。 */
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: #425b6d transparent;
  border-right: 1px solid #2b3b4a;
  background: #101d2a;
}
.panel-close,
.panel-backdrop,
.settings-button {
  display: none;
}
.eyebrow {
  color: #79cfcb;
  font-size: 10px;
  letter-spacing: 0.18em;
  margin-bottom: 10px;
}
h1 {
  font-size: 25px;
  font-weight: 600;
}
.intro {
  margin: 12px 0 18px;
  color: #98acbc;
  line-height: 1.8;
}
.loading {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 11px;
  color: #9cabb9;
}
.loading strong {
  margin-left: auto;
  color: #dce8f1;
  font-variant-numeric: tabular-nums;
}
.status-dot,
.live-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #ffca78;
  display: inline-block;
}
.status-dot.ready,
.live-dot {
  background: #71e6e3;
}
.live-dot.paused {
  background: #ffca78;
}
section {
  margin-top: 25px;
}
h2 {
  color: #8da0b0;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.06em;
  margin-bottom: 12px;
}
button {
  cursor: pointer;
  color: #bdcbd6;
  border: 1px solid #334554;
  background: #192a38;
  border-radius: 5px;
  padding: 8px 10px;
  font-size: 12px;
}
button:hover {
  background: #243d4d;
  color: #fff;
}
button:focus-visible,
input:focus-visible {
  outline: 2px solid #71e6e3;
  outline-offset: 3px;
}
button[aria-pressed="true"] {
  color: #8ef1eb;
  background: #1d4148;
  border-color: #428c8c;
}
.segmented {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}
.help {
  color: #8ca1b2;
  font-size: 12px;
  line-height: 1.7;
  margin-top: 10px;
}
.small {
  font-size: 11px;
}
.levels {
  display: grid;
  gap: 12px;
  margin-top: 18px;
}
.levels > div {
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: 12px;
}
.levels strong {
  margin-left: auto;
  font-weight: 500;
}
.levels i {
  width: 7px;
  height: 7px;
  border-radius: 2px;
}
.model-dot {
  background: #71e6e3;
}
.billboard-dot {
  background: #ffca78;
}
.hidden-dot {
  background: #637584;
}
.range-label {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 12px;
}
output {
  color: #8ce4df;
  font-variant-numeric: tabular-nums;
}
input[type="range"] {
  width: 100%;
  accent-color: #71e6e3;
  cursor: pointer;
}
.camera-buttons {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 5px;
  margin-top: 10px;
}
.camera-buttons button {
  padding: 7px 2px;
  font-size: 11px;
}
.actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 7px;
  margin-top: 12px;
}
.reset {
  grid-column: 1 / -1;
  background: transparent;
}
.api-note {
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid #2b3b4a;
}
.api-note code {
  display: flex;
  justify-content: space-between;
  color: #8ce4df;
  line-height: 2;
  font-size: 11px;
}
.api-note code span {
  color: #92a3b2;
  font-family: inherit;
}
.api-note p {
  color: #72899b;
  font-size: 11px;
  line-height: 1.7;
  margin-top: 9px;
}
.scene-area {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
.scene-toolbar {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 48px;
  padding: 10px 18px;
  border-bottom: 1px solid #2b3b4a;
  background: #101d2a;
}
.scene-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  min-width: 0;
  font-size: 12px;
}
.scene-title {
  display: none;
  margin-right: 6px;
  font-size: 14px;
  font-weight: 600;
}
.live-dot {
  flex-shrink: 0;
}
.mode-badge {
  padding: 4px 8px;
  background: #112638d9;
  border: 1px solid #405363;
  border-radius: 4px;
  color: #9bb5c7;
  font-size: 11px;
}
.scene-summary {
  /* 统计信息占用正常文档流，避免窄屏时覆盖地图和 Cesium 控件。 */
  display: grid;
  flex: 0 0 auto;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  align-items: center;
  gap: 20px;
  padding: 12px 18px;
  border-bottom: 1px solid #2b3b4a;
  background: #132332;
}
.metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  min-width: 0;
  gap: 0 8px;
}
.metrics > div {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 3px 6px;
}
.metrics strong {
  font-size: 23px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}
.metrics span {
  color: #91a5b6;
  font-size: 11px;
}
.metrics p {
  grid-column: 1 / -1;
  color: #708b9d;
  font-size: 10px;
  margin-top: 5px;
}
.model-count strong {
  color: #71e6e3;
}
.billboard-count strong {
  color: #ffca78;
}
.focus-card {
  min-width: 0;
  padding-left: 20px;
  border-left: 1px solid #334554;
}
.focus-title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 4px 10px;
  margin-bottom: 5px;
}
.focus-title span {
  color: #ffca78;
  font-size: 11px;
}
.focus-card p {
  color: #91a5b6;
  font-size: 12px;
}
.focus-card strong {
  color: #dce8f1;
  margin-left: 8px;
  font-variant-numeric: tabular-nums;
}
.focus-card .help {
  font-size: 11px;
  margin-top: 5px;
}
.scene-viewport {
  position: relative;
  /* 地图取得工具栏、统计区和页脚之外的剩余高度，允许随容器缩小。 */
  flex: 1 1 0;
  min-height: 0;
  overflow: hidden;
}
.cesium-container {
  /* 画布尺寸由外层视口决定，不让画布自身尺寸反过来撑高布局。 */
  position: absolute;
  inset: 0;
}
.scene-footer {
  /* 页脚位于地图外，给 Cesium 底部版权信息保留独立空间。 */
  display: flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 6px 14px;
  padding: 10px 18px;
  border-top: 1px solid #2b3b4a;
  background: #101d2a;
  color: #a0b4c2;
  font-size: 11px;
}
.scene-footer > span {
  white-space: nowrap;
}
.scene-footer strong {
  color: #e1ecf3;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}
.error {
  position: absolute;
  top: 16px;
  left: 16px;
  right: 16px;
  max-height: calc(100% - 32px);
  overflow: auto;
  padding: 14px;
  background: #612b2bf2;
  color: #ffe3e3;
  border-radius: 6px;
  z-index: 3;
  overflow-wrap: anywhere;
}
/* 空间不足时将固定侧栏改为覆盖抽屉，让地图仍能使用整行宽度。 */
@container lod (max-width: 900px) {
  .lod-layout {
    grid-template-columns: minmax(0, 1fr);
  }
  .panel {
    position: absolute;
    inset: 0 auto 0 0;
    z-index: 4;
    width: min(320px, calc(100% - 40px));
    /* 仅移出屏幕仍会参与 Tab 顺序；visibility 同时禁用隐藏控件的焦点。 */
    visibility: hidden;
    transform: translateX(-100%);
    box-shadow: 8px 0 30px #0005;
  }
  .controls-open .panel {
    visibility: visible;
    transform: translateX(0);
  }
  .panel-close {
    display: block;
    position: absolute;
    top: 16px;
    right: 16px;
    padding: 5px 8px;
  }
  .panel-backdrop,
  .panel-backdrop:hover {
    display: block;
    position: absolute;
    inset: 0;
    z-index: 3;
    border: 0;
    border-radius: 0;
    background: #0008;
  }
  .settings-button {
    display: block;
    flex-shrink: 0;
    padding: 6px 10px;
  }
  .scene-title {
    display: inline;
  }
  .focus-card .help {
    display: none;
  }
}
/* 更窄时让统计与目标详情纵向排列，页脚则依靠 flex-wrap 自然换行。 */
@container lod (max-width: 480px) {
  .scene-toolbar {
    padding: 10px 12px;
  }
  .scene-title {
    flex-basis: 100%;
  }
  .scene-summary {
    grid-template-columns: minmax(0, 1fr);
    gap: 8px;
    padding: 10px 12px;
  }
  .metrics p {
    display: none;
  }
  .focus-card {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 4px 10px;
    padding: 8px 0 0;
    border-left: 0;
    border-top: 1px solid #334554;
  }
  .focus-title {
    margin-bottom: 0;
  }
  .scene-footer {
    padding: 8px 12px;
  }
}
</style>
