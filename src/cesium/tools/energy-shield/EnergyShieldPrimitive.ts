import * as Cesium from "cesium";
import { energyShieldMaterialSource } from "./shader";
import type { EnergyShieldImpact, EnergyShieldOptions } from "./types";

const IMPACT_COUNT = 8;
const DEFAULT_COLOR = Cesium.Color.fromCssColorString("#087fe8");
const DEFAULT_GLOW_COLOR = Cesium.Color.fromCssColorString("#65eaff");

interface ShieldMaterialUniforms {
  shieldColor: Cesium.Color;
  glowColor: Cesium.Color;
  shieldTime: number;
  hexScale: number;
  impactDuration: number;
  [name: `impact${number}`]: Cesium.Cartesian4;
}

/**
 * One resource-owning spherical energy shield.
 *
 * The sphere mesh is immutable. A pre-render listener advances shader time and
 * fills a fixed eight-slot impact ring buffer, so animation never rebuilds the
 * Cesium Primitive or allocates per-frame geometry.
 */
export class EnergyShieldPrimitive {
  readonly primitive: Cesium.Primitive;

  private readonly scene: Cesium.Scene;
  private readonly material: Cesium.Material;
  private readonly uniforms: ShieldMaterialUniforms;
  private readonly removePreRender: () => void;
  private readonly startTime = performance.now();
  private impactCursor = 0;
  private lastAutomaticImpact = 0;
  private autoImpact: boolean;
  private impactInterval: number;
  private destroyed = false;

  constructor(scene: Cesium.Scene, options: EnergyShieldOptions) {
    this.scene = scene;
    this.autoImpact = options.autoImpact ?? true;
    this.impactInterval = Math.max(options.impactInterval ?? 0.72, 0.12);

    const shieldColor = Cesium.Color.clone(options.color ?? DEFAULT_COLOR);
    shieldColor.alpha = Cesium.Math.clamp(options.opacity ?? 0.11, 0, 1);
    this.uniforms = {
      shieldColor,
      glowColor: Cesium.Color.clone(options.glowColor ?? DEFAULT_GLOW_COLOR),
      shieldTime: 0,
      hexScale: Math.max(options.hexScale ?? 18, 2),
      impactDuration: Math.max(options.impactDuration ?? 3.8, 0.2),
      impact0: new Cesium.Cartesian4(0, 0, 0, 1e6),
      impact1: new Cesium.Cartesian4(0, 0, 0, 1e6),
      impact2: new Cesium.Cartesian4(0, 0, 0, 1e6),
      impact3: new Cesium.Cartesian4(0, 0, 0, 1e6),
      impact4: new Cesium.Cartesian4(0, 0, 0, 1e6),
      impact5: new Cesium.Cartesian4(0, 0, 0, 1e6),
      impact6: new Cesium.Cartesian4(0, 0, 0, 1e6),
      impact7: new Cesium.Cartesian4(0, 0, 0, 1e6),
    };

    this.material = new Cesium.Material({
      fabric: {
        type: "EnergyShield",
        uniforms: this.uniforms,
        source: energyShieldMaterialSource,
      },
      translucent: true,
    });

    const localFrame = Cesium.Transforms.eastNorthUpToFixedFrame(
      options.position,
    );
    // A sphere cannot be globally parameterized without singularities. Move
    // the UV poles from the top of the shield toward its side, where curvature
    // and the Fresnel rim make the unavoidable distortion far less noticeable.
    const localRotation = Cesium.Matrix4.fromRotationTranslation(
      Cesium.Matrix3.fromRotationY(Cesium.Math.PI_OVER_TWO),
    );
    const modelMatrix = Cesium.Matrix4.multiply(
      localFrame,
      localRotation,
      new Cesium.Matrix4(),
    );
    this.primitive = scene.primitives.add(
      new Cesium.Primitive({
        geometryInstances: new Cesium.GeometryInstance({
          id: this,
          geometry: new Cesium.SphereGeometry({
            radius: options.radius,
            stackPartitions: 96,
            slicePartitions: 192,
            vertexFormat:
              Cesium.MaterialAppearance.MaterialSupport.TEXTURED.vertexFormat,
          }),
          modelMatrix,
        }),
        appearance: new Cesium.MaterialAppearance({
          material: this.material,
          materialSupport: Cesium.MaterialAppearance.MaterialSupport.TEXTURED,
          flat: true,
          faceForward: false,
          closed: false,
          translucent: true,
          renderState: {
            depthTest: { enabled: true },
            depthMask: false,
            cull: { enabled: true, face: Cesium.CullFace.BACK },
            blending: Cesium.BlendingState.ALPHA_BLEND,
          },
        }),
        asynchronous: false,
        allowPicking: false,
      }),
    );

    // Seed the shield so multiple waves are already visible on its first frame.
    for (let index = 0; index < 4; index += 1) {
      this.addRandomImpact(-index * 0.58);
    }

    this.removePreRender = scene.preRender.addEventListener(() => {
      this.tick();
    });
  }

  /** Trigger a wave at normalized spherical surface coordinates. */
  addImpact(impact: EnergyShieldImpact): void {
    if (this.destroyed) return;
    this.writeImpact(impact, this.uniforms.shieldTime);
  }

  /** Immediately trigger a uniformly distributed random surface impact. */
  addRandomImpact(startOffset = 0): void {
    if (this.destroyed) return;
    const vertical = Math.random() * 2 - 1;
    this.writeImpact(
      {
        u: Math.random(),
        v: Math.asin(vertical) / Math.PI + 0.5,
        intensity: 0.72 + Math.random() * 0.48,
      },
      this.uniforms.shieldTime + startOffset,
    );
  }

  /** Enable or disable periodic random impacts without stopping shader time. */
  setAutoImpact(enabled: boolean): void {
    this.autoImpact = enabled;
  }

  /** Change the period used by subsequent automatic impacts. */
  setImpactInterval(seconds: number): void {
    this.impactInterval = Math.max(seconds, 0.12);
  }

  isDestroyed(): boolean {
    return this.destroyed;
  }

  /** Remove listeners and release the primitive and material resources. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.removePreRender();
    if (!this.primitive.isDestroyed()) {
      this.scene.primitives.remove(this.primitive);
    }
    if (!this.material.isDestroyed()) this.material.destroy();
  }

  private tick(): void {
    if (this.destroyed) return;
    const seconds = (performance.now() - this.startTime) * 0.001;
    this.uniforms.shieldTime = seconds;
    if (
      this.autoImpact &&
      seconds - this.lastAutomaticImpact >= this.impactInterval
    ) {
      this.addRandomImpact();
      this.lastAutomaticImpact = seconds;
    }
  }

  private writeImpact(impact: EnergyShieldImpact, startedAt: number): void {
    const uniformName = `impact${this.impactCursor}` as const;
    const target = this.uniforms[uniformName];
    const longitude = Cesium.Math.mod(impact.u, 1) * Cesium.Math.TWO_PI;
    const latitude = (Cesium.Math.clamp(impact.v, 0, 1) - 0.5) * Math.PI;
    const horizontal = Math.cos(latitude);
    const intensity = Math.max(impact.intensity ?? 1, 0);
    target.x = Math.cos(longitude) * horizontal * intensity;
    target.y = Math.sin(longitude) * horizontal * intensity;
    target.z = Math.sin(latitude) * intensity;
    target.w = startedAt;
    this.impactCursor = (this.impactCursor + 1) % IMPACT_COUNT;
  }
}
