import * as Cesium from "cesium";
import {
  type DemRaster,
  isNoDataValue,
  latitudeToWebMercator,
  longitudeToWebMercator,
} from "./DemRaster";
import {
  createColorLookup,
  findColorRamp,
} from "./colorRamps";

export interface DemRenderStyle {
  rampId: string;
  minimum: number;
  maximum: number;
  opacity: number;
  hillshade: number;
}

export interface DemTileStats {
  cacheSize: number;
  hasData: boolean;
}

const TILE_SIZE = 256;
const MAX_CACHE_SIZE = 128;
const METERS_PER_DEGREE_LATITUDE = 110_574;
const METERS_PER_DEGREE_LONGITUDE = 111_320;

export class DemImageryProvider {
  readonly tileWidth = TILE_SIZE;
  readonly tileHeight = TILE_SIZE;
  readonly minimumLevel = 0;
  readonly tilingScheme = new Cesium.GeographicTilingScheme();
  readonly tileDiscardPolicy = undefined;
  readonly errorEvent = new Cesium.Event();
  readonly credit: Cesium.Credit;
  readonly proxy = undefined;
  readonly hasAlphaChannel = true;
  readonly rectangle: Cesium.Rectangle;
  readonly maximumLevel: number;

  private readonly lookup: Uint8ClampedArray;
  private readonly cache = new Map<string, HTMLCanvasElement>();
  private readonly raster: DemRaster;
  private readonly style: DemRenderStyle;
  private readonly onTileRendered?: (stats: DemTileStats) => void;

  constructor(
    raster: DemRaster,
    style: DemRenderStyle,
    onTileRendered?: (stats: DemTileStats) => void,
  ) {
    this.raster = raster;
    this.style = style;
    this.onTileRendered = onTileRendered;
    const bounds = raster.geographicBounds;
    this.rectangle = Cesium.Rectangle.fromDegrees(
      bounds.west,
      bounds.south,
      bounds.east,
      bounds.north,
    );
    this.maximumLevel = calculateMaximumLevel(raster);
    this.lookup = createColorLookup(findColorRamp(style.rampId));
    this.credit = new Cesium.Credit(
      `本地 DEM：${escapeHtml(raster.name)}`,
    );
  }

  getTileCredits(): Cesium.Credit[] {
    return [];
  }

  requestImage(
    x: number,
    y: number,
    level: number,
  ): Promise<HTMLCanvasElement> {
    const cacheKey = `${level}/${x}/${y}`;
    const cachedTile = this.cache.get(cacheKey);
    if (cachedTile) {
      this.cache.delete(cacheKey);
      this.cache.set(cacheKey, cachedTile);
      return Promise.resolve(cachedTile);
    }

    const tileRectangle = this.tilingScheme.tileXYToRectangle(x, y, level);
    const canvas = document.createElement("canvas");
    canvas.width = TILE_SIZE;
    canvas.height = TILE_SIZE;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) return Promise.resolve(canvas);

    const imageData = context.createImageData(TILE_SIZE, TILE_SIZE);
    const hasData = this.renderTile(tileRectangle, imageData.data);
    context.putImageData(imageData, 0, 0);
    this.cache.set(cacheKey, canvas);

