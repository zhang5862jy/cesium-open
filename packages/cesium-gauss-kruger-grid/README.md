# cesium-gauss-kruger-grid

在 CesiumJS 三维地球上绘制 CGCS2000 高斯—克吕格投影坐标网。支持 3° / 6° 自动分带、固定投影带、固定间隔和自适应 LOD，以及屏幕边缘坐标注记。独立于 Vue，不创建 Viewer，不请求底图、地形或外部坐标服务。

## 学习资料与 Skill

建议先阅读 [项目介绍](docs/项目介绍.md)，了解功能、坐标含义、接入流程和适用范围；再阅读 [架构设计](docs/架构设计.md)，跟踪从相机视域到 GPU 线段与屏幕标签的完整数据流。`src/` 中的 TypeScript、GLSL 和仓库 Vue 示例已配有中文注释，解释单位、公式、状态和资源所有权。

[cesium-gauss-kruger-grid Skill](skills/cesium-gauss-kruger-grid/SKILL.md) 用于后续接入、讲解、调试与维护此包。Skill 随源码与文档一起打包；将其整个目录放入 `$CODEX_HOME/skills`（未设置时为 `~/.codex/skills`）后，可在支持该技能的 Codex 会话中使用 `$cesium-gauss-kruger-grid`。

## 安装和使用

本仓库通过 pnpm workspace 引用。独立使用时可在包目录运行 `pnpm pack --pack-destination <输出目录>`，再在目标项目执行 `pnpm add <生成的tgz文件> cesium@~1.143.0`。构建生成 ESM 和 TypeScript 声明；GLSL 已内联，使用方不需要 GLSL loader。包的直接依赖为 `proj4`，`cesium` 为 peer dependency，避免加载两个 Cesium 实例。

已验证的依赖组合为 Cesium `1.143.0`、`@cesium/engine` `26.1.0`、`@cesium/widgets` `16.1.0`。必须保留应用的 lockfile。此次独立安装检查发现：Cesium `1.143.0` 的宽泛间接依赖可解析到 engine `26.4.0`，随后 Cesium 自身的 ESM 入口因缺少 `_shadersPolygonSignedDistanceFS` 导出而失败。新建 pnpm 项目可先在应用根目录的 `pnpm-workspace.yaml` 设置以下覆盖，再安装包；这不需要修改本仓库已有的锁定版本。

```yaml
packages:
  - .
overrides:
  "@cesium/engine": 26.1.0
  "@cesium/widgets": 16.1.0
```

```ts
import {
  GaussKrugerGrid,
  type GaussKrugerGridStatus,
} from "cesium-gauss-kruger-grid";

// viewer 为应用已经创建的 Cesium.Viewer。
const grid = new GaussKrugerGrid(viewer.scene, {
  calculationMode: "bounded",
  zoneWidthDegrees: 6,
  zoneNumber: 20, // 固定 20 带，中央经线 117°E；省略则随视域自动分带
  gridSpacing: 1000,
  maximumLinesPerAxis: 64,
  altitude: 20,
});

// 构造时已计算初始状态；changed 在后续重建时触发。
const initialStatus = grid.status;
const removeChanged = grid.changed.addEventListener(
  (status: GaussKrugerGridStatus | undefined) => {
    // undefined 表示没有可构建范围或预算仍超限；rangeLimited 表示本次采用低空局部范围。
    console.log(status);
  },
);

grid.show = false; // 同时暂停几何和标签更新
grid.show = true; // 按当前视域恢复
grid.refresh(); // 可选：主动刷新，通常由相机事件自动驱动

// 页面/图层卸载时清理。grid 不拥有 viewer。
removeChanged();
grid.destroy();
viewer.destroy();
```

示例 `/examples/primitive/square-kilometer-grid` 使用仓库共享的 `createLocalWorldBaseLayers` 和 `applyDefaultViewerConfig`。包本身只接收 `Scene`，不会修改相机交互设置。

## 投影和坐标约定

采用 GRS80 椭球、赤道原点、中央经线比例因子 1、500,000 m 假东偏和 0 m 假北偏。在投影平面生成恒定 Easting / Northing 的坐标线，再反投影、采样和裁切到各带边界及地平线。

- 6° 带的中央经线为 `6 × zoneNumber − 3` 度，20 带对应 117°E。
- 3° 带的中央经线为 `3 × zoneNumber` 度，39 带对应 117°E。
- 全球浏览采用周期分带：6° 为 1～60，3° 为 0～119（0 带跨越 Greenwich）；经度及中央经线归一化，±180° 采用同一带号约定。境外带号只是数学编号，不代表注册的 CGCS2000 EPSG CRS。
- `GaussKrugerProjection.project(Cartographic)` 返回 `{ easting, northing }`，单位米，东坐标不含百万米带号。`unproject(easting, northing, height?)` 返回弧度制 `Cartographic`。`zoneNumberFromLongitude(longitude, width)` 的 longitude 也为弧度。
- `formatGridCoordinate({ axis, coordinate, zoneNumber })` 提供完整文本，如 `Y 20500 km` 或 `X 4419 km`。屏幕注记将高位缩小、公里末两位放大，仍保留完整坐标值、负号和小数。

