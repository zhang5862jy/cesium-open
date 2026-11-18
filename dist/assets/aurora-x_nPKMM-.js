import{E as e,T as t,_t as n,a as r,bt as i,c as a,m as o,q as s,t as c,w as l}from"./runtime-core.esm-bundler-DkML_vOj.js";import{n as u}from"./index-X3oIGtop.js";import{n as d,r as f,t as p}from"./viewerConfig-D2DHbJkY.js";var m=1e5,h=3e5,g=60,_=1,v=5,y=144,b=`
in vec3 position3DHigh;
in vec3 position3DLow;
in vec3 normal;
in vec2 st;
in float batchId;

out vec3 v_positionEC;
out vec2 v_st;
out vec3 v_surfaceNormalWC;
flat out vec4 v_auroraState;

void main() {
  vec4 position = czm_computePosition();
  vec3 positionWC = position3DHigh + position3DLow;

  v_positionEC = (czm_modelViewRelativeToEye * position).xyz;
  v_st = st;
  v_surfaceNormalWC = normalize(positionWC);
  v_auroraState = czm_batchTable_auroraState(batchId);

  gl_Position = czm_modelViewProjectionRelativeToEye * position;
}
`,x=`
in vec3 v_positionEC;
in vec2 v_st;
in vec3 v_surfaceNormalWC;
flat in vec4 v_auroraState;

float hash(vec2 point) {
  return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 point) {
  vec2 cell = floor(point);
  vec2 local = fract(point);
  local = local * local * (3.0 - 2.0 * local);
  return mix(
    mix(hash(cell), hash(cell + vec2(1.0, 0.0)), local.x),
    mix(hash(cell + vec2(0.0, 1.0)), hash(cell + vec2(1.0, 1.0)), local.x),
    local.y
  );
}

float fbm(vec2 point) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int index = 0; index < 4; index++) {
    value += noise(point) * amplitude;
    point = point * 2.03 + vec2(13.7, 7.9);
    amplitude *= 0.5;
  }
  return value;
}

void main() {
  // Noise creates broad curtains and fine rays; the activity state then fades
  // the result through the deterministic growing/active/quiet cycle.
  float time = v_auroraState.x;
  float activity = v_auroraState.y;
  float brightness = v_auroraState.z;
  float bandPhase = v_auroraState.w;
  float u = v_st.x;
  float v = v_st.y;

  float distortion = fbm(vec2(u * 4.0 + bandPhase, time * 0.055));
  float broadCurtain = 0.5 + 0.5 * sin(
    u * 42.0 + distortion * 8.0 - time * 0.85 + bandPhase * 11.0
  );
  broadCurtain = smoothstep(0.18, 0.94, broadCurtain);

  float rayNoise = noise(vec2(floor(u * 110.0), time * 0.75 + bandPhase * 19.0));
  float fineRays = pow(
    0.5 + 0.5 * sin(u * 690.0 + distortion * 13.0 + bandPhase * 31.0),
    6.0
  );
  float rays = mix(0.3, 1.0, max(fineRays, rayNoise * 0.72));

  float bottomFade = smoothstep(0.0, 0.13, v);
  float topFade = 1.0 - smoothstep(0.78, 1.0, v);
  float verticalShape = bottomFade * topFade;
  verticalShape *= 0.72 + 0.28 * sin(v * 18.0 - time * 1.2 + distortion * 5.0);

  float sunFacing = dot(normalize(v_surfaceNormalWC), czm_sunDirectionWC);
  float nightMask = 1.0 - smoothstep(-0.10, 0.05, sunFacing);

  vec3 violet = vec3(0.43, 0.12, 0.86);
  vec3 green = vec3(0.04, 1.0, 0.48);
  vec3 red = vec3(1.0, 0.16, 0.14);
  vec3 color = mix(violet, green, smoothstep(0.04, 0.28, v));
  color = mix(color, red, smoothstep(0.66, 0.96, v) * 0.64);

  float flicker = 0.82 + 0.18 * sin(time * 3.1 + bandPhase * 23.0);
  float intensity = broadCurtain * rays * verticalShape * nightMask;
  intensity *= activity * brightness * flicker;
  float alpha = clamp(intensity * 0.52, 0.0, 0.68);

  out_FragColor = vec4(color, alpha);
}
`;function S(e,t,n){let r=Cesium.Math.clamp((n-e)/(t-e),0,1);return r*r*(3-2*r)}function C(e,t){return new Cesium.GeometryInstanceAttribute({componentDatatype:Cesium.ComponentDatatype.FLOAT,componentsPerAttribute:e,value:Array.from(t)})}function w(e){let t=Cesium.Math.toRadians(e===`north`?-72:108),n=Cesium.Math.toRadians(e===`north`?80:-80),r=Math.cos(n);return new Cesium.Cartesian3(r*Math.cos(t),r*Math.sin(t),Math.sin(n))}function T(e,t,n,r){let i=w(e),a=Cesium.Cartesian3.normalize(Cesium.Cartesian3.cross(Cesium.Cartesian3.UNIT_Z,i,new Cesium.Cartesian3),new Cesium.Cartesian3),o=Cesium.Cartesian3.normalize(Cesium.Cartesian3.cross(i,a,new Cesium.Cartesian3),new Cesium.Cartesian3),s=[],c=[],l=[],u=t-(v-1)*.5;for(let e=0;e<=y;e+=1){let d=e/y*Cesium.Math.TWO_PI,f=18+u*1.05+Math.sin(d*2+t*.7)*1.6+Math.sin(d*5-t*.45)*.55,p=Cesium.Math.toRadians(f),m=Cesium.Cartesian3.add(Cesium.Cartesian3.multiplyByScalar(a,Math.cos(d),new Cesium.Cartesian3),Cesium.Cartesian3.multiplyByScalar(o,Math.sin(d),new Cesium.Cartesian3),new Cesium.Cartesian3),h=Cesium.Cartesian3.normalize(Cesium.Cartesian3.add(Cesium.Cartesian3.multiplyByScalar(i,Math.cos(p),new Cesium.Cartesian3),Cesium.Cartesian3.multiplyByScalar(m,Math.sin(p),new Cesium.Cartesian3),new Cesium.Cartesian3),new Cesium.Cartesian3),g=Math.atan2(h.y,h.x),_=Math.asin(h.z),v=Math.sin(d*7+t*1.4),b=Math.sin(d*3-t*.8);s.push(Cesium.Cartesian3.fromRadians(g,_)),c.push(n+v*9e3+t*2500),l.push(r-t*7e3+b*24e3+v*12e3)}return new Cesium.WallGeometry({positions:s,minimumHeights:c,maximumHeights:l,vertexFormat:Cesium.MaterialAppearance.MaterialSupport.TEXTURED.vertexFormat})}function E(e){return e===`both`?[`north`,`south`]:[e]}var D=class{primitive;scene;material;states;cycleDuration;brightness;destroyed=!1;constructor(e,t={}){this.scene=e;let n=t.minimumHeight??m,r=t.maximumHeight??h;if(n<0||r<=n)throw Error(`Aurora heights must satisfy 0 <= minimumHeight < maximumHeight.`);this.cycleDuration=Math.max(t.cycleDuration??g,10),this.brightness=Math.max(t.brightness??_,0);let i=E(t.hemispheres??`both`);this.states=[];let a=[];for(let e of i)for(let t=0;t<v;t+=1){let i=`aurora-${e}-${t}`,o=(t+(e===`south`?v:0))/(v*2),s=new Float32Array([0,1,this.brightness,o]);this.states.push({id:i,value:s}),a.push(new Cesium.GeometryInstance({id:i,geometry:T(e,t,n,r),attributes:{auroraState:C(4,s)}}))}this.material=Cesium.Material.fromType(Cesium.Material.ColorType);let o=new Cesium.Appearance({material:this.material,vertexShaderSource:b,fragmentShaderSource:x,translucent:!0,closed:!1,renderState:{depthTest:{enabled:!0},depthMask:!1,cull:{enabled:!1},blending:Cesium.BlendingState.ADDITIVE_BLEND}});this.primitive=e.primitives.add(new Cesium.Primitive({geometryInstances:a,appearance:o,asynchronous:!1,allowPicking:!1,compressVertices:!1,releaseGeometryInstances:!0}))}setTime(e){if(this.destroyed)return{phase:`quiet`,intensity:0};let t=this.getActivityState(e);if(this.primitive.ready)for(let n of this.states){n.value[0]=e,n.value[1]=t.intensity,n.value[2]=this.brightness;let r=this.primitive.getGeometryInstanceAttributes(n.id);r.auroraState=n.value}return t}getActivityState(e){let t=(e%this.cycleDuration+this.cycleDuration)%this.cycleDuration/this.cycleDuration;return t<1/3?{phase:`active`,intensity:.88+Math.sin(t*Math.PI*9)*.08}:t<.5?{phase:`fading`,intensity:1-S(0,1,(t-1/3)*6)}:t<2/3?{phase:`quiet`,intensity:0}:t<5/6?{phase:`growing`,intensity:S(0,1,(t-2/3)*6)}:{phase:`active`,intensity:.94+Math.sin(t*Math.PI*12)*.06}}isDestroyed(){return this.destroyed}destroy(){this.destroyed||(this.destroyed=!0,this.primitive.isDestroyed()||this.scene.primitives.remove(this.primitive),this.material.isDestroyed()||this.material.destroy())}},O={class:`effect-panel`},k=u(o({__name:`index`,setup(o){let u=s(),m=s(`active`),h=s(`活跃`),g,_,v,y=!1,b={growing:`增强`,active:`活跃`,fading:`消退`,quiet:`平静`};return l(async()=>{let e=await f();if(y||!u.value)return;g=new Cesium.Viewer(u.value,{animation:!1,timeline:!1,baseLayer:e.west,baseLayerPicker:!1,sceneModePicker:!1,fullscreenButton:!1,geocoder:!1,homeButton:!1,infoBox:!1,navigationHelpButton:!1,skyBox:!1,scene3DOnly:!0,selectionIndicator:!1,contextOptions:{requestWebgl1:!1}}),p(g),d(g,e),g.scene.backgroundColor=Cesium.Color.fromCssColorString(`#020711`),g.scene.globe.baseColor=Cesium.Color.fromCssColorString(`#071421`),g.scene.globe.enableLighting=!0,g.scene.globe.showGroundAtmosphere=!0,g.scene.globe.dynamicAtmosphereLighting=!0,g.scene.globe.dynamicAtmosphereLightingFromSun=!0,g.scene.globe.showWaterEffect=!1,g.scene.highDynamicRange=!0,g.scene.skyAtmosphere&&(g.scene.skyAtmosphere.show=!0,g.scene.skyAtmosphere.perFragmentAtmosphere=!0),g.clock.currentTime=Cesium.JulianDate.fromIso8601(`2026-01-15T00:00:00Z`),g.clock.shouldAnimate=!1,_=new D(g.scene,{minimumHeight:1e5,maximumHeight:3e5,hemispheres:`both`,cycleDuration:60,brightness:1.15});let t=performance.now();v=g.scene.preRender.addEventListener(()=>{let e=(performance.now()-t)/1e3,n=_?.setTime(e);n&&n.phase!==m.value&&(m.value=n.phase,h.value=b[n.phase])});let n=Cesium.Cartesian3.fromDegrees(15,70,17e4);g.camera.lookAt(n,new Cesium.HeadingPitchRange(Cesium.Math.toRadians(195),Cesium.Math.toRadians(-18),365e4)),g.camera.lookAtTransform(Cesium.Matrix4.IDENTITY)}),t(()=>{y=!0,v?.(),v=void 0,_?.destroy(),_=void 0,g&&!g.isDestroyed()&&g.destroy(),g=void 0}),(t,o)=>(e(),a(c,null,[r(`div`,{ref_key:`container`,ref:u,class:`cesium-container`},null,512),r(`div`,O,[r(`span`,{class:n([`effect-dot`,`is-${m.value}`])},null,2),r(`div`,null,[o[0]||=r(`strong`,null,`动态极光`,-1),r(`span`,null,i(h.value)+` · 高空极光帘幕`,1)])])],64))}}),[[`__scopeId`,`data-v-633b9f16`]]);export{k as default};