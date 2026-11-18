---
name: cesium-gauss-kruger-grid
description: "接入、解释和维护 cesium-gauss-kruger-grid 的 CGCS2000 高斯—克吕格方里网，包括分带、反投影采样、Cesium 线段渲染和屏幕注记。用于此包或同类高斯—克吕格坐标网任务；不用于一般 Cesium 图层、经纬网或 MGRS。"
---

# Cesium 高斯—克吕格方里网

帮助用户理解或完成方里网任务，保留其指定的坐标系、功能范围和应用结构。解释请求只读取并讲解；修改请求再实施相应代码。用户要求其他基准或投影时，明确需要替换的投影参数与验证数据，不把当前 CGCS2000 实现套作通用答案。

## 定位实际实现

先读取当前仓库约束和实际包版本。在源码仓库中查找 `packages/cesium-gauss-kruger-grid`；消费项目中从依赖和导出声明定位，不能假定本机绝对路径。

按任务读取包内资料，无需每次通读全部文件：

- 接入、配置、支持范围：`README.md`、`docs/项目介绍.md`、`src/types.ts`、`src/index.ts`。
- 计算原理、修改算法：`docs/架构设计.md`、`src/gaussKrugerProjection.ts`、`src/gridGeometry.ts`。
- 相机刷新和清理：`src/GaussKrugerGrid.ts`。
- 线宽、闪烁、近裁剪、显存：`src/DrawCommandGaussKrugerGridPrimitive.ts`、`src/shader/`。
- 标签格式、边缘位置、密度：`src/screenLabels.ts`。

这些资料随包发布，但 Skill 可单独安装。找不到资料时以实际源码和官方接口为依据，不能声称已经验证了未取得的实现。

## 计算与坐标约定

当前流水线：相机视域 → 经度区间与投影带 → 正投影求 Easting/Northing 范围 → 选择网格间距 → 在平面上生成等坐标线 → 采样反投影 → 转为 ECEF → 分片裁切 → GPU 线段与 Canvas 注记。

- 投影采用 GRS80、横轴墨卡托、高斯—克吕格比例因子 `k=1`、假东偏 500000 m、假北偏 0 m。不要误换成 UTM 的 `k=0.9996`。
- Cesium `Cartographic` 和带号辅助函数的经纬度为弧度；Proj4js 地理数组为度；投影坐标与 ECEF 为米；屏幕线宽和标签间距为 CSS 像素。
- 6° 带号为 1～60，中央经线为 `6n−3` 度；3° 带号为 0～119，中央经线为 `3n` 度。中央经线按周期归一化。117°E 对应 6° 的 20 带、3° 的 39 带。境外编号仅是数学扩展，不能称为注册的 CGCS2000 EPSG CRS。
- Proj4js 使用 `[easting, northing]`；中国测绘标注 X 为北坐标、Y 为东坐标。东坐标的百万米带号只用于文本，不能加入反投影输入。
- 1000 m 间距指投影平面距离，地面距离有投影变形。当前以同一组角度绘制在 Cesium WGS84 椭球上，没有基准或历元转换；数值回归吻合不代表测绘绝对精度。
- `gridSpacing` 控制格子大小，`sampleSpacing` 控制曲线离散程度，`lineWidth` 控制屏幕粗细。三者不可互相替代。

修改计算时保留以下行为，除非任务明确要求改变：

- 正确处理 ±180°、3° 的 0/60 带和跨日界线的拆分范围，不能直接用 west/east 的普通大小比较。
- 投影范围检查赤道和中央经线极值，不能只投影矩形四角。
- 裁切后多个片段保持断开，不能连接穿过不可见区的端点。边界二分只处理相邻样点内外状态改变；有限采样仍可能漏掉极窄可见区。
- bounded 模式不能静默改变用户指定的一公里间距。全视域超预算且相机高度不超过 `gridSpacing × (maximumLinesPerAxis−1) / 2` 时，允许裁到相机地表位置附近的局部窗口，并按实际投影预算收缩；高空或仍超预算时隐藏。`status.rangeLimited` 标识局部范围，远处不绘制。lod 模式才允许选取更粗层级。
- 低空范围限制不等于精确的视锥地表轮廓或圆形距离裁切。不能只因中心射线朝天就隐藏；屏幕下方仍可能看到地面。全天空快速排除使用四角射线相对相机地表切平面的方向，而非“四角没命中地球”。
- 候选线 8192 条和常规采样点预估 500000 个是预检预算，后者不含边界二分的额外求值。采样启发式中的 8 cm / 0.05 px 不是最终误差保证，1 cm 是二分停止尺度。

## 接入与资源所有权

使用公开包入口；只有需要直接提供折线时才使用底层 primitive。普通接入示例：

