import { fromBlob } from "geotiff";
import {
  type DemBounds,
  type DemCoordinateSystem,
  type DemRaster,
  isNoDataValue,
  webMercatorToLatitude,
  webMercatorToLongitude,
} from "./DemRaster";

const MAX_PIXEL_COUNT = 50_000_000;

export async function parseDemFile(file: File | Blob): Promise<DemRaster> {
  const fileName = file instanceof File ? file.name : "sample.asc";
  const extension = fileName.split(".").pop()?.toLowerCase();

  if (extension === "asc" || extension === "txt") {
    return parseAsciiGrid(await file.text(), fileName);
  }

  if (extension === "tif" || extension === "tiff") {
    return parseGeoTiff(file, fileName);
  }

  throw new Error("仅支持 .tif、.tiff 和 .asc DEM 文件。");
}

async function parseGeoTiff(file: File | Blob, name: string): Promise<DemRaster> {
  const tiff = await fromBlob(file);
  const image = await tiff.getImage();
  const width = image.getWidth();
  const height = image.getHeight();
  validateDimensions(width, height);

  const geoKeys = image.getGeoKeys();
  const projectedCode = numberOrUndefined(geoKeys?.ProjectedCSTypeGeoKey);
  const geographicCode = numberOrUndefined(geoKeys?.GeographicTypeGeoKey);
  const modelType = numberOrUndefined(geoKeys?.GTModelTypeGeoKey);
  const coordinateSystem = resolveCoordinateSystem(
    modelType,
    projectedCode,
    geographicCode,
    image.getBoundingBox(),
  );
  const sourceBounds = normalizeBounds(image.getBoundingBox());
  const geographicBounds = toGeographicBounds(sourceBounds, coordinateSystem);
  validateGeographicBounds(geographicBounds);

  const values = await image.readRasters({
    samples: [0],
    interleave: true,
  });
  const noDataValue = image.getGDALNoData() ?? undefined;
  const { minimum, maximum } = calculateRange(values, noDataValue);

  return {
    name,
    width,
    height,
    values,
    noDataValue,
    minimum,
    maximum,
    coordinateSystem,
    sourceBounds,
    geographicBounds,
    projectionLabel:
      coordinateSystem === "web-mercator"
        ? "EPSG:3857"
        : geographicCode === 4490
          ? "EPSG:4490"
          : "EPSG:4326",
  };
}

function parseAsciiGrid(text: string, name: string): DemRaster {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const header = new Map<string, number>();
  let dataStart = 0;

  for (; dataStart < Math.min(lines.length, 12); dataStart += 1) {
    const [rawKey, rawValue] = lines[dataStart]!.split(/\s+/, 2);
    const key = rawKey?.toLowerCase();
    const value = Number(rawValue);
    if (!key || !Number.isFinite(value)) break;
    if (
      ![
        "ncols",
        "nrows",
        "xllcorner",
        "xllcenter",
        "yllcorner",
        "yllcenter",
        "cellsize",
        "nodata_value",
      ].includes(key)
    ) {
      break;
    }
    header.set(key, value);
  }

  const width = requireHeader(header, "ncols");
  const height = requireHeader(header, "nrows");
  const cellSize = requireHeader(header, "cellsize");
  validateDimensions(width, height);
  if (cellSize <= 0) throw new Error("ASC 的 cellsize 必须大于 0。");

  const xCorner = header.get("xllcorner");
  const xCenter = header.get("xllcenter");
  const yCorner = header.get("yllcorner");
  const yCenter = header.get("yllcenter");
  if (xCorner === undefined && xCenter === undefined) {
    throw new Error("ASC 缺少 xllcorner 或 xllcenter。");
  }
  if (yCorner === undefined && yCenter === undefined) {
    throw new Error("ASC 缺少 yllcorner 或 yllcenter。");
  }

  const west = xCorner ?? xCenter! - cellSize / 2;
  const south = yCorner ?? yCenter! - cellSize / 2;
  const geographicBounds = {
    west,
    south,
    east: west + width * cellSize,
    north: south + height * cellSize,
  };
  validateGeographicBounds(geographicBounds);

  const tokens = lines.slice(dataStart).join(" ").split(/\s+/);
  const expectedLength = width * height;
  if (tokens.length !== expectedLength) {
    throw new Error(
      `ASC 像元数量不正确：期望 ${expectedLength.toLocaleString()}，实际 ${tokens.length.toLocaleString()}。`,
    );
  }

  const values = new Float32Array(expectedLength);
  for (let index = 0; index < expectedLength; index += 1) {
    const value = Number(tokens[index]);
    if (!Number.isFinite(value)) {
      throw new Error(`ASC 第 ${index + 1} 个像元不是有效数字。`);
    }
    values[index] = value;
  }

  const noDataValue = header.get("nodata_value");
  const { minimum, maximum } = calculateRange(values, noDataValue);

  return {
    name,
    width,
    height,
    values,
    noDataValue,
    minimum,
    maximum,
    coordinateSystem: "geographic",
    sourceBounds: geographicBounds,
    geographicBounds,
    projectionLabel: "地理坐标（按 EPSG:4326 解释）",
  };
}

