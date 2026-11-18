import { DEFAULT_CALLOUT_STYLE, DEFAULT_COMPACT_CALLOUT_STYLE, DEFAULT_TITLE_CALLOUT_STYLE, type CalloutStyleSection, type TargetCalloutStyle, type WorkerCalloutHandle } from "cesium-screen-callout";
import type { Affiliation, PlatformType, TargetClassification } from "./classification";

/** 维护分类配置及批量应用规则；只更新匹配分类，不创建渲染资源。 */
export class CalloutStyleController {
  private readonly classifications: Record<CalloutStyleSection, readonly TargetClassification[]>;
  private readonly getCallouts: () => readonly WorkerCalloutHandle[];
  constructor(
    classifications: readonly TargetClassification[],
    getCallouts: () => readonly WorkerCalloutHandle[],
    compactClassifications: readonly TargetClassification[] = classifications,
    titleClassifications: readonly TargetClassification[] = classifications,
  ) {
    this.classifications = { detailed: classifications, compact: compactClassifications, title: titleClassifications };
    this.getCallouts = getCallouts;
  }

  /** 属方负责当前样式区域的颜色；标记字母由每个目标单独设置。 */
  setAffiliationColor(affiliation: Affiliation, key: keyof Affiliation["colors"], value: string, mode: CalloutStyleSection = "detailed"): void {
    affiliation.colors[key] = value;
    this.applyMatching((item) => item.affiliation.id === affiliation.id, { [key]: value }, mode);
  }

  /** 平台只负责字体、字号、粗体及斜体，不覆盖属方颜色。 */
  setTypography(platform: PlatformType, patch: Partial<PlatformType["typography"]>, mode: CalloutStyleSection = "detailed"): void {
    Object.assign(platform.typography, patch);
    this.applyMatching((item) => item.platform.id === platform.id, patch, mode);
  }

  restore(callouts: readonly WorkerCalloutHandle[], mode: CalloutStyleSection = "detailed"): void {
    for(const callout of callouts) {
      const classification = this.classifications[mode][callout.index]!;
      callout.setStyle({
        ...(mode === "title" ? DEFAULT_TITLE_CALLOUT_STYLE : mode === "compact" ? DEFAULT_COMPACT_CALLOUT_STYLE : DEFAULT_CALLOUT_STYLE),
        ...classification.platform.typography,
        ...classification.affiliation.colors,
      }, mode);
    }
  }

  private applyMatching(matches: (item: TargetClassification) => boolean, patch: Partial<TargetCalloutStyle>, mode: CalloutStyleSection): void {
    const callouts = this.getCallouts();
    this.classifications[mode].forEach((item, index) => {
      if(matches(item)) callouts[index]?.setStyle(patch, mode);
    });
  }
}