```ts
import { GaussKrugerGrid } from "cesium-gauss-kruger-grid";

const grid = new GaussKrugerGrid(viewer.scene, {
  calculationMode: "bounded",
  zoneWidthDegrees: 6,
  zoneNumber: 20, // 117°E；需要自动分带时省略
  gridSpacing: 1000,
  maximumLinesPerAxis: 64, // 扩大显示预算，仍不能保证任意缩放距离下可见
  altitude: 20,
});
updateStatus(grid.status); // 构造时已完成首次计算，先读取当前状态
const removeChanged = grid.changed.addEventListener(updateStatus);

// 由应用挂接到实际的卸载或图层移除钩子。
function disposeGrid() {
  removeChanged();
  grid.destroy();
}
```

示例中的 `viewer`、`updateStatus` 和卸载钩子由宿主提供。包只接收 Scene，不创建或销毁 Viewer，不加载底图、不修改相机控制。格网管理自己的 primitive、GPU 资源、Canvas 和监听器；销毁需幂等，并兼容 `destroyPrimitives=false` 和 Viewer 提前销毁。

在原 Cesium 示例仓库中，示例底图使用 `createLocalWorldBaseLayers`，创建 Viewer 后立即调用 `applyDefaultViewerConfig`。这是该仓库约束；不要将这两个本地 helper 当作包导出，或强加给其他消费项目。

当前渲染仅支持 WGS84 椭球与 `SCENE3D`，纬度显示范围为 80°S～84°N。格网为椭球上方的折线，地平线判断依据椭球地表，不含地形深度测试；不承诺贴地或抬高线段的完整地平线可见性。

## 按现象排查

| 现象                                 | 优先检查                                                                                                       |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| 编辑器提示找不到 GLSL 的 `?raw` 模块 | 包内标准 `tsconfig.json` 是否被发现、是否加载 `vite/client`；仅有 `tsconfig.build.json` 不足以让编辑器归属项目 |
| 带号、坐标或跨日界线异常             | 弧度/度、轴顺序、中央经线与经度归一化、边界拆分                                                                |
| 近景没有线或出现错误连桥             | 采样密度、至少三点、片段切断、边界状态变化                                                                     |
| 拉远后隐藏，或低空倾斜范围过大       | bounded 线数预算、低空局部窗口及 `rangeLimited`、纬度/固定带范围、采样预算；不要直接扩大间距                   |
| 相机不动却重建，或只改视场角不刷新   | view/projection 双矩阵、画布尺寸、场景模式；保留 requestRenderMode 更新调度                                    |
| 地球尺度抖动、线宽随距离变化         | ECEF high/low 拆分、相机相对坐标、clip.w 和屏幕扩宽                                                            |
| 标签漂移、模糊或拥挤                 | Canvas 实际尺寸/像素倍率、投影到边框的交点、抽稀与文字宽度避让                                                 |
| 切换页面后泄漏或报错                 | 监听器解除、primitive collection 所有权、异步取消、销毁顺序                                                    |

状态中的线数可能是裁切片段数；`drawCommandCount` 是逻辑命令数，Cesium 多 pass 下不等于全场景一次 GPU 调用。`status` 可能存在但线数为零，不能把它当作是否有像素可见的唯一判断。

## 验证与交付

验证范围与修改相称。文档或注释任务核对源码事实、链接和编译即可；算法或渲染修改还要运行相应回归。在原仓库中可用：

```sh
pnpm test:gauss-kruger-grid
pnpm build
pnpm dev
```

浏览器页面为 `/scripts/grid-regression.html` 和 `/examples/primitive/square-kilometer-grid`。按改动关注自动/固定带、3°/6°、±180°、赤道、近景、视场角与尺寸变化、显式渲染、模式切换和销毁。坐标算法需使用独立 PROJ/EPSG 控制值；不能仅以同一实现的正反算闭环证明正确。

包使用 Cesium 内部 Buffer/VertexArray/DrawCommand 接口。升级前核对实际锁定版本与浏览器回归。已有验证组合是 Cesium 1.143.0、engine 26.1.0、widgets 16.1.0；若新装解析到不同间接版本导致导出错误，查清版本关系并参照 README 的应用级 pnpm overrides，不能把固定覆盖推广为所有版本的要求。

独立打包时确认 `cesium` 保持 peer/external、`proj4` 保持依赖/external、GLSL 已内联、类型相对导入使用 `.js`；再做消费项目导入和 NodeNext 类型检查。依赖、文件结构或 API 改动后同步包文档与 Skill，保持仓库副本和安装副本一致。

解释时按“输入与单位 → 计算目的 → 公式或判定 → 数据结构 → 绘制 → 生命周期 → 已验证结果与限制”展开，引用实际代码位置。需要进一步核对投影或 Cesium 行为时使用 PROJ、Proj4js 和 Cesium 官方文档，不把示意公式描述成代码已实现的算法。
