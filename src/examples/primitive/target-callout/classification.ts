import type {
  TargetCalloutFontStyle,
  TargetCalloutFontWeight,
  TargetCalloutStyle,
} from "cesium-screen-callout";

export interface PlatformType {
  id: string;
  name: string;
  typography: Pick<
    TargetCalloutStyle,
    "fontFamily" | "fontSize" | "fontStyle" | "fontWeight"
  >;
}

export interface Affiliation {
  id: string;
  name: string;
  colors: Pick<TargetCalloutStyle, "leaderColor" | "borderColor" | "textColor" | "badgeColor" | "badgeTextColor">;
}

export interface TargetClassification {
  platform: PlatformType;
  affiliation: Affiliation;
}

const PLATFORM_NAMES = [
  ["fighter", "战斗机"],
  ["bomber", "轰炸机"],
  ["transport", "运输机"],
  ["early-warning", "预警机"],
  ["uav", "无人机"],
  ["helicopter", "直升机"],
  ["ship", "水面舰艇"],
  ["armored", "装甲车辆"],
  ["air-defense", "防空系统"],
  ["radar", "雷达站"],
  ["missile", "导弹"],
] as const;

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function pick<T>(values: readonly T[], random: () => number): T {
  return values[Math.floor(random() * values.length)]!;
}

const typographyRandom = seededRandom(0x11c06a55);
export const PLATFORM_FONT_FAMILIES = [
  { name: "微软雅黑", value: '"Microsoft YaHei", "微软雅黑", sans-serif' },
  { name: "宋体", value: '"SimSun", "宋体", serif' },
] as const;
const fontFamilies = PLATFORM_FONT_FAMILIES.map((item) => item.value);
const fontSizes = [12, 13, 14, 15, 16, 17, 18, 20] as const;
const fontStyles: readonly TargetCalloutFontStyle[] = ["normal", "italic"];
const fontWeights: readonly TargetCalloutFontWeight[] = [400, 700];

/** Eleven stable platform definitions; typography is pseudo-randomized once. */
export const PLATFORM_TYPES: readonly PlatformType[] = PLATFORM_NAMES.map(([id, name]) => ({
  id,
  name,
  typography: {
    fontFamily: pick(fontFamilies, typographyRandom),
    fontSize: pick(fontSizes, typographyRandom),
    fontStyle: pick(fontStyles, typographyRandom),
    fontWeight: pick(fontWeights, typographyRandom),
  },
}));

/** Each style section keeps its own affiliation colors, including the letter badge. */
export const AFFILIATIONS: readonly Affiliation[] = [
  { id: "red", name: "红", colors: { leaderColor: "#ff3b30", borderColor: "#ff3b30", textColor: "#ff3b30", badgeColor: "#ff3b30", badgeTextColor: "#ffffff" } },
  { id: "blue", name: "蓝", colors: { leaderColor: "#2196f3", borderColor: "#2196f3", textColor: "#2196f3", badgeColor: "#2196f3", badgeTextColor: "#ffffff" } },
  { id: "green", name: "绿", colors: { leaderColor: "#34c759", borderColor: "#34c759", textColor: "#34c759", badgeColor: "#34c759", badgeTextColor: "#142033" } },
  { id: "pink", name: "粉", colors: { leaderColor: "#ff4fa3", borderColor: "#ff4fa3", textColor: "#ff4fa3", badgeColor: "#ff4fa3", badgeTextColor: "#142033" } },
  { id: "unassigned", name: "未分配", colors: { leaderColor: "#ff9500", borderColor: "#ff9500", textColor: "#ff9500", badgeColor: "#ff9500", badgeTextColor: "#142033" } },
  { id: "unknown", name: "不明", colors: { leaderColor: "#ff9500", borderColor: "#ff9500", textColor: "#ff9500", badgeColor: "#ff9500", badgeTextColor: "#142033" } },
];

/** Random classification is deterministic so reloading and performance runs stay comparable. */
export function createTargetClassifications(
  count: number,
  seed = 0x6ca11007,
  platforms: readonly PlatformType[] = PLATFORM_TYPES,
  affiliations: readonly Affiliation[] = AFFILIATIONS,
): readonly TargetClassification[] {
  const random = seededRandom(seed);
  return Array.from({ length: count }, () => ({
    platform: pick(platforms, random),
    affiliation: pick(affiliations, random),
  }));
}
