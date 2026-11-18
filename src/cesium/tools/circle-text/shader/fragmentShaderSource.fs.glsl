in vec2 v_uv;
in float v_textureRotation;

uniform sampler2D u_image;

void main() {
  vec2 ellipse = v_uv * 2.0 - 1.0;
  if (dot(ellipse, ellipse) > 1.0) {
    discard;
  }

  vec2 centered = v_uv - 0.5;
  float cosine = cos(v_textureRotation);
  float sine = sin(v_textureRotation);
  // 公开角度为顺时针；纹理坐标 Y 轴朝上，因此这里使用负角度矩阵。
  vec2 rotated = vec2(
    cosine * centered.x + sine * centered.y,
    -sine * centered.x + cosine * centered.y
  ) + 0.5;
  vec4 color = texture(u_image, rotated);
  if (color.a <= 0.001) {
    discard;
  }
  out_FragColor = color;
}
