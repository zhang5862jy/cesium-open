<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import * as C from "cesium";
import Map from "ol/Map.js";
import View from "ol/View.js";
import ImageLayer from "ol/layer/Image.js";
import ImageStatic from "ol/source/ImageStatic.js";
import "ol/ol.css";
import {
  DEFAULT_CALLOUT_STYLE,
  DEFAULT_COMPACT_CALLOUT_STYLE,
  DEFAULT_TITLE_CALLOUT_STYLE,
  TargetCalloutManager,
  type CalloutDisplayMode,
  type CalloutStyleSection,
  type TargetCalloutStyle,
  type WorkerCalloutHandle,
} from "cesium-screen-callout";
import { AFFILIATIONS, createTargetClassifications, type TargetClassification } from "../target-callout/classification";
import { compactFieldFormatter } from "../target-callout/compactFieldFormatter";
import { simulate, type SimulationConfig } from "../target-callout/simulation";

const mapElement = ref<HTMLDivElement>();
const count = ref(120);
const running = ref(true);
const ready = ref(false);
const panelCollapsed = ref(false);
const error = ref("");
const selectedIndex = ref(0);
const selectedDisplayMode = ref<CalloutDisplayMode>("detailed");
const selectedFixed = ref(false);
const selectedVisible = ref(true);
const hoverStatus = ref("移动鼠标到标牌上查看交互状态");
const lastAction = ref("等待地图就绪");
const scope = ref("selected");
const styleMode = ref<CalloutStyleSection>("detailed");
const affiliationGroups = reactive({
  detailed: AFFILIATIONS.map(item => ({ ...item, colors: { ...item.colors } })),
  compact: AFFILIATIONS.map(item => ({ ...item, colors: { ...item.colors } })),
  title: AFFILIATIONS.map(item => ({ ...item, colors: { ...item.colors } })),
});
const classificationsByStyle: Record<CalloutStyleSection, readonly TargetClassification[]> = { detailed: [], compact: [], title: [] };
const affiliations = computed(() => affiliationGroups[styleMode.value]);
const selectedAffiliationId = ref(AFFILIATIONS[0]!.id);
const selectedAffiliation = computed(() => affiliations.value.find(item => item.id === selectedAffiliationId.value) ?? affiliations.value[0]!);
const selectedTitle = ref("");
const selectedBadgeText = ref("A");
const avoidanceMode = ref<CalloutDisplayMode>("detailed");
const avoidance = reactive({
  detailed: { enabled: true, gap: 6, maxDisplacement: 160 },
  compact: { enabled: true, gap: 4, maxDisplacement: 80 },
});
const currentAvoidance = computed(() => avoidance[avoidanceMode.value]);
const editor = reactive({ fontSize: 14, textColor: "#70d5ff", borderColor: "#70d5ff", showBorder: true, showLeader: true });
const metrics = reactive({ visible: 0, layoutMs: 0, moved: 0, unresolved: 0 });
const note = ref("人工备注：待核实");
const originFrame = C.Matrix4.toArray(C.Transforms.eastNorthUpToFixedFrame(C.Cartesian3.fromDegrees(110, 32, 1800)));
const viewProjection = C.Matrix4.toArray(C.Matrix4.IDENTITY);
const camera = [0, 0, 100000000];
let map: Map | undefined;
let manager: TargetCalloutManager | undefined;
let simulationConfig: SimulationConfig | undefined;
let animationId = 0;
let seconds = 0;
let lastFrame = 0;
let lastUpdate = 0;
let lastMetrics = 0;
let requestId = 0;
let generation = 0;
let disposed = false;
const editedTitles = new Set<number>();
let sourceTitles: string[] = [];

