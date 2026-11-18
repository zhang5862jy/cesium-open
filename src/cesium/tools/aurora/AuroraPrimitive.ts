import * as Cesium from "cesium";

/** Which magnetic hemisphere(s) receive aurora bands. */
export type AuroraHemisphere = "north" | "south" | "both";
/** Phase labels returned by the deterministic activity cycle. */
export type AuroraActivityPhase = "growing" | "active" | "fading" | "quiet";

/** Configuration for the procedural aurora wall primitive. */
export interface AuroraPrimitiveOptions {
  /** Bottom altitude of the curtain in meters. */
  minimumHeight?: number;
  /** Top altitude of the curtain in meters. */
  maximumHeight?: number;
  /** Hemisphere selection; defaults to both. */
  hemispheres?: AuroraHemisphere;
  /** Duration of one activity cycle in seconds. */
  cycleDuration?: number;
  /** Multiplier for emitted aurora brightness. */
  brightness?: number;
}

/** Current phase and normalized intensity of the aurora animation. */
export interface AuroraActivityState {
  phase: AuroraActivityPhase;
  intensity: number;
}

/** Mutable state packed into one GeometryInstance attribute per band. */
interface AuroraInstanceState {
  id: string;
  value: Float32Array;
}

const DEFAULT_MINIMUM_HEIGHT = 100_000;
const DEFAULT_MAXIMUM_HEIGHT = 300_000;
const DEFAULT_CYCLE_DURATION = 60;
const DEFAULT_BRIGHTNESS = 1;
const BAND_COUNT = 5;
const SAMPLES_PER_BAND = 144;

// The vertex shader keeps the WallGeometry's geodetic position and forwards
// texture coordinates plus the per-band animation state to the fragment stage.
const vertexShaderSource = `
in vec3 position3DHigh;
in vec3 position3DLow;
in vec3 normal;
in vec2 st;
in float batchId;

out vec3 v_positionEC;
out vec2 v_st;
out vec3 v_surfaceNormalWC;
flat out vec4 v_auroraState;

void main() {
  vec4 position = czm_computePosition();
  vec3 positionWC = position3DHigh + position3DLow;

  v_positionEC = (czm_modelViewRelativeToEye * position).xyz;
  v_st = st;
  v_surfaceNormalWC = normalize(positionWC);
  v_auroraState = czm_batchTable_auroraState(batchId);

  gl_Position = czm_modelViewProjectionRelativeToEye * position;
}
`;

