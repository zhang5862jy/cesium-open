import * as Cesium from "cesium";

const depthEdgeFragmentShader = /* glsl */ `
uniform sampler2D colorTexture;
uniform sampler2D depthTexture;
uniform vec4 outlineColor;
uniform vec4 backgroundColor;
uniform float sampleRadius;
uniform float edgeStrength;
uniform float edgeThreshold;
uniform float depthWeight;
uniform float blueprintAmount;
uniform float posterizeSteps;

in vec2 v_textureCoordinates;

float luminanceAt(vec2 uv)
{
  vec3 color = texture(colorTexture, clamp(uv, vec2(0.0), vec2(1.0))).rgb;
  return dot(color, vec3(0.299, 0.587, 0.114));
}

float depthMetricAt(vec2 uv)
{
  vec2 safeUv = clamp(uv, vec2(0.0), vec2(1.0));
  float packedDepth = czm_unpackDepth(texture(depthTexture, safeUv));
  if (packedDepth <= 0.0) {
    return 0.0;
  }

  vec2 windowPosition = safeUv * czm_viewport.zw + czm_viewport.xy;
  vec4 eyeCoordinate = czm_windowToEyeCoordinates(windowPosition, packedDepth);
  float distanceToCamera = max(-eyeCoordinate.z / eyeCoordinate.w, 1.0);
  return log2(distanceToCamera + 1.0) / 24.0;
}

vec2 sobelLuminance(vec2 uv, vec2 texel)
{
  float topLeft = luminanceAt(uv + texel * vec2(-1.0, 1.0));
  float top = luminanceAt(uv + texel * vec2(0.0, 1.0));
  float topRight = luminanceAt(uv + texel * vec2(1.0, 1.0));
  float left = luminanceAt(uv + texel * vec2(-1.0, 0.0));
  float right = luminanceAt(uv + texel * vec2(1.0, 0.0));
  float bottomLeft = luminanceAt(uv + texel * vec2(-1.0, -1.0));
  float bottom = luminanceAt(uv + texel * vec2(0.0, -1.0));
  float bottomRight = luminanceAt(uv + texel * vec2(1.0, -1.0));

  float horizontal =
    -topLeft - 2.0 * left - bottomLeft +
    topRight + 2.0 * right + bottomRight;
  float vertical =
    topLeft + 2.0 * top + topRight -
    bottomLeft - 2.0 * bottom - bottomRight;
  return vec2(horizontal, vertical);
}

vec2 sobelDepth(vec2 uv, vec2 texel)
{
  float topLeft = depthMetricAt(uv + texel * vec2(-1.0, 1.0));
  float top = depthMetricAt(uv + texel * vec2(0.0, 1.0));
  float topRight = depthMetricAt(uv + texel * vec2(1.0, 1.0));
  float left = depthMetricAt(uv + texel * vec2(-1.0, 0.0));
  float right = depthMetricAt(uv + texel * vec2(1.0, 0.0));
  float bottomLeft = depthMetricAt(uv + texel * vec2(-1.0, -1.0));
  float bottom = depthMetricAt(uv + texel * vec2(0.0, -1.0));
  float bottomRight = depthMetricAt(uv + texel * vec2(1.0, -1.0));

  float horizontal =
    -topLeft - 2.0 * left - bottomLeft +
    topRight + 2.0 * right + bottomRight;
  float vertical =
    topLeft + 2.0 * top + topRight -
    bottomLeft - 2.0 * bottom - bottomRight;
  return vec2(horizontal, vertical);
}

void main()
{
  vec2 texel = sampleRadius / max(czm_viewport.zw, vec2(1.0));
  vec2 colorGradient = sobelLuminance(v_textureCoordinates, texel);
  vec2 depthGradient = sobelDepth(v_textureCoordinates, texel);
  float colorEdge = length(colorGradient);
  float depthEdge = length(depthGradient) * depthWeight;
  float rawEdge = max(colorEdge, depthEdge);
  float edge = smoothstep(edgeThreshold, edgeThreshold * 2.0, rawEdge);
  edge = clamp(edge * edgeStrength, 0.0, 1.0);

  vec4 sceneColor = texture(colorTexture, v_textureCoordinates);
  float luma = dot(sceneColor.rgb, vec3(0.299, 0.587, 0.114));
  float steps = max(posterizeSteps, 2.0);
  float posterized = floor(luma * steps) / max(steps - 1.0, 1.0);
  vec3 blueprint = backgroundColor.rgb + posterized * vec3(0.035, 0.13, 0.19);
  vec3 base = mix(sceneColor.rgb, blueprint, blueprintAmount);
  vec3 outlined = mix(base, outlineColor.rgb, edge * outlineColor.a);

  out_FragColor = vec4(outlined, sceneColor.a);
}
`;

