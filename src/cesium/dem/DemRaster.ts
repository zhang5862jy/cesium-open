export type DemCoordinateSystem = "geographic" | "web-mercator";

export interface DemBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface DemRaster {
  name: string;
  width: number;
  height: number;
  values: ArrayLike<number>;
  noDataValue?: number;
  minimum: number;
  maximum: number;
  coordinateSystem: DemCoordinateSystem;
  sourceBounds: DemBounds;
  geographicBounds: DemBounds;
  projectionLabel: string;
}

const WEB_MERCATOR_RADIUS = 6_378_137;
const WEB_MERCATOR_LIMIT = 85.0511287798066;

export function longitudeToWebMercator(longitude: number): number {
  return (longitude * Math.PI * WEB_MERCATOR_RADIUS) / 180;
}

export function latitudeToWebMercator(latitude: number): number {
  const limitedLatitude = Math.max(
    -WEB_MERCATOR_LIMIT,
    Math.min(WEB_MERCATOR_LIMIT, latitude),
  );
  return (
    WEB_MERCATOR_RADIUS *
    Math.log(Math.tan(Math.PI / 4 + (limitedLatitude * Math.PI) / 360))
  );
}

export function webMercatorToLongitude(x: number): number {
  return (x / WEB_MERCATOR_RADIUS) * (180 / Math.PI);
}

export function webMercatorToLatitude(y: number): number {
  return (
    (Math.atan(Math.exp(y / WEB_MERCATOR_RADIUS)) * 2 - Math.PI / 2) *
    (180 / Math.PI)
  );
}

export function isNoDataValue(
  value: number,
  noDataValue: number | undefined,
): boolean {
  if (!Number.isFinite(value)) return true;
  if (noDataValue === undefined) return false;

  const tolerance = Math.max(1, Math.abs(noDataValue)) * 1e-7;
  return Math.abs(value - noDataValue) <= tolerance;
}

