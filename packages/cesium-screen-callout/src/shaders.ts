// 屏幕空间实例绘制着色器：顶点阶段定位标牌，片元阶段重建 SDF 文字边缘。
export const VERTEX = `
precision highp float;
in vec2 aCorner;
in vec2 aTargetKind;
in vec2 aOffset;
in vec2 aAxisX;
in vec2 aAxisY;
in vec4 aUV;
in vec4 aColor;
uniform sampler2D uTargets;
uniform vec2 uViewport;
uniform vec3 uTextRendering;
out vec2 vUV;
out vec4 vColor;
flat out float vGlyph;
flat out float vLeader;
void main(){
  vec2 q=aCorner;
  int id=int(aTargetKind.x);
  vec4 target=texelFetch(uTargets,ivec2(id,0),0);
  vec4 panel=texelFetch(uTargets,ivec2(id,1),0);
  vec2 pixel;
  if(aTargetKind.y>.5 && aTargetKind.y<1.5){
    vec2 end=panel.xy;
    vec2 c=panel.xy-vec2(0.,panel.w);
    if(dot(c,c)<dot(end,end))end=c;
    c=panel.xy+vec2(panel.z,-panel.w); if(dot(c,c)<dot(end,end))end=c;
    c=panel.xy+vec2(panel.z,0.); if(dot(c,c)<dot(end,end))end=c;
    vec2 n=vec2(-end.y,end.x)/max(length(end),.0001);
    pixel=target.xy+end*q.x+n*(2.*q.y-1.);
  }else{
    vec2 origin=target.xy+panel.xy-vec2(0.,panel.w)+aOffset;
    if(aTargetKind.y>1.5 && uTextRendering.z>.5){
      vec2 ratio=czm_viewport.zw/uViewport;
      vec2 snappedOrigin=floor(origin*ratio+.5)/ratio;
      vec2 snappedX=floor((origin+aAxisX)*ratio+.5)/ratio-snappedOrigin;
      vec2 snappedY=floor((origin+aAxisY)*ratio+.5)/ratio-snappedOrigin;
      pixel=snappedOrigin+snappedX*q.x+snappedY*q.y;
    }else{
      pixel=origin+aAxisX*q.x+aAxisY*q.y;
    }
  }
  // Reconstruct depth with the projection for Cesium's current frustum.
  vec4 clip=czm_projection*vec4(0.,0.,-max(target.w,.001),1.);
  clip.xy=vec2(pixel.x/uViewport.x*2.-1.,1.-pixel.y/uViewport.y*2.)*clip.w;
  gl_Position=target.z>.5 ? clip : vec4(2.*clip.w,2.*clip.w,clip.z,clip.w);
  czm_vertexLogDepth();
  vUV=aUV.xy+aUV.zw*q; vColor=aColor; vGlyph=step(1.5,aTargetKind.y);
  vLeader=aTargetKind.y>.5 && aTargetKind.y<1.5 ? 1. : 0.;
}`;
export const FRAGMENT = `
precision highp float;
uniform sampler2D uAtlas;
uniform vec3 uTextRendering;
in vec2 vUV;
in vec4 vColor;
flat in float vGlyph;
flat in float vLeader;
uniform float uLeaderPass;

void main(){
  if(abs(vLeader-uLeaderPass)>.5)discard;
  vec4 sampleValue=texture(uAtlas,vUV);
  float coverage=sampleValue.a;
  if(vGlyph>.5){
    float gradient=max(fwidth(sampleValue.r),1./255.);
    float edge=max(gradient*uTextRendering.x,.00001);
    // A small subpixel coverage correction preserves thin strokes at small sizes.
    float contour=.5-gradient*uTextRendering.y;
    coverage=smoothstep(contour-edge,contour+edge,sampleValue.r);
  }
  float alpha=vColor.a*coverage;
  if(alpha<.003)discard;
  out_FragColor=vec4(vColor.rgb,alpha);czm_writeLogDepth();
}`;
