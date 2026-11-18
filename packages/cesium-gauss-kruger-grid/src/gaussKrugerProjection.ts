import * as Cesium from "cesium";
import proj4, { type Converter } from "proj4";

/**
 * 本模块只负责单个投影带的坐标转换，不生成格网、不读取相机。
 * Cesium.Cartographic 的经纬度用弧度；Proj4js 的地理坐标用度；投影坐标用米。
 * 在这里集中转换单位，调用方即可始终使用 Cesium 的坐标约定。
 */
// CGCS2000 采用 GRS80 椭球。这里的 CRS 定义没有配置基准或历元转换参数。
const CGCS2000_GEOGRAPHIC =
  "+proj=longlat +ellps=GRS80 +no_defs +type=crs";
// 假东偏：中央经线的东坐标为 500 km，使通常的带内东坐标保持正值。
const FALSE_EASTING = 500_000;

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
export class GaussKrugerProjection {
  /** 当前带号；含义由带宽决定，不能仅凭带号确定中央经线。 */
  readonly zoneNumber: number;
  /** 中央经线，弧度；归入 [-π, π]，但带界允许稍微超出该区间。 */
  readonly centralMeridian: number;
  /** 带的西界，弧度。与东界组成连续区间，跨反经线时不在此拆段。 */
  readonly westBoundary: number;
  /** 带的东界，弧度。周期副本和视野求交交由 gridGeometry 处理。 */
  readonly eastBoundary: number;
  /** 复用已解析的 CRS，避免每个采样点重新创建投影转换器。 */
  private readonly converter: Converter;

  /** 校验带号并建立正反投影器；zoneWidthDegrees 的单位是度。 */
  constructor(zoneNumber: number, zoneWidthDegrees: 3 | 6) {
    validateZone(zoneNumber, zoneWidthDegrees);
    this.zoneNumber = zoneNumber;
    // 6° 带的中央经线为 6z−3，3° 带为 3z；先在 0..360° 方向计算。
    const unwrappedCentralMeridianDegrees =
      zoneWidthDegrees === 6 ? zoneNumber * 6 - 3 : zoneNumber * 3;
    // 西半球仍保留向东递增的带号，只把投影参数中的经度改写为负经度。
    const centralMeridianDegrees =
      unwrappedCentralMeridianDegrees > 180
        ? unwrappedCentralMeridianDegrees - 360
        : unwrappedCentralMeridianDegrees;
    this.centralMeridian = Cesium.Math.toRadians(centralMeridianDegrees);
    this.westBoundary = Cesium.Math.toRadians(
      centralMeridianDegrees - zoneWidthDegrees * 0.5,
    );
    this.eastBoundary = Cesium.Math.toRadians(
      centralMeridianDegrees + zoneWidthDegrees * 0.5,
    );
    // 原点纬度=赤道，中央经线比例=1，假东偏=500 km，假北偏=0，输出单位=米。
    const projectedDefinition = [
      "+proj=tmerc",
      "+lat_0=0",
      `+lon_0=${centralMeridianDegrees}`,
      "+k=1",
      `+x_0=${FALSE_EASTING}`,
      "+y_0=0",
      "+ellps=GRS80",
      "+units=m",
      "+no_defs",
      "+type=crs",
    ].join(" ");
    this.converter = proj4(CGCS2000_GEOGRAPHIC, projectedDefinition);
  }

  /**
   * 正算：经纬度（弧度）→ 带内 E/N（米）；输入 height 不参与二维投影。
   * 主要用于求视野的投影包围范围。此处不强制裁到本带，带界由几何模块处理。
   */
  project(cartographic: Cesium.Cartographic): GaussKrugerCoordinate {
    assertFinite("longitude", cartographic.longitude);
    assertFinite("latitude", cartographic.latitude);
    if (Math.abs(cartographic.latitude) > Cesium.Math.PI_OVER_TWO) {
      throw new RangeError("latitude must be between -PI/2 and PI/2 radians.");
    }
    const [easting, northing] = this.converter.forward([
      Cesium.Math.toDegrees(normalizeLongitude(cartographic.longitude)),
      Cesium.Math.toDegrees(cartographic.latitude),
    ]);
    assertFinite("projected easting", easting);
    assertFinite("projected northing", northing);
    return { easting, northing };
  }

