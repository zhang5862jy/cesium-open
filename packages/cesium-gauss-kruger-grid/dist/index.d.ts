/**
 * 包的公共入口。普通使用者通过 GaussKrugerGrid 管理完整图层；
 * 独立投影/格式化函数可用于坐标查询，底层 primitive 则供高级调用者自行管理。
 * 相对导入使用 .js 后缀，让生成的声明兼容 ESM / TypeScript NodeNext 解析。
 */
export { GaussKrugerGrid, GaussKrugerNeighborGrid, WebMercatorSquareGrid, } from "./GaussKrugerGrid.js";
export type { GaussKrugerGridCalculationMode, GaussKrugerGridSpacingLevel, GaussKrugerGridStatus, GaussKrugerGridOptions, GaussKrugerNeighborGridOptions, WebMercatorGridSpacingLevel, WebMercatorGridStatus, WebMercatorSquareGridOptions, } from "./types.js";
export { GaussKrugerProjection, zoneNumberFromLongitude, } from "./gaussKrugerProjection.js";
export type { GaussKrugerCoordinate } from "./gaussKrugerProjection.js";
export { formatGridCoordinate } from "./screenLabels.js";
export type { GridAxis, ProjectedGridLine } from "./gridGeometry.js";
export { DrawCommandGaussKrugerGridPrimitive, type DrawCommandGaussKrugerGridPrimitiveOptions, } from "./DrawCommandGaussKrugerGridPrimitive.js";
//# sourceMappingURL=index.d.ts.map