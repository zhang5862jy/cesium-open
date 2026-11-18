# cesium-screen-callout

维护文档：[设计文档](docs/设计文档.md)、[架构文档](docs/架构文档.md)、[技术路线](docs/技术路线.md)。

可发布的 CesiumJS / OpenLayers 屏幕空间目标标牌工具。两种地图共用 `TargetCalloutManager`、目标数据、`WorkerCalloutHandle` 和交互 API。传入 `scene` 时使用 Worker、共享字形图集和实例化 DrawCommand；传入 `map` 时使用顶层 DOM 容器与 CSS transform，不创建布局 Worker、字形图集或标牌 GPU 资源。

```ts
import { TargetCalloutManager } from "cesium-screen-callout";

const manager = new TargetCalloutManager({
  scene: viewer.scene,
  container: viewer.container,
  maxOffsetDistance: 240, // 可选；默认 Infinity，不限制
  targets: data.map((target) => ({
    id: target.id, // 可选；默认初始数组索引。字符串和数字是不同的键。
    position: target.position,
    title: target.title,
    badgeText: target.badgeText, // 每目标独立字母；省略为 A
    lines: target.lines,
    style: target.style,
  })),
});

await manager.ready;
manager.get(0)?.setTitle("目标 001");
manager.get(0)?.setLines(["状态：正常"]);
manager.get(0)?.setMaxOffsetDistance(180);
manager.updateTargets({ positions, lines }, true);
await manager.flush(); // 等待待处理数据完成布局与 GPU 上传，不代表已绘制一帧

const selected = manager.getById(data[0].id);
selected?.setLines(["人工备注"]); // 持续覆写实时数据
selected?.resetOverrides(["lines"]); // 立即恢复最近收到的数据源文字

// 先销毁管理器，再销毁 Viewer。
manager.destroy();
```

Cesium 和 OpenLayers 是 peer dependencies，不会被重复打包；当前要求 `cesium >=1.143.0 <2`、`ol ^10.11.0`。三维分支的包内 Worker 以内联 Blob 方式启动；严格 CSP 页面使用三维分支时需要允许 `worker-src blob:`。发布前执行 `pnpm --filter cesium-screen-callout build`，再执行 `pnpm --filter cesium-screen-callout pack` 检查 tarball。

## 二维 / 三维统一入口

构造参数必须且只能提供一个宿主：`{ scene: viewer.scene, ... }` 或 `{ map, ... }`。`TargetCalloutManagerOptions` 使用 TypeScript 联合类型约束，运行时也会校验；共有选项由 `TargetCalloutSharedOptions` 声明。除宿主对象外，目标数据、稀疏更新、样式、字段处理函数和句柄方法均保持一致。

```ts
import Map from "ol/Map.js";
import View from "ol/View.js";
import "ol/ol.css";
import { Cartesian3 } from "cesium";
import { TargetCalloutManager } from "cesium-screen-callout";

const map = new Map({
  target: mapElement,
  layers: localLayers, // 使用方提供底图；本仓库示例只使用本地静态影像
  view: new View({ projection: "EPSG:4326", center: [110, 32], zoom: 10 }),
});
const manager = new TargetCalloutManager({
  map, // 与三维入口的 scene 二选一；无需额外 container
  targets: [{
    id: "flight-001",
    position: Cartesian3.fromDegrees(110, 32, 1800), // 仍为 ECEF，不改成经纬度数组
    title: "目标 001",
    badgeText: "B",
    lines: ["速度：120 km/h"],
    fields: [{ key: "name", value: "001" }, { key: "speed", value: 120 }],
    compactStyle: { fontSize: 12, badgeColor: "#2196f3" },
    titleStyle: { badgeColor: "#2196f3", badgeTextColor: "#ffffff" },
  }],
  avoidance: true,
  onSelect: callout => console.log("选中", callout.id),
  onClick: (callout, event) => console.log("点击", callout.id, event),
  onDoubleClick: callout => console.log("双击切换后", callout.getDisplayMode()),
  onDragEnd: callout => console.log("释放位置", callout.getOffset()),
});
manager.onHover("fixedchange", ({ callout }) => console.log(callout.isScreenFixed()));
await manager.ready;
manager.updateTargets({ positions, titles, lines, fields }); // 与三维相同的输入结构
await manager.flush();

manager.destroy(); // 仅释放标牌所属资源，外部地图仍可继续使用
map.setTarget(undefined);
map.dispose(); // 地图由创建方决定何时销毁
```

二维使用 WGS84 将 `Cartesian3` / ECEF 转成经纬度，再转换到地图 View 的投影，支持 OpenLayers 用户投影（如 `useGeographic()`）及可横向循环投影的最近世界副本。高程仍保留在源数据与业务字段中，但不参与二维屏幕位置；二维没有地球遮挡或三维场景深度测试。视口显隐同时考虑目标锚点与标牌矩形：锚点出屏后，只要面板仍与视口相交就继续显示；两者都离开视口后才按离屏隐藏。

`DomCalloutRenderer` 在 `map.getViewport()` 中添加一个 `.target-callout-dom-overlay` 顶层 div，目标点、牵引线和标牌均为 div。面板用 `transform: translate(...)` 定位，牵引线用 transform 旋转；文本通过 `textContent` 写入。内容/样式变化先统一写 DOM，再统一测量，地图平移/缩放/旋转只重投影和更新偏移。已加载的新字体会使测量失效并重新布局。隐藏容器内的零尺寸测量不会覆盖有效缓存；容器恢复显示后调用 `map.updateSize()`，下一帧会重新测量。

二维碰撞尺寸读取计算样式中的小数 CSS 宽高，与 DOM 面板和命中范围同步；不使用取整后的 `offsetWidth` 作为最终宽度，避免零间距时漏检小数像素的边缘重叠。

