import * as THREE from "three";

export type CullMode = "back" | "front" | "none";

export interface CustomCubePipelineState {
  cullMode: CullMode;
  depthTest: boolean;
}

export interface CustomCubeDrawCommandOptions {
  baseColor?: THREE.ColorRepresentation;
  accentColor?: THREE.ColorRepresentation;
  pipelineState?: Partial<CustomCubePipelineState>;
}

const vertexShader = /* glsl */ `
precision highp float;
precision highp int;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 normalMatrix;
uniform float uTime;

in vec3 position;
in vec3 normal;
in vec2 uv;

out vec2 vUv;
out vec3 vNormalView;
out vec3 vPosition;

void main() {
  float wave = sin(uTime * 1.8 + uv.x * 5.0 + uv.y * 4.0) * 0.025;
  vec3 displacedPosition = position + normal * wave;

  vUv = uv;
  vNormalView = normalize(normalMatrix * normal);
  vPosition = displacedPosition;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(displacedPosition, 1.0);
}
`;

const fragmentShader = /* glsl */ `
precision highp float;
precision highp int;

uniform vec3 uBaseColor;
uniform vec3 uAccentColor;
uniform vec3 uLightDirectionView;
uniform float uTime;

in vec2 vUv;
in vec3 vNormalView;
in vec3 vPosition;

out vec4 outColor;

vec3 linearToSrgb(vec3 value) {
  vec3 lower = value * 12.92;
  vec3 higher = 1.055 * pow(max(value, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055;
  return mix(higher, lower, lessThanEqual(value, vec3(0.0031308)));
}

void main() {
  vec3 normalView = normalize(vNormalView);
  float diffuse = max(dot(normalView, normalize(uLightDirectionView)), 0.0);
  float fresnel = pow(1.0 - abs(normalView.z), 2.4);

  vec2 gridCoordinates = vUv * 8.0;
  vec2 gridDistance = abs(fract(gridCoordinates - 0.5) - 0.5) / fwidth(gridCoordinates);
  float grid = 1.0 - min(min(gridDistance.x, gridDistance.y), 1.0);

  float faceEdgeDistance = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
  float faceEdge = 1.0 - smoothstep(0.015, 0.065, faceEdgeDistance);
  float scan = pow(max(sin((vPosition.y - uTime * 0.32) * 12.0), 0.0), 18.0);

  vec3 color = uBaseColor * (0.28 + diffuse * 0.72);
  color += uAccentColor * (grid * 0.38 + faceEdge * 0.85 + fresnel * 0.35 + scan * 0.16);
  outColor = vec4(linearToSrgb(color), 1.0);
}
`;

/**
 * A small Three.js render-command analogue.
 *
 * It owns the vertex/index buffers, shader program description, render state,
 * uniforms and one Mesh submission. The WebGLRenderer still owns program and
 * pipeline caching, just as Cesium's renderer owns the DrawCommand execution.
 */
export class CustomCubeDrawCommand {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.RawShaderMaterial>;
  readonly indexCount = 36;
  readonly vertexCount = 24;

  private readonly scene: THREE.Scene;
  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.RawShaderMaterial;
  private destroyed = false;

  constructor(scene: THREE.Scene, options: CustomCubeDrawCommandOptions = {}) {
    this.scene = scene;
    this.geometry = createCubeGeometry();
    this.material = new THREE.RawShaderMaterial({
      name: "CustomCubePipelineMaterial",
      glslVersion: THREE.GLSL3,
      vertexShader,
      fragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uBaseColor: {
          value: new THREE.Color(options.baseColor ?? "#123963"),
        },
        uAccentColor: {
          value: new THREE.Color(options.accentColor ?? "#44e6ff"),
        },
        uLightDirectionView: {
          value: new THREE.Vector3(0.35, 0.7, 1).normalize(),
        },
      },
      depthTest: true,
      depthWrite: true,
      side: THREE.FrontSide,
      transparent: false,
      blending: THREE.NoBlending,
    });

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.name = "CustomCubeDrawCommand";
    this.mesh.renderOrder = 0;
    this.scene.add(this.mesh);

    this.setPipelineState({
      cullMode: options.pipelineState?.cullMode ?? "back",
      depthTest: options.pipelineState?.depthTest ?? true,
    });
  }

  update(elapsedSeconds: number, deltaSeconds: number, rotationSpeed: number): void {
    this.assertAlive();
    this.material.uniforms.uTime!.value = elapsedSeconds;
    this.mesh.rotation.x += deltaSeconds * rotationSpeed * 0.42;
    this.mesh.rotation.y += deltaSeconds * rotationSpeed;
  }

  setAccentColor(color: THREE.ColorRepresentation): void {
    this.assertAlive();
    (this.material.uniforms.uAccentColor!.value as THREE.Color).set(color);
  }

  setPipelineState(state: CustomCubePipelineState): void {
    this.assertAlive();
    this.material.depthTest = state.depthTest;
    this.material.depthWrite = state.depthTest;
    this.material.side = sideForCullMode(state.cullMode);
    this.material.needsUpdate = true;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.scene.remove(this.mesh);
    this.geometry.dispose();
    this.material.dispose();
  }

  private assertAlive(): void {
    if (this.destroyed) {
      throw new Error("CustomCubeDrawCommand has been destroyed.");
    }
  }
}

function sideForCullMode(cullMode: CullMode): THREE.Side {
  if (cullMode === "front") return THREE.BackSide;
  if (cullMode === "none") return THREE.DoubleSide;
  return THREE.FrontSide;
}

function createCubeGeometry(): THREE.BufferGeometry {
  // Four independent vertices per face preserve flat normals and face-local UVs.
  const positions = new Float32Array([
    -1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1, 1,
    1, -1, -1, -1, -1, -1, -1, 1, -1, 1, 1, -1,
    1, -1, 1, 1, -1, -1, 1, 1, -1, 1, 1, 1,
    -1, -1, -1, -1, -1, 1, -1, 1, 1, -1, 1, -1,
    -1, 1, 1, 1, 1, 1, 1, 1, -1, -1, 1, -1,
    -1, -1, -1, 1, -1, -1, 1, -1, 1, -1, -1, 1,
  ]);
  const normals = new Float32Array([
    0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1,
    0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1,
    1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0,
    -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0,
    0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0,
    0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0,
  ]);
  const faceUvs = [0, 0, 1, 0, 1, 1, 0, 1];
  const uvs = new Float32Array(Array.from({ length: 6 }, () => faceUvs).flat());
  const indices = new Uint16Array([
    0, 1, 2, 0, 2, 3,
    4, 5, 6, 4, 6, 7,
    8, 9, 10, 8, 10, 11,
    12, 13, 14, 12, 14, 15,
    16, 17, 18, 16, 18, 19,
    20, 21, 22, 20, 22, 23,
  ]);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
}