const fragmentShaderSource = `
in vec3 v_positionEC;
in vec2 v_st;
in vec3 v_surfaceNormalWC;
flat in vec4 v_auroraState;

float hash(vec2 point) {
  return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 point) {
  vec2 cell = floor(point);
  vec2 local = fract(point);
  local = local * local * (3.0 - 2.0 * local);
  return mix(
    mix(hash(cell), hash(cell + vec2(1.0, 0.0)), local.x),
    mix(hash(cell + vec2(0.0, 1.0)), hash(cell + vec2(1.0, 1.0)), local.x),
    local.y
  );
}

float fbm(vec2 point) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int index = 0; index < 4; index++) {
    value += noise(point) * amplitude;
    point = point * 2.03 + vec2(13.7, 7.9);
    amplitude *= 0.5;
  }
  return value;
}

void main() {
  // Noise creates broad curtains and fine rays; the activity state then fades
  // the result through the deterministic growing/active/quiet cycle.
  float time = v_auroraState.x;
  float activity = v_auroraState.y;
  float brightness = v_auroraState.z;
  float bandPhase = v_auroraState.w;
  float u = v_st.x;
  float v = v_st.y;

  float distortion = fbm(vec2(u * 4.0 + bandPhase, time * 0.055));
  float broadCurtain = 0.5 + 0.5 * sin(
    u * 42.0 + distortion * 8.0 - time * 0.85 + bandPhase * 11.0
  );
  broadCurtain = smoothstep(0.18, 0.94, broadCurtain);

  float rayNoise = noise(vec2(floor(u * 110.0), time * 0.75 + bandPhase * 19.0));
  float fineRays = pow(
    0.5 + 0.5 * sin(u * 690.0 + distortion * 13.0 + bandPhase * 31.0),
    6.0
  );
  float rays = mix(0.3, 1.0, max(fineRays, rayNoise * 0.72));

  float bottomFade = smoothstep(0.0, 0.13, v);
  float topFade = 1.0 - smoothstep(0.78, 1.0, v);
  float verticalShape = bottomFade * topFade;
  verticalShape *= 0.72 + 0.28 * sin(v * 18.0 - time * 1.2 + distortion * 5.0);

  float sunFacing = dot(normalize(v_surfaceNormalWC), czm_sunDirectionWC);
  float nightMask = 1.0 - smoothstep(-0.10, 0.05, sunFacing);

  vec3 violet = vec3(0.43, 0.12, 0.86);
  vec3 green = vec3(0.04, 1.0, 0.48);
  vec3 red = vec3(1.0, 0.16, 0.14);
  vec3 color = mix(violet, green, smoothstep(0.04, 0.28, v));
  color = mix(color, red, smoothstep(0.66, 0.96, v) * 0.64);

  float flicker = 0.82 + 0.18 * sin(time * 3.1 + bandPhase * 23.0);
  float intensity = broadCurtain * rays * verticalShape * nightMask;
  intensity *= activity * brightness * flicker;
  float alpha = clamp(intensity * 0.52, 0.0, 0.68);

  out_FragColor = vec4(color, alpha);
}
`;

/** CPU equivalent of GLSL smoothstep used by the activity timeline. */
function smoothStep(edge0: number, edge1: number, value: number): number {
  const normalized = Cesium.Math.clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return normalized * normalized * (3 - 2 * normalized);
}

function createFloatAttribute(
  componentsPerAttribute: number,
  value: Float32Array,
): Cesium.GeometryInstanceAttribute {
  // GeometryInstance attributes are the update channel for animation; keeping
  // one packed vec4 per band avoids rebuilding the WallGeometry each frame.
  return new Cesium.GeometryInstanceAttribute({
    componentDatatype: Cesium.ComponentDatatype.FLOAT,
    componentsPerAttribute,
    value: Array.from(value),
  });
}

/** Return the unit Cartesian direction of a magnetic pole approximation. */
function createMagneticAxis(hemisphere: "north" | "south"): Cesium.Cartesian3 {
  const longitude = Cesium.Math.toRadians(hemisphere === "north" ? -72 : 108);
  const latitude = Cesium.Math.toRadians(hemisphere === "north" ? 80 : -80);
  const cosineLatitude = Math.cos(latitude);
  return new Cesium.Cartesian3(
    cosineLatitude * Math.cos(longitude),
    cosineLatitude * Math.sin(longitude),
    Math.sin(latitude),
  );
}

/**
 * Build one closed curtain around a magnetic pole.
 *
 * The CPU samples only the stable geographic footprint and height envelope;
 * all flicker, rays, color mixing, and alpha remain in the fragment shader.
 */