function selected(): WorkerCalloutHandle | undefined {
  return manager?.callouts[selectedIndex.value];
}
function affected(): readonly WorkerCalloutHandle[] {
  const handle = selected();
  return scope.value === "all" ? manager?.callouts ?? [] : handle ? [handle] : [];
}
function syncSelection(): void {
  const handle = selected();
  if (!handle) return;
  selectedDisplayMode.value = handle.getDisplayMode();
  selectedFixed.value = handle.isScreenFixed();
  selectedVisible.value = handle.getShow();
  selectedTitle.value = handle.getTitle();
  selectedBadgeText.value = handle.getBadgeText();
  selectedAffiliationId.value = classificationsByStyle[styleMode.value][handle.index]?.affiliation.id ?? AFFILIATIONS[0]!.id;
  const style = handle.getStyle(styleMode.value);
  for (const key of ["fontSize", "textColor", "borderColor", "showBorder", "showLeader"] as const) {
    Object.assign(editor, { [key]: style[key] });
  }
}
function selectHandle(handle: WorkerCalloutHandle): void {
  selectedIndex.value = handle.index;
  syncSelection();
}
watch([selectedIndex, styleMode], syncSelection);
watch(avoidance, () => {
  if (!manager || !ready.value) return;
  for (const mode of ["detailed", "compact"] as const) {
    const options = avoidance[mode];
    manager.setAvoidance({
      enabled: options.enabled,
      gap: Math.max(0, Math.min(200, Number(options.gap) || 0)),
      maxDisplacement: Math.max(0, Math.min(5000, Number(options.maxDisplacement) || 0)),
    }, mode);
  }
}, { deep: true });

/** Exactly the same ECEF positions, detailed lines and structured fields as the 3D example. */
function sample() {
  if (!simulationConfig) throw new Error("目标模拟尚未初始化");
  // The shared simulator's Cesium visibility result is intentionally ignored:
  // the map backend determines 2D visibility with the current map projection.
  return simulate(simulationConfig, { id: ++requestId, seconds, viewProjection, camera });
}
function coordinate(handle: WorkerCalloutHandle): [number, number] {
  const position = C.Cartographic.fromCartesian(handle.getPosition());
  return [C.Math.toDegrees(position.longitude), C.Math.toDegrees(position.latitude)];
}
function focusSelected(): void {
  const handle = selected();
  const size = map?.getSize();
  if (!map || !size || !handle) return;
  map.getView().cancelAnimations();
  map.getView().setResolution(0.00022);
  // Leave room on the right and above the target for its full detailed panel.
  map.getView().centerOn(coordinate(handle), size, [size[0]! * 0.25, size[1]! * 0.65]);
}
function overview(): void {
  if (!manager || !map) return;
  const extent = [Infinity, Infinity, -Infinity, -Infinity];
  for (const handle of manager.callouts) {
    const [x, y] = coordinate(handle);
    extent[0] = Math.min(extent[0]!, x); extent[1] = Math.min(extent[1]!, y);
    extent[2] = Math.max(extent[2]!, x); extent[3] = Math.max(extent[3]!, y);
  }
  map.getView().fit(extent, { padding: [100, 150, 70, 70], duration: 300, maxZoom: 12 });
}
function toggleMode(): void {
  selected()?.toggleDisplayMode();
  syncSelection();
}
function setMode(mode: CalloutDisplayMode): void {
  for (const handle of affected()) handle.setDisplayMode(mode);
  syncSelection();
}
function toggleFixed(): void {
  const handle = selected();
  if (handle && !handle.setScreenFixed(!handle.isScreenFixed())) {
    lastAction.value = "请先定位当前目标，使标牌进入视野后再固定";
  }
  syncSelection();
}
function toggleVisible(): void {
  const handle = selected();
  if (handle) handle.setShow(!handle.getShow());
  syncSelection();
}
function showAll(): void {
  for (const handle of manager?.callouts ?? []) handle.setShow(true);
  syncSelection();
}
function applyStyle(patch: Partial<TargetCalloutStyle>): void {
  for (const handle of affected()) handle.setStyle(patch, styleMode.value);
  syncSelection();
}
function setFontSize(): void {
  applyStyle({ fontSize: Math.max(8, Math.min(48, Number(editor.fontSize) || 14)) });
}
function applyTitle(): void {
  editedTitles.add(selectedIndex.value);
  selected()?.setTitle(selectedTitle.value);
}
function applyBadge(): void { selected()?.setBadgeText(selectedBadgeText.value); }
function setAffiliationBadgeColor(key: "badgeColor" | "badgeTextColor", event: Event): void {
  const value = (event.target as HTMLInputElement).value;
  const affiliation = selectedAffiliation.value;
  affiliation.colors[key] = value;
  for (const handle of manager?.callouts ?? []) {
    if (classificationsByStyle[styleMode.value][handle.index]?.affiliation.id === affiliation.id) {
      handle.setStyle({ [key]: value }, styleMode.value);
    }
  }
}
function resetOffsets(): void {
  for (const handle of affected()) {
    handle.setScreenFixed(false);
    handle.setOffset(new C.Cartesian2(40, -30));
  }
  syncSelection();
}
function overrideText(): void {
  selected()?.setLines([note.value]);
}
function restoreText(): void {
  selected()?.resetOverrides(["lines"]);
  editedTitles.delete(selectedIndex.value);
  selected()?.setTitle(sourceTitles[selectedIndex.value] ?? "");
  syncSelection();
}

