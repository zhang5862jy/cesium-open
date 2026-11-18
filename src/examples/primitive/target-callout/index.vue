<template>
  <div :ref="setContainer" class="cesium-container"></div>
  <button v-if="panelCollapsed" class="panel-toggle" @click="panelCollapsed = false" aria-label="展开设置面板">
    展开设置<span v-if="avoidanceEnabled"> · {{ avoidanceMode === "compact" ? "简标" : "详标" }}冲突 {{ avoidanceStats.unresolved }}</span>
  </button>
  <aside v-show="!panelCollapsed" class="panel">
    <button @click="panelCollapsed = true" aria-label="收起设置面板">收起设置，查看标牌</button>
    <div class="eyebrow">{{ TARGET_COUNT }} TARGETS / SCREEN SPACE</div>
    <h2>可拖拽目标标牌</h2>
    <p class="hint">双击标牌可切换简标 / 详标；详标标题右侧的小圆按钮可固定或关闭。标题和简标左侧的属方色方块显示各目标独立字母。{{ hoverStatus }}</p>
    <button @click="showSelected()">显示当前标牌</button>
    <fieldset>
      <legend>标牌自动避让</legend>
      <label>避让配置模式
        <select v-model="avoidanceMode" aria-label="避让配置模式">
          <option value="detailed">详标避让</option>
          <option value="compact">简标避让</option>
        </select>
      </label>
      <label><input v-model="avoidanceEnabled" type="checkbox" aria-label="开启标牌避让" />开启标牌避让</label>
      <label>标牌间距（px）<input v-model.number="avoidanceGap" type="number" min="0" max="200" :disabled="!avoidanceEnabled" aria-label="避让间距" /></label>
      <label>自动避让半径（px）<input v-model.number="avoidanceRadius" type="number" min="0" max="5000" step="10" :disabled="!avoidanceEnabled" aria-label="自动避让半径" /></label>
      <p class="hint">简标与详标分别避让，互不挤开。优先少移动标牌并在附近选位；拖拽期间不触发避让，松手后再让周围标牌调整。附近放不下时保留重叠。</p>
      <p class="hint">无碰撞时保持偏移，允许随地图移出视口。只有本次碰撞修复前完整在屏内的标牌，才保护它不被修复推出；已经越界的不会拉回。避让直接落位，无过渡动画。</p>
      <p v-if="avoidanceEnabled" class="hint">已调整 {{ avoidanceStats.moved }} 个 · 仍有冲突 {{ avoidanceStats.unresolved }} 个</p>
    </fieldset>
    <label
      >Worker 更新间隔（ms）<input
        v-model="workerIntervalDraft"
        type="number"
        min="16"
        max="5000"
        step="1"
        aria-label="Worker 更新间隔"
        @input="updateWorkerInterval"
        @change="setWorkerInterval"
        @keydown.enter="setWorkerInterval"
    /></label>
    <p class="hint">
      Worker {{ workerInterval }}ms 更新（约
      {{ (1000 / workerInterval).toFixed(1) }}Hz） · 可见
      {{ performanceStats.visible }} / {{ TARGET_COUNT }}<br />计算
      {{ performanceStats.worker }}ms · 布局 {{ performanceStats.paint }}ms ·
      往返 {{ performanceStats.latency }}ms
    </p>
    <p class="hint" role="status">
      页面响应 {{ performanceStats.fps }} FPS · P95
      {{ performanceStats.p95 }}ms<br />主线程应用
      {{ performanceStats.apply }}ms · JS 堆 {{ performanceStats.heap
      }}<br />长任务 {{ performanceStats.longTasks }} · 地图默认连续渲染
    </p>
    <button @click="exportPerformance">导出最近 120 秒性能数据</button>
    <details>
      <summary @click="sampleReport = JSON.stringify(samples, null, 2)">
        查看性能采样（展开时刷新）
      </summary>
      <pre>{{ sampleReport }}</pre>
    </details>
    <p>左键拖动标牌，牵引线自动跟随。透明区域也可拖动；松手后保持屏幕偏移。</p>
    <div class="buttons">
      <button @click="toggleAnimation">
        {{ running ? "暂停运动" : "继续运动" }}</button
      ><button @click="overview">总览 {{ TARGET_COUNT }} 个</button>
    </div>
    <label
      >当前目标
      <select v-model.number="selectedIndex" aria-label="当前目标">
        <option v-for="index in TARGET_COUNT" :key="index" :value="index - 1">
          目标 {{ String(index).padStart(3, "0") }}
        </option>
      </select>
    </label>
    <fieldset>
      <legend>当前目标显示模式</legend>
      <p role="status">当前显示：{{ selectedDisplayMode === "compact" ? "简标" : "详标" }}</p>
      <button @click="toggleSelectedDisplayMode" aria-label="切换当前标牌显示模式">
        切换当前为{{ selectedDisplayMode === "compact" ? "详标" : "简标" }}
      </button>
      <p class="hint">简标将所有字段值放在一行，以一个空格分隔。经纬度、单位等通过字段处理函数格式化，双击也可切换。</p>
    </fieldset>
    <p class="classification" :style="{ borderColor: selectedDisplayClassification.affiliation.colors.borderColor }">
      <strong :style="{ color: selectedDisplayClassification.affiliation.colors.textColor }">
        {{ selectedDisplayClassification.affiliation.name }}
      </strong>
      · {{ selectedDisplayClassification.platform.name }}<br />
      {{ platformFontFamilyLabel(selectedDisplayClassification.platform.typography.fontFamily) }} ·
      {{ selectedDisplayClassification.platform.typography.fontSize }}px ·
      {{ selectedDisplayClassification.platform.typography.fontWeight >= 700 ? "粗体" : "常规" }} ·
      {{ selectedDisplayClassification.platform.typography.fontStyle.includes("italic") ? "斜体" : "正体" }}
    </p>
    <details class="taxonomy">
      <summary>11 个平台类型 / 6 个属方</summary>
      <p><strong>平台：</strong>{{ platformTypes.map((item) => item.name).join("、") }}</p>
      <p class="affiliation-list"><strong>属方：</strong>
        <span
          v-for="item in affiliations"
          :key="item.id"
          :style="{ color: item.colors.textColor }"
        >{{ item.name }}</span>
      </p>
    </details>
    <div class="buttons">
      <button :aria-pressed="selectedFixed" @click="toggleSelectedFixed">
        {{ selectedFixed ? "取消当前标牌固定" : "固定当前标牌到屏幕" }}
      </button>
    </div>
    <p class="hint">仅作用于当前目标。固定后仍可拖拽；开启避让时，松手后仍可能为其他标牌让位。</p>
    <fieldset>
      <legend>当前目标标题与标记</legend>
      <label>标题<input v-model="selectedTitle" type="text" maxlength="120" aria-label="当前目标标题" /></label>
      <button @click="applySelectedTitle">应用当前标题</button>
      <label>标记字母<select v-model="selectedBadgeText" aria-label="当前目标标记字母" @change="applySelectedBadge">
        <option v-for="letter in ['A', 'B', 'C']" :key="letter" :value="letter">{{ letter }}</option>
      </select></label>
      <p class="hint">只修改当前目标；简标与详标标题共用字母，颜色分别使用对应样式的属方配置。恢复实时数据也会恢复标题。</p>
    </fieldset>
    <fieldset>
      <legend>当前目标详标文字</legend>
      <label>备注<input v-model="customText" type="text" maxlength="120" aria-label="当前目标备注" /></label>
      <div class="buttons">
        <button @click="overrideSelectedText">替换当前详标文字</button>
        <button @click="restoreSelectedData">恢复实时数据</button>
      </div>
      <p class="hint">备注只覆盖详标正文，独立标题与简标实时字段值继续显示。恢复后详标显示数据源的最新标题和正文，样式和位置偏移不变。</p>
    </fieldset>
    <div class="buttons">
      <button @click="focusSelected">定位当前目标</button
      ><button @click="resetOffsets">重置标牌位置</button>
    </div>
    <label
      >重置间距（px）<input
        v-model.number="resetDistance"
        type="number"
        min="0"
        max="500"
        aria-label="重置间距"
    /></label>
    <fieldset>
      <legend>目标偏移距离限制</legend>
      <label><input
        :checked="offsetLimitEnabled"
        type="checkbox"
        @change="setOffsetLimitEnabled"
      />启用最大偏移距离</label>
      <label>最大中心距离（px）<input
        v-model.number="offsetLimit"
        type="number"
        min="0"
        max="5000"
        :disabled="!offsetLimitEnabled"
        aria-label="标牌中心最大偏移距离"
        @change="applyOffsetLimit"
      /></label>
      <p class="hint">默认不限。启用后，标牌中心点到目标点不能超过该半径。</p>
    </fieldset>
    <label
      >配置范围
      <select v-model="scope" aria-label="配置范围">
        <option value="all">全部 {{ TARGET_COUNT }} 个标牌</option>
        <option value="selected">仅当前目标</option>
      </select>
    </label>
    <div class="buttons">
      <button @click="applyDisplayMode('compact')" aria-label="将配置范围切换为简标">设为简标</button>
      <button @click="applyDisplayMode('detailed')" aria-label="将配置范围切换为详标">设为详标</button>
    </div>
    <div class="spacing-grid">
      <label
        >偏移 X<input
          v-model.number="offsetX"
          type="number"
          aria-label="偏移 X"
      /></label>
      <label
        >偏移 Y<input
          v-model.number="offsetY"
          type="number"
          aria-label="偏移 Y"
      /></label>
    </div>
    <button class="reset" @click="applyOffset">应用目标偏移（px）</button>
    <p class="hint">
      X 向右，Y 向下，以标牌左下角定位。牵引线自动连接四角中最近的一角。
    </p>
    <label>样式配置模式
      <select v-model="styleMode" aria-label="样式配置模式">
        <option value="detailed">详标正文样式</option>
        <option value="compact">简标样式</option>
        <option value="title">详标标题样式</option>
      </select>
    </label>
    <p class="hint">以下颜色、字体、间距和边框只修改{{ styleModeLabel }}样式；正文、简标、标题三套配置分别保留。</p>
    <fieldset>
      <legend>属方颜色配置（同属方批量生效）</legend>
      <label>属方
        <select v-model="selectedAffiliationId" aria-label="待配置属方">
          <option v-for="item in affiliations" :key="item.id" :value="item.id">
            {{ item.name }}
          </option>
        </select>
      </label>
      <label v-if="styleMode !== 'title'">牵引线颜色<input
        :value="selectedAffiliation.colors.leaderColor"
        type="color"
        aria-label="属方牵引线颜色"
        @input="setAffiliationColor('leaderColor', $event)"
      /></label>
      <template v-if="styleMode !== 'detailed'">
        <label>属方方块颜色<input
          :value="selectedAffiliation.colors.badgeColor"
          type="color"
          aria-label="属方方块颜色"
          @input="setAffiliationColor('badgeColor', $event)"
        /></label>
        <label>方块字母颜色<input
          :value="selectedAffiliation.colors.badgeTextColor"
          type="color"
          aria-label="方块字母颜色"
          @input="setAffiliationColor('badgeTextColor', $event)"
        /></label>
      </template>
      <label>边框颜色<input
        :value="selectedAffiliation.colors.borderColor"
        type="color"
        aria-label="属方边框颜色"
        @input="setAffiliationColor('borderColor', $event)"
      /></label>
      <label>文字颜色<input
        :value="selectedAffiliation.colors.textColor"
        type="color"
        aria-label="属方文字颜色"
        @input="setAffiliationColor('textColor', $event)"
      /></label>
    </fieldset>
    <fieldset>
      <legend>平台类型文字配置（同平台批量生效）</legend>
      <label>平台类型
        <select v-model="selectedPlatformId" aria-label="待配置平台类型">
          <option v-for="item in platformTypes" :key="item.id" :value="item.id">
            {{ item.name }}
          </option>
        </select>
      </label>
      <label>文字大小 <span>{{ selectedPlatform.typography.fontSize }} px</span></label>
      <input
        :value="selectedPlatform.typography.fontSize"
        type="range"
        min="8"
        max="32"
        aria-label="平台文字大小"
        @input="setPlatformFontSize"
      />
      <label>字体
        <select
          :value="selectedPlatform.typography.fontFamily"
          aria-label="平台字体"
          @change="setPlatformFontFamily"
        >
          <option
            v-for="family in PLATFORM_FONT_FAMILIES"
            :key="family.name"
            :value="family.value"
          >{{ family.name }}</option>
        </select>
      </label>
      <div class="checks">
        <label><input
          :checked="selectedPlatform.typography.fontWeight >= 700"
          type="checkbox"
          @change="setPlatformBold"
        />文字加粗</label>
        <label><input
          :checked="selectedPlatform.typography.fontStyle.includes('italic')"
          type="checkbox"
          @change="setPlatformItalic"
        />文字斜体</label>
      </div>
    </fieldset>
    <fieldset>
      <legend>文字清晰度（全部标牌 · 实时生效）</legend>
      <label>边缘平滑宽度
        <input :value="textRendering.smoothing" type="number" min="0" max="1.5" step="0.01" aria-label="文字平滑宽度" @input="setTextRenderingNumber('smoothing', $event)" />
      </label>
      <input :value="textRendering.smoothing" type="range" min="0" max="1.5" step="0.01" aria-label="文字平滑宽度滑块" @input="setTextRenderingNumber('smoothing', $event)" />
      <p class="hint">越小越锐利，0 为硬边；越大越柔和。默认 0.18。</p>
      <label>笔画粗细补偿
        <input :value="textRendering.weight" type="number" min="-0.5" max="0.5" step="0.01" aria-label="文字粗细补偿" @input="setTextRenderingNumber('weight', $event)" />
      </label>
      <input :value="textRendering.weight" type="range" min="-0.5" max="0.5" step="0.01" aria-label="文字粗细补偿滑块" @input="setTextRenderingNumber('weight', $event)" />
      <p class="hint">正值加粗，负值变细；默认 0.06，不改变字号。</p>
      <label><input v-model="textRendering.pixelSnap" type="checkbox" aria-label="文字像素对齐" />文字像素对齐</label>
      <button @click="Object.assign(textRendering, DEFAULT_TEXT_RENDERING)">恢复文字清晰度默认值</button>
      <code>setTextRendering({ smoothing: {{ textRendering.smoothing }}, weight: {{ textRendering.weight }}, pixelSnap: {{ textRendering.pixelSnap }} })</code>
    </fieldset>
    <label v-if="styleMode === 'detailed'"
      >统一行间距（px）<input
        :value="editor.lineGap"
        type="number"
        min="0"
        max="200"
        aria-label="统一行间距"
        @input="setSpacing('lineGap', $event)"
    /></label>
    <fieldset>
      <legend>文字内边距（px）</legend>
      <div class="spacing-grid">
        <label
          >上<input
            :value="editor.paddingTop"
            type="number"
            min="0"
            max="200"
            aria-label="上内边距"
            @input="setSpacing('paddingTop', $event)"
        /></label>
        <label
          >右<input
            :value="editor.paddingRight"
            type="number"
            min="0"
            max="200"
            aria-label="右内边距"
            @input="setSpacing('paddingRight', $event)"
        /></label>
        <label
          >下<input
            :value="editor.paddingBottom"
            type="number"
            min="0"
            max="200"
            aria-label="下内边距"
            @input="setSpacing('paddingBottom', $event)"
        /></label>
        <label
          >左<input
            :value="editor.paddingLeft"
            type="number"
            min="0"
            max="200"
            aria-label="左内边距"
            @input="setSpacing('paddingLeft', $event)"
        /></label>
      </div>
    </fieldset>
    <div class="checks">
      <label
        ><input
          :checked="editor.showBorder"
          type="checkbox"
          @change="setFlag('showBorder', $event)"
        />显示边框</label
      >
      <label v-if="styleMode !== 'title'"
        ><input
          :checked="editor.showLeader"
          type="checkbox"
          @change="setFlag('showLeader', $event)"
        />显示牵引线</label
      >
    </div>
    <p class="hint">正文、简标和标题的颜色、字号与内边距分别保存。标题与简标均为一行；标题牵引线由详标正文样式控制。</p>
    <button class="reset" @click="resetStyle">恢复平台 / 属方分类样式</button>
    <p class="hint">
      已创建 {{ TARGET_COUNT }} 个数据目标及标牌，无 Entity
      或立方体。总览时标牌可能重叠，可定位目标后拖动。修改只应用当前变动的配置项。
    </p>
    <p v-if="error" role="alert">{{ error }}</p>
  </aside>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useTargetCalloutExample } from "./useTargetCalloutExample";