中国测绘习惯的 X 为北坐标、Y 为东坐标；这与 Proj4js 默认数组顺序 `[easting, northing]` 不同。带号前缀仅用于显示，不应再次传入 `unproject`。

`gridSpacing: 1000` 表示投影平面中一公里一格，地表距离存在投影变形。输入地理坐标按 CGCS2000 解释；Cesium 绘制使用同一组经纬度对应的 WGS84 椭球位置，没有实现基准转换、历元转换或测量控制网拟合。因此数值投影测试的误差不代表真实测绘绝对精度。

## 配置

完整参数类型见 `GaussKrugerGridOptions`。主要配置如下：

| 参数                                                  | 默认值                                        | 含义                                                                     |
| ----------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------ |
| `calculationMode`                                     | 未提供 `gridSpacing` 时 `lod`，否则 `bounded` | 固定或自适应间隔                                                         |
| `zoneWidthDegrees` / `zoneNumber`                     | `6` / 自动                                    | 投影带宽和可选固定带                                                     |
| `gridSpacing`                                         | `1000` m                                      | bounded 固定间隔；低空超预算时尝试限制生成范围，高空超预算仍隐藏         |
| `spacingLevels`                                       | 100 m～2000 km 的内置层级                     | 按相机高度和视域选择 LOD；自定义层级需按高度递增且间距不减               |
| `maximumLinesPerAxis`                                 | `28`                                          | bounded 的投影轴线数预算、LOD 选层目标；多带和裁切片段不等于最终总折线数 |
| `maximumEastingSpacing`                               | `500000` m                                    | LOD 东向间隔上限，默认保留各带 500 km 中央线                             |
| `viewPadding`                                         | `0.12`                                        | 视域外的经纬度预留比例                                                   |
| `sampleSpacing`                                       | 自动                                          | 反投影采样步长上限，单位米；不改变格网间距                               |
| `altitude`                                            | `100` m                                       | WGS84 椭球上方绘制高度，必须大于 0                                       |
| `lineColor`                                           | 白色，alpha 0.82                              | 所有线的颜色                                                             |
| `lineWidth` / `majorLineWidth`                        | `1.25` / `2.5` px                             | 普通线/主线 CSS 像素宽度                                                 |
| `majorLineEvery`                                      | `10`                                          | 每多少格强调一条主线                                                     |
| `minimumLabelSpacing`                                 | `72` px                                       | 注记最小屏幕间距，另按实际文字宽度避让                                   |
| `labelPixelRatio`                                     | `2`                                           | 注记最小像素倍率，最终倍率上限 4                                         |
| `refreshInterval` / `labelUpdateInterval`             | `80` / `32` ms                                | 移动期间几何/注记刷新节流                                                |
| `largeViewRefreshInterval` / `largeViewZoneThreshold` | `250` ms / `4` 带                             | 多带时降低重建频率，移动结束后恢复注记                                   |

`bounded` 正常按带有 `viewPadding` 的视域生成。若低空倾斜使地平线附近的经纬度包围范围过大、超过固定线数预算，仅当相机椭球高度不大于 `gridSpacing × (maximumLinesPerAxis − 1) / 2` 时，才尝试以相机地表位置为中心的局部经纬窗口，与原视域求交。局部范围按实际分带后的投影跨度最多进行 4 轮构建与预算校验，必要时收缩；格距保持不变，窗口外的远处不绘制。高空超预算、局部求交无效或重试后仍超预算时隐藏。此窗口是计算范围限制，不是精确视锥轮廓，也不是以相机为圆心的严格距离裁剪；LOD 行为不变。

局部回退还会用视锥四角射线相对相机地表切平面的方向与起点位置，保守排除整个视锥朝天的情况。它不要求屏幕中心命中地球，也不会因为四角拾取未命中就直接隐藏。局部范围通过固定线数预算后，仍需通过下文候选线与采样点预算。

`status` 提供当前相机高度、带号、中央经线、东西/南北间距、坐标线数、线段数和 draw command 数。`rangeLimited: true` 表示本次固定格网采用了低空局部范围，远处可能没有覆盖；正常全视域和 LOD 结果为 `false`。无法建立有效范围或经过回退后仍超出预算时为 `undefined`，原因可能是高空视域超限、相机朝向天空、超出纬度范围、固定带不在视域，或场景不处于 3D。有效范围中也可能没有整间距格线，此时状态存在而线数为零，不能仅凭状态存在判断是否有可见像素。

