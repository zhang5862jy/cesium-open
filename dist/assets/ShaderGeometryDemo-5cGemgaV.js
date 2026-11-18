import{E as e,F as t,G as n,R as r,T as i,a,bt as o,c as s,f as c,m as l,q as u,s as d,t as f,w as p}from"./runtime-core.esm-bundler-DkML_vOj.js";import{l as m,n as h,s as g}from"./index-X3oIGtop.js";import{n as _,r as v,t as y}from"./viewerConfig-D2DHbJkY.js";var b=125e4;function x(){return{position:[],parametric:[],surface:[],barycentric:[],indices:[]}}function S(e,t,n){let r=e.position.length/3,i=[[1,0,0],[0,1,0],[0,0,1]];for(let a=0;a<3;a++)e.position.push(0,0,0),e.parametric.push(...t[a]),e.surface.push(...n[a]),e.barycentric.push(...i[a]),e.indices.push(r+a)}function C(){let e=x(),t=[[[-1,-1,0],[1,-1,0],[1,1,0],[-1,1,0]],[[-1,1,1],[1,1,1],[1,-1,1],[-1,-1,1]],[[-1,-1,0],[-1,1,0],[-1,1,1],[-1,-1,1]],[[1,-1,0],[1,-1,1],[1,1,1],[1,1,0]],[[-1,-1,0],[-1,-1,1],[1,-1,1],[1,-1,0]],[[-1,1,0],[1,1,0],[1,1,1],[-1,1,1]]],n=[[0,0],[1,0],[1,1],[0,1]];for(let r of t)S(e,[r[0],r[1],r[2]],[n[0],n[1],n[2]]),S(e,[r[0],r[2],r[3]],[n[0],n[2],n[3]]);return e}function w(){let e=x(),t=Math.sqrt(3)/2,n=[[0,1,0],[-t,-.5,0],[t,-.5,0]],r=[0,0,1],i=[[.5,1],[0,0],[1,0]];return S(e,[n[0],n[2],n[1]],i),S(e,[n[0],n[1],r],i),S(e,[n[1],n[2],r],i),S(e,[n[2],n[0],r],i),e}function T(e,t,n,r=0){let i=e.position.length/3;for(let i=0;i<=n;i++){let a=i/n;for(let n=0;n<=t;n++){let i=n/t;e.position.push(0,0,0),e.parametric.push(i,a,r),e.surface.push(i,a),e.barycentric.push(1,1,1)}}let a=t+1;for(let r=0;r<n;r++)for(let n=0;n<t;n++){let t=i+r*a+n,o=t+1,s=t+a,c=s+1;e.indices.push(t,o,c,t,c,s)}}function E(e){let t=x();if(e===`phased-array-radar`){T(t,32,18,0);for(let e=1;e<=4;e++)T(t,24,10,e);return t}return e===`torus-knot`?(T(t,192,24),t):(T(t,96,e===`sphere-radar`?48:28),t)}function D(e){return new Cesium.Geometry({attributes:{position:new Cesium.GeometryAttribute({componentDatatype:Cesium.ComponentDatatype.DOUBLE,componentsPerAttribute:3,values:new Float64Array(e.position)}),parametric:new Cesium.GeometryAttribute({componentDatatype:Cesium.ComponentDatatype.FLOAT,componentsPerAttribute:3,values:new Float32Array(e.parametric)}),surface:new Cesium.GeometryAttribute({componentDatatype:Cesium.ComponentDatatype.FLOAT,componentsPerAttribute:2,values:new Float32Array(e.surface)}),barycentric:new Cesium.GeometryAttribute({componentDatatype:Cesium.ComponentDatatype.FLOAT,componentsPerAttribute:3,values:new Float32Array(e.barycentric)})},indices:new Uint16Array(e.indices),primitiveType:Cesium.PrimitiveType.TRIANGLES,boundingSphere:new Cesium.BoundingSphere(Cesium.Cartesian3.ZERO,b)})}function O(e){return D(e===`cube`?C():e===`triangular-pyramid`?w():E(e))}var k=`
in vec3 parametric;
in vec2 surface;
in vec3 barycentric;
in float batchId;

out vec3 v_positionEC;
out vec2 v_surface;
out vec3 v_barycentric;
flat out vec4 v_style;
flat out vec2 v_gridScale;
flat out vec4 v_baseColor;
flat out vec4 v_gridColor;

#define APPLY_INSTANCE_STYLE()   v_style = czm_batchTable_style(batchId);   v_gridScale = czm_batchTable_gridScale(batchId);   v_baseColor = czm_batchTable_baseColor(batchId);   v_gridColor = czm_batchTable_gridColor(batchId);

vec3 rotateAroundZ(vec3 value, float angle) {
  float cosine = cos(angle);
  float sine = sin(angle);
  return vec3(
    cosine * value.x - sine * value.y,
    sine * value.x + cosine * value.y,
    value.z
  );
}

void finishVertex(vec3 localPosition) {
  // All shape formulas are local ENU coordinates. Cesium's model-view matrix
  // applies the geographic anchor and transforms the result into eye space.
  vec4 positionEC = czm_modelView * vec4(localPosition, 1.0);
  v_positionEC = positionEC.xyz;
  v_surface = surface;
  v_barycentric = barycentric;
  gl_Position = czm_projection * positionEC;
}
`,A=`
void main() {
  vec4 dimensions = czm_batchTable_shapeDimensions(batchId);
  vec4 style = czm_batchTable_style(batchId);
  float breathing = 1.0 + sin(style.x * 1.7) * 0.035;
  // Each face is normalized to a unit rectangle on the CPU. Expand it here so
  // the same topology supports any edge length and can breathe over time.
  vec3 position = vec3(
    parametric.x * dimensions.x * 0.5,
    parametric.y * dimensions.x * 0.5,
    parametric.z * dimensions.x
  ) * breathing;
  position = rotateAroundZ(position, style.x * 0.28);
  finishVertex(position);
  APPLY_INSTANCE_STYLE()
}
`,j=`
void main() {
  vec4 dimensions = czm_batchTable_shapeDimensions(batchId);
  vec4 style = czm_batchTable_style(batchId);
  float breathing = 1.0 + sin(style.x * 1.5) * 0.03;
  // The CPU provides a triangular base and apex in parametric coordinates;
  // dimensions turn that unit tetrahedron into the requested physical shape.
  vec3 position = vec3(
    parametric.xy * dimensions.x,
    parametric.z * dimensions.y
  ) * breathing;
  position = rotateAroundZ(position, style.x * 0.32);
  finishVertex(position);
  APPLY_INSTANCE_STYLE()
}
`,M=`
void main() {
  vec4 dimensions = czm_batchTable_shapeDimensions(batchId);
  // U wraps longitude around the horizon; V sweeps elevation from 0 to 90°.
  float azimuth = surface.x * czm_twoPi - czm_pi;
  float elevation = surface.y * czm_piOverTwo;
  float horizontalRadius = cos(elevation) * dimensions.z;
  vec3 position = vec3(
    sin(azimuth) * horizontalRadius,
    cos(azimuth) * horizontalRadius,
    sin(elevation) * dimensions.z
  );
  finishVertex(position);
  APPLY_INSTANCE_STYLE()
}
`,N=`
void main() {
  vec4 dimensions = czm_batchTable_shapeDimensions(batchId);
  // Latitude is centered at zero, so the same rectangular parameter grid
  // closes at both poles (the seam is handled by duplicated U endpoints).
  float azimuth = surface.x * czm_twoPi - czm_pi;
  float latitude = (surface.y - 0.5) * czm_pi;
  float horizontalRadius = cos(latitude) * dimensions.z;
  vec3 position = vec3(
    sin(azimuth) * horizontalRadius,
    cos(azimuth) * horizontalRadius,
    sin(latitude) * dimensions.z + dimensions.z
  );
  finishVertex(position);
  APPLY_INSTANCE_STYLE()
}
`,P=`
// Four side grids plus one cap grid form a directional radar coverage volume.
// Side faces reuse U as distance and V as the varying angular coordinate.
vec3 radarDirection(float azimuth, float elevation) {
  float horizontal = cos(elevation);
  return vec3(
    sin(azimuth) * horizontal,
    cos(azimuth) * horizontal,
    sin(elevation)
  );
}

void main() {
  vec4 dimensions = czm_batchTable_shapeDimensions(batchId);
  vec4 shapeParameters = czm_batchTable_shapeParameters(batchId);
  vec2 orientation = czm_batchTable_orientation(batchId);
  float face = parametric.z;
  float u = parametric.x;
  float v = parametric.y;
  float halfAzimuth = shapeParameters.z * 0.5;
  float halfElevation = shapeParameters.w * 0.5;
  float azimuth = (u - 0.5) * shapeParameters.z;
  float elevation = (v - 0.5) * shapeParameters.w;
  float distanceFromRadar = dimensions.z;

  // face=0 is the end cap; faces 1..4 are the fixed azimuth/elevation walls.
  if (face > 0.5 && face < 1.5) {
    azimuth = -halfAzimuth;
    distanceFromRadar = u * dimensions.z;
  } else if (face > 1.5 && face < 2.5) {
    azimuth = halfAzimuth;
    distanceFromRadar = u * dimensions.z;
  } else if (face > 2.5 && face < 3.5) {
    azimuth = (v - 0.5) * shapeParameters.z;
    elevation = -halfElevation;
    distanceFromRadar = u * dimensions.z;
  } else if (face > 3.5) {
    azimuth = (v - 0.5) * shapeParameters.z;
    elevation = halfElevation;
    distanceFromRadar = u * dimensions.z;
  }

  vec3 position = radarDirection(
    azimuth + orientation.x,
    elevation + orientation.y
  ) * distanceFromRadar;
  finishVertex(position);
  APPLY_INSTANCE_STYLE()
}
`,F=`
// Evaluate the p/q centerline first, then build a local Frenet-like frame for
// the tube. The finite-difference tangent keeps the formula compact and stable.
vec3 knotCenter(float angle, vec4 dimensions, vec4 shapeParameters) {
  float radialWave = dimensions.x * (1.0 + 0.32 * cos(shapeParameters.y * angle));
  return vec3(
    radialWave * cos(shapeParameters.x * angle),
    radialWave * sin(shapeParameters.x * angle),
    dimensions.x * 0.32 * sin(shapeParameters.y * angle)
  );
}

void main() {
  vec4 dimensions = czm_batchTable_shapeDimensions(batchId);
  vec4 shapeParameters = czm_batchTable_shapeParameters(batchId);
  vec4 style = czm_batchTable_style(batchId);
  float angle = surface.x * czm_twoPi;
  float tubeAngle = surface.y * czm_twoPi;
  float epsilon = 0.002;
  vec3 center = knotCenter(angle, dimensions, shapeParameters);
  vec3 tangent = normalize(
    knotCenter(angle + epsilon, dimensions, shapeParameters) -
    knotCenter(angle - epsilon, dimensions, shapeParameters)
  );
  // Avoid a nearly parallel reference vector before taking the cross product.
  vec3 reference = abs(tangent.z) < 0.9
    ? vec3(0.0, 0.0, 1.0)
    : vec3(1.0, 0.0, 0.0);
  vec3 normal = normalize(cross(tangent, reference));
  vec3 bitangent = normalize(cross(tangent, normal));
  vec3 tubeDirection = cos(tubeAngle) * normal + sin(tubeAngle) * bitangent;
  vec3 position = center + tubeDirection * dimensions.w;
  position.z += dimensions.x * 1.5 + dimensions.w;
  position = rotateAroundZ(position, style.x * 0.18);
  finishVertex(position);
  APPLY_INSTANCE_STYLE()
}
`;function I(e){return`${k}\n${{cube:A,"triangular-pyramid":j,"hemisphere-radar":M,"sphere-radar":N,"phased-array-radar":P,"torus-knot":F}[e]}`}var L=`
in vec3 v_positionEC;
in vec2 v_surface;
in vec3 v_barycentric;
flat in vec4 v_style;
flat in vec2 v_gridScale;
flat in vec4 v_baseColor;
flat in vec4 v_gridColor;

float parametricGrid(vec2 coordinates) {
  vec2 scaled = coordinates * v_gridScale;
  vec2 derivative = max(fwidth(scaled), vec2(0.0001));
  vec2 distanceToLine = abs(fract(scaled - 0.5) - 0.5) / derivative;
  return 1.0 - min(min(distanceToLine.x, distanceToLine.y), 1.0);
}

float triangleEdges(vec3 coordinates) {
  vec3 derivative = max(fwidth(coordinates), vec3(0.0001));
  vec3 smoothed = smoothstep(vec3(0.0), derivative * 1.4, coordinates);
  return 1.0 - min(min(smoothed.x, smoothed.y), smoothed.z);
}

void main() {
  // Derive a screen-space normal from the displaced eye-space position. This
  // works for every parametric surface without sending normals from the CPU.
  vec3 normalEC = normalize(cross(dFdx(v_positionEC), dFdy(v_positionEC)));
  if (!gl_FrontFacing) normalEC = -normalEC;
  float light = 0.45 + 0.55 * abs(dot(normalEC, normalize(czm_lightDirectionEC)));
  // Cubes/pyramids use barycentric edge distance; smooth surfaces use UV lines.
  float grid = v_style.w < 0.5
    ? triangleEdges(v_barycentric)
    : parametricGrid(v_surface);
  grid *= v_style.z;

  // Radar scan phase advances with time and wraps without discontinuities.
  float scanPhase = fract(v_style.x * 0.09);
  float scanDistance = abs(fract(v_surface.x - scanPhase + 0.5) - 0.5);
  float scan = (1.0 - smoothstep(0.012, 0.055, scanDistance)) * v_style.y;

  vec3 surfaceColor = v_baseColor.rgb * light;
  vec3 color = mix(surfaceColor, v_gridColor.rgb, grid * 0.92);
  color += v_gridColor.rgb * scan * 0.85;
  float alpha = v_baseColor.a + grid * 0.28 + scan * 0.2;
  out_FragColor = vec4(color, clamp(alpha, 0.0, 0.96));
}
`,R=`parametric-geometry-instance`,z=Cesium.Color.fromCssColorString(`#25aee8`),B=Cesium.Color.fromCssColorString(`#b8f4ff`);function V(e){return e.includes(`radar`)}function H(e){let t={baseColor:new Uint8Array(4),gridColor:new Uint8Array(4),style:new Float32Array([0,+!!V(e.kind),e.gridEnabled===!1?0:1,e.kind===`cube`||e.kind===`triangular-pyramid`?0:1]),gridScale:new Float32Array(e.kind===`torus-knot`?[24,8]:[16,8]),shapeDimensions:new Float32Array([1,1,1,1]),shapeParameters:new Float32Array([2,3,Cesium.Math.toRadians(50),Cesium.Math.toRadians(30)]),orientation:new Float32Array([0,Cesium.Math.toRadians(18)])};return U(t,e),t}function U(e,t){let n=Cesium.Color.clone(t.color??z);switch(n.alpha=Cesium.Math.clamp(t.opacity??.28,0,1),Cesium.ColorGeometryInstanceAttribute.toValue(n,e.baseColor),Cesium.ColorGeometryInstanceAttribute.toValue(t.gridColor??B,e.gridColor),e.style[1]=+!!V(t.kind),e.style[2]=t.gridEnabled===!1?0:1,t.kind){case`cube`:e.shapeDimensions[0]=t.size;break;case`triangular-pyramid`:e.shapeDimensions[0]=t.baseRadius,e.shapeDimensions[1]=t.height;break;case`hemisphere-radar`:case`sphere-radar`:e.shapeDimensions[2]=t.radius;break;case`phased-array-radar`:e.shapeDimensions[2]=t.range,e.shapeParameters[2]=Cesium.Math.toRadians(t.azimuthSpan),e.shapeParameters[3]=Cesium.Math.toRadians(t.elevationSpan),e.orientation[0]=Cesium.Math.toRadians(t.heading),e.orientation[1]=Cesium.Math.toRadians(t.pitch);break;case`torus-knot`:e.shapeDimensions[0]=t.majorRadius,e.shapeDimensions[3]=t.tubeRadius,e.shapeParameters[0]=t.p,e.shapeParameters[1]=t.q;break}}function W(e,t){return new Cesium.GeometryInstanceAttribute({componentDatatype:Cesium.ComponentDatatype.FLOAT,componentsPerAttribute:e,value:Array.from(t)})}function G(e){return new Cesium.GeometryInstanceAttribute({componentDatatype:Cesium.ComponentDatatype.UNSIGNED_BYTE,componentsPerAttribute:4,normalize:!0,value:Array.from(e)})}function K(e){return{baseColor:G(e.baseColor),gridColor:G(e.gridColor),style:W(4,e.style),gridScale:W(2,e.gridScale),shapeDimensions:W(4,e.shapeDimensions),shapeParameters:W(4,e.shapeParameters),orientation:W(2,e.orientation)}}var q=class{primitive;scene;kind;material;attributes;destroyed=!1;pendingFullAttributeUpdate=!1;constructor(e,t){this.scene=e,this.kind=t.kind,this.attributes=H(t),this.material=Cesium.Material.fromType(Cesium.Material.ColorType);let n=new Cesium.Appearance({material:this.material,vertexShaderSource:I(t.kind),fragmentShaderSource:L,translucent:!0,closed:!1,renderState:{depthTest:{enabled:!0},depthMask:!1,cull:{enabled:!1},blending:Cesium.BlendingState.ALPHA_BLEND}});this.primitive=e.primitives.add(new Cesium.Primitive({geometryInstances:new Cesium.GeometryInstance({id:R,geometry:O(t.kind),attributes:K(this.attributes)}),appearance:n,modelMatrix:Cesium.Transforms.eastNorthUpToFixedFrame(t.position),asynchronous:!1,allowPicking:!1}))}update(e){if(!this.destroyed){if(e.kind!==this.kind)throw Error(`Cannot change a parametric primitive's geometry kind.`);Cesium.Transforms.eastNorthUpToFixedFrame(e.position,Cesium.Ellipsoid.default,this.primitive.modelMatrix),U(this.attributes,e),this.pendingFullAttributeUpdate=!0,this.applyRuntimeAttributes()}}setTime(e){if(this.destroyed||(this.attributes.style[0]=e,!this.primitive.ready))return;if(this.pendingFullAttributeUpdate){this.applyRuntimeAttributes();return}let t=this.primitive.getGeometryInstanceAttributes(R);t.style=this.attributes.style}isDestroyed(){return this.destroyed}destroy(){this.destroyed||(this.destroyed=!0,this.primitive.isDestroyed()||this.scene.primitives.remove(this.primitive),this.material.isDestroyed()||this.material.destroy())}applyRuntimeAttributes(){if(!this.primitive.ready)return;let e=this.primitive.getGeometryInstanceAttributes(R);e.baseColor=this.attributes.baseColor,e.gridColor=this.attributes.gridColor,e.style=this.attributes.style,e.gridScale=this.attributes.gridScale,e.shapeDimensions=this.attributes.shapeDimensions,e.shapeParameters=this.attributes.shapeParameters,e.orientation=this.attributes.orientation,this.pendingFullAttributeUpdate=!1}},J={key:0,class:`webgl-error`},Y={class:`control-panel`},X={class:`panel-heading`},Z={class:`toolbar`},Q={class:`toggle`},$={class:`controls`},ee={key:0},te={key:2},ne=h(l({__name:`ShaderGeometryDemo`,props:{kind:{},title:{},description:{}},setup(l){let h=l,b=u(),x=u(!1),S=u(``),C=n({animationSpeed:1,opacity:.28,gridEnabled:!0,size:18e4,baseRadius:17e4,height:26e4,radius:32e4,range:43e4,azimuthSpan:58,elevationSpan:34,heading:24,pitch:20,majorRadius:125e3,tubeRadius:32e3,p:2,q:3}),w=Cesium.Cartesian3.fromDegrees(110,30,4e3),T=Cesium.Color.fromCssColorString(`#23aee8`),E=Cesium.Color.fromCssColorString(`#d2f8ff`),D,O,k,A=!1,j=0,M=0;function N(e){return`${Math.round(e/1e3)} km`}function P(){return{position:w,color:T,gridColor:E,opacity:C.opacity,gridEnabled:C.gridEnabled,animationSpeed:C.animationSpeed}}function F(){let e=P();switch(h.kind){case`cube`:return{...e,kind:h.kind,size:C.size};case`triangular-pyramid`:return{...e,kind:h.kind,baseRadius:C.baseRadius,height:C.height};case`hemisphere-radar`:case`sphere-radar`:return{...e,kind:h.kind,radius:C.radius};case`phased-array-radar`:return{...e,kind:h.kind,range:C.range,azimuthSpan:C.azimuthSpan,elevationSpan:C.elevationSpan,heading:C.heading,pitch:C.pitch};case`torus-knot`:return{...e,kind:h.kind,majorRadius:C.majorRadius,tubeRadius:C.tubeRadius,p:C.p,q:C.q}}}return t(C,()=>O?.update(F()),{deep:!0}),p(async()=>{let e=await v();if(A||!b.value)return;if(D=new Cesium.Viewer(b.value,{animation:!1,timeline:!1,baseLayer:e.west,baseLayerPicker:!1,geocoder:!1,navigationHelpButton:!1,sceneModePicker:!1,fullscreenButton:!1,infoBox:!1,selectionIndicator:!1,homeButton:!1,skyBox:!1,scene3DOnly:!0,contextOptions:{requestWebgl1:!1}}),y(D),_(D,e),D.scene.backgroundColor=Cesium.Color.fromCssColorString(`#071526`),D.scene.globe.baseColor=Cesium.Color.fromCssColorString(`#16374c`),D.scene.globe.showWaterEffect=!1,D.scene.globe.enableLighting=!1,D.scene.screenSpaceCameraController.minimumZoomDistance=2e4,!D.scene.context.webgl2){S.value=`当前浏览器或显卡没有提供 WebGL 2.0 渲染上下文。`;return}O=new q(D.scene,F()),M=performance.now(),k=D.clock.onTick.addEventListener(()=>{let e=performance.now(),t=Math.min((e-M)/1e3,.1);M=e,x.value||(j+=t*C.animationSpeed),O?.setTime(j)});let t=h.kind===`sphere-radar`?C.radius:12e4,n=Cesium.Cartesian3.fromDegrees(110,30,t),r=h.kind===`phased-array-radar`?115e4:95e4;D.camera.lookAt(n,new Cesium.HeadingPitchRange(Cesium.Math.toRadians(25),Cesium.Math.toRadians(-24),r)),D.camera.lookAtTransform(Cesium.Matrix4.IDENTITY)}),i(()=>{A=!0,k?.(),k=void 0,O?.destroy(),O=void 0,D&&!D.isDestroyed()&&D.destroy(),D=void 0}),(t,n)=>(e(),s(f,null,[a(`div`,{ref_key:`container`,ref:b,class:`cesium-container`},null,512),S.value?(e(),s(`div`,J,[n[17]||=a(`strong`,null,`需要 WebGL 2.0`,-1),a(`span`,null,o(S.value),1)])):d(``,!0),a(`aside`,Y,[a(`div`,X,[n[18]||=a(`span`,{class:`eyebrow`},`VERTEX SHADER LAB`,-1),a(`h2`,null,o(l.title),1),a(`p`,null,o(l.description),1)]),a(`div`,Z,[a(`button`,{type:`button`,onClick:n[0]||=e=>x.value=!x.value},o(x.value?`继续动画`:`暂停动画`),1),a(`label`,Q,[r(a(`input`,{"onUpdate:modelValue":n[1]||=e=>C.gridEnabled=e,type:`checkbox`},null,512),[[g,C.gridEnabled]]),n[19]||=a(`span`,null,`参数网格`,-1)])]),a(`div`,$,[a(`label`,null,[a(`span`,null,[n[20]||=c(`动画速度 `,-1),a(`output`,null,o(C.animationSpeed.toFixed(1))+`×`,1)]),r(a(`input`,{"onUpdate:modelValue":n[2]||=e=>C.animationSpeed=e,type:`range`,min:`0`,max:`3`,step:`0.1`},null,512),[[m,C.animationSpeed,void 0,{number:!0}]])]),a(`label`,null,[a(`span`,null,[n[21]||=c(`表面透明度 `,-1),a(`output`,null,o(C.opacity.toFixed(2)),1)]),r(a(`input`,{"onUpdate:modelValue":n[3]||=e=>C.opacity=e,type:`range`,min:`0.08`,max:`0.72`,step:`0.01`},null,512),[[m,C.opacity,void 0,{number:!0}]])]),l.kind===`cube`?(e(),s(`label`,ee,[a(`span`,null,[n[22]||=c(`边长 `,-1),a(`output`,null,o(N(C.size)),1)]),r(a(`input`,{"onUpdate:modelValue":n[4]||=e=>C.size=e,type:`range`,min:`50000`,max:`320000`,step:`5000`},null,512),[[m,C.size,void 0,{number:!0}]])])):d(``,!0),l.kind===`triangular-pyramid`?(e(),s(f,{key:1},[a(`label`,null,[a(`span`,null,[n[23]||=c(`底面半径 `,-1),a(`output`,null,o(N(C.baseRadius)),1)]),r(a(`input`,{"onUpdate:modelValue":n[5]||=e=>C.baseRadius=e,type:`range`,min:`50000`,max:`280000`,step:`5000`},null,512),[[m,C.baseRadius,void 0,{number:!0}]])]),a(`label`,null,[a(`span`,null,[n[24]||=c(`高度 `,-1),a(`output`,null,o(N(C.height)),1)]),r(a(`input`,{"onUpdate:modelValue":n[6]||=e=>C.height=e,type:`range`,min:`50000`,max:`360000`,step:`5000`},null,512),[[m,C.height,void 0,{number:!0}]])])],64)):d(``,!0),l.kind===`hemisphere-radar`||l.kind===`sphere-radar`?(e(),s(`label`,te,[a(`span`,null,[n[25]||=c(`探测半径 `,-1),a(`output`,null,o(N(C.radius)),1)]),r(a(`input`,{"onUpdate:modelValue":n[7]||=e=>C.radius=e,type:`range`,min:`100000`,max:`600000`,step:`10000`},null,512),[[m,C.radius,void 0,{number:!0}]])])):d(``,!0),l.kind===`phased-array-radar`?(e(),s(f,{key:3},[a(`label`,null,[a(`span`,null,[n[26]||=c(`探测距离 `,-1),a(`output`,null,o(N(C.range)),1)]),r(a(`input`,{"onUpdate:modelValue":n[8]||=e=>C.range=e,type:`range`,min:`100000`,max:`700000`,step:`10000`},null,512),[[m,C.range,void 0,{number:!0}]])]),a(`label`,null,[a(`span`,null,[n[27]||=c(`方位宽度 `,-1),a(`output`,null,o(C.azimuthSpan)+`°`,1)]),r(a(`input`,{"onUpdate:modelValue":n[9]||=e=>C.azimuthSpan=e,type:`range`,min:`10`,max:`120`,step:`1`},null,512),[[m,C.azimuthSpan,void 0,{number:!0}]])]),a(`label`,null,[a(`span`,null,[n[28]||=c(`俯仰宽度 `,-1),a(`output`,null,o(C.elevationSpan)+`°`,1)]),r(a(`input`,{"onUpdate:modelValue":n[10]||=e=>C.elevationSpan=e,type:`range`,min:`5`,max:`90`,step:`1`},null,512),[[m,C.elevationSpan,void 0,{number:!0}]])]),a(`label`,null,[a(`span`,null,[n[29]||=c(`航向 `,-1),a(`output`,null,o(C.heading)+`°`,1)]),r(a(`input`,{"onUpdate:modelValue":n[11]||=e=>C.heading=e,type:`range`,min:`0`,max:`360`,step:`1`},null,512),[[m,C.heading,void 0,{number:!0}]])]),a(`label`,null,[a(`span`,null,[n[30]||=c(`中心俯仰 `,-1),a(`output`,null,o(C.pitch)+`°`,1)]),r(a(`input`,{"onUpdate:modelValue":n[12]||=e=>C.pitch=e,type:`range`,min:`-20`,max:`70`,step:`1`},null,512),[[m,C.pitch,void 0,{number:!0}]])])],64)):d(``,!0),l.kind===`torus-knot`?(e(),s(f,{key:4},[a(`label`,null,[a(`span`,null,[n[31]||=c(`主半径 `,-1),a(`output`,null,o(N(C.majorRadius)),1)]),r(a(`input`,{"onUpdate:modelValue":n[13]||=e=>C.majorRadius=e,type:`range`,min:`60000`,max:`230000`,step:`5000`},null,512),[[m,C.majorRadius,void 0,{number:!0}]])]),a(`label`,null,[a(`span`,null,[n[32]||=c(`管半径 `,-1),a(`output`,null,o(N(C.tubeRadius)),1)]),r(a(`input`,{"onUpdate:modelValue":n[14]||=e=>C.tubeRadius=e,type:`range`,min:`10000`,max:`70000`,step:`2500`},null,512),[[m,C.tubeRadius,void 0,{number:!0}]])]),a(`label`,null,[a(`span`,null,[n[33]||=c(`缠绕参数 p `,-1),a(`output`,null,o(C.p),1)]),r(a(`input`,{"onUpdate:modelValue":n[15]||=e=>C.p=e,type:`range`,min:`2`,max:`7`,step:`1`},null,512),[[m,C.p,void 0,{number:!0}]])]),a(`label`,null,[a(`span`,null,[n[34]||=c(`缠绕参数 q `,-1),a(`output`,null,o(C.q),1)]),r(a(`input`,{"onUpdate:modelValue":n[16]||=e=>C.q=e,type:`range`,min:`2`,max:`7`,step:`1`},null,512),[[m,C.q,void 0,{number:!0}]])])],64)):d(``,!0)]),n[35]||=a(`div`,{class:`tech-note`},[c(` CPU：参数与索引`),a(`br`),c(`GPU：坐标、法线、网格与扫描 `)],-1)])],64))}}),[[`__scopeId`,`data-v-960056b6`]]);export{ne as t};