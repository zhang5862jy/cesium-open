# 自定义几何体扩展指南

本目录的实现采用“CPU 拓扑 + GPU 形状公式”的方式：CPU 只创建三角形索引和参数属性，顶点着色器根据实例属性计算最终位置，片元着色器完成颜色、网格和扫描效果。

## 一次创建的四层结构

1. **类型层：** 在 `types.ts` 增加新的 `ShaderGeometryKind` 字面量和对应的判别联合选项。
2. **拓扑层：** 在 `geometry.ts` 增加一个网格生成函数，并在 `createSurfaceArrays` 或 `createParametricGeometry` 中分派。这里决定顶点数量、参数坐标和索引，属于不可变拓扑。
3. **参数层：** 在 `ParametricGeometryPrimitive.ts` 的 `AttributeState` 中增加或复用 `Float32Array`，再在 `updateAttributeState` 中把 UI 参数打包成 GPU 属性。参数变化应走这里，不要重新创建 `Primitive`。
4. **着色层：** 在 `shaders.ts` 增加一个顶点 shader body，并在 `getVertexShader` 中注册。片元 shader 可以读取 `v_surface`、`v_barycentric` 和批属性，实现通用网格或高亮。

## 推荐的扩展步骤

### 1. 定义参数

```ts
export interface SpiralGeometryOptions extends CommonShaderGeometryOptions {
  kind: "spiral";
  radius: number;
  turns: number;
}
```

把 `SpiralGeometryOptions` 加入 `ShaderGeometryOptions`，这样 `switch` 会要求所有更新路径处理新形状。

### 2. 生成参数化网格

```ts
function createSpiralArrays(): AttributeArrays {
  const arrays = createArrays();
  appendGrid(arrays, 128, 16);
  return arrays;
}
```

`surface.x/y` 通常保存 `[0, 1]` 的参数坐标；`parametric.z` 可以保存面编号。需要硬边线框时，不要共享三角形顶点，并为每个角点写入不同的 `barycentric` 值。

### 3. 在顶点 shader 中计算位置

```glsl
void main() {
  vec4 dimensions = czm_batchTable_shapeDimensions(batchId);
  vec4 shapeParameters = czm_batchTable_shapeParameters(batchId);
  float angle = surface.x * czm_twoPi * shapeParameters.x;
  vec3 position = vec3(
    cos(angle) * dimensions.z,
    sin(angle) * dimensions.z,
    (surface.y - 0.5) * dimensions.z
  );
  finishVertex(position);
  APPLY_INSTANCE_STYLE()
}
```

顶点公式应输出局部 ENU 坐标。`finishVertex` 会使用 `czm_modelView` 和 `czm_projection` 完成 Cesium 坐标变换；不要在 CPU 中把每个顶点转换成经纬度，也不要在 shader 中重复应用地理模型矩阵。

### 4. 打包并更新参数

如果参数能放入已有的四元数组，就复用 `shapeDimensions` 或 `shapeParameters`；否则新增一个实例属性，并在 `createInstanceAttributes` 和 `applyRuntimeAttributes` 两处同时注册。更新流程只修改 `getGeometryInstanceAttributes` 返回的值，因此不会重建索引缓冲。

### 5. 设置包围球和渲染状态

`geometry.ts` 中的 `boundingSphere` 必须覆盖所有允许的 shader 形变，否则相机移动时可能发生错误裁剪。透明体继续使用深度测试、关闭深度写入、关闭背面剔除和 alpha blending；不透明形状可以单独优化为开启背面剔除。

## 选择 CPU/GPU 的边界

- **放在 CPU：** 拓扑、索引、面编号、参数坐标、不会变化的分段数。
- **放在 GPU：** 尺寸、颜色、透明度、时间、旋转、扫描相位、法线或位移等每帧/每次交互变化的值。
- **必须重建 Geometry：** 只有分段数、面数或索引连接关系改变时才重建；当前 UI 不暴露这些参数。

## 常见检查项

- `GeometryAttribute` 名称必须和 GLSL `in` 声明一致。
- `batchId` 要保留，Cesium 才能生成 `czm_batchTable_*` 实例属性访问器。
- 透明 `Appearance` 不要在 shader 中重复声明 `czm_out_FragColor` 或 `out_FragColor`。
- 球面经纬网格要复制 U=0/U=1 的接缝顶点，极点要避免退化三角形造成裂缝。
- 新增 kind 后同步更新 `types.ts`、`geometry.ts`、`shaders.ts`、`updateAttributeState` 和页面的 `buildOptions`。
- 控制器销毁时移除 Primitive 并销毁 Material；页面卸载时销毁控制器和时钟监听。