## 支持范围与渲染

- 仅支持 Cesium `SCENE3D` 和地球 WGS84 椭球显示。进入 2D / Columbus / morph 模式时隐藏，回到 3D 自动恢复。
- 当前显示纬度为 80°S～84°N。这是本实现范围，不是高斯—克吕格公式的固有限制；没有实现极区格网。
- 候选坐标线预算为 8192 条，常规采样点预估预算为 500000 个，后者不包括边界二分的额外求值。极小采样步长、极低绘制高度等超出预算的配置会隐藏格网，避免长时间阻塞页面；不会擅自放大采样间隔。
- 格网是椭球上方折线，不是贴地线；地形或三维模型可能遮挡线段。不自动采样地形高度。
- LOD 间隔可能大于或小于一公里，不能将其全部称为“一公里一格”。标签会避让，并不保证每条生成线都有注记。
- 线段使用实例化四边形、像素宽度扩展、近裁剪面处理和边缘抗锯齿。注记使用独立 HiDPI Canvas。重用 GPU 缓冲和 draw command，静止时不重复生成几何。
- 支持 `requestRenderMode`：在更新阶段检测相机矩阵、投影矩阵和画布尺寸，几何变化后请求渲染；标签在渲染阶段按最终相机状态绘制。
- `destroy()` 可重复调用；图层拥有自己的 primitive、GPU 缓冲、标签 Canvas 和场景监听器，不销毁 Scene/Viewer。兼容先销毁 Viewer 的清理顺序。

底层 `DrawCommand`、`Buffer`、`VertexArray` 属于 Cesium 内部渲染接口。因此 peer 版本限制为已验证的 `1.143.x`；升级需要重新执行浏览器着色器和资源清理回归。高级用户可使用导出的 `DrawCommandGaussKrugerGridPrimitive` 和 `ProjectedGridLine` 自行提供折线，此时需自行管理场景事件和可见性。

保留 `GaussKrugerNeighborGrid`、`WebMercatorSquareGrid` 及旧类型别名供迁移，均已标记 deprecated；新的代码应使用 `GaussKrugerGrid`。包实现位于 `src/GaussKrugerGrid.ts`，仓库原有的工具实现目录已移除，示例保留并改为从包导入。

## 验证

源码编辑使用包内的 `tsconfig.json`，其中 `vite/client` 为 GLSL 的 `?raw` 导入提供字符串类型声明；`tsconfig.build.json` 继承同一套规则并输出类型声明。不能只保留后者，否则编辑器可能把单独打开的包源码归入无配置项目，出现“找不到模块 `*.glsl?raw`”错误，即使命令行构建可以通过。两份配置均随源码发布；编辑或构建源码时仍需安装包的开发依赖。

在仓库根目录运行：

```sh
pnpm test:gauss-kruger-grid
pnpm build
pnpm dev
```

打开 `/scripts/grid-regression.html` 查看浏览器验证结果，再打开 `/examples/primitive/square-kilometer-grid` 检查交互。Node 检查从构建后的包导入；浏览器检查包含真实 Cesium/WebGL 绘制、跨带/反经线、视场角、显式渲染、固定网格隐藏恢复和清理。

独立控制值 `scripts/grid-projection-reference.json` 由 Python `pyproj` 的 PROJ EPSG 数据库生成（EPSG:4498 / 4527 / 4528），不使用被测 Proj4js 生成。运行 `python scripts/generate-grid-projection-reference.py` 可再生成，需要自行安装 `pyproj`。不将特定硬件下的 FPS 宣称为性能保证。

## 资料依据

- [PROJ：Transverse Mercator](https://proj.org/en/stable/operations/projections/tmerc.html)：高斯—克吕格投影、中央经线比例因子及假东/北偏参数。
- [Proj4js：坐标顺序和转换 API](https://proj4js.org/)：默认 `[longitude, latitude]` 与 `[easting, northing]`，以及正反算接口。
- [Cesium Scene](https://cesium.com/learn/cesiumjs/ref-doc/Scene.html)：更新/渲染事件、模式与显式请求渲染。
- [Cesium PrimitiveCollection](https://cesium.com/learn/cesiumjs/ref-doc/PrimitiveCollection.html)：`destroyPrimitives` 对移除/销毁资源的影响。
- [ArcGIS Pro：Grid label tags](https://doc.esri.com/en/arcgis-pro/latest/help/layouts/grid-label-tags.html)：注记数位分组的表现方式。这里只借鉴显示方式，不声明符合完整纸质地形图图式。
