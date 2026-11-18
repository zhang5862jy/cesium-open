/**
 * Fabric material source for the shield surface.
 *
 * A dominant-axis cube projection avoids the singular poles of latitude/
 * longitude UVs. Each impact packs (direction * intensity, startTime), so both
 * the honeycomb and waves remain stable over the complete sphere.
 */
export const energyShieldMaterialSource = `
float hexDistance(vec2 point) {
  point = abs(point);
  return max(
    point.x * 1.1547005,
    point.x * 0.5773503 + point.y
  );
}

vec4 hexCell(vec2 coordinates) {
  // Convert a point to fractional axial coordinates for pointy-top hexagons.
  float axialX = coordinates.x * 0.5773503 - coordinates.y / 3.0;
  float axialZ = coordinates.y * 0.6666667;
  vec3 cube = vec3(axialX, -axialX - axialZ, axialZ);
  vec3 rounded = floor(cube + 0.5);
  vec3 error = abs(rounded - cube);

  // Preserve x + y + z = 0 after rounding to the nearest hexagon.
  if (error.x > error.y && error.x > error.z) {
    rounded.x = -rounded.y - rounded.z;
  } else if (error.y > error.z) {
    rounded.y = -rounded.x - rounded.z;
  } else {
    rounded.z = -rounded.x - rounded.y;
  }

  vec2 center = vec2(
    1.7320508 * (rounded.x + rounded.z * 0.5),
    1.5 * rounded.z
  );
  return vec4(coordinates - center, rounded.xz);
}

float cellVariation(vec2 cellId) {
  // A three-coloring of the hex lattice keeps dark panels separated, giving
  // the surface a football-like one-dark/two-light panel rhythm.
  float category = mod(cellId.x - cellId.y, 3.0);
  return step(0.5, category);
}

vec3 cubeProject(vec3 direction) {
  vec3 absoluteDirection = abs(direction);
  vec2 projected;
  float faceId;

  if (
    absoluteDirection.x >= absoluteDirection.y &&
    absoluteDirection.x >= absoluteDirection.z
  ) {
    projected = direction.x >= 0.0
      ? vec2(-direction.z, direction.y) / absoluteDirection.x
      : vec2(direction.z, direction.y) / absoluteDirection.x;
    faceId = direction.x >= 0.0 ? 0.0 : 1.0;
  } else if (absoluteDirection.y >= absoluteDirection.z) {
    projected = direction.y >= 0.0
      ? vec2(direction.x, -direction.z) / absoluteDirection.y
      : vec2(direction.x, direction.z) / absoluteDirection.y;
    faceId = direction.y >= 0.0 ? 2.0 : 3.0;
  } else {
    projected = direction.z >= 0.0
      ? vec2(direction.x, direction.y) / absoluteDirection.z
      : vec2(-direction.x, direction.y) / absoluteDirection.z;
    faceId = direction.z >= 0.0 ? 4.0 : 5.0;
  }

  return vec3(projected, faceId);
}

float impactWave(vec3 surfaceDirection, vec4 impact) {
  float intensity = length(impact.xyz);
  vec3 impactDirection = impact.xyz / max(intensity, 0.0001);
  float age = shieldTime - impact.w;
  float normalizedAge = age / impactDuration;
  float activeWave = step(0.0, age) * (1.0 - step(1.0, normalizedAge));
  float safeAge = clamp(age, 0.0, impactDuration);
  float safeNormalizedAge = safeAge / impactDuration;
  float distanceToImpact = acos(clamp(
    dot(surfaceDirection, impactDirection),
    -1.0,
    1.0
  )) / czm_pi;
  float waveRadius = safeNormalizedAge * 0.68;
  float delta = abs(distanceToImpact - waveRadius);
  float waveEnvelope = exp(-delta * 72.0);
  float wavelets = 0.64 + 0.36 * cos(
    delta * 260.0 - safeNormalizedAge * 8.0
  );
  float centerFlash = exp(-distanceToImpact * 42.0) * exp(-safeAge * 2.2);
  return activeWave * intensity * (
    waveEnvelope * wavelets + centerFlash * 1.6
  );
}

czm_material czm_getMaterial(czm_materialInput materialInput) {
  czm_material material = czm_getDefaultMaterial(materialInput);
  vec3 surfaceDirection = normalize(
    transpose(czm_normal) * materialInput.normalEC
  );
  vec3 projected = cubeProject(surfaceDirection);

  vec2 hexCoordinates = projected.xy * hexScale;
  vec4 cell = hexCell(hexCoordinates);
  float cellDistance = hexDistance(cell.xy);
  float distanceToBoundary = 1.0 - cellDistance;
  float edgeWidth = max(fwidth(cellDistance) * 1.15, 0.004);
  float tileInterior = smoothstep(0.016, 0.016 + edgeWidth, distanceToBoundary);
  vec2 variationId = cell.zw + vec2(projected.z * 7.0, projected.z * 11.0);
  float tileShade = mix(0.48, 0.56, cellVariation(variationId));

  float impacts = impactWave(surfaceDirection, impact0)
    + impactWave(surfaceDirection, impact1)
    + impactWave(surfaceDirection, impact2)
    + impactWave(surfaceDirection, impact3)
    + impactWave(surfaceDirection, impact4)
    + impactWave(surfaceDirection, impact5)
    + impactWave(surfaceDirection, impact6)
    + impactWave(surfaceDirection, impact7);

  vec3 viewDirection = normalize(materialInput.positionToEyeEC);
  float facing = abs(dot(normalize(materialInput.normalEC), viewDirection));
  float fresnel = pow(1.0 - facing, 2.35);
  float breathing = sin(shieldTime * 1.8) * 0.5 + 0.5;
  float surfaceHeight = surfaceDirection.z * 0.5 + 0.5;
  float latitudeScan = pow(
    max(0.0, 1.0 - abs(fract(surfaceHeight * 1.45 - shieldTime * 0.085) - 0.5) * 12.0),
    2.0
  );

  float waveEnergy = latitudeScan * 0.05 + impacts * 1.28;
  vec3 seamColor = glowColor.rgb * (0.52 + breathing * 0.06);
  vec3 tileColor = shieldColor.rgb * (0.28 + tileShade * 0.3);
  tileColor += glowColor.rgb * (waveEnergy * 0.48 + fresnel * 0.12);
  vec3 color = mix(seamColor, tileColor, tileInterior);

  material.diffuse = color;
  material.emission = glowColor.rgb * (
    (1.0 - tileInterior) * 0.32
      + waveEnergy * 0.26
      + fresnel * 0.12
  );
  material.alpha = clamp(
    mix(0.64, shieldColor.a + 0.3, tileInterior)
      + fresnel * 0.12
      + impacts * 0.2,
    0.0,
    0.88
  );
  return material;
}
`;