两种后端共同实现 `CalloutRenderer`，地图事件由 `CalloutInteractionHost` 抽象；拖拽、点击、双击与悬停控制器共用同一份句柄命中区域。拖拽只暂停宿主地图当前启用的交互，结束后恢复；OpenLayers 控件和其他交互覆盖层不参与标牌拾取。简/详标独立避让、关闭避让保留位置、屏幕固定、透明区域拾取、双击切换与详标专属按钮规则在两种后端一致。

| 差异 | Cesium 三维 | OpenLayers 二维 |
| --- | --- | --- |
| 渲染 | Worker + SDF 图集 + DrawCommand | 主线程 DOM + 浏览器字体 |
| 视图刷新 | Cesium primitive.update / postRender | OpenLayers postrender |
| 深度 | 目标深度、椭球显隐及场景深度测试 | 顶层 DOM，不执行三维遮挡 |
| 文字画质 | `smoothing`、`weight`、`pixelSnap` | `smoothing` / `weight` 仅保存；`pixelSnap` 可用于面板像素对齐 |
| 运行要求 | WebGL2、Worker、OffscreenCanvas 2D、ImageBitmap | DOM、OpenLayers 与支持可转移缓冲的 `structuredClone` |

二维的像素对齐不会覆盖拖拽指针位置或有限距离约束，可能在这些状态下不执行取整。两种后端共用样式参数，但浏览器字体与 SDF 栅格化的字宽、抗锯齿可能有差异，不承诺逐像素一致。二维大量 DOM 的性能也不能直接套用三维 GPU 数据。

