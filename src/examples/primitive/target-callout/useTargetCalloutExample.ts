import * as C from "cesium";
import { computed, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import {
  DEFAULT_CALLOUT_STYLE,
  DEFAULT_COMPACT_CALLOUT_STYLE,
  DEFAULT_TITLE_CALLOUT_STYLE,
  DEFAULT_TEXT_RENDERING,
  TargetCalloutManager,
  applyCalloutRenderQuality,
  type CalloutDisplayMode,
  type CalloutStyleSection,
  type TargetCalloutManagerStats,
  type TargetCalloutStyle,
  type WorkerCalloutHandle,
} from "cesium-screen-callout";
import {
  AFFILIATIONS,
  PLATFORM_FONT_FAMILIES,
  PLATFORM_TYPES,
  createTargetClassifications,
} from "./classification";
import {
  createLocalWorldBaseLayers,
  completeLocalWorldBaseLayer,
} from "../../../cesium/tools/localWorldImagery";
import { applyDefaultViewerConfig } from "../../../cesium/tools/viewerConfig";
import { simulate } from "./simulation";
import { TargetSimulationController } from "./TargetSimulationController";
import { CalloutPerformanceMonitor } from "./CalloutPerformanceMonitor";
import { CalloutStyleController } from "./CalloutStyleController";
import { compactFieldFormatter } from "./compactFieldFormatter";

/** 页面状态及生命周期：将用户操作连接到工具包和业务服务。 */
export function useTargetCalloutExample() {
  const TARGET_COUNT = 100;
  const GRID_COLUMNS = Math.ceil(Math.sqrt(TARGET_COUNT));
  const GRID_ROWS = Math.ceil(TARGET_COUNT / GRID_COLUMNS);
  const detailedPlatformTypes = reactive(PLATFORM_TYPES.map((item) => ({
    ...item,
    typography: { ...item.typography },
  })));
  const detailedAffiliations = reactive(AFFILIATIONS.map((item) => ({
    ...item,
    colors: { ...item.colors },
  })));
  const compactPlatformTypes = reactive(PLATFORM_TYPES.map((item) => ({
    ...item,
    typography: { ...item.typography, fontSize: DEFAULT_COMPACT_CALLOUT_STYLE.fontSize },
  })));
  const compactAffiliations = reactive(AFFILIATIONS.map((item) => ({
    ...item,
    colors: { ...item.colors },
  })));
  const titlePlatformTypes = reactive(PLATFORM_TYPES.map((item) => ({
    ...item,
    typography: { ...item.typography, fontSize: DEFAULT_TITLE_CALLOUT_STYLE.fontSize, fontWeight: DEFAULT_TITLE_CALLOUT_STYLE.fontWeight },
  })));
  const titleAffiliations = reactive(AFFILIATIONS.map((item) => ({ ...item, colors: { ...item.colors } })));
  const styleMode = ref<CalloutStyleSection>("detailed");
  const styleModeLabel = computed(() => ({ detailed: "详标正文", compact: "简标", title: "详标标题" })[styleMode.value]);
  const platformTypes = computed(() => styleMode.value === "title" ? titlePlatformTypes : styleMode.value === "compact" ? compactPlatformTypes : detailedPlatformTypes);
  const affiliations = computed(() => styleMode.value === "title" ? titleAffiliations : styleMode.value === "compact" ? compactAffiliations : detailedAffiliations);
  const classifications = createTargetClassifications(
    TARGET_COUNT,
    0x6ca11007,
    detailedPlatformTypes,
    detailedAffiliations,
  );
  const compactClassifications = createTargetClassifications(
    TARGET_COUNT, 0x6ca11007, compactPlatformTypes, compactAffiliations,
  );
  const titleClassifications = createTargetClassifications(
    TARGET_COUNT, 0x6ca11007, titlePlatformTypes, titleAffiliations,
  );
  function platformFontFamilyLabel(value: string): string {
    return PLATFORM_FONT_FAMILIES.find((item) => item.value === value)?.name ?? value;
  }
  const container = ref<HTMLDivElement>();
  const running = ref(true);
  const error = ref("");
  const selectedIndex = ref(44);
  const selectedDisplayMode = ref<CalloutDisplayMode>("detailed");
  const selectedClassification = computed(() => classifications[selectedIndex.value]!);
  const selectedDisplayClassification = computed(() =>
    (selectedDisplayMode.value === "compact" ? compactClassifications : classifications)[selectedIndex.value]!,
  );
  const selectedPlatformId = ref(selectedClassification.value.platform.id);
  const selectedAffiliationId = ref(selectedClassification.value.affiliation.id);
  const selectedPlatform = computed(() =>
    platformTypes.value.find((item) => item.id === selectedPlatformId.value) ?? platformTypes.value[0]!,
  );
  const selectedAffiliation = computed(() =>
    affiliations.value.find((item) => item.id === selectedAffiliationId.value) ?? affiliations.value[0]!,
  );
  const hoverStatus = ref("");
  const selectedFixed = ref(false);
  const customText = ref("人工备注：待核实");
  const selectedTitle = ref("");
  const selectedBadgeText = ref("A");
  const avoidanceMode = ref<CalloutDisplayMode>("detailed");
  const avoidanceByMode = reactive({
    detailed: { enabled: true, gap: 6, maxDisplacement: 160 },
    compact: { enabled: true, gap: 4, maxDisplacement: 80 },
  });
  const avoidanceEnabled = computed({
    get: () => avoidanceByMode[avoidanceMode.value].enabled,
    set: (value: boolean) => { avoidanceByMode[avoidanceMode.value].enabled = value; },
  });
  const avoidanceGap = computed({
    get: () => avoidanceByMode[avoidanceMode.value].gap,
    set: (value: number) => { avoidanceByMode[avoidanceMode.value].gap = value; },
  });
  const avoidanceRadius = computed({
    get: () => avoidanceByMode[avoidanceMode.value].maxDisplacement,
    set: (value: number) => { avoidanceByMode[avoidanceMode.value].maxDisplacement = value; },
  });
  const avoidanceStats = reactive({ moved: 0, unresolved: 0 });
  watch([avoidanceEnabled, avoidanceGap, avoidanceRadius, avoidanceMode], () => {
    if (!calloutManager || calloutManager.isDestroyed()) return;
    calloutManager.setAvoidance({
      enabled: avoidanceEnabled.value,
      gap: Math.min(200, Math.max(0, Number(avoidanceGap.value) || 0)),
      maxDisplacement: Math.min(5000, Math.max(0, Number(avoidanceRadius.value) || 0)),
    }, avoidanceMode.value);
  });
  const scope = ref("all");
  const resetDistance = ref(100);
  const offsetLimitEnabled = ref(false);
  const offsetLimit = ref(200);
  const offsetX = ref(80);
  const offsetY = ref(-80);
  const editor = reactive<TargetCalloutStyle>({ ...DEFAULT_CALLOUT_STYLE });
  const textRendering = reactive({ ...DEFAULT_TEXT_RENDERING });
  watch(textRendering, () => calloutManager?.setTextRendering(textRendering));
  function setTextRenderingNumber(key: "smoothing" | "weight", event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    if(!raw.trim()) return;
    const value = Number(raw);
    if(!Number.isFinite(value)) return;
    textRendering[key] = key === "smoothing" ? C.Math.clamp(value, 0, 1.5) : C.Math.clamp(value, -0.5, 0.5);
  }
  const workerInterval = ref(16);
  const workerIntervalDraft = ref<string | number>(16);
  function updateWorkerInterval(event: Event): void {
    const value = (event.target as HTMLInputElement).valueAsNumber;
    if(Number.isFinite(value) && value >= 16 && value <= 5000)
      workerInterval.value = Math.round(value);
  }
  function setWorkerInterval(event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = input.valueAsNumber;
    if(Number.isFinite(value))
      workerInterval.value = Math.min(5000, Math.max(16, Math.round(value)));
    workerIntervalDraft.value = workerInterval.value;
    input.value = String(workerInterval.value);
  }
  const performanceStats = reactive({
    visible: 0,
    worker: 0,
    paint: 0,
    apply: 0,
    latency: 0,
    fps: 0,
    p95: 0,
    heap: "不可用",
    longTasks: 0,
  });
  const sampleReport = ref("");

  let removeUpdate: (() => void) | undefined;
  let removeRenderQuality: (() => void) | undefined;
  let calloutManager: TargetCalloutManager | undefined;
  const performanceMonitor = new CalloutPerformanceMonitor(performanceStats);
  const samples = performanceMonitor.samples;
  const editedTitles = new Set<number>();
  let sourceTitles: string[] = [];
  function exportPerformance(): void { performanceMonitor.export(); }
  const simulationController = new TargetSimulationController({
    interval: () => workerInterval.value,
    running: () => running.value,
    onResult: (result) => {
      sourceTitles = result.titles.map(row => row.title);
      calloutManager?.updateTargets({ positions: result.positions,
        titles: result.titles.filter(row => !editedTitles.has(row.index)), lines: result.lines, fields: result.fields }, true);
      performanceStats.worker = Math.round(result.computeMs * 10) / 10;
    },
    onError: (message) => { error.value = message; running.value = false; },
  });
  let viewer: C.Viewer | undefined;
  let disposed = false;
  const origin = C.Cartesian3.fromDegrees(110, 32, 1800);
  const frame = C.Transforms.eastNorthUpToFixedFrame(origin);
  let callouts: readonly WorkerCalloutHandle[] = [];
  const styleController = new CalloutStyleController(classifications, () => callouts, compactClassifications, titleClassifications);

  function affected(): readonly WorkerCalloutHandle[] {
    return scope.value === "all"
      ? callouts
      : callouts[selectedIndex.value]
        ? [callouts[selectedIndex.value]!]
        : [];
  }
  function syncEditor(): void {
    selectedDisplayMode.value = callouts[selectedIndex.value]?.getDisplayMode() ?? "detailed";
    selectedFixed.value = callouts[selectedIndex.value]?.isScreenFixed() ?? false;
    selectedTitle.value = callouts[selectedIndex.value]?.getTitle() ?? "";
    selectedBadgeText.value = callouts[selectedIndex.value]?.getBadgeText() ?? "A";
    const style =
      callouts[selectedIndex.value]?.getStyle(styleMode.value)
      ?? (styleMode.value === "title" ? DEFAULT_TITLE_CALLOUT_STYLE : styleMode.value === "compact" ? DEFAULT_COMPACT_CALLOUT_STYLE : DEFAULT_CALLOUT_STYLE);
    Object.assign(editor, style);
    const offset = callouts[selectedIndex.value]?.getOffset();
    if(offset) {
      offsetX.value = Math.round(offset.x);
      offsetY.value = Math.round(offset.y);
    }
    const maxOffsetDistance = callouts[selectedIndex.value]?.getMaxOffsetDistance()
      ?? Number.POSITIVE_INFINITY;
    offsetLimitEnabled.value = Number.isFinite(maxOffsetDistance);
    if(offsetLimitEnabled.value) offsetLimit.value = maxOffsetDistance;
    selectedPlatformId.value = selectedClassification.value.platform.id;
    selectedAffiliationId.value = selectedClassification.value.affiliation.id;
  }
  watch(selectedIndex, syncEditor);
  watch(scope, syncEditor);
  watch(styleMode, syncEditor);
  function toggleSelectedDisplayMode(): void {
    callouts[selectedIndex.value]?.toggleDisplayMode();
    syncEditor();
  }
  function applyDisplayMode(mode: CalloutDisplayMode): void {
    for (const callout of affected()) callout.setDisplayMode(mode);
    syncEditor();
  }
  function toggleSelectedFixed(): void {
    const callout = callouts[selectedIndex.value];
    if(!callout) return;
    callout.setScreenFixed(!callout.isScreenFixed());
    syncEditor();
  }
  function applyStyle(patch: Partial<TargetCalloutStyle>): void {
    Object.assign(editor, patch);
    for(const callout of affected()) callout.setStyle(patch, styleMode.value);
  }
  function valueOf(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }
  function setAffiliationColor(
    key: "leaderColor" | "borderColor" | "textColor" | "badgeColor" | "badgeTextColor",
    event: Event,
  ): void {
    const value = valueOf(event);
    styleController.setAffiliationColor(selectedAffiliation.value, key, value, styleMode.value);
    if(selectedClassification.value.affiliation.id === selectedAffiliation.value.id) {
      Object.assign(editor, { [key]: value });
    }
  }
  function applyPlatformTypography(
    patch: Partial<typeof selectedPlatform.value.typography>,
  ): void {
    styleController.setTypography(selectedPlatform.value, patch, styleMode.value);
    if(selectedClassification.value.platform.id === selectedPlatform.value.id) {
      Object.assign(editor, patch);
    }
  }
  function setPlatformFontSize(event: Event): void {
    applyPlatformTypography({ fontSize: Number(valueOf(event)) });
  }
  function setSpacing(
    key:
      | "lineGap"
      | "paddingTop"
      | "paddingRight"
      | "paddingBottom"
      | "paddingLeft",
    event: Event,
  ): void {
    const value = Math.min(200, Math.max(0, Number(valueOf(event)) || 0));
    (event.target as HTMLInputElement).value = String(value);
    applyStyle({ [key]: value });
  }
  function applyOffset(): void {
    if(!Number.isFinite(offsetX.value) || !Number.isFinite(offsetY.value))
      return;
    for(const callout of affected())
      callout.setOffset(new C.Cartesian2(offsetX.value, offsetY.value));
    syncEditor();
  }
  function setOffsetLimitEnabled(event: Event): void {
    offsetLimitEnabled.value = (event.target as HTMLInputElement).checked;
    applyOffsetLimit();
  }
  function applyOffsetLimit(): void {
    const limit = Math.min(5000, Math.max(0, Number(offsetLimit.value) || 0));
    offsetLimit.value = limit;
    for(const callout of affected()) {
      callout.setMaxOffsetDistance(
        offsetLimitEnabled.value ? limit : Number.POSITIVE_INFINITY,
      );
    }
    syncEditor();
  }
  function setPlatformBold(event: Event): void {
    applyPlatformTypography({
      fontWeight: (event.target as HTMLInputElement).checked ? 700 : 400,
    });
  }
  function setPlatformItalic(event: Event): void {
    applyPlatformTypography({
      fontStyle: (event.target as HTMLInputElement).checked ? "italic" : "normal",
    });
  }
  function setPlatformFontFamily(event: Event): void {
    applyPlatformTypography({ fontFamily: valueOf(event) });
  }
  function setFlag(key: "showBorder" | "showLeader", event: Event): void {
    applyStyle({ [key]: (event.target as HTMLInputElement).checked });
  }
  function resetStyle(): void {
    styleController.restore(affected(), styleMode.value);
    syncEditor();
  }
  function resetOffsets(): void {
    const distance = Math.min(500, Math.max(0, Number(resetDistance.value) || 0));
    resetDistance.value = distance;
    for(const callout of affected()) callout.setDistance(distance);
    syncEditor();
  }
  function toggleAnimation(): void {
    simulationController.advance();
    running.value = !running.value;
  }
  function lookAt(position: C.Cartesian3, range: number): void {
    if(!viewer) return;
    viewer.camera.lookAt(
      position,
      new C.HeadingPitchRange(0, C.Math.toRadians(-65), range),
    );
    viewer.camera.lookAtTransform(C.Matrix4.IDENTITY);
  }
  function overview(): void {
    lookAt(origin, Math.max(GRID_COLUMNS, GRID_ROWS) * 8000 * 1.75);
  }
  function focusSelected(): void {
    const target = callouts[selectedIndex.value];
    if(target) lookAt(target.getPosition(), 12000);
  }

  onMounted(async () => {
    try {
      const base = await createLocalWorldBaseLayers();
      if(disposed || !container.value) {
        base.west.destroy();
        base.east.destroy();
        return;
      }
      viewer = new C.Viewer(container.value, {
        baseLayer: base.west,
        baseLayerPicker: false,
        geocoder: false,
        animation: false,
        timeline: false,
        navigationHelpButton: false,
        sceneModePicker: false,
        fullscreenButton: false,
        infoBox: false,
        selectionIndicator: false,
        homeButton: false,
      });
      applyDefaultViewerConfig(viewer);
      removeRenderQuality = applyCalloutRenderQuality(viewer);
      completeLocalWorldBaseLayer(viewer, base);
      // Cesium FPS 与页面 rAF FPS 分开观测，避免混淆渲染速度与数据频率。
      viewer.scene.debugShowFramesPerSecond = true;

      const simulationConfig = {
        count: TARGET_COUNT,
        columns: GRID_COLUMNS,
        frame: C.Matrix4.toArray(frame),
        classifications: classifications.map(({ platform, affiliation }) => ({
          platform: platform.name,
          affiliation: affiliation.name,
        })),
      };
      const initial = simulate(simulationConfig, {
        id: 0,
        seconds: 0,
        viewProjection: new Array(16).fill(0),
        camera: [0, 0, 0],
      });
      sourceTitles = initial.titles.map(row => row.title);
      calloutManager = new TargetCalloutManager({
        scene: viewer.scene,
        container: container.value!,
        targets: initial.lines.map((row, index) => {
          const classification = classifications[index]!;
          return {
            id: `target-${index + 1}`,
            position: C.Cartesian3.fromElements(
              initial.positions[index * 3]!,
              initial.positions[index * 3 + 1]!,
              initial.positions[index * 3 + 2]!,
            ),
            lines: row.text,
            title: initial.titles[index]!.title,
            badgeText: ["A", "B", "C"][index % 3]!,
            fields: initial.fields[index]!.fields,
            style: {
              ...classification.platform.typography,
              ...classification.affiliation.colors,
            },
            compactStyle: {
              ...compactClassifications[index]!.platform.typography,
              ...compactClassifications[index]!.affiliation.colors,
            },
            titleStyle: {
              ...titleClassifications[index]!.platform.typography,
              ...titleClassifications[index]!.affiliation.colors,
            },
          };
        }),
        textRendering,
        defaultCompactStyle: DEFAULT_COMPACT_CALLOUT_STYLE,
        defaultTitleStyle: DEFAULT_TITLE_CALLOUT_STYLE,
        compactFieldFormatter,
        avoidance: avoidanceByMode.detailed,
        onSelect: (selected) => {
          selectedIndex.value = selected.index;
          syncEditor();
        },
        onDragEnd: syncEditor,
        onDisplayModeChange: (changed) => {
          if (changed.index === selectedIndex.value) syncEditor();
        },
        onStats: (stats: TargetCalloutManagerStats) => {
          performanceStats.paint = Math.round(stats.layoutMs * 10) / 10;
          performanceStats.latency = Math.round(stats.latencyMs);
          performanceStats.apply = Math.round(stats.applyMs * 10) / 10;
        },
        onError: (cause) => {
          error.value = cause.message;
          if (calloutManager?.isDestroyed()) {
            simulationController.destroy();
            running.value = false;
          }
        },
      });
      calloutManager.setAvoidance(avoidanceByMode.compact, "compact");
      callouts = calloutManager.callouts;
      syncEditor();
      calloutManager.onHover("fixedchange", ({ callout }) => {
        selectedIndex.value = callout.index;
        syncEditor();
      });
      calloutManager.onHover("close", ({ properties }) => {
        hoverStatus.value = `已关闭目标 ${properties.index + 1} 的标牌`;
      });
      calloutManager.onHover("mouseenter", ({ properties }) => {
        hoverStatus.value = `悬停目标 ${properties.index + 1} · ${properties.screenFixed ? "固定" : "跟随"}`;
      });
      await calloutManager.ready;
      if(disposed) return;
      simulationController.start(simulationConfig);
      overview();
      // postRender 时屏幕命中区域已经更新，可读取可见数并推进业务调度。
      removeUpdate = viewer.scene.postRender.addEventListener(() => {
        if(!viewer || disposed) return;
        performanceStats.visible = calloutManager!.visibleCount;
        const layoutStats = calloutManager!.getAvoidanceStats(avoidanceMode.value);
        avoidanceStats.moved = layoutStats.moved;
        avoidanceStats.unresolved = layoutStats.unresolved;
        simulationController.tick();
      });
      performanceMonitor.start();
    } catch(cause) {
      if (!disposed) {
        error.value = cause instanceof Error ? cause.message : String(cause);
        running.value = false;
      }
      cleanup();
    }
  });

  function cleanup(): void {
    // 先停数据源，再释放标牌，最后释放 Viewer；防止异步回调访问已销毁场景。
    simulationController.destroy();
    calloutManager?.destroy();
    calloutManager = undefined;
    removeUpdate?.();
    removeUpdate = undefined;
    performanceMonitor.destroy();
    callouts = [];
    removeRenderQuality?.();
    removeRenderQuality = undefined;
    if(viewer && !viewer.isDestroyed()) viewer.destroy();
    viewer = undefined;
  }

  onUnmounted(() => {
    disposed = true;
    cleanup();
  });

  function showSelected(): void { callouts[selectedIndex.value]?.setShow(true); }
  function overrideSelectedText(): void {
    calloutManager?.getById(`target-${selectedIndex.value + 1}`)?.setLines([customText.value]);
  }
  function applySelectedTitle(): void {
    editedTitles.add(selectedIndex.value);
    callouts[selectedIndex.value]?.setTitle(selectedTitle.value);
  }
  function applySelectedBadge(): void {
    callouts[selectedIndex.value]?.setBadgeText(selectedBadgeText.value);
  }
  function restoreSelectedData(): void {
    const handle = calloutManager?.getById(`target-${selectedIndex.value + 1}`);
    handle?.resetOverrides();
    editedTitles.delete(selectedIndex.value);
    handle?.setTitle(sourceTitles[selectedIndex.value] ?? "");
    syncEditor();
  }
  return {
    TARGET_COUNT, container, running, error, selectedIndex, selectedDisplayClassification,
    selectedDisplayMode, toggleSelectedDisplayMode, applyDisplayMode, styleMode, styleModeLabel, avoidanceMode,
    platformTypes, affiliations, platformFontFamilyLabel, hoverStatus, selectedFixed,
    scope, resetDistance, offsetLimitEnabled, offsetLimit, offsetX, offsetY, editor,
    textRendering, workerInterval, workerIntervalDraft, performanceStats, sampleReport, samples,
    selectedAffiliationId, selectedAffiliation, selectedPlatformId, selectedPlatform,
    PLATFORM_FONT_FAMILIES, DEFAULT_TEXT_RENDERING,
    setTextRenderingNumber, updateWorkerInterval, setWorkerInterval, exportPerformance,
    toggleSelectedFixed, setAffiliationColor, setPlatformFontSize, setSpacing, applyOffset,
    setOffsetLimitEnabled, applyOffsetLimit, setPlatformBold, setPlatformItalic,
    setPlatformFontFamily, setFlag, resetStyle, resetOffsets, toggleAnimation, overview, focusSelected,
    showSelected, customText, overrideSelectedText, restoreSelectedData,
    selectedTitle, selectedBadgeText, applySelectedTitle, applySelectedBadge,
    avoidanceEnabled, avoidanceGap, avoidanceRadius, avoidanceStats
  };
}
