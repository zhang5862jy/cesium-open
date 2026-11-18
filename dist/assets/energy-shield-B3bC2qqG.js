import{E as e,F as t,R as n,T as r,a as i,bt as a,c as o,f as s,m as c,q as l,t as u,w as d}from"./runtime-core.esm-bundler-DkML_vOj.js";import{l as f,n as p}from"./index-X3oIGtop.js";import{n as m,r as h,t as g}from"./viewerConfig-D2DHbJkY.js";var _=`
float hexDistance(vec2 point) {
  point = abs(point);
  return max(
    point.x * 1.1547005,
    point.x * 0.5773503 + point.y
  );
}

vec4 hexCell(vec2 coordinates) {
  // Convert a point to fractional axial coordinates for pointy-top hexagons.
  float axialX = coordinates.x * 0.5773503 - coordinates.y / 3.0;
  float axialZ = coordinates.y * 0.6666667;
  vec3 cube = vec3(axialX, -axialX - axialZ, axialZ);
  vec3 rounded = floor(cube + 0.5);
  vec3 error = abs(rounded - cube);

  // Preserve x + y + z = 0 after rounding to the nearest hexagon.
  if (error.x > error.y && error.x > error.z) {
    rounded.x = -rounded.y - rounded.z;
  } else if (error.y > error.z) {
    rounded.y = -rounded.x - rounded.z;
  } else {
    rounded.z = -rounded.x - rounded.y;
  }

  vec2 center = vec2(
    1.7320508 * (rounded.x + rounded.z * 0.5),
    1.5 * rounded.z
  );
  return vec4(coordinates - center, rounded.xz);
}

float cellVariation(vec2 cellId) {
  // A three-coloring of the hex lattice keeps dark panels separated, giving
  // the surface a football-like one-dark/two-light panel rhythm.
  float category = mod(cellId.x - cellId.y, 3.0);
  return step(0.5, category);
}

vec3 cubeProject(vec3 direction) {
  vec3 absoluteDirection = abs(direction);
  vec2 projected;
  float faceId;

  if (
    absoluteDirection.x >= absoluteDirection.y &&
    absoluteDirection.x >= absoluteDirection.z
  ) {
    projected = direction.x >= 0.0
      ? vec2(-direction.z, direction.y) / absoluteDirection.x
      : vec2(direction.z, direction.y) / absoluteDirection.x;
    faceId = direction.x >= 0.0 ? 0.0 : 1.0;
  } else if (absoluteDirection.y >= absoluteDirection.z) {
    projected = direction.y >= 0.0
      ? vec2(direction.x, -direction.z) / absoluteDirection.y
      : vec2(direction.x, direction.z) / absoluteDirection.y;
    faceId = direction.y >= 0.0 ? 2.0 : 3.0;
  } else {
    projected = direction.z >= 0.0
      ? vec2(direction.x, direction.y) / absoluteDirection.z
      : vec2(-direction.x, direction.y) / absoluteDirection.z;
    faceId = direction.z >= 0.0 ? 4.0 : 5.0;
  }

  return vec3(projected, faceId);
}

float impactWave(vec3 surfaceDirection, vec4 impact) {
  float intensity = length(impact.xyz);
  vec3 impactDirection = impact.xyz / max(intensity, 0.0001);
  float age = shieldTime - impact.w;
  float normalizedAge = age / impactDuration;
  float activeWave = step(0.0, age) * (1.0 - step(1.0, normalizedAge));
  float safeAge = clamp(age, 0.0, impactDuration);
  float safeNormalizedAge = safeAge / impactDuration;
  float distanceToImpact = acos(clamp(
    dot(surfaceDirection, impactDirection),
    -1.0,
    1.0
  )) / czm_pi;
  float waveRadius = safeNormalizedAge * 0.68;
  float delta = abs(distanceToImpact - waveRadius);
  float waveEnvelope = exp(-delta * 72.0);
  float wavelets = 0.64 + 0.36 * cos(
    delta * 260.0 - safeNormalizedAge * 8.0
  );
  float centerFlash = exp(-distanceToImpact * 42.0) * exp(-safeAge * 2.2);
  return activeWave * intensity * (
    waveEnvelope * wavelets + centerFlash * 1.6
  );
}

czm_material czm_getMaterial(czm_materialInput materialInput) {
  czm_material material = czm_getDefaultMaterial(materialInput);
  vec3 surfaceDirection = normalize(
    transpose(czm_normal) * materialInput.normalEC
  );
  vec3 projected = cubeProject(surfaceDirection);

  vec2 hexCoordinates = projected.xy * hexScale;
  vec4 cell = hexCell(hexCoordinates);
  float cellDistance = hexDistance(cell.xy);
  float distanceToBoundary = 1.0 - cellDistance;
  float edgeWidth = max(fwidth(cellDistance) * 1.15, 0.004);
  float tileInterior = smoothstep(0.016, 0.016 + edgeWidth, distanceToBoundary);
  vec2 variationId = cell.zw + vec2(projected.z * 7.0, projected.z * 11.0);
  float tileShade = mix(0.48, 0.56, cellVariation(variationId));

  float impacts = impactWave(surfaceDirection, impact0)
    + impactWave(surfaceDirection, impact1)
    + impactWave(surfaceDirection, impact2)
    + impactWave(surfaceDirection, impact3)
    + impactWave(surfaceDirection, impact4)
    + impactWave(surfaceDirection, impact5)
    + impactWave(surfaceDirection, impact6)
    + impactWave(surfaceDirection, impact7);

  vec3 viewDirection = normalize(materialInput.positionToEyeEC);
  float facing = abs(dot(normalize(materialInput.normalEC), viewDirection));
  float fresnel = pow(1.0 - facing, 2.35);
  float breathing = sin(shieldTime * 1.8) * 0.5 + 0.5;
  float surfaceHeight = surfaceDirection.z * 0.5 + 0.5;
  float latitudeScan = pow(
    max(0.0, 1.0 - abs(fract(surfaceHeight * 1.45 - shieldTime * 0.085) - 0.5) * 12.0),
    2.0
  );

  float waveEnergy = latitudeScan * 0.05 + impacts * 1.28;
  vec3 seamColor = glowColor.rgb * (0.52 + breathing * 0.06);
  vec3 tileColor = shieldColor.rgb * (0.28 + tileShade * 0.3);
  tileColor += glowColor.rgb * (waveEnergy * 0.48 + fresnel * 0.12);
  vec3 color = mix(seamColor, tileColor, tileInterior);

  material.diffuse = color;
  material.emission = glowColor.rgb * (
    (1.0 - tileInterior) * 0.32
      + waveEnergy * 0.26
      + fresnel * 0.12
  );
  material.alpha = clamp(
    mix(0.64, shieldColor.a + 0.3, tileInterior)
      + fresnel * 0.12
      + impacts * 0.2,
    0.0,
    0.88
  );
  return material;
}
`,v=8,y=Cesium.Color.fromCssColorString(`#087fe8`),b=Cesium.Color.fromCssColorString(`#65eaff`),x=class{primitive;scene;material;uniforms;removePreRender;startTime=performance.now();impactCursor=0;lastAutomaticImpact=0;autoImpact;impactInterval;destroyed=!1;constructor(e,t){this.scene=e,this.autoImpact=t.autoImpact??!0,this.impactInterval=Math.max(t.impactInterval??.72,.12);let n=Cesium.Color.clone(t.color??y);n.alpha=Cesium.Math.clamp(t.opacity??.11,0,1),this.uniforms={shieldColor:n,glowColor:Cesium.Color.clone(t.glowColor??b),shieldTime:0,hexScale:Math.max(t.hexScale??18,2),impactDuration:Math.max(t.impactDuration??3.8,.2),impact0:new Cesium.Cartesian4(0,0,0,1e6),impact1:new Cesium.Cartesian4(0,0,0,1e6),impact2:new Cesium.Cartesian4(0,0,0,1e6),impact3:new Cesium.Cartesian4(0,0,0,1e6),impact4:new Cesium.Cartesian4(0,0,0,1e6),impact5:new Cesium.Cartesian4(0,0,0,1e6),impact6:new Cesium.Cartesian4(0,0,0,1e6),impact7:new Cesium.Cartesian4(0,0,0,1e6)},this.material=new Cesium.Material({fabric:{type:`EnergyShield`,uniforms:this.uniforms,source:_},translucent:!0});let r=Cesium.Transforms.eastNorthUpToFixedFrame(t.position),i=Cesium.Matrix4.fromRotationTranslation(Cesium.Matrix3.fromRotationY(Cesium.Math.PI_OVER_TWO)),a=Cesium.Matrix4.multiply(r,i,new Cesium.Matrix4);this.primitive=e.primitives.add(new Cesium.Primitive({geometryInstances:new Cesium.GeometryInstance({id:this,geometry:new Cesium.SphereGeometry({radius:t.radius,stackPartitions:96,slicePartitions:192,vertexFormat:Cesium.MaterialAppearance.MaterialSupport.TEXTURED.vertexFormat}),modelMatrix:a}),appearance:new Cesium.MaterialAppearance({material:this.material,materialSupport:Cesium.MaterialAppearance.MaterialSupport.TEXTURED,flat:!0,faceForward:!1,closed:!1,translucent:!0,renderState:{depthTest:{enabled:!0},depthMask:!1,cull:{enabled:!0,face:Cesium.CullFace.BACK},blending:Cesium.BlendingState.ALPHA_BLEND}}),asynchronous:!1,allowPicking:!1}));for(let e=0;e<4;e+=1)this.addRandomImpact(-e*.58);this.removePreRender=e.preRender.addEventListener(()=>{this.tick()})}addImpact(e){this.destroyed||this.writeImpact(e,this.uniforms.shieldTime)}addRandomImpact(e=0){if(this.destroyed)return;let t=Math.random()*2-1;this.writeImpact({u:Math.random(),v:Math.asin(t)/Math.PI+.5,intensity:.72+Math.random()*.48},this.uniforms.shieldTime+e)}setAutoImpact(e){this.autoImpact=e}setImpactInterval(e){this.impactInterval=Math.max(e,.12)}isDestroyed(){return this.destroyed}destroy(){this.destroyed||(this.destroyed=!0,this.removePreRender(),this.primitive.isDestroyed()||this.scene.primitives.remove(this.primitive),this.material.isDestroyed()||this.material.destroy())}tick(){if(this.destroyed)return;let e=(performance.now()-this.startTime)*.001;this.uniforms.shieldTime=e,this.autoImpact&&e-this.lastAutomaticImpact>=this.impactInterval&&(this.addRandomImpact(),this.lastAutomaticImpact=e)}writeImpact(e,t){let n=`impact${this.impactCursor}`,r=this.uniforms[n],i=Cesium.Math.mod(e.u,1)*Cesium.Math.TWO_PI,a=(Cesium.Math.clamp(e.v,0,1)-.5)*Math.PI,o=Math.cos(a),s=Math.max(e.intensity??1,0);r.x=Math.cos(i)*o*s,r.y=Math.sin(i)*o*s,r.z=Math.sin(a)*s,r.w=t,this.impactCursor=(this.impactCursor+1)%v}},S={class:`control-panel`},C={class:`status-row`},w={class:`actions`},T=p(c({__name:`index`,setup(c){let p=l(),_=l(!0),v=l(.72),y=l(4),b,T,E=!1,D;function O(){T?.addRandomImpact(),y.value+=1}return t(_,e=>T?.setAutoImpact(e)),t(v,e=>T?.setImpactInterval(e)),d(async()=>{let e=await h();if(E||!p.value)return;b=new Cesium.Viewer(p.value,{animation:!1,timeline:!1,baseLayer:e.west,baseLayerPicker:!1,geocoder:!1,navigationHelpButton:!1,sceneModePicker:!1,fullscreenButton:!1,infoBox:!1,selectionIndicator:!1,homeButton:!1,skyBox:!1,scene3DOnly:!0}),g(b),m(b,e);let t=b.scene;t.backgroundColor=Cesium.Color.fromCssColorString(`#010812`),t.globe.baseColor=Cesium.Color.fromCssColorString(`#071a2a`),t.globe.enableLighting=!1,t.globe.showWaterEffect=!1,t.postProcessStages.bloom.enabled=!0,t.postProcessStages.bloom.uniforms.contrast=118,t.postProcessStages.bloom.uniforms.brightness=-.46,t.postProcessStages.bloom.uniforms.glowOnly=!1;let n=36e4,r=Cesium.Cartesian3.fromDegrees(112.5,31.2,n*.78);T=new x(t,{position:r,radius:n,color:Cesium.Color.fromCssColorString(`#087de8`),glowColor:Cesium.Color.fromCssColorString(`#62e9ff`),opacity:.1,hexScale:20,impactInterval:v.value,impactDuration:3.8}),b.camera.lookAt(r,new Cesium.HeadingPitchRange(Cesium.Math.toRadians(20),Cesium.Math.toRadians(-12),n*4.2)),b.camera.lookAtTransform(Cesium.Matrix4.IDENTITY),D=window.setInterval(()=>{_.value&&(y.value+=1)},v.value*1e3)}),t(v,e=>{D!==void 0&&window.clearInterval(D),D=window.setInterval(()=>{_.value&&(y.value+=1)},e*1e3)}),r(()=>{E=!0,D!==void 0&&window.clearInterval(D),D=void 0,T?.destroy(),T=void 0,b&&!b.isDestroyed()&&b.destroy(),b=void 0}),(t,r)=>(e(),o(u,null,[i(`div`,{ref_key:`container`,ref:p,class:`cesium-container`},null,512),i(`aside`,S,[r[4]||=i(`span`,{class:`eyebrow`},`DEFENSE FIELD / ONLINE`,-1),r[5]||=i(`h2`,null,`六边形能量罩`,-1),r[6]||=i(`p`,null,`GPU 程序化六边形罩面，持续模拟弹丸命中后沿球面扩散的能量涟漪。`,-1),i(`div`,C,[r[2]||=i(`span`,{class:`status-dot`},null,-1),i(`strong`,null,a(_.value?`自动防御中`:`手动模式`),1),i(`output`,null,a(y.value.toString().padStart(3,`0`))+` HITS`,1)]),i(`label`,null,[i(`span`,null,[r[3]||=s(`自动命中间隔 `,-1),i(`output`,null,a(v.value.toFixed(2))+` s`,1)]),n(i(`input`,{"onUpdate:modelValue":r[0]||=e=>v.value=e,type:`range`,min:`0.25`,max:`1.6`,step:`0.05`},null,512),[[f,v.value,void 0,{number:!0}]])]),i(`div`,w,[i(`button`,{type:`button`,class:`primary`,onClick:O},` 模拟一次命中 `),i(`button`,{type:`button`,onClick:r[1]||=e=>_.value=!_.value},a(_.value?`停止自动命中`:`开启自动命中`),1)]),r[7]||=i(`div`,{class:`legend`},[i(`span`,null,[i(`i`,{class:`hexagon`}),s(` 深浅六边形甲片`)]),i(`span`,null,[i(`i`,{class:`wave`}),s(` 球面冲击波`)])],-1)])],64))}}),[[`__scopeId`,`data-v-5d343251`]]);export{T as default};