function createAuroraWall(
  hemisphere: "north" | "south",
  bandIndex: number,
  minimumHeight: number,
  maximumHeight: number,
): Cesium.WallGeometry {
  const axis = createMagneticAxis(hemisphere);
  const east = Cesium.Cartesian3.normalize(
    Cesium.Cartesian3.cross(
      Cesium.Cartesian3.UNIT_Z,
      axis,
      new Cesium.Cartesian3(),
    ),
    new Cesium.Cartesian3(),
  );
  const north = Cesium.Cartesian3.normalize(
    Cesium.Cartesian3.cross(axis, east, new Cesium.Cartesian3()),
    new Cesium.Cartesian3(),
  );
  const positions: Cesium.Cartesian3[] = [];
  const minimumHeights: number[] = [];
  const maximumHeights: number[] = [];
  const bandOffset = bandIndex - (BAND_COUNT - 1) * 0.5;

  // Duplicate the first sample at the end so the wall closes without a seam.
  for (let sample = 0; sample <= SAMPLES_PER_BAND; sample += 1) {
    const fraction = sample / SAMPLES_PER_BAND;
    const angle = fraction * Cesium.Math.TWO_PI;
    const radiusDegrees =
      18 +
      bandOffset * 1.05 +
      Math.sin(angle * 2 + bandIndex * 0.7) * 1.6 +
      Math.sin(angle * 5 - bandIndex * 0.45) * 0.55;
    const radius = Cesium.Math.toRadians(radiusDegrees);
    const tangent = Cesium.Cartesian3.add(
      Cesium.Cartesian3.multiplyByScalar(
        east,
        Math.cos(angle),
        new Cesium.Cartesian3(),
      ),
      Cesium.Cartesian3.multiplyByScalar(
        north,
        Math.sin(angle),
        new Cesium.Cartesian3(),
      ),
      new Cesium.Cartesian3(),
    );
    // Rotate a point around the magnetic axis using an east/north tangent basis.
    const direction = Cesium.Cartesian3.normalize(
      Cesium.Cartesian3.add(
        Cesium.Cartesian3.multiplyByScalar(
          axis,
          Math.cos(radius),
          new Cesium.Cartesian3(),
        ),
        Cesium.Cartesian3.multiplyByScalar(
          tangent,
          Math.sin(radius),
          new Cesium.Cartesian3(),
        ),
        new Cesium.Cartesian3(),
      ),
      new Cesium.Cartesian3(),
    );
    const longitude = Math.atan2(direction.y, direction.x);
    const latitude = Math.asin(direction.z);
    const heightWave = Math.sin(angle * 7 + bandIndex * 1.4);
    const topWave = Math.sin(angle * 3 - bandIndex * 0.8);

    positions.push(Cesium.Cartesian3.fromRadians(longitude, latitude));
    minimumHeights.push(minimumHeight + heightWave * 9_000 + bandIndex * 2_500);
    maximumHeights.push(
      maximumHeight - bandIndex * 7_000 + topWave * 24_000 + heightWave * 12_000,
    );
  }

  return new Cesium.WallGeometry({
    positions,
    minimumHeights,
    maximumHeights,
    vertexFormat: Cesium.MaterialAppearance.MaterialSupport.TEXTURED.vertexFormat,
  });
}

/** Expand the public hemisphere option into concrete primitive instances. */
function getSelectedHemispheres(
  hemispheres: AuroraHemisphere,
): Array<"north" | "south"> {
  if (hemispheres === "both") return ["north", "south"];
  return [hemispheres];
}

export class AuroraPrimitive {
  readonly primitive: Cesium.Primitive;

  private readonly scene: Cesium.Scene;
  private readonly material: Cesium.Material;
  private readonly states: AuroraInstanceState[];
  private readonly cycleDuration: number;
  private readonly brightness: number;
  private destroyed = false;

