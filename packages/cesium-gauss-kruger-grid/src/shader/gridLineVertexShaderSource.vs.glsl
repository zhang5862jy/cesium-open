// 顶点阶段：把一个 ECEF 采样线段展开成恒定像素宽度的屏幕四边形。
// 顺序是 high/low 相机相对变换 → 齐次近面裁切 → NDC → 像素法线扩宽 → 回写 clip。
// Cesium 的 czm_* 由 ShaderSource 自动注入，不是本包自行声明的 uniform/function。

// 六顶点共享模板：x=0/1 选择线段起终点，y=-1/+1 选择四边形两侧。
in vec2 corner;
// 每个实例独有的 ECEF 米制起终点，拆成高/低位以保留大坐标下的局部精度。
in vec3 instanceStartHigh;
in vec3 instanceStartLow;
in vec3 instanceEndHigh;
in vec3 instanceEndLow;
// CPU 存入的是 CSS 像素半宽；实际 drawing buffer 的像素倍率稍后换算。
in float instanceHalfWidth;

// 同时传递“距离 × w”和 w，片元阶段用它们的商抵消默认透视插值。
out vec2 v_lineDistanceAndW;
out float v_halfWidth;

void main() {
  // 先以 high/low 分别减去相机的编码位置，再使用相对相机的 MVP。
  // 不先把 high+low 合成数百万米的 Float32，避免局部米级细节在相减前就丢失。
  vec4 startClip = czm_modelViewProjectionRelativeToEye *
    czm_translateRelativeToEye(instanceStartHigh, instanceStartLow);
  vec4 endClip = czm_modelViewProjectionRelativeToEye *
    czm_translateRelativeToEye(instanceEndHigh, instanceEndLow);
  // WebGL 齐次裁剪体的近面为 z=-w；z+w 的符号表示端点是否位于近面内侧。
  // 必须在 xy/w 之前裁切，否则跨越相机/近面的线段会投成超长或翻转的四边形。
  float startDistance = startClip.z + startClip.w;
  float endDistance = endClip.z + endClip.w;
  if (startDistance < 0.0 && endDistance < 0.0) {
    // 两端均在近面外：让本实例的六个模板顶点都落在裁剪体外，不产生可见片元。
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    v_lineDistanceAndW = vec2(0.0, 1.0);
    v_halfWidth = 0.0;
    return;
  }
  // 一端在外：利用有符号距离求线性参数 t=d0/(d0-d1)，把该端移到近面交点。
  if (startDistance < 0.0) {
    startClip = mix(startClip, endClip, startDistance / (startDistance - endDistance));
  } else if (endDistance < 0.0) {
    endClip = mix(endClip, startClip, endDistance / (endDistance - startDistance));
  }
  // 透视除法得到 NDC（可见屏幕横纵范围 -1..1）；按视口尺寸恢复正确像素比例。
  // 求方向后还会归一化，所以从 NDC 到像素的公共 1/2 因子可以省略。
  vec2 startNdc = startClip.xy / startClip.w;
  vec2 endNdc = endClip.xy / endClip.w;
  vec2 screenDirection = (endNdc - startNdc) * czm_viewport.zw;
  // 近乎零长度时用小下限防止除零；法线把屏幕方向 (dx,dy) 旋转 90 度。
  float screenLength = max(length(screenDirection), 0.0001);
  vec2 screenNormal = vec2(-screenDirection.y, screenDirection.x) /
    screenLength;

  vec4 clipPosition = mix(startClip, endClip, corner.x);
  // 半宽由 CSS 像素转为 drawing-buffer 像素，再额外留一个 CSS 像素的抗锯齿带。
  // 额外三角形区域是否可见由片元 shader 的 coverage 决定，不等于实线变粗。
  float halfWidth = instanceHalfWidth * czm_pixelRatio;
  float expandedHalfWidth = halfWidth + czm_pixelRatio;
  vec2 ndcOffset = screenNormal * corner.y * expandedHalfWidth * 2.0 /
    czm_viewport.zw;
  // 一个像素对应 2/viewport 的 NDC 距离；NDC 偏移乘该端点 w 才能回到齐次 clip。
  // 这样最终 xy/w 后保留恒定像素偏移，不随端点深度改变线宽。
  clipPosition.xy += ndcOffset * clipPosition.w;

  gl_Position = clipPosition;
  // 默认 smooth varying 会按 1/w 做透视校正；线的横向距离却应当在屏幕上线性变化。
  // 分别插值 d*w 与 1*w 后再相除，可消去共同的透视分母，恢复屏幕线性距离 d。
  // 若直接传 d，起终点深度不同时抗锯齿带会扭曲，视觉上表现为宽度不均。
  v_lineDistanceAndW = vec2(corner.y * expandedHalfWidth, 1.0) * clipPosition.w;
  // 同一实例六个顶点的半宽相同，无需做上述抵消；单位是 drawing-buffer 像素。
  v_halfWidth = halfWidth;
}