async function createManager(): Promise<void> {
  if (!map) return;
  const token = ++generation;
  ready.value = false;
  error.value = "";
  manager?.destroy();
  manager = undefined;
  selectedIndex.value = 0;
  seconds = 0;
  lastFrame = 0;
  lastUpdate = 0;
  editedTitles.clear();
  for (const section of ["detailed", "compact", "title"] as const) {
    classificationsByStyle[section] = createTargetClassifications(count.value, 0x6ca11007, undefined, affiliationGroups[section]);
  }
  const classifications = classificationsByStyle.detailed;
  simulationConfig = {
    count: count.value,
    columns: Math.ceil(Math.sqrt(count.value * 1.5)),
    frame: originFrame,
    classifications: classifications.map(item => ({ platform: item.platform.name, affiliation: item.affiliation.name })),
  };
  const initial = sample();
  sourceTitles = initial.titles.map(row => row.title);
  try {
    const created = new TargetCalloutManager({
      map,
      targets: classifications.map((classification, index) => ({
        id: `target-${index + 1}`,
        position: new C.Cartesian3(initial.positions[index * 3]!, initial.positions[index * 3 + 1]!, initial.positions[index * 3 + 2]!),
        lines: initial.lines[index]!.text,
        title: initial.titles[index]!.title,
        badgeText: ["A", "B", "C"][index % 3]!,
        fields: initial.fields[index]!.fields,
        // A small mixed group makes independent display modes easy to inspect.
        displayMode: index % 4 === 3 ? "compact" : "detailed",
        offset: new C.Cartesian2(40, -30),
        style: { ...classification.affiliation.colors, fontSize: 13 },
        compactStyle: { ...classificationsByStyle.compact[index]!.affiliation.colors },
        titleStyle: { ...classificationsByStyle.title[index]!.affiliation.colors },
      })),
      defaultStyle: { ...DEFAULT_CALLOUT_STYLE, backgroundColor: "rgba(12, 24, 38, 0.88)", paddingTop: 8, paddingBottom: 8 },
      defaultCompactStyle: { ...DEFAULT_COMPACT_CALLOUT_STYLE, backgroundColor: "rgba(12, 24, 38, 0.9)" },
      defaultTitleStyle: { ...DEFAULT_TITLE_CALLOUT_STYLE, backgroundColor: "rgba(24, 44, 65, 0.95)" },
      compactFieldFormatter,
      avoidance: avoidance.detailed,
      draggable: true,
      hoverActions: true,
      onSelect: selectHandle,
      onClick: handle => {
        selectHandle(handle);
        lastAction.value = `已点击目标 ${handle.index + 1}`;
      },
      onDoubleClick: handle => {
        selectHandle(handle);
        lastAction.value = `已双击目标 ${handle.index + 1}，切换简标 / 详标`;
      },
      onDragEnd: handle => {
        selectHandle(handle);
        lastAction.value = `目标 ${handle.index + 1} 拖拽结束，已重新计算避让`;
      },
      onDisplayModeChange: handle => {
        if (selectedIndex.value === handle.index) syncSelection();
        lastAction.value = `目标 ${handle.index + 1} 已切换为${handle.getDisplayMode() === "compact" ? "简标" : "详标"}`;
      },
      onStats: stats => {
        metrics.visible = stats.visibleCount;
        metrics.layoutMs = Math.round(stats.layoutMs * 10) / 10;
      },
      onError: cause => { error.value = cause.message; running.value = false; },
    });
    manager = created;
    created.setAvoidance(avoidance.compact, "compact");
    created.onHover("mouseenter", ({ callout }) => { hoverStatus.value = `悬停：目标 ${callout.index + 1}`; });
    created.onHover("mouseleave", () => { hoverStatus.value = "移动鼠标到标牌上查看交互状态"; });
    created.onHover("fixedchange", ({ callout }) => {
      selectHandle(callout);
      lastAction.value = `目标 ${callout.index + 1} ${callout.isScreenFixed() ? "已固定到屏幕" : "已取消固定"}`;
    });
    created.onHover("close", ({ callout }) => {
      selectHandle(callout);
      lastAction.value = `目标 ${callout.index + 1} 已关闭，可在面板中重新显示`;
    });
    await created.ready;
    if (disposed || token !== generation) return;
    ready.value = true;
    syncSelection();
    map.updateSize();
    focusSelected();
    lastAction.value = "地图已就绪，可拖拽或双击标牌";
  } catch (cause) {
    if (disposed || token !== generation) return;
    error.value = cause instanceof Error ? cause.message : String(cause);
    manager?.destroy();
    manager = undefined;
  }
}
function tick(now: number): void {
  if (disposed) return;
  const elapsed = lastFrame ? Math.min(100, now - lastFrame) : 0;
  lastFrame = now;
  if (running.value && ready.value && manager) {
    seconds += elapsed / 1000;
    if (now - lastUpdate >= 200) {
      lastUpdate = now;
      try {
        const result = sample();
        sourceTitles = result.titles.map(row => row.title);
        manager.updateTargets({ positions: result.positions,
          titles: result.titles.filter(row => !editedTitles.has(row.index)), lines: result.lines, fields: result.fields }, true);
      } catch (cause) {
        error.value = cause instanceof Error ? cause.message : String(cause);
        running.value = false;
      }
    }
  }
  if (ready.value && manager && now - lastMetrics >= 250) {
    lastMetrics = now;
    const stats = manager.getAvoidanceStats(avoidanceMode.value);
    metrics.moved = stats.moved;
    metrics.unresolved = stats.unresolved;
    metrics.visible = manager.getStats().visibleCount;
  }
  animationId = requestAnimationFrame(tick);
}
watch(count, () => { void createManager(); });