  /**
   * 反算：带内 E/N（米）→ Cesium 经纬度（弧度），并原样携带 height（米）。
   * 格网生成时先在平面按整格距取点，再通过此方法把点放回椭球经纬度空间。
   * height 是附加的显示高度，不属于投影算法的输入维度。
   */
  unproject(
    easting: number,
    northing: number,
    height = 0,
  ): Cesium.Cartographic {
    assertFinite("easting", easting);
    assertFinite("northing", northing);
    assertFinite("height", height);
    const [longitude, latitude] = this.converter.inverse([easting, northing]);
    assertFinite("unprojected longitude", longitude);
    assertFinite("unprojected latitude", latitude);
    if (Math.abs(latitude) > 90) {
      throw new RangeError("Projected coordinates are outside the projection domain.");
    }
    return Cesium.Cartographic.fromDegrees(longitude, latitude, height);
  }
}

/**
 * 根据任意周期的经度（弧度）选取规范带号，带宽为 3° 或 6°。
 * 先折回 0..360° 再分带，使西半球不会因负数取整而产生非法带号。
 * 6° 带界从 0° 起；3° 带以 0° 为中心，因此分带前要平移 1.5°。
 */
export function zoneNumberFromLongitude(
  longitude: number,
  zoneWidthDegrees: 3 | 6,
): number {
  validateZoneWidth(zoneWidthDegrees);
  assertFinite("longitude", longitude);
  let longitudeDegrees = Cesium.Math.toDegrees(normalizeLongitude(longitude));
  if (longitudeDegrees < 0) longitudeDegrees += 360;
  // 仅吸收精确带界附近的浮点噪声；例如 178.5° 经弧度往返后不应误落到前一带。
  const zoneIndex = zoneWidthDegrees === 6
    ? longitudeDegrees / 6
    : (longitudeDegrees + 1.5) / 3;
  const nearestInteger = Math.round(zoneIndex);
  const index = Math.floor(
    Math.abs(zoneIndex - nearestInteger) < 1e-12 ? nearestInteger : zoneIndex,
  );
  return zoneWidthDegrees === 6 ? index % 60 + 1 : index % 120;
}

/** 校验带宽及其对应的整数带号范围，失败时给调用方明确的 RangeError。 */
export function validateZone(zoneNumber: number, zoneWidthDegrees: 3 | 6): void {
  validateZoneWidth(zoneWidthDegrees);
  const minimum = zoneWidthDegrees === 6 ? 1 : 0;
  const maximum = zoneWidthDegrees === 6 ? 60 : 119;
  if (!Number.isInteger(zoneNumber) || zoneNumber < minimum || zoneNumber > maximum) {
    throw new RangeError(`zoneNumber must be an integer from ${minimum} through ${maximum}.`);
  }
}

/** 运行时仍检查带宽，防止来自 JavaScript、JSON 等来源的值绕过 TypeScript 类型。 */
function validateZoneWidth(zoneWidthDegrees: 3 | 6): void {
  if (zoneWidthDegrees !== 3 && zoneWidthDegrees !== 6) {
    throw new RangeError("zoneWidthDegrees must be either 3 or 6.");
  }
}

/** 将经度折回 [-π, π]，保留恰好 +π/-π 的符号；不会修改纬度。 */
function normalizeLongitude(longitude: number): number {
  const wrapped = longitude % Cesium.Math.TWO_PI;
  if (wrapped > Math.PI) return wrapped - Cesium.Math.TWO_PI;
  if (wrapped < -Math.PI) return wrapped + Cesium.Math.TWO_PI;
  return wrapped;
}

/** 拒绝 NaN 和无穷值，避免无效坐标继续进入 Proj4js 或后续 GPU 数据。 */
function assertFinite(name: string, value: number): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${name} must be finite.`);
  }
}
