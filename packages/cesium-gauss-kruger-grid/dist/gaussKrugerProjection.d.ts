import * as Cesium from "cesium";
/** 带内平面坐标。两轴均以米为单位，东坐标尚未加上百万位带号。 */
export interface GaussKrugerCoordinate {
    /** 东坐标 E，已包含 500,000 m 假东偏。 */
    easting: number;
    /** 北坐标 N，以赤道为零；南半球为负，没有南半球假北偏。 */
    northing: number;
}
/**
 * 一个 3° 或 6° 分带的 CGCS2000 高斯—克吕格投影转换器。
 * 高斯—克吕格在这里采用横轴墨卡托（tmerc），中央经线比例因子为 1。
 * 格网的“1 km”是投影平面上的间距，地表距离仍受投影变形影响。
 *
 * 内部不将带号拼入东坐标；传统中国测绘坐标的百万位带号应仅在标签中添加，
 * 否则会把显示格式误当成参与正反投影的坐标值。
 *
 * 带号沿地球向东循环：6° 为 1..60，3° 为 0..119（0 带以格林尼治为中央经线）。
 * 中国境外的编号是本实现为全球浏览定义的数学扩展，不代表已注册的 CGCS2000 CRS。
 * 输入经纬度被视为已属于 CGCS2000；这里不会将 WGS84 观测值做基准或历元转换。
 */
export declare class GaussKrugerProjection {
    /** 当前带号；含义由带宽决定，不能仅凭带号确定中央经线。 */
    readonly zoneNumber: number;
    /** 中央经线，弧度；归入 [-π, π]，但带界允许稍微超出该区间。 */
    readonly centralMeridian: number;
    /** 带的西界，弧度。与东界组成连续区间，跨反经线时不在此拆段。 */
    readonly westBoundary: number;
    /** 带的东界，弧度。周期副本和视野求交交由 gridGeometry 处理。 */
    readonly eastBoundary: number;
    /** 复用已解析的 CRS，避免每个采样点重新创建投影转换器。 */
    private readonly converter;
    /** 校验带号并建立正反投影器；zoneWidthDegrees 的单位是度。 */
    constructor(zoneNumber: number, zoneWidthDegrees: 3 | 6);
    /**
     * 正算：经纬度（弧度）→ 带内 E/N（米）；输入 height 不参与二维投影。
     * 主要用于求视野的投影包围范围。此处不强制裁到本带，带界由几何模块处理。
     */
    project(cartographic: Cesium.Cartographic): GaussKrugerCoordinate;
    /**
     * 反算：带内 E/N（米）→ Cesium 经纬度（弧度），并原样携带 height（米）。
     * 格网生成时先在平面按整格距取点，再通过此方法把点放回椭球经纬度空间。
     * height 是附加的显示高度，不属于投影算法的输入维度。
     */
    unproject(easting: number, northing: number, height?: number): Cesium.Cartographic;
}
/**
 * 根据任意周期的经度（弧度）选取规范带号，带宽为 3° 或 6°。
 * 先折回 0..360° 再分带，使西半球不会因负数取整而产生非法带号。
 * 6° 带界从 0° 起；3° 带以 0° 为中心，因此分带前要平移 1.5°。
 */
export declare function zoneNumberFromLongitude(longitude: number, zoneWidthDegrees: 3 | 6): number;
/** 校验带宽及其对应的整数带号范围，失败时给调用方明确的 RangeError。 */
export declare function validateZone(zoneNumber: number, zoneWidthDegrees: 3 | 6): void;
//# sourceMappingURL=gaussKrugerProjection.d.ts.map