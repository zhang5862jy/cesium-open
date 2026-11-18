import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";

export type NoomoSceneStatus = "loading" | "ready" | "error";

export interface NoomoSceneState {
  heroProgress: number;
  immersiveProgress: number;
  exitProgress: number;
}

interface PreparedModel {
  group: THREE.Group;
  source: THREE.Object3D;
}

const MODEL_URLS = {
  platform: "/noomo-agency/models/Platform-O.glb",
  clouds: "/noomo-agency/models/Clouds.glb",
  jellyfish: "/noomo-agency/models/Jellyfish.glb",
} as const;

const ICE_MATERIAL = new THREE.MeshPhysicalMaterial({
  color: 0xe7eef8,
  roughness: 0.28,
  metalness: 0.02,
  transmission: 0.16,
  thickness: 0.8,
  transparent: true,
  opacity: 0.97,
  side: THREE.DoubleSide,
  envMapIntensity: 1.15,
});

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(value: number) {
  const progress = clamp01(value);
  return progress * progress * (3 - 2 * progress);
}

function prepareModel(source: THREE.Object3D, targetSize: number): PreparedModel {
  const group = new THREE.Group();
  const bounds = new THREE.Box3().setFromObject(source);
  const size = bounds.getSize(new THREE.Vector3());
  const largestDimension = Math.max(size.x, size.y, size.z) || 1;
  const scale = targetSize / largestDimension;

  source.scale.setScalar(scale);
  source.updateMatrixWorld(true);

  const scaledBounds = new THREE.Box3().setFromObject(source);
  const center = scaledBounds.getCenter(new THREE.Vector3());
  source.position.sub(center);
  group.add(source);

  return { group, source };
}

export class NoomoThreeScene {
  readonly state: NoomoSceneState = {
    heroProgress: 0,
    immersiveProgress: 0,
    exitProgress: 0,
  };

  private readonly canvas: HTMLCanvasElement;
  private readonly host: HTMLElement;
  private readonly onStatus: (status: NoomoSceneStatus) => void;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  private readonly renderer: THREE.WebGLRenderer;
  private readonly loader = new GLTFLoader();
  private readonly dracoLoader = new DRACOLoader();
  private readonly timer = new THREE.Timer();
  private readonly pointer = new THREE.Vector2();
  private readonly smoothedPointer = new THREE.Vector2();
  private readonly resizeObserver: ResizeObserver;
  private readonly sceneRoot = new THREE.Group();

  private environmentTarget?: THREE.WebGLRenderTarget;
  private platformPrimary?: THREE.Group;
  private platformSecondary?: THREE.Group;
  private cloudsPrimary?: THREE.Group;
  private cloudsSecondary?: THREE.Group;
  private jellyfish?: THREE.Group;
  private mixer?: THREE.AnimationMixer;
  private destroyed = false;
  private isMobile = false;
  private frameCount = 0;

  constructor(
    canvas: HTMLCanvasElement,
    host: HTMLElement,
    onStatus: (status: NoomoSceneStatus) => void,
  ) {
    this.canvas = canvas;
    this.host = host;
    this.onStatus = onStatus;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.camera.position.set(0, 0, 8);
    this.scene.add(this.sceneRoot);

    const hemisphere = new THREE.HemisphereLight(0xf4f7ff, 0x7d6a96, 1.65);
    const keyLight = new THREE.DirectionalLight(0xfff0ee, 3.4);
    keyLight.position.set(4, 6, 8);
    const rimLight = new THREE.DirectionalLight(0x8e72ff, 2.7);
    rimLight.position.set(-5, 1, -3);
    this.scene.add(hemisphere, keyLight, rimLight);
    this.timer.connect(document);

    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.environmentTarget = pmremGenerator.fromScene(
      new RoomEnvironment(),
      0.04,
    );
    this.scene.environment = this.environmentTarget.texture;
    pmremGenerator.dispose();

    this.dracoLoader.setDecoderPath("/noomo-agency/draco/");
    this.dracoLoader.preload();
    this.loader.setDRACOLoader(this.dracoLoader);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();
    this.renderer.setAnimationLoop((timestamp) => this.render(timestamp));
  }

