import * as Cesium from "cesium";

const depthFogFragmentShader = /* glsl */ `
uniform sampler2D colorTexture;
uniform sampler2D depthTexture;
uniform vec4 fogColor;
uniform float nearDistance;
uniform float farDistance;
uniform float density;
uniform float noiseStrength;
uniform float noiseScale;
uniform float timeSeconds;

in vec2 v_textureCoordinates;

float eyeDistance(vec2 texCoords)
{
  float depth = czm_unpackDepth(texture(depthTexture, texCoords));
  if (depth <= 0.0) {
    return czm_infinity;
  }

  vec4 eyeCoordinate = czm_windowToEyeCoordinates(gl_FragCoord.xy, depth);
  return -eyeCoordinate.z / eyeCoordinate.w;
}

float hash12(vec2 point)
{
  vec3 point3 = fract(vec3(point.xyx) * 0.1031);
  point3 += dot(point3, point3.yzx + 33.33);
  return fract((point3.x + point3.y) * point3.z);
}

float valueNoise(vec2 point)
{
  vec2 cell = floor(point);
  vec2 local = fract(point);
  local = local * local * (3.0 - 2.0 * local);

  float lower = mix(hash12(cell), hash12(cell + vec2(1.0, 0.0)), local.x);
  float upper = mix(
    hash12(cell + vec2(0.0, 1.0)),
    hash12(cell + vec2(1.0, 1.0)),
    local.x
  );
  return mix(lower, upper, local.y);
}

float fogNoise(vec2 texCoords)
{
  vec2 aspect = vec2(czm_viewport.z / max(czm_viewport.w, 1.0), 1.0);
  vec2 drift = vec2(timeSeconds * 0.055, timeSeconds * -0.018);
  vec2 point = texCoords * aspect * noiseScale + drift;
  float broad = valueNoise(point);
  float detail = valueNoise(point * 2.07 + vec2(7.4, -3.1));
  return broad * 0.7 + detail * 0.3;
}

void main()
{
  vec4 sceneColor = texture(colorTexture, v_textureCoordinates);
  float distanceToCamera = eyeDistance(v_textureCoordinates);
  if (distanceToCamera == czm_infinity) {
    out_FragColor = sceneColor;
    return;
  }

  float range = max(farDistance - nearDistance, 1.0);
  float distanceFog = smoothstep(
    nearDistance,
    farDistance,
    distanceToCamera
  );
  float exponentialFog = 1.0 - exp(
    -max(density, 0.0) * max(distanceToCamera - nearDistance, 0.0) / range
  );
  float baseFog = max(distanceFog, exponentialFog * 0.82);
  float variation = mix(1.0, 0.68 + fogNoise(v_textureCoordinates) * 0.58, noiseStrength);
  float amount = clamp(baseFog * variation, 0.0, fogColor.a);

  vec3 scattered = mix(sceneColor.rgb, fogColor.rgb, amount);
  out_FragColor = vec4(scattered, sceneColor.a);
}
`;

export interface DepthFogOptions {
  /** Distance in metres at which fog begins to affect geometry. */
  nearDistance?: number;
  /** Distance in metres at which the linear fog term reaches full strength. */
  farDistance?: number;
  /** Exponential density multiplier in the view-distance interval. */
  density?: number;
  /** Fog tint; alpha is the maximum blend amount. */
  color?: Cesium.Color;
  /** Screen-space low-frequency variation from 0 (uniform) to 1 (wispy). */
  noiseStrength?: number;
  /** Number of broad noise cells across the viewport height. */
  noiseScale?: number;
  /** Whether the stage executes. */
  show?: boolean;
}

const defaultOptions: Required<Omit<DepthFogOptions, "color">> = {
  nearDistance: 12_000,
  farDistance: 180_000,
  density: 1.15,
  noiseStrength: 0.32,
  noiseScale: 4.5,
  show: true,
};

/**
 * A depth-aware fog post-process stage.
 *
 * The stage follows Cesium's Sandcastle depth-fog technique: packed scene
 * depth is reconstructed to eye coordinates before view distance controls the
 * blend. A small procedural noise term breaks up the otherwise uniform layer.
 */
export class DepthFogStage {
  private readonly collection: Cesium.PostProcessStageCollection;
  private readonly stage: Cesium.PostProcessStage;
  private nearDistanceValue: number;
  private farDistanceValue: number;
  private densityValue: number;
  private colorValue: Cesium.Color;
  private noiseStrengthValue: number;
  private noiseScaleValue: number;
  private timeSecondsValue = 0;
  private destroyed = false;

  constructor(scene: Cesium.Scene, options: DepthFogOptions = {}) {
    this.collection = scene.postProcessStages;
    this.nearDistanceValue = options.nearDistance ?? defaultOptions.nearDistance;
    this.farDistanceValue = options.farDistance ?? defaultOptions.farDistance;
    this.densityValue = options.density ?? defaultOptions.density;
    this.colorValue = Cesium.Color.clone(
      options.color ?? Cesium.Color.fromCssColorString("#a7c5ce").withAlpha(0.9),
    );
    this.noiseStrengthValue =
      options.noiseStrength ?? defaultOptions.noiseStrength;
    this.noiseScaleValue = options.noiseScale ?? defaultOptions.noiseScale;

    this.stage = new Cesium.PostProcessStage({
      name: "depth-aware-procedural-fog",
      fragmentShader: depthFogFragmentShader,
      uniforms: {
        fogColor: () => this.colorValue,
        nearDistance: () => this.nearDistanceValue,
        farDistance: () => this.farDistanceValue,
        density: () => this.densityValue,
        noiseStrength: () => this.noiseStrengthValue,
        noiseScale: () => this.noiseScaleValue,
        timeSeconds: () => this.timeSecondsValue,
      },
    });
    this.collection.add(this.stage);
    this.stage.enabled = options.show ?? defaultOptions.show;
  }

  get show(): boolean {
    return this.stage.enabled;
  }

  set show(value: boolean) {
    this.stage.enabled = value;
  }

  /** Updates any subset of the fog controls without rebuilding the GPU stage. */
  setOptions(options: Omit<DepthFogOptions, "show">): void {
    if (options.nearDistance !== undefined) {
      this.nearDistanceValue = Math.max(0, options.nearDistance);
    }
    if (options.farDistance !== undefined) {
      this.farDistanceValue = Math.max(
        this.nearDistanceValue + 1,
        options.farDistance,
      );
    }
    if (options.density !== undefined) {
      this.densityValue = Math.max(0, options.density);
    }
    if (options.color !== undefined) {
      Cesium.Color.clone(options.color, this.colorValue);
    }
    if (options.noiseStrength !== undefined) {
      this.noiseStrengthValue = Cesium.Math.clamp(
        options.noiseStrength,
        0,
        1,
      );
    }
    if (options.noiseScale !== undefined) {
      this.noiseScaleValue = Math.max(0.01, options.noiseScale);
    }
  }

  /** Supplies animation time without tying the effect to Cesium's scene clock. */
  setTime(seconds: number): void {
    this.timeSecondsValue = seconds;
  }

  isDestroyed(): boolean {
    return this.destroyed;
  }

  /** Removes the stage and deterministically releases its framebuffer resources. */
  destroy(): void {
    if (this.destroyed) return;
    this.collection.remove(this.stage);
    this.destroyed = true;
  }
}
