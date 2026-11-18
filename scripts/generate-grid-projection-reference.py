"""Developer-only fixture generator; requires pyproj, not used by the app."""
import json
from pathlib import Path
from pyproj import Transformer

cases = []
for epsg, width, zone, points in [
    (4498, 6, 20, [(117, 0), (117, 39.907), (114.01, 20), (119.99, 50)]),
    (4527, 3, 39, [(117, 39.907), (115.51, 35), (118.49, 45)]),
    (4528, 3, 40, [(120, 40), (118.51, 30)]),
]:
    transformer = Transformer.from_crs(4490, epsg, always_xy=True)
    for longitude, latitude in points:
        easting, northing = transformer.transform(longitude, latitude)
        cases.append(dict(epsg=epsg, width=width, zone=zone,
                          longitude=longitude, latitude=latitude,
                          easting=easting - zone * 1_000_000, northing=northing))

Path(__file__).with_name("grid-projection-reference.json").write_text(
    json.dumps({"source": "pyproj / PROJ EPSG database, always_xy=True; zone prefix removed from easting",
                "cases": cases}, indent=2), encoding="utf-8")
