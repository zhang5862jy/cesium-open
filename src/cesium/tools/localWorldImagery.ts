import * as Cesium from "cesium";

export interface LocalWorldBaseLayers {
  west: Cesium.ImageryLayer;
  east: Cesium.ImageryLayer;
}

const WESTERN_HEMISPHERE = Cesium.Rectangle.fromDegrees(-180, -90, 0, 90);
const EASTERN_HEMISPHERE = Cesium.Rectangle.fromDegrees(0, -90, 180, 90);

/**
 * Creates the repository-standard offline globe base map.
 *
 * Cesium's bundled NaturalEarthII level zero consists of one image per
 * hemisphere. SingleTileImageryProvider keeps both images fixed at every
 * zoom level, so examples never start a tile pyramid or contact a map service.
 */
export async function createLocalWorldBaseLayers(): Promise<LocalWorldBaseLayers> {
  const [westProvider, eastProvider] = await Promise.all([
    Cesium.SingleTileImageryProvider.fromUrl(
      Cesium.buildModuleUrl("Assets/Textures/NaturalEarthII/0/0/0.jpg"),
      { rectangle: WESTERN_HEMISPHERE },
    ),
    Cesium.SingleTileImageryProvider.fromUrl(
      Cesium.buildModuleUrl("Assets/Textures/NaturalEarthII/0/1/0.jpg"),
      { rectangle: EASTERN_HEMISPHERE },
    ),
  ]);

  return {
    west: new Cesium.ImageryLayer(westProvider),
    east: new Cesium.ImageryLayer(eastProvider),
  };
}

/** Adds the eastern half after the western layer supplied to Viewer. */
export function completeLocalWorldBaseLayer(
  viewer: Cesium.Viewer,
  layers: LocalWorldBaseLayers,
): void {
  viewer.imageryLayers.add(layers.east);
}
