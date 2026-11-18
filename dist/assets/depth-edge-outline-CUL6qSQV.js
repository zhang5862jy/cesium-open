import{E as e,F as t,G as n,R as r,T as i,_t as a,a as o,bt as s,c,d as l,f as u,m as d,q as f,t as p,w as m}from"./runtime-core.esm-bundler-DkML_vOj.js";import{l as h,n as g}from"./index-X3oIGtop.js";import{n as _,r as v,t as y}from"./viewerConfig-D2DHbJkY.js";var b=`
uniform sampler2D colorTexture;
uniform sampler2D depthTexture;
uniform vec4 outlineColor;
uniform vec4 backgroundColor;
uniform float sampleRadius;
uniform float edgeStrength;
uniform float edgeThreshold;
uniform float depthWeight;
uniform float blueprintAmount;
uniform float posterizeSteps;

in vec2 v_textureCoordinates;

float luminanceAt(vec2 uv)
{
  vec3 color = texture(colorTexture, clamp(uv, vec2(0.0), vec2(1.0))).rgb;
  return dot(color, vec3(0.299, 0.587, 0.114));
}

float depthMetricAt(vec2 uv)
{
  vec2 safeUv = clamp(uv, vec2(0.0), vec2(1.0));
  float packedDepth = czm_unpackDepth(texture(depthTexture, safeUv));
  if (packedDepth <= 0.0) {
    return 0.0;
  }

  vec2 windowPosition = safeUv * czm_viewport.zw + czm_viewport.xy;
  vec4 eyeCoordinate = czm_windowToEyeCoordinates(windowPosition, packedDepth);
  float distanceToCamera = max(-eyeCoordinate.z / eyeCoordinate.w, 1.0);
  return log2(distanceToCamera + 1.0) / 24.0;
}

vec2 sobelLuminance(vec2 uv, vec2 texel)
{
  float topLeft = luminanceAt(uv + texel * vec2(-1.0, 1.0));
  float top = luminanceAt(uv + texel * vec2(0.0, 1.0));
  float topRight = luminanceAt(uv + texel * vec2(1.0, 1.0));
  float left = luminanceAt(uv + texel * vec2(-1.0, 0.0));
  float right = luminanceAt(uv + texel * vec2(1.0, 0.0));
  float bottomLeft = luminanceAt(uv + texel * vec2(-1.0, -1.0));
  float bottom = luminanceAt(uv + texel * vec2(0.0, -1.0));
  float bottomRight = luminanceAt(uv + texel * vec2(1.0, -1.0));

  float horizontal =
    -topLeft - 2.0 * left - bottomLeft +
    topRight + 2.0 * right + bottomRight;
  float vertical =
    topLeft + 2.0 * top + topRight -
    bottomLeft - 2.0 * bottom - bottomRight;
  return vec2(horizontal, vertical);
}

vec2 sobelDepth(vec2 uv, vec2 texel)
{
  float topLeft = depthMetricAt(uv + texel * vec2(-1.0, 1.0));
  float top = depthMetricAt(uv + texel * vec2(0.0, 1.0));
  float topRight = depthMetricAt(uv + texel * vec2(1.0, 1.0));
  float left = depthMetricAt(uv + texel * vec2(-1.0, 0.0));
  float right = depthMetricAt(uv + texel * vec2(1.0, 0.0));
  float bottomLeft = depthMetricAt(uv + texel * vec2(-1.0, -1.0));
  float bottom = depthMetricAt(uv + texel * vec2(0.0, -1.0));
  float bottomRight = depthMetricAt(uv + texel * vec2(1.0, -1.0));

  float horizontal =
    -topLeft - 2.0 * left - bottomLeft +
    topRight + 2.0 * right + bottomRight;
  float vertical =
    topLeft + 2.0 * top + topRight -
    bottomLeft - 2.0 * bottom - bottomRight;
  return vec2(horizontal, vertical);
}

void main()
{
  vec2 texel = sampleRadius / max(czm_viewport.zw, vec2(1.0));
  vec2 colorGradient = sobelLuminance(v_textureCoordinates, texel);
  vec2 depthGradient = sobelDepth(v_textureCoordinates, texel);
  float colorEdge = length(colorGradient);
  float depthEdge = length(depthGradient) * depthWeight;
  float rawEdge = max(colorEdge, depthEdge);
  float edge = smoothstep(edgeThreshold, edgeThreshold * 2.0, rawEdge);
  edge = clamp(edge * edgeStrength, 0.0, 1.0);

  vec4 sceneColor = texture(colorTexture, v_textureCoordinates);
  float luma = dot(sceneColor.rgb, vec3(0.299, 0.587, 0.114));
  float steps = max(posterizeSteps, 2.0);
  float posterized = floor(luma * steps) / max(steps - 1.0, 1.0);
  vec3 blueprint = backgroundColor.rgb + posterized * vec3(0.035, 0.13, 0.19);
  vec3 base = mix(sceneColor.rgb, blueprint, blueprintAmount);
  vec3 outlined = mix(base, outlineColor.rgb, edge * outlineColor.a);

  out_FragColor = vec4(outlined, sceneColor.a);
}
`,x=class{collection;stage;outlineColorValue;backgroundColorValue;sampleRadiusValue;edgeStrengthValue;edgeThresholdValue;depthWeightValue;blueprintAmountValue;posterizeStepsValue;destroyed=!1;constructor(e,t={}){this.collection=e.postProcessStages,this.outlineColorValue=Cesium.Color.clone(t.outlineColor??Cesium.Color.fromCssColorString(`#74f6ff`).withAlpha(.95)),this.backgroundColorValue=Cesium.Color.clone(t.backgroundColor??Cesium.Color.fromCssColorString(`#06131f`).withAlpha(1)),this.sampleRadiusValue=t.sampleRadius??1.15,this.edgeStrengthValue=t.edgeStrength??1.6,this.edgeThresholdValue=t.edgeThreshold??.045,this.depthWeightValue=t.depthWeight??5.5,this.blueprintAmountValue=t.blueprintAmount??.82,this.posterizeStepsValue=t.posterizeSteps??7,this.stage=new Cesium.PostProcessStage({name:`depth-edge-outline`,fragmentShader:b,uniforms:{outlineColor:()=>this.outlineColorValue,backgroundColor:()=>this.backgroundColorValue,sampleRadius:()=>this.sampleRadiusValue,edgeStrength:()=>this.edgeStrengthValue,edgeThreshold:()=>this.edgeThresholdValue,depthWeight:()=>this.depthWeightValue,blueprintAmount:()=>this.blueprintAmountValue,posterizeSteps:()=>this.posterizeStepsValue},sampleMode:Cesium.PostProcessStageSampleMode.LINEAR}),this.collection.add(this.stage),this.stage.enabled=t.show??!0}get show(){return this.stage.enabled}set show(e){this.stage.enabled=e}setOptions(e){e.outlineColor!==void 0&&Cesium.Color.clone(e.outlineColor,this.outlineColorValue),e.backgroundColor!==void 0&&Cesium.Color.clone(e.backgroundColor,this.backgroundColorValue),e.sampleRadius!==void 0&&(this.sampleRadiusValue=Cesium.Math.clamp(e.sampleRadius,.5,5)),e.edgeStrength!==void 0&&(this.edgeStrengthValue=Math.max(0,e.edgeStrength)),e.edgeThreshold!==void 0&&(this.edgeThresholdValue=Math.max(1e-4,e.edgeThreshold)),e.depthWeight!==void 0&&(this.depthWeightValue=Math.max(0,e.depthWeight)),e.blueprintAmount!==void 0&&(this.blueprintAmountValue=Cesium.Math.clamp(e.blueprintAmount,0,1)),e.posterizeSteps!==void 0&&(this.posterizeStepsValue=Math.max(2,e.posterizeSteps))}isDestroyed(){return this.destroyed}destroy(){this.destroyed||=(this.collection.remove(this.stage),!0)}},S={class:`control-panel`},C={class:`heading-row`},w={class:`color-control`},T=g(d({__name:`index`,setup(d){let g=f(),b=n({enabled:!0,sampleRadius:1.2,threshold:.04,strength:1.85,depthWeight:6,blueprint:.86,outlineColor:`#74f6ff`}),T,E,D=[],O=!1,k=Cesium.Cartesian3.fromDegrees(121.48,31.23);function A(e,t){return(e%t+t)%t}function j(e,t,n,r){return Cesium.Matrix4.multiplyByPoint(e,new Cesium.Cartesian3(t,n,r),new Cesium.Cartesian3)}function M(){let e=Cesium.Transforms.eastNorthUpToFixedFrame(k),t=[],n=[];for(let r=-4;r<=5;r+=1)for(let i=-5;i<=5;i+=1){if((r*3+i*5+30)%8==0)continue;let a=i*7400+Math.sin(r+i*.7)*900,o=r*8800+Math.cos(i*1.2)*700,s=3800+A(r*19+i*23+80,9)*980,c=2700+A(r+i+20,4)*520,l=j(e,a,o,s*.5),u=.55+(r+i+20)%5*.018;if(t.push(new Cesium.GeometryInstance({id:`blueprint-block-${r}-${i}`,geometry:Cesium.BoxGeometry.fromDimensions({dimensions:new Cesium.Cartesian3(c,c*(.68+(r+12)%3*.13),s),vertexFormat:Cesium.PerInstanceColorAppearance.VERTEX_FORMAT}),modelMatrix:Cesium.Transforms.eastNorthUpToFixedFrame(l),attributes:{color:Cesium.ColorGeometryInstanceAttribute.fromColor(Cesium.Color.fromHsl(u,.52,.46,1))}})),(r+i+20)%6==0){let t=s*1.65,l=j(e,a+c*.9,o-c*.7,t*.5);n.push(new Cesium.GeometryInstance({id:`blueprint-tower-${r}-${i}`,geometry:new Cesium.CylinderGeometry({length:t,topRadius:c*.18,bottomRadius:c*.46,slices:32,vertexFormat:Cesium.PerInstanceColorAppearance.VERTEX_FORMAT}),modelMatrix:Cesium.Transforms.eastNorthUpToFixedFrame(l),attributes:{color:Cesium.ColorGeometryInstanceAttribute.fromColor(Cesium.Color.fromCssColorString(`#e3a96a`))}}))}}let r=()=>new Cesium.PerInstanceColorAppearance({translucent:!1,closed:!0});return[new Cesium.Primitive({geometryInstances:t,appearance:r(),asynchronous:!0,allowPicking:!1}),new Cesium.Primitive({geometryInstances:n,appearance:r(),asynchronous:!0,allowPicking:!1})]}function N(){if(!E)return;let e=Cesium.Color.fromCssColorString(b.outlineColor)??Cesium.Color.CYAN.clone();e.alpha=.96,E.show=b.enabled,E.setOptions({outlineColor:e,sampleRadius:b.sampleRadius,edgeThreshold:b.threshold,edgeStrength:b.strength,depthWeight:b.depthWeight,blueprintAmount:b.blueprint})}return t(()=>[b.enabled,b.sampleRadius,b.threshold,b.strength,b.depthWeight,b.blueprint,b.outlineColor],N),m(async()=>{let e=await v();if(O||!g.value)return;T=new Cesium.Viewer(g.value,{animation:!1,timeline:!1,baseLayer:e.west,baseLayerPicker:!1,geocoder:!1,navigationHelpButton:!1,sceneModePicker:!1,fullscreenButton:!1,infoBox:!1,selectionIndicator:!1,homeButton:!1,skyBox:!1,scene3DOnly:!0,contextOptions:{requestWebgl1:!1}}),y(T),_(T,e);let t=T.scene;t.backgroundColor=Cesium.Color.fromCssColorString(`#02070d`),t.globe.baseColor=Cesium.Color.fromCssColorString(`#071827`),t.globe.enableLighting=!1,t.globe.showWaterEffect=!1,t.globe.depthTestAgainstTerrain=!0;for(let e of M())D.push(t.primitives.add(e));E=new x(t),N(),T.camera.lookAt(k,new Cesium.HeadingPitchRange(Cesium.Math.toRadians(142),Cesium.Math.toRadians(-26),132e3)),T.camera.lookAtTransform(Cesium.Matrix4.IDENTITY)}),i(()=>{if(O=!0,E?.destroy(),E=void 0,T)for(let e of D)T.scene.primitives.contains(e)&&T.scene.primitives.remove(e);D.length=0,T&&!T.isDestroyed()&&T.destroy(),T=void 0}),(t,n)=>(e(),c(p,null,[o(`div`,{ref_key:`container`,ref:g,class:`cesium-container`},null,512),o(`aside`,S,[o(`div`,C,[n[7]||=o(`span`,{class:`eyebrow`},`COLOR + DEPTH SOBEL`,-1),o(`button`,{type:`button`,class:a({muted:!b.enabled}),onClick:n[0]||=e=>b.enabled=!b.enabled},s(b.enabled?`GPU 描边中`:`查看原图`),3)]),n[15]||=l(`<h2 data-v-744d8e52>深度边缘描边</h2><p data-v-744d8e52> 9 点卷积同时寻找颜色与眼空间深度突变；即使相邻建筑颜色接近，遮挡边界仍会被准确描出。 </p><div class="metrics" data-v-744d8e52><div data-v-744d8e52><strong data-v-744d8e52>17</strong><span data-v-744d8e52>纹理采样 / 像素</span></div><div data-v-744d8e52><strong data-v-744d8e52>3×3</strong><span data-v-744d8e52>Sobel 核</span></div><div data-v-744d8e52><strong data-v-744d8e52>1</strong><span data-v-744d8e52>全屏 Pass</span></div></div>`,3),o(`label`,null,[o(`span`,null,[n[8]||=u(`采样半径 `,-1),o(`output`,null,s(b.sampleRadius.toFixed(2))+` px`,1)]),r(o(`input`,{"onUpdate:modelValue":n[1]||=e=>b.sampleRadius=e,type:`range`,min:`0.5`,max:`3`,step:`0.05`},null,512),[[h,b.sampleRadius,void 0,{number:!0}]])]),o(`label`,null,[o(`span`,null,[n[9]||=u(`边缘阈值 `,-1),o(`output`,null,s(b.threshold.toFixed(3)),1)]),r(o(`input`,{"onUpdate:modelValue":n[2]||=e=>b.threshold=e,type:`range`,min:`0.01`,max:`0.16`,step:`0.002`},null,512),[[h,b.threshold,void 0,{number:!0}]])]),o(`label`,null,[o(`span`,null,[n[10]||=u(`线条强度 `,-1),o(`output`,null,s(b.strength.toFixed(2))+`×`,1)]),r(o(`input`,{"onUpdate:modelValue":n[3]||=e=>b.strength=e,type:`range`,min:`0`,max:`4`,step:`0.05`},null,512),[[h,b.strength,void 0,{number:!0}]])]),o(`label`,null,[o(`span`,null,[n[11]||=u(`深度权重 `,-1),o(`output`,null,s(b.depthWeight.toFixed(1))+`×`,1)]),r(o(`input`,{"onUpdate:modelValue":n[4]||=e=>b.depthWeight=e,type:`range`,min:`0`,max:`12`,step:`0.25`},null,512),[[h,b.depthWeight,void 0,{number:!0}]])]),o(`label`,null,[o(`span`,null,[n[12]||=u(`蓝图混合 `,-1),o(`output`,null,s(Math.round(b.blueprint*100))+`%`,1)]),r(o(`input`,{"onUpdate:modelValue":n[5]||=e=>b.blueprint=e,type:`range`,min:`0`,max:`1`,step:`0.02`},null,512),[[h,b.blueprint,void 0,{number:!0}]])]),o(`div`,w,[n[13]||=o(`span`,null,`描边颜色`,-1),r(o(`input`,{"onUpdate:modelValue":n[6]||=e=>b.outlineColor=e,type:`color`},null,512),[[h,b.outlineColor]]),n[14]||=o(`code`,null,`log2(eyeDistance) → Sobel`,-1)])])],64))}}),[[`__scopeId`,`data-v-744d8e52`]]);export{T as default};