二维示例位于 `/examples/primitive/target-callout-2d`，默认 120 个目标，可选择 30 / 120 / 300 / 1000。示例用两张 Cesium 自带 NaturalEarthII 半球图片构成 OpenLayers `ImageStatic` 本地底图，复用三维模拟函数、字段处理函数和分类数据，每 200ms 提交一批业务数据，不访问外部地图服务。底图的投影和范围配置参考 [OpenLayers ImageStatic API](https://openlayers.org/en/latest/apidoc/module-ol_source_ImageStatic-Static.html)。

## 管理器接入约定

- `targets` 在构造时确定数量和顺序，至少一个；`id` 必须唯一，省略时使用数组索引。`get(index)` 与 `getById(id)` 返回同一轻量句柄。增删或重排目标需销毁并重建管理器。
- `updateTargets({ positions, titles, badges, lines, fields })` 的 `positions` 是完整 ECEF 数组（每个目标 x/y/z 三个有限数）；其余为稀疏更新：`titles: [{ index, title }]`、`badges: [{ index, badgeText }]`、`lines: [{ index, text }]` 和 `fields: [{ index, fields }]`。未处理的内容按目标索引合并，同目标最后一次提交优先，不同目标互不覆盖。位置保留最新一整批；三维最多一个 Worker 请求在途，二维在同一微任务调度边界合并后更新 DOM。
- 默认复制输入，提交后可继续修改调用方数据。第二参 `true` 将位置缓冲交给管理器，**从调用起就不得读写或再次转移该缓冲**；实际 detach 在异步应用批次时发生，二维使用可转移 structuredClone 保持这一约定。SharedArrayBuffer 不允许转移。文字和字段始终复制。
- `setPosition` / `setLines` 是持续覆写；后台继续保存最新源数据。`resetOverrides()` 恢复位置和文字，或传 `["position"]` / `["lines"]` 只恢复某一项；不改变样式、偏移、固定状态或显隐。
- `ready` 表示首批数据已应用到渲染后端（三维为布局/上传，二维为 DOM 内容/测量）。`flush()` 等待当前队列排空，适合静态批量配置、截图前的数据同步；持续提交的数据源可能延后其完成。二者不承诺浏览器已绘制一帧；视图变化后的命中区域在宿主下一次绘制后读取。
- 非法坐标、索引、行数、颜色、字号、间距在提交前同步抛错，失败不会部分应用到待处理队列。字体大小支持 8–48px，行距/内边距支持 0–200px。包会为数据、文字画质、偏移和拖动更新请求绘制，支持 `requestRenderMode`。
- 渲染后端失败（如三维 Worker 消息、GPU 上传或二维 DOM 更新出错）会终止并释放该管理器，拒绝尚未完成的 `ready` / `flush`，调用 `onError`；需要恢复时由业务重新创建。构造失败同步抛出并释放已创建资源。`onStats` 抛错会交给 `onError`，不阻断内部队列；`onError` 自身抛错只记录到控制台。
- `destroy()` 可重复调用，应先于 `viewer.destroy()` 或 `map.dispose()`；不会销毁外部 Scene、Viewer 或 Map。`isDestroyed()` 可检查状态；销毁后句柄修改、数据更新、事件注册会抛错。`onHover()` 返回取消订阅函数；事件快照包含稳定 `id`。

三维分支运行需要 WebGL2、Worker、OffscreenCanvas 2D 和 ImageBitmap；三维目标数不能超过 GPU 最大纹理宽度。该上限是存储约束，不是性能保证，二维 DOM 不受该纹理宽度限制。

## 详标与简标

每个标牌可独立选择 `"detailed"`（详标，默认）或 `"compact"`（简标）。详标顶部为独立 `title` 标题行，下面使用多行 `lines` 正文；标题只显示值，不添加字段名。简标把结构化 `fields` 的值按顺序放入同一行，字段之间用一个空格连接，不自动添加字段名。字段值接受字符串、有限数字、布尔值或 `null`，默认将 `null` 显示为 `—`；字段内的换行、制表符和连续空白归一为空格，空字符串字段省略。

详标标题和简标左侧都有属方色正方形，方块中显示该目标独立的 `badgeText`，切换模式时共用字母。字母默认 A，支持单个 A–Z，输入小写会转换为大写。方块背景 `badgeColor` 和字母颜色 `badgeTextColor` 分别从标题或简标样式读取；属方含义由业务传入，工具包不会由颜色推断属方。示例按目标索引循环使用 A/B/C，同属方颜色修改不会改变每目标字母。

```ts
const manager = new TargetCalloutManager({
  scene: viewer.scene,
  container: viewer.container,
  targets: [{
    id: "flight-001",
    position,
    title: "目标 001 / TRACKING",
    badgeText: "C",
    lines: ["速度：120 km/h", "高度：1800 m"],
    fields: [
      { key: "name", value: "001" },
      { key: "speed", value: 120 },
      { key: "height", value: 1800 },
    ],
    displayMode: "compact",
    style: { fontSize: 16, backgroundColor: "rgba(0, 0, 0, 0.8)" },
    compactStyle: { fontSize: 12, backgroundColor: "rgba(0, 0, 0, 0.4)" },
    titleStyle: { fontSize: 14, fontWeight: 700, badgeColor: "#34c759", badgeTextColor: "#142033" },
  }],
  defaultCompactStyle: { paddingTop: 2, paddingBottom: 2 },
  defaultTitleStyle: { paddingTop: 4, paddingBottom: 4 },
  compactFieldFormatter: (field, _index, _id) => {
    if (field.key === "speed") return `${field.value}km/h`;
    if (field.key === "height") return `${field.value}m`;
    return String(field.value ?? "");
  },
  onDisplayModeChange: callout => {
    console.log(callout.id, callout.getDisplayMode());
  },
});

const callout = manager.getById("flight-001")!;
callout.toggleDisplayMode(); // 同样可双击画布中的标牌切换
callout.setDisplayMode("compact");
callout.setStyle({ textColor: "#00ff00" }, "compact");
callout.setStyle({ textColor: "#ffffff" }, "detailed");
callout.setStyle({ textColor: "#ffffff", badgeColor: "#2196f3" }, "title");
callout.getStyle("compact"); // 返回副本；省略模式时读取当前请求的模式
callout.setTitle("目标 001 / CONFIRMED");
callout.setBadgeText("B");
callout.getTitle();
callout.getBadgeText();
callout.setFields([{ key: "name", value: "001" }, { key: "speed", value: 125 }]);
callout.setCompactFieldFormatter(field => String(field.value ?? ""));
callout.setCompactFieldFormatter(undefined); // 恢复工具包内置的字段值显示
manager.updateTargets({ fields: [{ index: 0, fields: [
  { key: "name", value: "001" }, { key: "speed", value: 130 },
] }] });
manager.updateTargets({ titles: [{ index: 0, title: "目标 001 / TRACKING" }], badges: [{ index: 0, badgeText: "C" }] });
await manager.flush();
```

`style` / `defaultStyle` 定义详标正文样式，`compactStyle` / `defaultCompactStyle` 定义简标样式，`titleStyle` / `defaultTitleStyle` 定义详标标题样式。`CalloutStyleSection` 为 `"detailed" | "compact" | "title"`，三套样式分别保存，切换不会覆盖另一套。`setStyle(patch)` 默认修改当前显示模式，第二参可明确选择标题；`getStyle("title")` 返回标题样式副本。标题的字体、字号、粗斜体、颜色、背景、边框与内边距独立生效，牵引线仍由当前显示模式样式控制；标题和简标均为一行，`lineGap` 不增加它们的行数。标题与正文组成一个完整详标矩形，命中、拖拽和避让包含标题、方块以及右侧按钮预留区域，标题不形成第三个避让组。

`title` 可直接设置，也可从 `fields` 中 `key: "title"` 的字段值获取；同一批提供显式 `titles` 时以显式值为准。标题内的换行与连续空白归一为空格，独立于简标字段处理函数。`getFields()` 返回字段副本；`setTitle`、`setBadgeText`、`setFields` 及对应批量更新都采用最近一次更新，不建立持久覆写层。`resetOverrides()` 仍只恢复位置和详标正文；不会恢复标题或字母。示例为了保留手工编辑的标题，会在业务层暂停向该目标推送源标题，点击恢复时重新提交最新源值。详标正文的 `setLines()` / `resetOverrides(["lines"])` 规则保持不变。

字段处理函数签名为 `(field, index, id) => string`，在主线程调用，返回文字后才交给对应渲染后端，不传递函数到 Worker。函数必须返回字符串；抛异常或返回错误类型会使当前修改同步失败，不部分更新同一批目标。请保持函数无副作用。未提供 `fields` 的旧项目会把已有详标文字合成一行，保留原文字内容；如需严格只显示字段值，应显式提供结构化字段，不会猜测并删除旧行中的字段名。

`getDisplayMode()` 是最新请求的模式；`getRenderedDisplayMode()` 是当前已显示几何的模式。模式切换、文字尺寸、按钮区域和避让分组随同一帧更新生效，避免新分组或按钮使用旧尺寸：三维在上传后的下一次绘制中一起提交，二维在 DOM 内容与测量提交时切换。`flush()` 后再等待一次绘制，即可读取对应命中区域。双击地图中的可见标牌切换模式，销毁时注销监听；`onDisplayModeChange` 接收双击和程序切换，不在构造时通知初始模式。

详标只与详标避让，简标只与简标避让，两组独立保留历史位置；简、详标之间允许重叠。两种模式共用目标位置、显隐、固定状态和用户偏移。模式切换不会复制目标，也不会增加独立的 Worker 或 Primitive。

## 标牌自动避让

```ts
const manager = new TargetCalloutManager({
  scene: viewer.scene,
  container: viewer.container,
  targets,
  preservePositionOnAvoidanceDisable: true, // 默认值；关闭避让时保留当前显示位置
  avoidance: {
    enabled: true, gap: 6,
    maxDisplacement: 160, // 相对自身配置位置的自动避让半径，CSS px
    distanceWeight: 0.25, // 靠近配置位置的偏好权重；精确修复先比较碰撞与移动数量
    maxCandidates: 96, maxIterations: 32,
  },
});
manager.setAvoidance(false); // 当前显示偏移成为新的配置偏移，不跳回避让前的位置
manager.setAvoidance({ enabled: true, gap: 10 });
manager.setAvoidance({ enabled: true, gap: 3, maxDisplacement: 80 }, "compact");
manager.getAvoidance("compact"); // 返回该模式的配置副本；省略时查询 detailed
manager.getAvoidanceStats(); // moved、unresolved、candidateChecks，两模式合计，postRender 后读取
manager.getAvoidanceStats("detailed"); // 只查询详标
```

构造时的 `avoidance` 和省略模式参数的 `setAvoidance()` 同时配置两种模式；传入第二参 `"compact"` / `"detailed"` 只修改对应模式，两组各自保存开关、间距、半径和布局历史。

管理器的 `preservePositionOnAvoidanceDisable` 默认 `true`：某一模式从开启切换为关闭时，将该模式当前已渲染标牌的显示偏移保存为新的首选偏移，之后继续跟随目标，不跳回原位置。重新开启后以保存的位置为中心继续避让；重复关闭不会再次改写偏移。需要旧版关闭后恢复配置位置的行为时，在构造管理器时设置 `preservePositionOnAvoidanceDisable: false`。该选项适用于管理器的全局和分模式 `setAvoidance()`，不触发 Worker 文字布局。

工具包默认关闭以兼容旧项目；示例默认开启，并提供开关、间距和自动避让半径输入。开启后默认优先就近布局：自动移动相对各自配置位置最多 160px，半径内放不下就保留局部重叠，全部标牌仍然显示。`maxDisplacement: 0` 禁止自动位移；`Infinity` 允许不限距离。`distanceWeight` 范围 0–10，默认 0.25，调节靠近配置位置的偏好；精确修复先比较碰撞结果和移动数量，不允许用距离代价抵消尚未解决的碰撞。设为 0 仍会考虑相对本次修复起点的移动距离；它不会关闭稳定性偏好。若希望扩大可用搜索范围，可显式设置 `maxDisplacement: Infinity`，仍不保证全局装箱最优。

这里的半径是“自动避让额外移动量”，以每个标牌自己的配置偏移为中心，不改变配置值。手动拖拽的位置仍由鼠标决定，松手后的新位置成为后续避让的首选位置。它不同于 `setMaxOffsetDistance()`：后者约束标牌中心到地理目标投影点的距离，且也影响手动拖拽。两者同时启用时共同生效；视口边缘本身不触发自动位移。

避让针对可见标牌的整个矩形（包括透明背景），不检测牵引线交叉、页面面板或建筑物的逐像素遮挡。

只有标牌之间发生碰撞（含配置间距）才进行避让移动。没有碰撞时保留已有相对偏移，标牌随地图平移、缩放或旋转可以部分或全部移出视口，不会因为越界被拉回屏内。锚点出屏但面板仍与视口相交时继续显示，两者都离屏才按离屏隐藏；三维的地球遮挡、相机前后关系、显式显隐和中心距离限制仍独立生效。

碰撞修复有条件保护屏内标牌：以**本次修复开始前**、按当前地图投影和已有偏移得到的矩形为准，只有当时完整位于视口内的标牌，才要求修复后的矩形继续完整留在视口内。它不是“上一帧曾经在屏内”的永久约束；本次修复前已部分或全部越界的标牌不会被强制拉回。附近没有满足距离与此项保护的空位时保留剩余重叠，不把受保护标牌推出屏幕换取无碰撞。

一次求解完成后，直接将结果写入二三维渲染偏移和命中区域，不使用插值、过渡动画或分帧限速滑动。求解内部可执行多轮有预算的迭代；这不等于跨帧播放位移动画。

拖拽期间暂停整批自动避让：被拖拽标牌跟随指针，其他标牌保留已有避让偏移，目标自身运动和牵引线继续刷新。松手后才按最终位置重算，本次释放的标牌优先保持最终位置；历史拖拽和固定状态提高移动代价，普通标牌更容易让位，但这类代价不会让已找到可行空位的精确候选输给仍有碰撞的候选。两张都曾拖动的标牌再次相遇时，仍应尝试只移动其中必要的一张。同级按索引稳定处理。固定坐标仍是首选位置，固定标牌也可以被临时避让。这替代了旧版“拖动每帧推开邻居”的交互，拖拽途中允许临时重叠。

布局从上一帧相对位置继续计算。精确候选、搜索队列和整批最佳结果使用同一比较顺序：先减少与本次释放标牌的冲突，再减少总重叠，然后减少本轮移动标牌数，最后比较移动代价。这样尽量只移动冲突中的必要一侧，已有稳定布局不为微小收益整体重排。已无冲突的标牌在障碍移走后保持当前位置，不自动回到原配置位置。空间哈希查找接触矩形，受影响邻居仍受各自自动半径限制。局部修复搜索附近矩形边缘空位，候选入队前去重。初次碰撞修复的额外候选也限定在自身附近；显式使用无限半径时可扩大候选搜索，但仍须遵守本次修复的屏内保护。这是有限预算的启发式，不保证全局最少移动数量。

目标运动、地图视图变化和已应用的文字尺寸在当前渲染帧同步应用；GPU / DOM 偏移、牵引线、悬停和拖拽命中区域使用同一结果。沿用 MapLibre 的“先尝试历史位置”策略：整体平移直接跟随目标，布局相对位置不变；相对几何变化累计超过 1 CSS px 后才重新求解，新发生的实际矩形碰撞、尺寸/约束变化触发计算。阈值参照上次求解，缓慢移动不会被永久忽略。拖拽期间不调用避让求解器，松手后使布局重新计算。重复设置相同避让配置保留缓存；纯避让不发送 Worker 消息，也不重建字形。

目标中心距离圆和自动偏移圆共同限制碰撞候选；只有本次修复前完整位于视口内的标牌，才额外限制其候选矩形留在屏内。没有碰撞时不做视口投影或边界钳制。屏幕外矩形进入空间哈希的边界桶，最终使用真实矩形检测，避免越界后漏报冲突。屏幕平面上的矩形分离仍是有预算的启发式，不能保证任意密度或尺寸突变时完全不跳位。

这是有限预算的二维启发式约束求解，不保证全局最优，也不把搜索耗尽等同于数学上的无解。空间不足、最大偏移限制冲突或预算耗尽时，优先保护拖动标牌，尽量减少剩余冲突，全部保留标牌。`unresolved` 是最终仍参与冲突的可见标牌数（包括间距），一对冲突的两张标牌都会计数；不是重叠对数。

`maxCandidates` 默认 96，可设 8–512，限制局部搜索展开数；`candidateChecks` 统计展开数或密度采样数，不包含空间索引查询及队列优先级预估。`maxIterations` 默认 32，可设 1–128。还有内部的成对修正预算。单一模式中可见标牌超过 64 张且总面积超过视口时，碰撞修复可使用同模式标牌共同贡献的占用密度场，用积分表评估至多 32 个候选。密度搜索前后各有一轮基于真实矩形的局部修复，每标牌每轮至多展开 16 个候选，并限制检查的邻域不超过 32 张，避免某处过密导致其他有空间的局部冲突只接受粗略密度估计。各阶段共享候选预算，默认仍在各自自动半径内搜索。密度估计不等于真实重叠，因此密度阶段在优先保护本次释放标牌后，权衡占用密度与移动代价，避免为了微小的估计收益大幅移动；前后的精确阶段仍按真实碰撞优先。密度候选也遵守本次修复的屏内保护，选定位置直接应用，不用逐帧小步移动模拟动画。密度搜索本身仍是近似退化策略；最终冲突统计使用真实矩形，预算耗尽后允许残留重叠。

算法参考 [Adaptagrams 的矩形分离约束](https://www.adaptagrams.org/documentation/namespacevpsc.html)、[WebCola 先满足分离约束再优化位置](https://github.com/tgdwyer/WebCola/blob/master/src/vpsc.ts)、[textalloc 的精确碰撞候选过滤](https://github.com/ckjellson/textalloc/blob/main/src/textalloc/non_overlapping_boxes.py)、[adjustText 的包围盒迭代调整](https://adjusttext.readthedocs.io/en/latest/)和 [MapLibre 的历史位置复用](https://github.com/maplibre/maplibre-gl-js/blob/main/src/symbol/placement.ts)。本实现借鉴约束优先、精确候选过滤和历史位置复用思想，使用有界投影迭代，没有引入或声称实现完整的 VPSC 二次规划求解器。

最大中心偏移距离仍是硬约束，拖动标牌的既有距离限制也继续生效。自动避让不能以越过本次修复的屏内保护来换取空位；没有合适位置时允许剩余碰撞。自动布局期间不改写配置偏移：`getOffset()` 返回实际显示偏移，`getPreferredOffset()` 返回首选配置偏移。默认管理器关闭避让时才将当前显示偏移保存为首选偏移；选择 `preservePositionOnAvoidanceDisable: false` 或直接使用低层 Renderer 关闭避让时，则恢复既有配置偏移。

自定义 Worker 应从 `cesium-screen-callout/worker` 导入 `GlyphBatchBuilder`、`WorkerCalloutRenderer`、`isTargetVisible` 等纯计算工具。该入口不加载 Cesium、DOM 控制器或 GPU Renderer，避免开发模式 Worker 间接引入主线程依赖；主线程继续从包主入口导入管理器。

当前 `/examples/primitive/target-callout` 从本包导入 Worker 字形/布局计算和 WebGL2 实例化批量绘制，默认显示 100 个目标，按 10×10 网格分布，不创建 Entity 或立方体。原生 Cesium `TargetCallout` 小批量实现仍兼容保留。

## 三维数据更新和相机更新分离

- 仅位置或显隐变化、文字与样式未变化时，Worker 跳过文字布局，主线程保留现有 GPU 字符缓冲；相机投影和中心距离限制仍逐帧更新。
- 字体相同且内容未变化的行复用字形引用与测量宽度；字形纹理坐标复用，颜色解析缓存最多 256 项。逐行缓存通过 WeakMap 绑定目标，目标释放后可回收，不积累历史字符串。

- `TargetCalloutManager` 内置 Worker 计算字形和标牌布局，并合并高频目标/样式更新。目标运动或业务数据由使用方产生，通过 `updateTargets()` 批量提交；示例自己的模拟 Worker 不属于发布包。
- `GlyphBatchBuilder` 在 Worker 的 OffscreenCanvas 中维护固定 4096×4096 字形图集，可容纳多平台字体、样式和字重组合。切换样式时增量追加缺失字形，不再清空并重建全部字形；容量不足时丢弃当前未使用的缓存并重排，当前字符集合本身超限才报错。字符集合变化时才上传图集，不再把整张屏幕截图当作标牌结果。
- `ScreenBatchRenderer` 注册 Cesium primitive，在 primitive.update 中使用当前相机投影及遮挡判断，更新约 32KB 的目标参数纹理，提交两个共享实例缓冲的有序 DrawCommand：先完整绘制全部牵引线，再绘制背景、边框和文字。Cesium 可因 OIT 或多视锥派生出多次实际绘制，不再使用独立覆盖 Canvas。
- 相机平移/旋转/缩放、画布尺寸、显隐判定、命中区域和拖拽偏移按每个实际渲染帧同步，不等待 Worker 返回。即使数据间隔设为 5000ms，地图交互也不延迟 5 秒。
- 牵引线最近角在顶点着色器中按当前偏移与尺寸计算；纯拖拽不触发 Worker 文本布局重建。文字/样式变化仍按异步数据管线更新。
- 纯偏移/距离限制修改不发送布局 Worker 消息；重复样式和显隐修改直接跳过。管理器通过位置版本复用包围球，相机连续变化时不重复计算。低层 Renderer 未提供 `WorkerFrame.positionsVersion` 时保留逐帧计算行为，兼容直接原地修改数组；若选择提供版本，位置变化时须递增版本。
- 新批次将牵引线放在连续的前段实例，面板和文字放在后段。两个 DrawCommand 通过不同 VAO 偏移共享同一缓冲，各自只遍历自己的实例；原先每个命令遍历全批次，共 2N 次实例处理，现在合计 N 次。此项减少重复顶点/光栅化工作，不代表 FPS 翻倍。未提供 `leaderCount` 的旧批次仍走兼容绘制。
- 位置和实例 TypedArray 往返复用；GPU 实例缓冲按容量复用。位图上传后立即 close；卸载释放计时器、RAF、性能观察器、Worker、所属 primitive、GPU 缓冲/纹理/程序、拖拽和场景监听；共享 Cesium 上下文仅由 Viewer 管理。

## 三维 Viewer 与文字清晰度

包不擅自修改 Viewer 的相机按键映射。可选的 `applyCalloutRenderQuality(viewer)` 会避免小字号文字被低分辨率画布放大或被全屏后处理重复软化：使用设备原生像素比（超大画布受显存上限约束）、可用时启用 4× MSAA，并关闭 FXAA。返回的清理函数会恢复此前的画质设置。

模拟运动使用独立的 performance.now 计时；暂停/恢复不改 Viewer 时钟。默认高空总览和定位按钮是相机操作，不改相机控制器默认映射；仅拖动标牌期间临时锁定相机输入并在结束时恢复。

标牌直接绘入 Cesium Canvas，字体图集统一按 64px 生成，布局按用户字号缩放，同字体的不同字号共享字形。字形四边会按实际绘图缓冲区像素对齐，避免宽高端点落在半个物理像素上。画布按设备原生 DPR 输出，不做会再次缩小整张画布的额外超采样。

文字使用 Worker 生成的 SDF 距离场，而非直接缩小透明度位图。距离保存在不透明 RGB 通道，避免 ImageBitmap 预乘透明度破坏数值；每个字符保留 12 个图集像素的留白。片元着色器通过屏幕导数重建窄抗锯齿边缘，字符起点按实际绘图缓冲区像素对齐，标牌边框和牵引线仍保持原始精确偏移。文字通过普通 source-over alpha 混合叠加在背景上，实色笔画完全覆盖底色，不参与 OIT 加权混色。SDF 只在字体/字符集合变化时重建，日常数字更新继续复用图集。

## 三维场景深度与渲染顺序

完整保留牵引线，不裁剪标牌内部区域。先绘制整批牵引线，再按实例顺序绘制标牌背景、边框和文字；背景透明时能透出底层牵引线，半透明时按 source-over 混合，不透明时覆盖牵引线。

当前 Cesium 1.143 / engine 26.1 使用内部 `CESIUM_3D_TILE_EDGES_DIRECT` 通道作为有序直接颜色阶段。该阶段在不透明场景之后、OIT 透明场景之前执行，并保持提交顺序；两个命令均开启深度测试、关闭深度写入。不改变 Viewer 的 OIT 设置。此内部通道是版本适配点，升级 Cesium 必须验证；其他场景透明对象仍在后续透明阶段合成，标牌与它们不提供任意深度排序保证。

标牌使用绑定目标的相机空间深度，屏幕偏移只改变投影后的 XY，尺寸仍为 CSS 像素。有序绘制通道开启 depthTest、关闭 depthMask，支持 Cesium 对数深度和多视锥。更近的不透明物体可遮挡标牌，较远物体不会盖住标牌。透明物体由 Cesium OIT/透明排序合成，不提供类似 DOM z-index 的强制上下层保证。固定屏幕和拖拽时，XY 固定但深度仍取绑定目标。

构造方式：`new ScreenBatchRenderer(viewer.scene, count, () => currentFrame, () => callouts)`。Worker 返回后仍调用 `renderer.update(batch, enabled)`；渲染由 scene.primitives 自动驱动，无需 postRender 调用 draw。在 postRender 读取 `visibleCount` 并更新 Hover 按钮。视口显隐同时考虑目标锚点和偏移后的标牌矩形：锚点出屏但面板仍与视口相交时继续显示，两者都离屏才按离屏隐藏。计数和矩形拾取仍考虑相机前后与椭球显隐，未做建筑遮挡的逐像素拾取；Hover 操作按钮仍属于 DOM UI。

DrawCommand、Buffer、Texture 等使用 Cesium 内部渲染 API，升级 Cesium 时需运行像素级回归。

## 数据接口与性能指标

文字清晰度可通过 `manager.setTextRendering({ smoothing: 0.18, weight: 0.06, pixelSnap: true })` 实时调整，`getTextRendering()` 返回当前值。三维的 `smoothing` 范围 0–1.5，越小边缘越硬；`weight` 范围 -0.5–0.5，正值加粗、负值变细；`pixelSnap` 控制字符四边对齐实际绘图缓冲区像素。三维设置作用于整个批次的两个绘制通道，立即更新 uniform，不需要等待 Worker。二维保存同样参数，其中 `smoothing` / `weight` 不干预浏览器字体栅格化，`pixelSnap` 按前述约束对齐面板。三维示例在“文字清晰度”区域提供对应控件。

`WorkerCalloutHandle.setScreenFixed(true)` 将当前标牌左下角固定在地图视口 CSS 像素位置；`isScreenFixed()` 查询状态，`setScreenFixed(false)` 保留取消时的当前目标偏移继续跟随。固定时牵引线仍连接目标最近角，拖拽或 `setOffset()` 可重新定位固定位置，不触发 Worker 布局。未产生可见帧时开启固定返回 false。固定面板仍与视口相交时，不会仅因锚点出屏而隐藏；三维额外考虑相机前后与地球遮挡，重新可见时保留固定位置。页面固定按钮仅作用于当前目标，不受批量配置范围影响。

`WorkerCalloutHandle.setPosition()` / `setLines()` 覆盖目标模拟数据；`setStyle()`、`setOffset()`、`setDistance()`、`setShow()` 修改配置。每个实例保存独立样式；透明矩形区域可拖拽。位置/文字的覆写持续有效直到下次修改、`resetOverrides()` 或卸载。

`setMaxOffsetDistance(px)` 限制目标点到标牌中心点的最大 CSS 像素距离，拖拽、`setOffset()` 和 `setDistance()` 都会被约束到圆形边界；传入 `Infinity` 或不配置表示不限制。管理器的 `maxOffsetDistance` 设置批次默认值，单个 target 的同名配置优先。`getMaxOffsetDistance()` 返回当前限制。标牌尺寸因文字、字号或内边距变化时会重新约束中心点。屏幕固定与距离限制同时开启时，距离限制优先，目标远离固定位置后标牌会沿限制边界跟随。

三维页面显示原生 Cesium FPS，以及页面 rAF FPS/P95、Worker 计算与布局时间、主线程上传时间、往返时间、JS 堆估计和长任务计数。页面 rAF、实际地图绘制、目标数据更新是不同频率，不把低频数据更新冒充高频文字变化。采样最多保存最近 120 条，每秒一条，可查看和导出。`performance.memory` 不是 GPU/Worker/进程总内存，短期 GC 波动不能证明长期零泄漏。二维 `getStats()` 保留相同字段，记录最近批次的主线程数据处理、DOM 测量和应用时间；这些值不代表 Worker 往返或 GPU 上传。

## 点击、悬停与操作事件

两种后端支持相同的构造回调：`onSelect(callout)`、`onClick(callout, MouseEvent)`、`onDoubleClick(callout, MouseEvent)`、`onDragEnd(callout)`。双击先执行默认简详标切换，再通知 `onDoubleClick`；原生双击序列仍包含单击事件，不延迟或屏蔽先前的 `onClick`。超过 3 CSS px 的拖动不会再当作点击。`draggable: false` 只关闭拖拽，点击选择和双击切换仍可使用。

两种后端共用 `TargetCalloutHoverController`（`hover.ts`），通过屏幕矩形从后向前拾取最上层标牌，透明区域同样可悬停。仅详标悬停时在标题右侧显示固定/取消固定、关闭两个小圆按钮；布局为按钮预留位置，避免覆盖标题文字。简标不显示按钮，仍正常触发悬停事件。切换模式期间，只有请求模式和已渲染模式均为详标才显示按钮，避免简标旁残留工具栏。关闭调用 `setShow(false)`，恢复调用 `setShow(true)`。管理器在后端绘制后更新悬停和按钮位置，并在销毁时释放控制器。二维自动挂载在地图 viewport；三维启用工具栏时仍需提供 `container`。`hoverActions: false` 不创建悬停控制器，`onHover()` 注册返回空清理函数。

```ts
const hover = new TargetCalloutHoverController(container, viewer.canvas, () => callouts);
const unsubscribe = hover.on("mouseenter", ({ callout, properties, originalEvent }) => {
  // callout 是可调用 setStyle / setLines / setShow 等方法的原实例。
  // properties 是快照：index、position、offset、style、screenFixed、show、bounds。
  console.log(callout, properties, originalEvent);
});
hover.on("close", ({ callout, properties }) => { /* 关闭后的实例和属性 */ });
// 同样支持 mousemove、mouseleave、fixedchange；程序触发的悬停变化没有 originalEvent。
unsubscribe();
```

事件回调不参与 Worker 消息传递；属性快照中的位置、偏移和样式是副本。`close` 和 `fixedchange` 在默认动作完成后触发。

## 验证

执行 `pnpm build`，打开示例测试输入框、默认地图交互、拖拽换角、暂停、窗口缩放及退出清理。

二维路由 `/examples/primitive/target-callout-2d` 还应检查四档数量、地图平移/缩放/旋转、DOM transform 与命中区域一致、按钮不触发地图交互、简详标切换和独立避让，以及导航离开后重新进入无重复容器/事件监听。三维路由 `/examples/primitive/target-callout` 的原有 Worker/GPU 回归继续保留；二维没有 Worker/GPU，不能用三维通过结果替代二维验证。

两种后端都需检查视口边缘行为：无碰撞标牌随地图移动越界时保持偏移；锚点出屏但面板仍相交时继续显示，两者都离屏才隐藏；同一轮修复开始时完整在屏内的标牌不会被碰撞修复推出；开始时已越界者不会被强制拉回；避让结果直接落位，命中区域同步更新。

执行 `node scripts/target-callout-efficiency-check.mjs` 验证布局缓存与未缓存输出一致、Unicode、样式/文字变更、仅位置/显隐更新及 GPU 上传跳过路径。脚本使用模拟 Canvas，耗时仅反映算法执行，不代表浏览器实际 FPS 或字体栅格化耗时。

- `pnpm test:target-callout`：先构建包，再执行管理器、业务行为和缓存效率检查；涵盖稀疏更新合并、覆写恢复、输入快照、转移、非法输入、异常清理、回调隔离和纯偏移不发消息。
- `/scripts/target-callout-2d-regression.html`：真实 OpenLayers 与 DOM，检查 ECEF / 用户投影 / 世界循环、平移缩放旋转、transform 与命中矩形、简详标和独立避让、延后拖拽求解、关闭避让保留/恢复位置、共享事件、工具栏与地图事件隔离；三轮创建/销毁确认无标牌 Worker / WebGL 分配并清理容器和监听。
- `/scripts/target-callout-manager-regression.html`：真实 Worker/GPU、`requestRenderMode` 刷新、拖拽期间暂停避让与松手重算、简详标独立避让/样式/尺寸、双击切换和销毁、GPU/命中偏移一致、零实例透明面板拾取、连续三轮创建/销毁的 primitive、监听器与工具栏检查。
- `node scripts/target-callout-display-check.mjs`：实际管理器/Worker 的单行字段处理、稀疏合并、数据副本、非法输入原子性、双模式独立样式、详标覆写、连续切换时批次模式与尺寸一致。
- `node scripts/target-callout-avoidance-check.mjs`：空间足够、单行 8 张标牌连续拖动与连锁传播、移动目标交叉、边缘拖拽与尺寸变化、隐藏目标、中心距离约束、实际冲突统计、1000 个标牌放不下时的有界退化、低层 Renderer 关闭后恢复配置偏移。
- `node scripts/target-callout-stability-check.mjs`：120 帧整体平移、独立亚像素扰动、拖拽接触边界、缓慢累积运动、屏幕外碰撞，以及双半径约束的一致性检查。已纳入 `pnpm test:target-callout`。
- `/scripts/target-callout-camera-regression.html`：只发送一次 Worker 数据，测试多组相机姿态和平移；与 Cesium 当前投影对照误差，直接读取 GPU 边框/牵引线像素；四方向拖拽无需 Worker；检查只有一个 Cesium Canvas，真实不透明物体的前后遮挡，并覆盖普通/对数深度；校验 Renderer 不修改 Viewer 默认配置、图集复用和缓冲转移。
- `/scripts/target-callout-regression.html`：保留原生 Cesium 标牌回归。
- `/scripts/target-callout-worker-regression.html`：此前整屏 OffscreenCanvas 实现的算法回归，不代表当前示例的渲染管线。

## 原生 Cesium API（兼容保留）


```ts
const callout = new TargetCallout(viewer.scene, position, {
  offset: new Cartesian2(80, -80), // 创建时的 CSS 像素偏移
  style: {
    leaderColor: "#ff0000",
    borderColor: "#ff0000",
    textColor: "#ff0000",
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    fontSize: 14,
    fontFamily: "sans-serif",
    fontStyle: "normal",
    fontWeight: 400,
    lineGap: 1,
    paddingTop: 10,
    paddingRight: 10,
    paddingBottom: 10,
    paddingLeft: 5,
    showBorder: true,
    showLeader: true,
  },
  maxOffsetDistance: 240, // 可选；默认 Infinity
});
callout.setPosition(nextPosition);
callout.setLines(["目标 001", "速度 140.0 m/s"]);
callout.setOffset(new Cartesian2(-180, 100));
callout.setStyle({ fontStyle: "italic", fontWeight: 700, fontSize: 20 });
callout.setShow(true);

const drag = new TargetCalloutDragController(
  viewer.scene,
  () => callouts,
  (selected) => { /* 选择当前标牌 */ },
);
// 卸载时先释放拖拽，再释放标牌，最后销毁 Viewer。
drag.destroy();
callouts.forEach((item) => item.destroy());
viewer.destroy();
```

- 上述样式均为默认值；`fontStyle` 支持 normal / bold / italic / bold italic，`fontWeight` 支持 100–900 的整百数，字号范围 8–48px。新代码建议用 `fontStyle` 表示常规/斜体、用 `fontWeight` 独立控制粗细；旧的 bold 组合值继续兼容。
- setStyle 只修改传入项，getStyle 返回副本，实例之间样式独立。
- setOffset / getOffset 是目标中心到标牌左下角的 CSS 像素偏移，x 向右、y 向下。构造 options.offset 优先于 options.distance，并复制传入坐标；原有数字 distance / 第四参 style 的调用方式仍兼容。
- 牵引线自动选择四个角中距目标中心最近的角。拖拽、字号、文本和内边距变化都会重新计算；距离相等时按左下、左上、右上、右下顺序选择。getLeaderCorner / getLeaderEndpoint 可读取当前连接角及像素坐标。
- setDistance 将方向重置为右上 45°。拖拽到其他方向后，偏移仍与缩放无关。
- 六行以内，尺寸按实际行数和文字宽度自适应，不保留原来的固定最小尺寸。lineGap 是行框之间的空隙，每行纵向步长为 fontSize + lineGap；四侧 padding 从 2px 边框内沿算起，全部支持 0–200px，行距对每一行一致。
- 背景完全透明、边框隐藏时，整个矩形区域仍能拖动。重叠时选择后创建的可见标牌。
- 拖拽使用 pointer capture，拖动期间暂停相机输入，松手、失焦、取消或销毁时恢复原状态。
- 拖动期间即使目标继续运动，抓取点也保持在指针下方；松手后保存当前偏移。
- 拖拽控制器可传第四个 onDragEnd 回调，用于松手/取消后同步偏移输入框。
- 此原生兼容类保留旧显隐规则：目标在相机后、视口外或被地球椭球遮挡时隐藏，不做地形/建筑遮挡检测。前述管理器后端则同时考虑锚点与面板的视口位置；管理器自动避让通过 `avoidance` 显式开启。

