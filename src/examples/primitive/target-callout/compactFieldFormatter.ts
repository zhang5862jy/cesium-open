import type { CompactFieldFormatter } from "cesium-screen-callout";

/** 简标只输出字段值；数字精度和单位由业务决定，字段顺序与数据源一致。 */
export const compactFieldFormatter: CompactFieldFormatter = (field) => {
  if (field.value === null) return "—";
  if (field.key === "id") return String(field.value).padStart(3, "0");
  if (typeof field.value !== "number") return String(field.value);
  if (field.key === "longitude" || field.key === "latitude") return `${field.value.toFixed(3)}°`;
  if (field.key === "height") return `${field.value.toFixed(0)}m`;
  if (field.key === "speed") return `${field.value.toFixed(1)}m/s`;
  if (field.key === "time") return `${field.value.toFixed(1)}s`;
  return String(field.value);
};