    if (this.cache.size > MAX_CACHE_SIZE) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) this.cache.delete(oldestKey);
    }
    this.onTileRendered?.({ cacheSize: this.cache.size, hasData });

    return Promise.resolve(canvas);
  }

  pickFeatures(): undefined {
    return undefined;
  }

  sampleAt(longitude: number, latitude: number): number | undefined {
    const sourcePoint = this.toSourceCoordinates(longitude, latitude);
    return this.sampleBilinear(sourcePoint.x, sourcePoint.y);
  }

  private renderTile(
    rectangle: Cesium.Rectangle,
    output: Uint8ClampedArray,
  ): boolean {
    const west = Cesium.Math.toDegrees(rectangle.west);
    const east = Cesium.Math.toDegrees(rectangle.east);
    const south = Cesium.Math.toDegrees(rectangle.south);
    const north = Cesium.Math.toDegrees(rectangle.north);
    const longitudeStep = (east - west) / TILE_SIZE;
    const latitudeStep = (north - south) / TILE_SIZE;
    const range = Math.max(this.style.maximum - this.style.minimum, 1e-12);
    const alpha = Math.round(255 * Math.max(0, Math.min(1, this.style.opacity)));
    let hasData = false;

    for (let row = 0; row < TILE_SIZE; row += 1) {
      const latitude = north - (row + 0.5) * latitudeStep;
      for (let column = 0; column < TILE_SIZE; column += 1) {
        const longitude = west + (column + 0.5) * longitudeStep;
        const targetIndex = (row * TILE_SIZE + column) * 4;

        if (!this.contains(longitude, latitude)) {
          output[targetIndex + 3] = 0;
          continue;
        }

        const sourcePoint = this.toSourceCoordinates(longitude, latitude);
        const height = this.sampleBilinear(sourcePoint.x, sourcePoint.y);
        if (height === undefined) {
          output[targetIndex + 3] = 0;
          continue;
        }

        const normalized = Math.max(
          0,
          Math.min(1, (height - this.style.minimum) / range),
        );
        const lookupIndex = Math.round(
          normalized * (this.lookup.length / 3 - 1),
        );
        const brightness = this.calculateBrightness(
          sourcePoint.x,
          sourcePoint.y,
          latitude,
        );

        output[targetIndex] = this.lookup[lookupIndex * 3]! * brightness;
        output[targetIndex + 1] =
          this.lookup[lookupIndex * 3 + 1]! * brightness;
        output[targetIndex + 2] =
          this.lookup[lookupIndex * 3 + 2]! * brightness;
        output[targetIndex + 3] = alpha;
        hasData = true;
      }
    }
    return hasData;
  }

  private contains(longitude: number, latitude: number): boolean {
    const bounds = this.raster.geographicBounds;
    return (
      longitude >= bounds.west &&
      longitude <= bounds.east &&
      latitude >= bounds.south &&
      latitude <= bounds.north
    );
  }

  private toSourceCoordinates(
    longitude: number,
    latitude: number,
  ): { x: number; y: number } {
    if (this.raster.coordinateSystem === "web-mercator") {
      return {
        x: longitudeToWebMercator(longitude),
        y: latitudeToWebMercator(latitude),
      };
    }
    return { x: longitude, y: latitude };
  }

  private sampleBilinear(x: number, y: number): number | undefined {
    const bounds = this.raster.sourceBounds;
    const column =
      ((x - bounds.west) / (bounds.east - bounds.west)) *
      (this.raster.width - 1);
    const row =
      ((bounds.north - y) / (bounds.north - bounds.south)) *
      (this.raster.height - 1);

    if (
      column < 0 ||
      row < 0 ||
      column > this.raster.width - 1 ||
      row > this.raster.height - 1
    ) {
      return undefined;
    }

    const x0 = Math.floor(column);
    const y0 = Math.floor(row);
    const x1 = Math.min(x0 + 1, this.raster.width - 1);
    const y1 = Math.min(y0 + 1, this.raster.height - 1);
    const tx = column - x0;
    const ty = row - y0;

    const samples = [
      { value: this.valueAt(x0, y0), weight: (1 - tx) * (1 - ty) },
      { value: this.valueAt(x1, y0), weight: tx * (1 - ty) },
      { value: this.valueAt(x0, y1), weight: (1 - tx) * ty },
      { value: this.valueAt(x1, y1), weight: tx * ty },
    ];
    let sum = 0;
    let weightSum = 0;

    for (const sample of samples) {
      if (sample.value === undefined || sample.weight <= 0) continue;
      sum += sample.value * sample.weight;
      weightSum += sample.weight;
    }
    return weightSum > 0 ? sum / weightSum : undefined;
  }

  private valueAt(column: number, row: number): number | undefined {
    const value = Number(
      this.raster.values[row * this.raster.width + column],
    );
    return isNoDataValue(value, this.raster.noDataValue) ? undefined : value;
  }

  private calculateBrightness(
    x: number,
    y: number,
    latitude: number,
  ): number {
    if (this.style.hillshade <= 0) return 1;

    const bounds = this.raster.sourceBounds;
    const xStep = (bounds.east - bounds.west) / (this.raster.width - 1);
    const yStep = (bounds.north - bounds.south) / (this.raster.height - 1);
    const west = this.sampleBilinear(x - xStep, y);
    const east = this.sampleBilinear(x + xStep, y);
    const south = this.sampleBilinear(x, y - yStep);
    const north = this.sampleBilinear(x, y + yStep);
    if (
      west === undefined ||
      east === undefined ||
      south === undefined ||
      north === undefined
    ) {
      return 1;
    }

    const xMeters =
      this.raster.coordinateSystem === "web-mercator"
        ? xStep * Math.cos(Cesium.Math.toRadians(latitude))
        : xStep *
          METERS_PER_DEGREE_LONGITUDE *
          Math.cos(Cesium.Math.toRadians(latitude));
    const yMeters =
      this.raster.coordinateSystem === "web-mercator"
        ? yStep * Math.cos(Cesium.Math.toRadians(latitude))
        : yStep * METERS_PER_DEGREE_LATITUDE;
    const dzdx = (east - west) / Math.max(2 * xMeters, 0.001);
    const dzdy = (north - south) / Math.max(2 * yMeters, 0.001);

    const normalLength = Math.sqrt(dzdx * dzdx + dzdy * dzdy + 1);
    const azimuth = Cesium.Math.toRadians(315);
    const altitude = Cesium.Math.toRadians(45);
    const lightX = Math.sin(azimuth) * Math.cos(altitude);
    const lightY = Math.cos(azimuth) * Math.cos(altitude);
    const lightZ = Math.sin(altitude);
    const shade = Math.max(
      0,
      (-dzdx * lightX - dzdy * lightY + lightZ) / normalLength,
    );
    const strength = Math.max(0, Math.min(1, this.style.hillshade));
    return Math.max(0.35, Math.min(1.35, 1 + (shade - 0.6) * strength * 1.5));
  }
}

function calculateMaximumLevel(raster: DemRaster): number {
  const bounds = raster.geographicBounds;
  const longitudeResolution =
    (bounds.east - bounds.west) / Math.max(raster.width - 1, 1);
  const latitudeResolution =
    (bounds.north - bounds.south) / Math.max(raster.height - 1, 1);
  const sourceResolution = Math.max(longitudeResolution, latitudeResolution);
  const level = Math.ceil(
    Math.log2(180 / (TILE_SIZE * Math.max(sourceResolution, 1e-12))),
  );
  return Math.max(0, Math.min(22, level));
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
