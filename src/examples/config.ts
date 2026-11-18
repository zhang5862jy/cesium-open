interface DirectoryConfig {
  name: string;
  visible?: boolean;
}

interface ExampleConfig extends DirectoryConfig {
  description?: string;
}

export interface ExampleItem {
  name: string;
  description: string;
  visible: boolean;
  directoryPath: string;
  filePath: string;
  previewPath: string;
  routePath: string;
  component: () => Promise<unknown>;
}

export interface ExampleGroup {
  name: string;
  directoryPath: string;
  childrens: ExampleItem[];
}

const rootConfigModules = import.meta.glob("./config.json", {
  eager: true,
  import: "default",
}) as Record<string, DirectoryConfig>;
const categoryConfigs = import.meta.glob("./*/config.json", {
  eager: true,
  import: "default",
}) as Record<string, DirectoryConfig>;
const exampleConfigs = import.meta.glob("./*/*/config.json", {
  eager: true,
  import: "default",
}) as Record<string, ExampleConfig>;
const examplePages = import.meta.glob("./*/*/index.vue");

export const exampleRootConfig: DirectoryConfig = rootConfigModules[
  "./config.json"
] ?? { name: "Cesium 示例库" };

const groupMap = new Map<string, ExampleGroup>();

Object.entries(examplePages)
  .sort(([firstPath], [secondPath]) =>
    firstPath.localeCompare(secondPath, "en"),
  )
  .forEach(([modulePath, component]) => {
    const matchedPath = modulePath.match(/^\.\/([^/]+)\/([^/]+)\/index\.vue$/);
    if (!matchedPath) return;

    const [, categoryDirectory, exampleDirectory] = matchedPath;
    if (!categoryDirectory || !exampleDirectory) return;

    const categoryConfig =
      categoryConfigs[`./${categoryDirectory}/config.json`];
    const exampleConfig =
      exampleConfigs[`./${categoryDirectory}/${exampleDirectory}/config.json`];

    if (!categoryConfig || !exampleConfig) {
      throw new Error(`示例目录缺少 config.json：${modulePath}`);
    }

    const directoryPath = `${categoryDirectory}/${exampleDirectory}`;
    const group = groupMap.get(categoryDirectory) ?? {
      name: categoryConfig.name,
      directoryPath: categoryDirectory,
      childrens: [],
    };

    group.childrens.push({
      name: exampleConfig.name,
      description: exampleConfig.description ?? "",
      visible:
        exampleRootConfig.visible !== false &&
        categoryConfig.visible !== false &&
        exampleConfig.visible !== false,
      directoryPath,
      filePath: `${directoryPath}/index.vue`,
      previewPath: `/example-previews/${directoryPath}.png`,
      routePath: `/examples/${directoryPath}`,
      component,
    });
    groupMap.set(categoryDirectory, group);
  });

export const exampleConfig: ExampleGroup[] = Array.from(groupMap.values()).sort(
  (firstGroup, secondGroup) =>
    firstGroup.directoryPath.localeCompare(secondGroup.directoryPath, "en"),
);

export const exampleCatalog = exampleConfig
  .map((group) => ({
    ...group,
    childrens: group.childrens.filter((example) => example.visible),
  }))
  .filter((group) => group.childrens.length > 0);