function resolveCoordinateSystem(
  modelType: number | undefined,
  projectedCode: number | undefined,
  geographicCode: number | undefined,
  rawBounds: number[],
): DemCoordinateSystem {
  if (projectedCode === 3857) return "web-mercator";
  if (
    modelType === 2 ||
    geographicCode === 4326 ||
    geographicCode === 4490
  ) {
    return "geographic";
  }

  const [west, south, east, north] = rawBounds;
  const looksGeographic =
    west !== undefined &&
    south !== undefined &&
    east !== undefined &&
    north !== undefined &&
    west >= -180 &&
    east <= 180 &&
    south >= -90 &&
    north <= 90;
  if (!modelType && !projectedCode && looksGeographic) return "geographic";

  const code = projectedCode ?? geographicCode;
  throw new Error(
    `暂不支持该 GeoTIFF 坐标系${code ? `（EPSG:${code}）` : ""}。请转换为 EPSG:4326、4490 或 3857。`,
  );
}

function normalizeBounds(bounds: number[]): DemBounds {
  const [x1, y1, x2, y2] = bounds;
  if (
    x1 === undefined ||
    y1 === undefined ||
    x2 === undefined ||
    y2 === undefined ||
    ![x1, y1, x2, y2].every(Number.isFinite)
  ) {
    throw new Error("DEM 缺少有效的地理范围。");
  }
  return {
    west: Math.min(x1, x2),
    south: Math.min(y1, y2),
    east: Math.max(x1, x2),
    north: Math.max(y1, y2),
  };
}

function toGeographicBounds(
  bounds: DemBounds,
  coordinateSystem: DemCoordinateSystem,
): DemBounds {
  if (coordinateSystem === "geographic") return bounds;
  return {
    west: webMercatorToLongitude(bounds.west),
    south: webMercatorToLatitude(bounds.south),
    east: webMercatorToLongitude(bounds.east),
    north: webMercatorToLatitude(bounds.north),
  };
}

function validateDimensions(width: number, height: number): void {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 2 ||
    height < 2
  ) {
    throw new Error("DEM 行列数无效，宽高必须至少为 2。");
  }
  if (width * height > MAX_PIXEL_COUNT) {
    throw new Error(
      `当前示例最多读取 ${MAX_PIXEL_COUNT.toLocaleString()} 个像元，请先建立概览或裁剪 DEM。`,
    );
  }
}

function validateGeographicBounds(bounds: DemBounds): void {
  if (
    bounds.west < -180 ||
    bounds.east > 180 ||
    bounds.south < -90 ||
    bounds.north > 90 ||
    bounds.west >= bounds.east ||
    bounds.south >= bounds.north
  ) {
    throw new Error("DEM 地理范围无效或跨越了经度 180°。");
  }
}

function calculateRange(
  values: ArrayLike<number>,
  noDataValue: number | undefined,
): { minimum: number; maximum: number } {
  let minimum = Number.POSITIVE_INFINITY;
  let maximum = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < values.length; index += 1) {
    const value = Number(values[index]);
    if (isNoDataValue(value, noDataValue)) continue;
    minimum = Math.min(minimum, value);
    maximum = Math.max(maximum, value);
  }

  if (!Number.isFinite(minimum) || !Number.isFinite(maximum)) {
    throw new Error("DEM 不包含有效高程值。");
  }
  if (minimum === maximum) maximum = minimum + 1;

  return { minimum, maximum };
}

function requireHeader(header: Map<string, number>, key: string): number {
  const value = header.get(key);
  if (value === undefined) throw new Error(`ASC 缺少 ${key}。`);
  return value;
}

function numberOrUndefined(value: unknown): number | undefined {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