  async init() {
    this.onStatus("loading");
    this.canvas.dataset.sceneState = "loading";

    try {
      const [platform, clouds, jellyfish] = await Promise.all([
        this.loader.loadAsync(MODEL_URLS.platform),
        this.loader.loadAsync(MODEL_URLS.clouds),
        this.loader.loadAsync(MODEL_URLS.jellyfish),
      ]);

      if (this.destroyed) return;

      this.mountPlatform(platform);
      this.mountClouds(clouds);
      this.mountJellyfish(jellyfish);

      this.canvas.dataset.sceneState = "ready";
      this.canvas.dataset.models =
        "Platform-O.glb,Clouds.glb,Jellyfish.glb";
      this.onStatus("ready");
    } catch (error) {
      console.error("Noomo Three.js scene failed to load", error);
      this.canvas.dataset.sceneState = "error";
      this.onStatus("error");
    }
  }

  setPointer(normalizedX: number, normalizedY: number) {
    this.pointer.set(
      THREE.MathUtils.clamp(normalizedX, -1, 1),
      THREE.MathUtils.clamp(normalizedY, -1, 1),
    );
  }

  resize() {
    const { width, height } = this.host.getBoundingClientRect();
    if (!width || !height) return;

    this.isMobile = width < 700;
    this.camera.aspect = width / height;
    this.camera.fov = this.isMobile ? 38 : 30;
    this.camera.position.z = this.isMobile ? 9.4 : 8;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height, false);
  }

  destroy() {
    this.destroyed = true;
    this.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect();
    this.mixer?.stopAllAction();
    this.dracoLoader.dispose();
    this.timer.dispose();
    this.environmentTarget?.dispose();

    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();

    this.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      geometries.add(object.geometry);
      const objectMaterials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      objectMaterials.forEach((material) => {
        materials.add(material);
        Object.values(material).forEach((value) => {
          if (value instanceof THREE.Texture) textures.add(value);
        });
      });
    });

    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    textures.forEach((texture) => texture.dispose());
    ICE_MATERIAL.dispose();
    this.renderer.dispose();
  }

  private mountPlatform(gltf: GLTF) {
    gltf.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) object.material = ICE_MATERIAL;
    });

    const prepared = prepareModel(gltf.scene, 1.55);
    this.platformPrimary = prepared.group;
    this.platformSecondary = prepared.group.clone(true);
    this.sceneRoot.add(this.platformPrimary, this.platformSecondary);
  }

  private mountClouds(gltf: GLTF) {
    gltf.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) object.material = ICE_MATERIAL;
    });

    const prepared = prepareModel(gltf.scene, 2);
    this.cloudsPrimary = prepared.group;
    this.cloudsSecondary = prepared.group.clone(true);
    this.sceneRoot.add(this.cloudsPrimary, this.cloudsSecondary);
  }

  private mountJellyfish(gltf: GLTF) {
    const tunedMaterials = new Set<THREE.MeshPhysicalMaterial>();
    let skinnedMeshCount = 0;

    gltf.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      if (object instanceof THREE.SkinnedMesh) skinnedMeshCount += 1;
      object.frustumCulled = false;
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      materials.forEach((material) => {
        if (
          !(material instanceof THREE.MeshPhysicalMaterial) ||
          tunedMaterials.has(material)
        ) {
          return;
        }

        tunedMaterials.add(material);
        material.transparent = true;
        material.depthWrite = false;
        material.envMapIntensity = 1.25;

        if (material.name.includes("Glass")) {
          material.color.set(0x801ca8);
          material.transmission = 0.58;
          material.thickness = 0.65;
          material.attenuationColor.set(0x6e0b91);
          material.attenuationDistance = 2.4;
          material.roughness = 0.2;
          material.opacity = 0.98;
        } else {
          material.color.set(0xaf28dd);
          material.emissive.set(0x360044);
          material.emissiveIntensity = 0.42;
          material.roughness = Math.max(material.roughness, 0.34);
        }

        material.needsUpdate = true;
      });
    });

    const prepared = prepareModel(gltf.scene, 2.85);
    this.jellyfish = prepared.group;
    this.sceneRoot.add(this.jellyfish);

    this.mixer = new THREE.AnimationMixer(gltf.scene);
    gltf.animations.forEach((clip) => {
      this.mixer?.clipAction(clip).play();
    });
    this.canvas.dataset.animationClips = String(gltf.animations.length);
    this.canvas.dataset.skinnedMeshes = String(skinnedMeshCount);
  }

  private render(timestamp?: number) {
    if (this.destroyed) return;

    this.timer.update(timestamp);
    const delta = Math.min(this.timer.getDelta(), 0.05);
    const elapsed = this.timer.getElapsed();
    this.mixer?.update(delta * 0.78);
    this.smoothedPointer.lerp(this.pointer, 0.045);

    const hero = smoothstep(this.state.heroProgress);
    const immersive = smoothstep(this.state.immersiveProgress);
    const exit = smoothstep(this.state.exitProgress);
    const immersiveActive = hero > 0.84;
    const responsiveScale = this.isMobile ? 0.76 : 1;

    this.sceneRoot.visible = exit < 0.995;
    this.sceneRoot.scale.setScalar(1 - exit * 0.12);
    this.sceneRoot.rotation.x = this.smoothedPointer.y * -0.055;
    this.sceneRoot.rotation.y = this.smoothedPointer.x * 0.075;

    if (this.platformPrimary && this.platformSecondary) {
      this.platformPrimary.visible = !immersiveActive;
      this.platformSecondary.visible = !immersiveActive;

      this.platformPrimary.position.set(
        (this.isMobile ? 0.62 : -1.35) + hero * 0.38,
        (this.isMobile ? 0.48 : 0.28) - hero * 0.9,
        0.45,
      );
      this.platformPrimary.rotation.set(
        0.16 + hero * 0.18,
        0.52 + Math.sin(elapsed * 0.24) * 0.16 + hero * 0.28,
        -0.12 + hero * 0.15,
      );
      this.platformPrimary.scale.setScalar(responsiveScale * 0.72);

      this.platformSecondary.position.set(
        this.isMobile ? 1.1 : 0.58,
        this.isMobile ? -1.55 : -0.72,
        -0.35,
      );
      this.platformSecondary.rotation.set(
        -0.12,
        -0.48 + Math.cos(elapsed * 0.2) * 0.14,
        0.24,
      );
      this.platformSecondary.scale.setScalar(responsiveScale * 0.58);
    }

    if (this.cloudsPrimary && this.cloudsSecondary) {
      this.cloudsPrimary.visible = immersiveActive;
      this.cloudsSecondary.visible = immersiveActive;
      this.cloudsPrimary.position.set(
        immersiveActive ? (this.isMobile ? -1.9 : -2.45) + immersive * 0.45 : 1.45,
        immersiveActive ? -0.35 + immersive * 0.45 : -1.4 - hero * 0.4,
        immersiveActive ? -0.9 : -0.5,
      );
      this.cloudsPrimary.rotation.z =
        (immersiveActive ? -0.12 : 0.12) + Math.sin(elapsed * 0.2) * 0.03;
      this.cloudsPrimary.scale.setScalar(
        responsiveScale * (immersiveActive ? 0.72 : 0.58),
      );

      this.cloudsSecondary.position.set(
        immersiveActive ? (this.isMobile ? 2.05 : 2.62) - immersive * 0.42 : -2.2,
        immersiveActive ? 1.3 - immersive * 0.25 : -1.8 + hero * 0.2,
        -1.2,
      );
      this.cloudsSecondary.rotation.z =
        0.16 + Math.cos(elapsed * 0.19) * 0.04;
      this.cloudsSecondary.scale.setScalar(
        responsiveScale * (immersiveActive ? 0.56 : 0.44),
      );
    }

    if (this.jellyfish) {
      this.jellyfish.visible = immersiveActive;
      this.jellyfish.position.set(
        (this.isMobile ? -0.3 : -0.85) + immersive * (this.isMobile ? 0.7 : 1.5),
        (this.isMobile ? -0.35 : 0.05) +
          immersive * 0.28 +
          Math.sin(elapsed * 0.55) * 0.08,
        0.25,
      );
      this.jellyfish.rotation.set(
        -0.08 + Math.sin(elapsed * 0.32) * 0.035,
        -0.28 + immersive * 0.48,
        -0.28 + immersive * 0.3,
      );
      this.jellyfish.scale.setScalar(
        responsiveScale * (0.85 + immersive * 0.25),
      );
    }

    this.renderer.render(this.scene, this.camera);
    this.frameCount += 1;
    if (this.frameCount === 2) this.canvas.dataset.rendering = "true";
  }
}