onMounted(async () => {
  if (!mapElement.value) return;
  try {
    const layers = ([[-180, -90, 0, 90], [0, -90, 180, 90]] as const).map((extent, index) => new ImageLayer({
      source: new ImageStatic({
        url: C.buildModuleUrl(`Assets/Textures/NaturalEarthII/0/${index}/0.jpg`),
        projection: "EPSG:4326",
        imageExtent: [...extent],
        attributions: "Natural Earth · 本地影像",
      }),
    }));
    map = new Map({
      target: mapElement.value,
      layers,
      view: new View({ projection: "EPSG:4326", center: [110, 32], resolution: 0.00022, minZoom: 1, maxZoom: 20 }),
    });
    animationId = requestAnimationFrame(tick);
    await createManager();
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  }
});
onUnmounted(() => {
  disposed = true;
  generation++;
  cancelAnimationFrame(animationId);
  manager?.destroy();
  manager = undefined;
  map?.setTarget(undefined);
  map?.dispose();
  map = undefined;
});
</script>

<template>
  <section class="example" :class="{ collapsed: panelCollapsed }">
    <div class="map-area">
      <div ref="mapElement" class="map" tabindex="0" aria-label="二维目标地图"></div>
      <div class="map-heading"><strong>二维移动目标标牌</strong><span>OpenLayers · 本地底图</span></div>
      <button v-if="panelCollapsed" class="expand" @click="panelCollapsed = false" aria-label="展开二维标牌设置">展开设置</button>
      <div class="map-status" role="status">{{ ready ? `${metrics.visible} / ${count} 个可见` : "正在加载地图…" }} · {{ running ? "运动中" : "已暂停" }}</div>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
    </div>
    <aside v-show="!panelCollapsed" class="panel">
      <div class="panel-title"><h2>标牌设置</h2><button @click="panelCollapsed = true" aria-label="收起二维标牌设置">收起</button></div>
      <p class="hint">拖动地图浏览，拖动标牌调整位置；双击切换简标 / 详标。详标标题右侧有固定、关闭小圆按钮；标题和简标左侧的属方色方块显示独立字母。</p>
      <label>目标数量<select v-model.number="count" aria-label="二维目标数量"><option v-for="value in [30, 120, 300, 1000]" :key="value" :value="value">{{ value }} 个</option></select></label>
      <div class="buttons"><button :disabled="!ready" @click="running = !running">{{ running ? "暂停运动" : "继续运动" }}</button><button :disabled="!ready" @click="overview">总览全部</button></div>
      <fieldset :disabled="!ready">
        <legend>当前目标</legend>
        <label>选择目标<select v-model.number="selectedIndex" aria-label="二维当前目标"><option v-for="index in count" :key="index" :value="index - 1">目标 {{ String(index).padStart(3, "0") }}</option></select></label>
        <p class="selection">{{ selectedDisplayMode === "compact" ? "简标" : "详标" }} · {{ selectedFixed ? "屏幕固定" : "跟随目标" }} · {{ selectedVisible ? "显示" : "已隐藏" }}</p>
        <div class="buttons"><button @click="focusSelected">定位当前目标</button><button @click="toggleMode" aria-label="切换二维当前标牌显示模式">切换为{{ selectedDisplayMode === "compact" ? "详标" : "简标" }}</button></div>
        <div class="buttons"><button @click="toggleFixed">{{ selectedFixed ? "取消固定" : "固定到屏幕" }}</button><button @click="toggleVisible">{{ selectedVisible ? "隐藏当前" : "显示当前" }}</button></div>
        <button @click="showAll">显示全部标牌</button>
        <label>独立标题<input v-model="selectedTitle" type="text" maxlength="120" aria-label="二维当前目标标题" /></label>
        <button @click="applyTitle">应用当前标题</button>
        <label>标记字母<select v-model="selectedBadgeText" aria-label="二维当前目标标记字母" @change="applyBadge"><option v-for="letter in ['A', 'B', 'C']" :key="letter" :value="letter">{{ letter }}</option></select></label>
        <p class="hint">标题和字母只修改当前目标；简标与详标标题共用该字母。</p>
        <p class="hint" role="status">{{ hoverStatus }}<br />{{ lastAction }}</p>
      </fieldset>
      <fieldset :disabled="!ready">
        <legend>独立避让配置</legend>
        <label>配置模式<select v-model="avoidanceMode" aria-label="二维避让配置模式"><option value="detailed">详标</option><option value="compact">简标</option></select></label>
        <label class="check"><input v-model="currentAvoidance.enabled" type="checkbox" aria-label="二维开启避让" />开启避让</label>
        <label>间距（px）<input v-model.number="currentAvoidance.gap" type="number" min="0" max="200" :disabled="!currentAvoidance.enabled" aria-label="二维避让间距" /></label>
        <label>附近避让半径（px）<input v-model.number="currentAvoidance.maxDisplacement" type="number" min="0" max="5000" step="10" :disabled="!currentAvoidance.enabled" aria-label="二维避让半径" /></label>
        <p class="hint">两种模式分别避让。拖拽期间暂停计算，松手后优先少移动标牌；空间不足时允许重叠。关闭避让会保留当前位置。</p>
        <p class="hint">无碰撞时保持偏移，允许随地图移出视口。只有本次碰撞修复前完整在屏内的标牌，才保护它不被修复推出；已经越界的不会拉回。避让直接落位，无过渡动画。</p>
        <p class="selection">已移动 {{ metrics.moved }} 个 · 未解冲突 {{ metrics.unresolved }} 个</p>
      </fieldset>
      <fieldset :disabled="!ready">
        <legend>样式与批量操作</legend>
        <label>操作范围<select v-model="scope" aria-label="二维配置范围"><option value="selected">仅当前目标</option><option value="all">全部标牌</option></select></label>
        <label>样式模式<select v-model="styleMode" aria-label="二维样式配置模式"><option value="detailed">详标正文样式</option><option value="compact">简标样式</option><option value="title">详标标题样式</option></select></label>
        <label>字号（px）<input v-model.number="editor.fontSize" type="number" min="8" max="48" aria-label="二维标牌字号" @change="setFontSize" /></label>
        <label>文字颜色<input v-model="editor.textColor" type="color" aria-label="二维标牌文字颜色" @input="applyStyle({ textColor: editor.textColor })" /></label>
        <label>边框颜色<input v-model="editor.borderColor" type="color" aria-label="二维标牌边框颜色" @input="applyStyle({ borderColor: editor.borderColor })" /></label>
        <div class="buttons checks"><label class="check"><input v-model="editor.showBorder" type="checkbox" @change="applyStyle({ showBorder: editor.showBorder })" />显示边框</label><label v-if="styleMode !== 'title'" class="check"><input v-model="editor.showLeader" type="checkbox" @change="applyStyle({ showLeader: editor.showLeader })" />牵引线</label></div>
        <p class="hint">正文、简标、标题三套样式分别保存。标题属于详标，同正文一起参与详标避让。</p>
        <template v-if="styleMode !== 'detailed'">
          <label>属方方块配置<select v-model="selectedAffiliationId" aria-label="二维待配置属方"><option v-for="item in affiliations" :key="item.id" :value="item.id">{{ item.name }}</option></select></label>
          <label>属方方块颜色<input :value="selectedAffiliation.colors.badgeColor" type="color" aria-label="二维属方方块颜色" @input="setAffiliationBadgeColor('badgeColor', $event)" /></label>
          <label>方块字母颜色<input :value="selectedAffiliation.colors.badgeTextColor" type="color" aria-label="二维方块字母颜色" @input="setAffiliationBadgeColor('badgeTextColor', $event)" /></label>
          <p class="hint">方块颜色按当前样式模式应用到全部同属方目标，不改变各目标的字母。</p>
        </template>
        <div class="buttons"><button @click="setMode('compact')">设为简标</button><button @click="setMode('detailed')">设为详标</button></div>
        <button @click="resetOffsets">重置所选范围偏移</button>
        <p class="hint">简标只显示字段值，以一个空格分隔；复用三维示例的字段处理函数。</p>
      </fieldset>
      <details>
        <summary>当前目标详标正文备注</summary>
        <label>备注<input v-model="note" type="text" maxlength="120" aria-label="二维当前目标备注" /></label>
        <div class="buttons"><button :disabled="!ready" @click="overrideText">替换详标文字</button><button :disabled="!ready" @click="restoreText">恢复实时数据</button></div>
        <p class="hint">备注只覆盖正文，独立标题继续显示；恢复会还原最新源标题和正文。</p>
      </details>
      <p class="hint">每 200 ms 更新目标数据 · 布局 {{ metrics.layoutMs }} ms</p>
    </aside>
  </section>
