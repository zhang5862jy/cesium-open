import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import {
  dedup,
  flatten,
  getSceneVertexCount,
  join,
  prune,
  simplify,
  VertexCountMethod,
  weld,
} from "@gltf-transform/functions";
import { MeshoptSimplifier } from "meshoptimizer";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");
const outputDirectory = resolve(repositoryRoot, "public/model/lod");

const jobs = [
  {
    input: "public/model/J20/j20_v1.glb",
    output: "j20-lod.glb",
    ratio: 0.22,
    error: 0.035,
  },
  {
    input: "public/model/V22/scene.gltf",
    output: "v22-lod.glb",
    ratio: 0.14,
    error: 0.035,
  },
  {
    input: "public/model/消防车.glb",
    output: "fire-engine-lod.glb",
    ratio: 0.025,
    error: 0.05,
  },
  {
    input: "public/model/大象人3_glb.glb",
    output: "elephant-man-lod.glb",
    ratio: 0.008,
    error: 0.055,
  },
];

function countVertices(document) {
  return document
    .getRoot()
    .listScenes()
    .reduce(
      (total, scene) =>
        total +
        getSceneVertexCount(scene, VertexCountMethod.UPLOAD),
      0,
    );
}

mkdirSync(outputDirectory, { recursive: true });
await MeshoptSimplifier.ready;

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const job of jobs) {
  const inputPath = resolve(repositoryRoot, job.input);
  const outputPath = resolve(outputDirectory, job.output);
  const document = await io.read(inputPath);
  const sourceVertices = countVertices(document);

  // 动目标只需要可辨识的轮廓。统一成单一中性材质，并删除远景不需要的
  // 纹理坐标、顶点色和切线，使 join 能合并更多 primitive、降低 draw call。
  const lodMaterial = document
    .createMaterial("Moving Target LOD")
    .setBaseColorFactor([1, 1, 1, 1])
    .setMetallicFactor(0)
    .setRoughnessFactor(0.82);

  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      primitive.setMaterial(lodMaterial);
      for (const semantic of primitive.listSemantics()) {
        if (semantic !== "POSITION" && semantic !== "NORMAL") {
          primitive.setAttribute(semantic, null);
        }
      }
    }
  }

  await document.transform(
    dedup(),
    flatten(),
    weld({ tolerance: 0.0001 }),
    simplify({
      simplifier: MeshoptSimplifier,
      ratio: job.ratio,
      error: job.error,
      lockBorder: false,
    }),
    join({ keepMeshes: false, keepNamed: false }),
    prune({
      keepAttributes: false,
      keepIndices: false,
      keepLeaves: false,
      keepSolidTextures: false,
    }),
  );

  await io.write(outputPath, document);
  const outputVertices = countVertices(document);
  console.log(
    `${job.output}: ${sourceVertices.toLocaleString()} → ` +
      `${outputVertices.toLocaleString()} vertices`,
  );
}