  /**
   * Create one batched Primitive containing all selected aurora bands.
   *
   * Each band is a GeometryInstance with its own animation vec4, while all
   * instances share one custom Appearance and therefore one draw configuration.
   */
  constructor(scene: Cesium.Scene, options: AuroraPrimitiveOptions = {}) {
    this.scene = scene;
    const minimumHeight = options.minimumHeight ?? DEFAULT_MINIMUM_HEIGHT;
    const maximumHeight = options.maximumHeight ?? DEFAULT_MAXIMUM_HEIGHT;
    if (minimumHeight < 0 || maximumHeight <= minimumHeight) {
      throw new Error("Aurora heights must satisfy 0 <= minimumHeight < maximumHeight.");
    }

    this.cycleDuration = Math.max(
      options.cycleDuration ?? DEFAULT_CYCLE_DURATION,
      10,
    );
    this.brightness = Math.max(options.brightness ?? DEFAULT_BRIGHTNESS, 0);
    const hemispheres = getSelectedHemispheres(options.hemispheres ?? "both");
    this.states = [];
    const geometryInstances: Cesium.GeometryInstance[] = [];

    // Build topology once. Runtime animation below only writes auroraState.
    for (const hemisphere of hemispheres) {
      for (let bandIndex = 0; bandIndex < BAND_COUNT; bandIndex += 1) {
        const id = `aurora-${hemisphere}-${bandIndex}`;
        const bandPhase =
          (bandIndex + (hemisphere === "south" ? BAND_COUNT : 0)) /
          (BAND_COUNT * 2);
        const value = new Float32Array([0, 1, this.brightness, bandPhase]);
        this.states.push({ id, value });
        geometryInstances.push(
          new Cesium.GeometryInstance({
            id,
            geometry: createAuroraWall(
              hemisphere,
              bandIndex,
              minimumHeight,
              maximumHeight,
            ),
            attributes: {
              auroraState: createFloatAttribute(4, value),
            },
          }),
        );
      }
    }

    this.material = Cesium.Material.fromType(Cesium.Material.ColorType);
    const appearance = new Cesium.Appearance({
      material: this.material,
      vertexShaderSource,
      fragmentShaderSource,
      translucent: true,
      closed: false,
      renderState: {
        depthTest: { enabled: true },
        depthMask: false,
        cull: { enabled: false },
        blending: Cesium.BlendingState.ADDITIVE_BLEND,
      },
    });

    this.primitive = scene.primitives.add(
      new Cesium.Primitive({
        geometryInstances,
        appearance,
        asynchronous: false,
        allowPicking: false,
        compressVertices: false,
        releaseGeometryInstances: true,
      }),
    );
  }

  /** Update every band state and return the phase for the UI indicator. */
  setTime(seconds: number): AuroraActivityState {
    if (this.destroyed) return { phase: "quiet", intensity: 0 };
    const activity = this.getActivityState(seconds);

    if (this.primitive.ready) {
      for (const state of this.states) {
        state.value[0] = seconds;
        state.value[1] = activity.intensity;
        state.value[2] = this.brightness;
        const attributes = this.primitive.getGeometryInstanceAttributes(state.id);
        attributes.auroraState = state.value;
      }
    }

    return activity;
  }

  /** Map an arbitrary time to the repeating growing/active/fading cycle. */
  getActivityState(seconds: number): AuroraActivityState {
    const cyclePosition =
      ((seconds % this.cycleDuration) + this.cycleDuration) % this.cycleDuration;
    const fraction = cyclePosition / this.cycleDuration;

    if (fraction < 1 / 3) {
      return {
        phase: "active",
        intensity: 0.88 + Math.sin(fraction * Math.PI * 9) * 0.08,
      };
    }
    if (fraction < 0.5) {
      const progress = (fraction - 1 / 3) * 6;
      return { phase: "fading", intensity: 1 - smoothStep(0, 1, progress) };
    }
    if (fraction < 2 / 3) {
      return { phase: "quiet", intensity: 0 };
    }
    if (fraction < 5 / 6) {
      const progress = (fraction - 2 / 3) * 6;
      return { phase: "growing", intensity: smoothStep(0, 1, progress) };
    }
    return {
      phase: "active",
      intensity: 0.94 + Math.sin(fraction * Math.PI * 12) * 0.06,
    };
  }

  isDestroyed(): boolean {
    return this.destroyed;
  }

  /** Idempotently remove the primitive and release its material. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (!this.primitive.isDestroyed()) {
      this.scene.primitives.remove(this.primitive);
    }
    if (!this.material.isDestroyed()) this.material.destroy();
  }
}