</template>

<style scoped>
.example { display: grid; grid-template-columns: minmax(0, 1fr) 300px; height: 100%; min-height: 480px; color: #dbe7f5; background: #0e1927; font: 13px/1.5 sans-serif; }
.example.collapsed { grid-template-columns: minmax(0, 1fr); }
.map-area { position: relative; min-width: 0; overflow: hidden; }
.map { width: 100%; height: 100%; background: #14283a; }
.map-heading { position: absolute; top: 16px; left: 54px; display: flex; flex-direction: column; padding: 8px 12px; border-radius: 6px; background: rgb(12 24 38 / 86%); pointer-events: none; }
.map-heading strong { font-size: 15px; }
.map-heading span { color: #95aec8; font-size: 11px; }
.map-status { position: absolute; bottom: 12px; left: 12px; padding: 6px 10px; border-radius: 5px; background: rgb(12 24 38 / 86%); pointer-events: none; }
.panel { padding: 16px; overflow: auto; border-left: 1px solid #314258; background: #152234; }
.panel-title { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
h2 { margin: 0; font-size: 17px; }
.hint { color: #9eb2c9; font-size: 11px; line-height: 1.7; }
.selection { margin: 8px 0; color: #93d6ff; font-size: 12px; }
fieldset { min-width: 0; margin: 16px 0; padding: 10px; border: 1px solid #3a4b61; border-radius: 6px; }
legend { padding: 0 5px; color: #edf5ff; font-weight: 600; }
label { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin: 9px 0; }
input, select, button { min-width: 0; border: 1px solid #4c607b; border-radius: 4px; color: #e7f1ff; background: #22364d; font: inherit; }
input, select { padding: 5px 6px; width: 114px; }
input[type="number"] { width: 80px; }
input[type="color"] { width: 58px; height: 30px; padding: 2px; }
.check { justify-content: flex-start; }
input[type="checkbox"] { width: auto; margin: 0; accent-color: #59b5f5; }
button { padding: 6px 9px; cursor: pointer; }
button:hover:not(:disabled) { border-color: #7bc7fb; background: #2d4a68; }
button:focus-visible, input:focus-visible, select:focus-visible { outline: 2px solid #7bc7fb; outline-offset: 2px; }
button:disabled, fieldset:disabled { opacity: 0.55; }
.buttons { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; }
.buttons button { flex: 1; white-space: nowrap; }
.checks { gap: 20px; }
.checks label { margin: 4px 0; }
.expand { position: absolute; right: 12px; top: 16px; }
summary { cursor: pointer; color: #c4dcf5; }
.error { position: absolute; bottom: 50px; left: 12px; right: 12px; padding: 10px; color: #ffd0c8; background: #522d2b; border: 1px solid #db7870; border-radius: 5px; }
@media (max-width: 1050px) {
  .example { grid-template-columns: minmax(0, 1fr); }
  .panel { position: absolute; z-index: 4; right: 0; top: 0; bottom: 0; width: 270px; box-sizing: border-box; box-shadow: -5px 0 20px rgb(0 0 0 / 25%); }
}
</style>