const panelCollapsed = ref(false);
const { TARGET_COUNT, container, running, error, selectedIndex, selectedDisplayClassification,
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
  avoidanceEnabled, avoidanceGap, avoidanceRadius, avoidanceStats } = useTargetCalloutExample();
function setContainer(element: unknown): void {
  container.value = element instanceof HTMLDivElement ? element : undefined;
}
</script>
<style scoped>
.cesium-container {
  position: relative;
  width: 100%;
  height: 100%;
}
.cesium-container :deep(.cesium-performanceDisplay) {
  z-index: 2;
}
.panel-toggle {
  position: absolute;
  z-index: 3;
  left: 16px;
  top: 16px;
  width: auto;
  padding: 10px 14px;
  color: #dff6ff;
  background: #071b2bef;
  border: 1px solid #65e2ff55;
  border-radius: 8px;
  cursor: pointer;
}
.panel {
  z-index: 2;
  position: absolute;
  top: 16px;
  left: 16px;
  width: min(290px, calc(100% - 32px));
  max-height: calc(100% - 32px);
  overflow: auto;
  box-sizing: border-box;
  padding: 18px;
  color: #dff6ff;
  background: #071b2bef;
  border: 1px solid #65e2ff55;
  border-radius: 12px;
}
.eyebrow {
  font: 10px monospace;
  letter-spacing: 0.1em;
  color: #65e2ff;
}
h2 {
  margin: 9px 0;
  font-size: 20px;
}
p {
  color: #a4bdcc;
  font-size: 12px;
  line-height: 1.6;
}
.classification {
  padding: 8px 10px;
  border-left: 3px solid;
  background: #102d40;
  border-radius: 4px;
}
.taxonomy {
  color: #a4bdcc;
  font-size: 12px;
}
.taxonomy summary {
  cursor: pointer;
  color: #dff6ff;
}
.affiliation-list span:not(:last-child)::after {
  content: "、";
  color: #a4bdcc;
}
label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin: 10px 0;
  font-size: 12px;
}
input[type="range"] {
  width: 100%;
  accent-color: #65e2ff;
}
input[type="color"] {
  width: 44px;
  height: 25px;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
}
input[type="number"] {
  width: 70px;
  padding: 5px;
  color: #def7ff;
  background: #16364b;
  border: 1px solid #65e2ff55;
  border-radius: 4px;
}
input[type="text"] {
  min-width: 0;
  width: 170px;
  padding: 5px;
  color: #def7ff;
  background: #16364b;
  border: 1px solid #65e2ff55;
  border-radius: 4px;
}
select {
  max-width: 170px;
  padding: 5px;
  background: #16364b;
  color: #def7ff;
  border: 1px solid #65e2ff55;
  border-radius: 4px;
}
.buttons,
.checks {
  display: flex;
  gap: 8px;
  margin: 8px 0;
}
button {
  flex: 1;
  border: 1px solid #65e2ff55;
  border-radius: 5px;
  padding: 8px 0;
  background: #16364b;
  color: #def7ff;
  cursor: pointer;
}
button:hover {
  background: #24516a;
}
.reset {
  width: 100%;
  margin-top: 10px;
}
.checks label {
  flex: 1;
  justify-content: flex-start;
}
.hint {
  font-size: 11px;
  margin-bottom: 0;
}
summary {
  cursor: pointer;
  font-size: 11px;
  margin-top: 8px;
}
pre {
  max-height: 150px;
  overflow: auto;
  font-size: 10px;
}
.spacing-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}
.spacing-grid label {
  margin: 5px 0;
}
.spacing-grid input {
  width: 55px;
}
fieldset {
  margin: 12px 0;
  padding: 8px;
  border: 1px solid #65e2ff44;
  border-radius: 5px;
}
legend {
  color: #a4bdcc;
  font-size: 12px;
}
</style>
