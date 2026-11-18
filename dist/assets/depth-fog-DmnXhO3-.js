import{E as e,F as t,G as n,R as r,T as i,_t as a,a as o,bt as s,c,f as l,m as u,q as d,t as f,w as p}from"./runtime-core.esm-bundler-DkML_vOj.js";import{l as m,n as h}from"./index-X3oIGtop.js";import{n as g,r as _,t as v}from"./viewerConfig-D2DHbJkY.js";var y=`
uniform sampler2D colorTexture;
uniform sampler2D depthTexture;
uniform vec4 fogColor;
uniform float nearDistance;
uniform float farDistance;
uniform float density;
uniform float noiseStrength;
uniform float noiseScale;
uniform float timeSeconds;

in vec2 v_textureCoordinates;

float eyeDistance(vec2 texCoords)
{
  float depth = czm_unpackDepth(texture(depthTexture, texCoords));
  if (depth <= 0.0) {
    return czm_infinity;
  }

  vec4 eyeCoordinate = czm_windowToEyeCoordinates(gl_FragCoord.xy, depth);
  return -eyeCoordinate.z / eyeCoordinate.w;
}

float hash12(vec2 point)
{
  vec3 point3 = fract(vec3(point.xyx) * 0.1031);
  point3 += dot(point3, point3.yzx + 33.33);
  return fract((point3.x + point3.y) * point3.z);
}

float valueNoise(vec2 point)
{
  vec2 cell = floor(point);
  vec2 local = fract(point);
  local = local * local * (3.0 - 2.0 * local);

  float lower = mix(hash12(cell), hash12(cell + vec2(1.0, 0.0)), local.x);
  float upper = mix(
    hash12(cell + vec2(0.0, 1.0)),
    hash12(cell + vec2(1.0, 1.0)),
    local.x
  );
  return mix(lower, upper, local.y);
}

float fogNoise(vec2 texCoords)
{
  vec2 aspect = vec2(czm_viewport.z / max(czm_viewport.w, 1.0), 1.0);
  vec2 drift = vec2(timeSeconds * 0.055, timeSeconds * -0.018);
  vec2 point = texCoords * aspect * noiseScale + drift;
  float broad = valueNoise(point);
  float detail = valueNoise(point * 2.07 + vec2(7.4, -3.1));
  return broad * 0.7 + detail * 0.3;
}

void main()
{
  vec4 sceneColor = texture(colorTexture, v_textureCoordinates);
  float distanceToCamera = eyeDistance(v_textureCoordinates);
  if (distanceToCamera == czm_infinity) {
    out_FragColor = sceneColor;
    return;
  }

  float range = max(farDistance - nearDistance, 1.0);
  float distanceFog = smoothstep(
    nearDistance,
    farDistance,
    distanceToCamera
  );
  float exponentialFog = 1.0 - exp(
    -max(density, 0.0) * max(distanceToCamera - nearDistance, 0.0) / range
  );
  float baseFog = max(distanceFog, exponentialFog * 0.82);
  float variation = mix(1.0, 0.68 + fogNoise(v_textureCoordinates) * 0.58, noiseStrength);
  float amount = clamp(baseFog * variation, 0.0, fogColor.a);

  vec3 scattered = mix(sceneColor.rgb, fogColor.rgb, amount);
  out_FragColor = vec4(scattered, sceneColor.a);
}
`,b={nearDistance:12e3,farDistance:18e4,density:1.15,noiseStrength:.32,noiseScale:4.5,show:!0},x=class{collection;stage;nearDistanceValue;farDistanceValue;densityValue;colorValue;noiseStrengthValue;noiseScaleValue;timeSecondsValue=0;destroyed=!1;constructor(e,t={}){this.collection=e.postProcessStages,this.nearDistanceValue=t.nearDistance??b.nearDistance,this.farDistanceValue=t.farDistance??b.farDistance,this.densityValue=t.density??b.density,this.colorValue=Cesium.Color.clone(t.color??Cesium.Color.fromCssColorString(`#a7c5ce`).withAlpha(.9)),this.noiseStrengthValue=t.noiseStrength??b.noiseStrength,this.noiseScaleValue=t.noiseScale??b.noiseScale,this.stage=new Cesium.PostProcessStage({name:`depth-aware-procedural-fog`,fragmentShader:y,uniforms:{fogColor:()=>this.colorValue,nearDistance:()=>this.nearDistanceValue,farDistance:()=>this.farDistanceValue,density:()=>this.densityValue,noiseStrength:()=>this.noiseStrengthValue,noiseScale:()=>this.noiseScaleValue,timeSeconds:()=>this.timeSecondsValue}}),this.collection.add(this.stage),this.stage.enabled=t.show??b.show}get show(){return this.stage.enabled}set show(e){this.stage.enabled=e}setOptions(e){e.nearDistance!==void 0&&(this.nearDistanceValue=Math.max(0,e.nearDistance)),e.farDistance!==void 0&&(this.farDistanceValue=Math.max(this.nearDistanceValue+1,e.farDistance)),e.density!==void 0&&(this.densityValue=Math.max(0,e.density)),e.color!==void 0&&Cesium.Color.clone(e.color,this.colorValue),e.noiseStrength!==void 0&&(this.noiseStrengthValue=Cesium.Math.clamp(e.noiseStrength,0,1)),e.noiseScale!==void 0&&(this.noiseScaleValue=Math.max(.01,e.noiseScale))}setTime(e){this.timeSecondsValue=e}isDestroyed(){return this.destroyed}destroy(){this.destroyed||=(this.collection.remove(this.stage),!0)}},S={class:`control-panel`},C={class:`panel-heading`},w={class:`color-row`},T=h(u({__name:`index`,setup(u){let h=d(),y=n({enabled:!0,nearDistance:18e3,farDistance:19e4,density:1.35,noiseStrength:.42,opacity:.9,tint:`#9dbbc3`}),b,T,E,D,O=!1,k=Cesium.Cartesian3.fromDegrees(116.39,39.91);function A(e,t){return(e%t+t)%t}function j(){let e=Cesium.Transforms.eastNorthUpToFixedFrame(k),t=[];for(let n=0;n<14;n+=1)for(let r=-4;r<=4;r+=1){if((n+r+8)%7==0)continue;let i=r*8500+Math.sin(n*1.7+r)*1100,a=(n-2)*13e3+Math.cos(r*1.3)*1400,o=2200+A(n*17+r*13+40,5)*460,s=3600+A(n*29+r*19+70,8)*1050,c=Cesium.Matrix4.multiplyByPoint(e,new Cesium.Cartesian3(i,a,s*.5),new Cesium.Cartesian3),l=Cesium.Transforms.eastNorthUpToFixedFrame(c),u=n/13,d=Cesium.Color.fromHsl(.54-u*.08,.62,.48+(r+4)%3*.055,1);t.push(new Cesium.GeometryInstance({id:`depth-building-${n}-${r}`,geometry:Cesium.BoxGeometry.fromDimensions({dimensions:new Cesium.Cartesian3(o,o*(.72+(n+r+8)%4*.09),s),vertexFormat:Cesium.PerInstanceColorAppearance.VERTEX_FORMAT}),modelMatrix:l,attributes:{color:Cesium.ColorGeometryInstanceAttribute.fromColor(d)}}))}return new Cesium.Primitive({geometryInstances:t,appearance:new Cesium.PerInstanceColorAppearance({translucent:!1,closed:!0}),asynchronous:!0,allowPicking:!1})}function M(){if(!E)return;let e=Cesium.Color.fromCssColorString(y.tint)??Cesium.Color.LIGHTGRAY.clone();e.alpha=y.opacity,E.show=y.enabled,E.setOptions({nearDistance:y.nearDistance,farDistance:Math.max(y.farDistance,y.nearDistance+1e3),density:y.density,noiseStrength:y.noiseStrength,color:e})}return t(()=>[y.enabled,y.nearDistance,y.farDistance,y.density,y.noiseStrength,y.opacity,y.tint],M),p(async()=>{let e=await _();if(O||!h.value)return;b=new Cesium.Viewer(h.value,{animation:!1,timeline:!1,baseLayer:e.west,baseLayerPicker:!1,geocoder:!1,navigationHelpButton:!1,sceneModePicker:!1,fullscreenButton:!1,infoBox:!1,selectionIndicator:!1,homeButton:!1,skyBox:!1,scene3DOnly:!0,contextOptions:{requestWebgl1:!1}}),v(b),g(b,e);let t=b.scene;t.backgroundColor=Cesium.Color.fromCssColorString(`#071018`),t.globe.baseColor=Cesium.Color.fromCssColorString(`#18313a`),t.globe.enableLighting=!1,t.globe.showWaterEffect=!1,t.globe.depthTestAgainstTerrain=!0,T=t.primitives.add(j()),E=new x(t),M();let n=performance.now();D=t.preRender.addEventListener(()=>{E?.setTime((performance.now()-n)*.001)});let r=Cesium.Transforms.eastNorthUpToFixedFrame(k),i=Cesium.Matrix4.multiplyByPoint(r,new Cesium.Cartesian3(0,66e3,2500),new Cesium.Cartesian3);b.camera.lookAt(i,new Cesium.HeadingPitchRange(Cesium.Math.toRadians(182),Cesium.Math.toRadians(-14),168e3)),b.camera.lookAtTransform(Cesium.Matrix4.IDENTITY)}),i(()=>{O=!0,D?.(),D=void 0,E?.destroy(),E=void 0,b&&T&&b.scene.primitives.contains(T)&&b.scene.primitives.remove(T),T=void 0,b&&!b.isDestroyed()&&b.destroy(),b=void 0}),(t,n)=>(e(),c(f,null,[o(`div`,{ref_key:`container`,ref:h,class:`cesium-container`},null,512),o(`aside`,S,[o(`div`,C,[n[7]||=o(`span`,{class:`eyebrow`},`DEPTH TEXTURE · EYE SPACE`,-1),o(`button`,{type:`button`,class:a([`power-button`,{"is-off":!y.enabled}]),onClick:n[0]||=e=>y.enabled=!y.enabled},s(y.enabled?`雾效开启`:`雾效关闭`),3)]),n[14]||=o(`h2`,null,`动态深度雾`,-1),n[15]||=o(`p`,null,` 从深度纹理重建每个像素的眼空间距离，让远处建筑逐层融入流动雾场，而天空保持不受影响。 `,-1),n[16]||=o(`div`,{class:`pipeline`},[o(`span`,null,`depthTexture`),o(`i`,null,`→`),o(`span`,null,`eye distance`),o(`i`,null,`→`),o(`span`,null,`fog mix`)],-1),o(`label`,null,[o(`span`,null,[n[8]||=l(`起雾距离 `,-1),o(`output`,null,s(Math.round(y.nearDistance/1e3))+` km`,1)]),r(o(`input`,{"onUpdate:modelValue":n[1]||=e=>y.nearDistance=e,type:`range`,min:`0`,max:`80000`,step:`2000`},null,512),[[m,y.nearDistance,void 0,{number:!0}]])]),o(`label`,null,[o(`span`,null,[n[9]||=l(`完全笼罩 `,-1),o(`output`,null,s(Math.round(y.farDistance/1e3))+` km`,1)]),r(o(`input`,{"onUpdate:modelValue":n[2]||=e=>y.farDistance=e,type:`range`,min:`90000`,max:`300000`,step:`5000`},null,512),[[m,y.farDistance,void 0,{number:!0}]])]),o(`label`,null,[o(`span`,null,[n[10]||=l(`指数密度 `,-1),o(`output`,null,s(y.density.toFixed(2)),1)]),r(o(`input`,{"onUpdate:modelValue":n[3]||=e=>y.density=e,type:`range`,min:`0`,max:`3`,step:`0.05`},null,512),[[m,y.density,void 0,{number:!0}]])]),o(`label`,null,[o(`span`,null,[n[11]||=l(`雾团扰动 `,-1),o(`output`,null,s(Math.round(y.noiseStrength*100))+`%`,1)]),r(o(`input`,{"onUpdate:modelValue":n[4]||=e=>y.noiseStrength=e,type:`range`,min:`0`,max:`1`,step:`0.02`},null,512),[[m,y.noiseStrength,void 0,{number:!0}]])]),o(`div`,w,[o(`label`,null,[n[12]||=o(`span`,null,`雾色`,-1),r(o(`input`,{"onUpdate:modelValue":n[5]||=e=>y.tint=e,type:`color`},null,512),[[m,y.tint]])]),o(`label`,null,[o(`span`,null,[n[13]||=l(`最大遮蔽 `,-1),o(`output`,null,s(Math.round(y.opacity*100))+`%`,1)]),r(o(`input`,{"onUpdate:modelValue":n[6]||=e=>y.opacity=e,type:`range`,min:`0.2`,max:`1`,step:`0.02`},null,512),[[m,y.opacity,void 0,{number:!0}]])])]),n[17]||=o(`div`,{class:`note`},[o(`strong`,null,`WebGL 要点`),o(`span`,null,[o(`code`,null,`czm_unpackDepth`),l(` + `),o(`code`,null,`czm_windowToEyeCoordinates`)])],-1)])],64))}}),[[`__scopeId`,`data-v-7fd63409`]]);export{T as default};