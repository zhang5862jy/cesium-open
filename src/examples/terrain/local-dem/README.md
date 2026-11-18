# 本地 DEM 色阶瓦片

该示例把浏览器选取的本地 DEM 解析为单波段栅格，再实现 Cesium
`ImageryProvider` 接口。Cesium 请求某个 `{z}/{x}/{y}` 时，提供器会：

1. 将 256 × 256 瓦片像元反算到经纬度；
2. 映射到 DEM 像元坐标并进行双线性插值；
3. 使用查找表完成色阶映射；
4. 可选地根据相邻高程计算山体阴影；
5. 返回带透明通道的 Canvas 瓦片，并保留最近 128 张瓦片。

## 支持的数据

- GeoTIFF：单波段高程取第一个波段，支持 EPSG:4326、EPSG:4490 和
  EPSG:3857。
- Esri ASCII Grid：按 WGS84 地理坐标解释。
- `NoData`：GeoTIFF 的 `GDAL_NODATA` 或 ASC 的 `NODATA_value` 会透明显示。
- 为控制纯浏览器示例的内存占用，最多读取 5000 万个像元。

其他投影请先用 GDAL 转换，例如：

```bash
gdalwarp -t_srs EPSG:4326 input.tif output-wgs84.tif
```

本例将 DEM 作为伪彩色影像底图显示，不会改变 globe 的真实几何起伏。
若需要地形遮挡与贴地几何，应在服务端将 DEM 预处理为 Cesium Quantized
Mesh，并使用 `CesiumTerrainProvider` 加载。

