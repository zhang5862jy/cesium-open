const A = 6378137;
const B = 6356752.314245179;

export function isTargetVisible(x: number, y: number, z: number, vp: number[], camera: number[], checkViewport = true): boolean {
  const w = vp[3]! * x + vp[7]! * y + vp[11]! * z + vp[15]!;
  if (w <= 0) return false;
  const clipX = vp[0]! * x + vp[4]! * y + vp[8]! * z + vp[12]!;
  const clipY = vp[1]! * x + vp[5]! * y + vp[9]! * z + vp[13]!;
  if (checkViewport && (Math.abs(clipX) > w || Math.abs(clipY) > w)) return false;
  // Camera-to-target segment intersecting the WGS84 ellipsoid means the target is occluded.
  const ox = camera[0]! / A, oy = camera[1]! / A, oz = camera[2]! / B;
  const dx = x / A - ox, dy = y / A - oy, dz = z / B - oz;
  const a = dx * dx + dy * dy + dz * dz;
  const b = ox * dx + oy * dy + oz * dz;
  const c = ox * ox + oy * oy + oz * oz - 1;
  if (c < 0) return false;
  const discriminant = b * b - a * c;
  if (a > 0 && discriminant >= 0) {
    const entry = (-b - Math.sqrt(discriminant)) / a;
    if (entry >= 0 && entry < 1 - 1e-8) return false;
  }
  return true;
}

/** A panel can remain visible after its target leaves the viewport. */
export function isCalloutInViewport(anchorX: number, anchorY: number, left: number, top: number, width: number, height: number, viewportWidth: number, viewportHeight: number): boolean {
  return anchorX >= 0 && anchorX <= viewportWidth && anchorY >= 0 && anchorY <= viewportHeight
    || width > 0 && height > 0 && left < viewportWidth && left + width > 0 && top < viewportHeight && top + height > 0;
}