export interface DepthEdgeOutlineOptions {
  outlineColor?: Cesium.Color;
  backgroundColor?: Cesium.Color;
  sampleRadius?: number;
  edgeStrength?: number;
  edgeThreshold?: number;
  depthWeight?: number;
  blueprintAmount?: number;
  posterizeSteps?: number;
  show?: boolean;
}

/**
 * Full-screen color/depth Sobel filter with an optional blueprint grade.
 *
 * Depth samples are reconstructed into eye-space distance before differencing,
 * avoiding the extreme near/far imbalance of raw non-linear depth values.
 */
export class DepthEdgeOutlineStage {
  private readonly collection: Cesium.PostProcessStageCollection;
  private readonly stage: Cesium.PostProcessStage;
  private outlineColorValue: Cesium.Color;
  private backgroundColorValue: Cesium.Color;
  private sampleRadiusValue: number;
  private edgeStrengthValue: number;
  private edgeThresholdValue: number;
  private depthWeightValue: number;
  private blueprintAmountValue: number;
  private posterizeStepsValue: number;
  private destroyed = false;

  constructor(scene: Cesium.Scene, options: DepthEdgeOutlineOptions = {}) {
    this.collection = scene.postProcessStages;
    this.outlineColorValue = Cesium.Color.clone(
      options.outlineColor ??
        Cesium.Color.fromCssColorString("#74f6ff").withAlpha(0.95),
    );
    this.backgroundColorValue = Cesium.Color.clone(
      options.backgroundColor ??
        Cesium.Color.fromCssColorString("#06131f").withAlpha(1),
    );
    this.sampleRadiusValue = options.sampleRadius ?? 1.15;
    this.edgeStrengthValue = options.edgeStrength ?? 1.6;
    this.edgeThresholdValue = options.edgeThreshold ?? 0.045;
    this.depthWeightValue = options.depthWeight ?? 5.5;
    this.blueprintAmountValue = options.blueprintAmount ?? 0.82;
    this.posterizeStepsValue = options.posterizeSteps ?? 7;

    this.stage = new Cesium.PostProcessStage({
      name: "depth-edge-outline",
      fragmentShader: depthEdgeFragmentShader,
      uniforms: {
        outlineColor: () => this.outlineColorValue,
        backgroundColor: () => this.backgroundColorValue,
        sampleRadius: () => this.sampleRadiusValue,
        edgeStrength: () => this.edgeStrengthValue,
        edgeThreshold: () => this.edgeThresholdValue,
        depthWeight: () => this.depthWeightValue,
        blueprintAmount: () => this.blueprintAmountValue,
        posterizeSteps: () => this.posterizeStepsValue,
      },
      sampleMode: Cesium.PostProcessStageSampleMode.LINEAR,
    });
    this.collection.add(this.stage);
    this.stage.enabled = options.show ?? true;
  }

  get show(): boolean {
    return this.stage.enabled;
  }

  set show(value: boolean) {
    this.stage.enabled = value;
  }

  /** Updates uniforms in place; no shader recompilation or stage recreation. */
  setOptions(options: Omit<DepthEdgeOutlineOptions, "show">): void {
    if (options.outlineColor !== undefined) {
      Cesium.Color.clone(options.outlineColor, this.outlineColorValue);
    }
    if (options.backgroundColor !== undefined) {
      Cesium.Color.clone(options.backgroundColor, this.backgroundColorValue);
    }
    if (options.sampleRadius !== undefined) {
      this.sampleRadiusValue = Cesium.Math.clamp(options.sampleRadius, 0.5, 5);
    }
    if (options.edgeStrength !== undefined) {
      this.edgeStrengthValue = Math.max(0, options.edgeStrength);
    }
    if (options.edgeThreshold !== undefined) {
      this.edgeThresholdValue = Math.max(0.0001, options.edgeThreshold);
    }
    if (options.depthWeight !== undefined) {
      this.depthWeightValue = Math.max(0, options.depthWeight);
    }
    if (options.blueprintAmount !== undefined) {
      this.blueprintAmountValue = Cesium.Math.clamp(
        options.blueprintAmount,
        0,
        1,
      );
    }
    if (options.posterizeSteps !== undefined) {
      this.posterizeStepsValue = Math.max(2, options.posterizeSteps);
    }
  }

  isDestroyed(): boolean {
    return this.destroyed;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.collection.remove(this.stage);
    this.destroyed = true;
  }
}
