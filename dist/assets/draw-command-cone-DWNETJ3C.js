import{E as e,F as t,G as n,R as r,T as i,a,bt as o,c as s,d as c,f as l,m as u,q as d,t as f,w as p}from"./runtime-core.esm-bundler-DkML_vOj.js";import{c as m,l as h,n as g}from"./index-X3oIGtop.js";import{n as _,r as v,t as y}from"./viewerConfig-D2DHbJkY.js";function b(e){let t=Cesium.CylinderGeometry.createGeometry(new Cesium.CylinderGeometry({length:1,topRadius:1,bottomRadius:1,slices:e,vertexFormat:Cesium.VertexFormat.POSITION_AND_NORMAL})),n=t?.attributes.position?.values,r=t?.attributes.normal?.values,i=t?.indices;if(!n||!r||!i)throw Error(`Cesium.CylinderGeometry 未能创建圆锥缓冲数据。`);return{positions:Float32Array.from(n),normals:Float32Array.from(r),indices:i instanceof Uint32Array?new Uint32Array(i):new Uint16Array(i)}}var x=`in vec3 v_normalEC;\r
flat in vec4 v_color;\r
in float v_axisProgress;\r
flat in float v_sideSurface;\r
flat in float v_materialType;\r
flat in float v_animationSpeed;\r
flat in float v_materialCount;\r
\r
float computeLighting(vec3 normalEC) {\r
  return 0.42 + 0.58 * abs(dot(normalEC, normalize(czm_lightDirectionEC)));\r
}\r
\r
void main() {\r
  // 动态材质的端盖完全透明，在相位和光照计算前丢弃。\r
  if (v_materialType >= 0.5 && v_sideSurface < 0.01) discard;\r
\r
  if (v_materialType < 0.5) {\r
    vec3 normalEC = normalize(v_normalEC);\r
    float lighting = computeLighting(normalEC);\r
    float edge = pow(1.0 - abs(dot(normalEC, vec3(0.0, 0.0, 1.0))), 1.6);\r
    vec3 diffuse = v_color.rgb * (0.65 + lighting * 0.35);\r
    diffuse += v_color.rgb * edge * 0.35;\r
    float alpha = v_color.a * (0.38 + edge * 0.62);\r
    out_FragColor = vec4(diffuse, alpha);\r
    return;\r
  }\r
\r
  // 波纹和分段渐变共用相位，均从起始截面持续移动到结束截面。\r
  float phase = v_axisProgress * max(v_materialCount, 1.0) -\r
    czm_frameNumber * 0.018 * v_animationSpeed;\r
\r
  if (v_materialType < 1.5) {\r
    float ringDistance = abs(fract(phase) - 0.5);\r
    float antialiasWidth = max(fwidth(phase) * 0.65, 0.025);\r
    float ring = 1.0 - smoothstep(\r
      0.075,\r
      0.075 + antialiasWidth,\r
      ringDistance\r
    );\r
    float wave = ring * v_sideSurface;\r
    if (wave < 0.01) {\r
      discard;\r
    }\r
    float lighting = computeLighting(normalize(v_normalEC));\r
    vec3 glow = mix(v_color.rgb, vec3(1.0), 0.62) *\r
      (0.72 + lighting * 0.28);\r
    out_FragColor = vec4(glow, v_color.a * wave);\r
    return;\r
  }\r
\r
  // 沿起点到终点的正方向由透明变为不透明，段与段之间留出透明分隔线。\r
  float segmentProgress = fract(phase);\r
  float separatorWidth = max(fwidth(phase) * 0.8, 0.035);\r
  float segmentMask = smoothstep(0.0, separatorWidth, segmentProgress) *\r
    (1.0 - smoothstep(\r
      1.0 - separatorWidth,\r
      1.0,\r
      segmentProgress\r
    ));\r
  float gradient = pow(segmentProgress, 0.75);\r
  float opacity = segmentMask * v_sideSurface * (0.18 + gradient * 0.82);\r
  if (opacity < 0.01) {\r
    discard;\r
  }\r
  float lighting = computeLighting(normalize(v_normalEC));\r
  vec3 gradientColor = mix(\r
    v_color.rgb * 0.58,\r
    mix(v_color.rgb, vec3(1.0), 0.32),\r
    gradient\r
  ) * (0.74 + lighting * 0.26);\r
  out_FragColor = vec4(gradientColor, v_color.a * opacity);\r
}\r
`,S=`in vec3 position;\r
in vec3 normal;\r
in vec3 instancePositionHigh;\r
in vec3 instancePositionLow;\r
in vec4 instanceQuaternion;\r
in vec3 instanceShape;\r
in vec4 instanceColor;\r
in vec3 instanceMaterial;\r
\r
out vec3 v_normalEC;\r
flat out vec4 v_color;\r
out float v_axisProgress;\r
flat out float v_sideSurface;\r
flat out float v_materialType;\r
flat out float v_animationSpeed;\r
flat out float v_materialCount;\r
\r
vec3 rotateByQuaternion(vec3 value, vec4 quaternion) {\r
  return value + 2.0 * cross(\r
    quaternion.xyz,\r
    cross(quaternion.xyz, value) + quaternion.w * value\r
  );\r
}\r
\r
void main() {\r
  // CylinderGeometry 以 Z 轴为中心，将顶部截面移动到局部坐标原点；\r
  // 随后沿局部 -Z 方向从起始截面延伸到结束截面。\r
  float axisProgress = clamp(0.5 - position.z, 0.0, 1.0);\r
  float radius = instanceShape.y +\r
    axisProgress * instanceShape.x * instanceShape.z;\r
  vec3 localPosition = vec3(\r
    position.xy * radius,\r
    (position.z - 0.5) * instanceShape.x\r
  );\r
  vec3 worldOffset = rotateByQuaternion(localPosition, instanceQuaternion);\r
  vec4 positionRTE = czm_translateRelativeToEye(\r
    instancePositionHigh,\r
    instancePositionLow + worldOffset\r
  );\r
\r
  float sideSurface = 1.0 - step(0.95, abs(normal.z));\r
  vec3 scaledNormal = normalize(mix(\r
    normal,\r
    vec3(normal.xy, instanceShape.z),\r
    sideSurface\r
  ));\r
  vec3 worldNormal = rotateByQuaternion(scaledNormal, instanceQuaternion);\r
  v_normalEC = normalize(czm_viewRotation * worldNormal);\r
  v_color = instanceColor;\r
  v_axisProgress = axisProgress;\r
  v_sideSurface = sideSurface;\r
  v_materialType = instanceMaterial.x;\r
  v_animationSpeed = instanceMaterial.y;\r
  v_materialCount = instanceMaterial.z;\r
  gl_Position = czm_modelViewProjectionRelativeToEye * positionRTE;\r
}\r
`,C=20,w=C*Float32Array.BYTES_PER_ELEMENT,T=256,E=48,D=new Cesium.Cartesian3(0,0,-1),O=new Cesium.Cartesian3,k=new Cesium.Cartesian3,A=new Cesium.Cartesian3,j=new Cesium.Cartesian3,M=16,N=new Float64Array(M),P=new Cesium.Quaternion,F=new Cesium.Quaternion,I=new Cesium.Matrix3,L=Cesium;function R(e){return e>=0?Math.floor(e/65536)*65536:-Math.floor(-e/65536)*65536}function z(e){return e===`wave`?1:e===`gradient`?2:0}function B(e){if(!Number.isFinite(e.length)||e.length<=0)throw Error(`每个圆锥的 length 必须是有限正数。`);if(!Number.isFinite(e.startRadius)||e.startRadius<0)throw Error(`每个圆锥的 startRadius 必须是有限非负数。`);if(!Number.isFinite(e.angle)||e.angle<=0||e.angle>=Math.PI)throw Error(`每个圆锥的 angle 必须是大于 0 且小于 PI 的有限弧度值。`);if(!Number.isFinite(e.animationSpeed)||e.animationSpeed<0)throw Error(`每个圆锥的 animationSpeed 必须是有限非负数。`);if(!Number.isInteger(e.materialCount)||e.materialCount<1)throw Error(`每个圆锥的 materialCount 必须是正整数。`);if(!Number.isFinite(e.direction.x)||!Number.isFinite(e.direction.y)||!Number.isFinite(e.direction.z)||Cesium.Cartesian3.magnitudeSquared(e.direction)<=Cesium.Math.EPSILON14)throw Error(`每个圆锥的 direction 必须是有限非零向量。`);if(e.type!==`transparent`&&e.type!==`wave`&&e.type!==`gradient`)throw Error(`未知的圆锥材质类型：${e.type}。`)}function V(e,t,n){let r={start:Cesium.Cartesian3.clone(e.position),length:n,startRadius:e.startRadius,angle:e.angle,direction:Cesium.Cartesian3.clone(t),type:e.type,animationSpeed:e.animationSpeed,materialCount:e.materialCount,color:Cesium.Color.clone(e.color)};return B(r),r}function H(e,t){Cesium.Cartesian3.normalize(e,O);let n=Cesium.Math.clamp(Cesium.Cartesian3.dot(D,O),-1,1);return n>1-Cesium.Math.EPSILON10?Cesium.Quaternion.clone(Cesium.Quaternion.IDENTITY,t):n<-1+Cesium.Math.EPSILON10?Cesium.Quaternion.fromAxisAngle(Cesium.Cartesian3.UNIT_X,Math.PI,t):(Cesium.Cartesian3.cross(D,O,k),t.x=k.x,t.y=k.y,t.z=k.z,t.w=1+n,Cesium.Quaternion.normalize(t,t))}var U=class{show=!0;capacity;mesh;renderStateOptions;boundingVolume=new Cesium.BoundingSphere;values;instanceCount=0;positionBuffer;normalBuffer;indexBuffer;instanceBuffer;vertexArray;shaderProgram;command;snapshots;instanceBounds;dirtyIndices=new Set;boundsDirty=!1;destroyed=!1;constructor(e={}){this.capacity=Math.max(1,Math.floor(e.capacity??T)),this.renderStateOptions=e.renderState;let t=Math.max(3,Math.floor(e.slices??E));this.mesh=b(t),this.values=new Float32Array(this.capacity*C),this.snapshots=new Float64Array(this.capacity*M),this.instanceBounds=new Float64Array(this.capacity*4)}static createFromEndPosition(e){let t=Cesium.Cartesian3.subtract(e.endPosition,e.position,new Cesium.Cartesian3),n=Cesium.Cartesian3.magnitude(t);if(!Number.isFinite(n)||n<=Cesium.Math.EPSILON7)throw Error(`圆锥的 position 和 endPosition 不能是同一个点。`);return Cesium.Cartesian3.normalize(t,t),V(e,t,n)}static createFromHeadingPitchRoll(e){Cesium.Transforms.headingPitchRollQuaternion(e.position,e.direction,Cesium.Ellipsoid.default,void 0,F),Cesium.Matrix3.fromQuaternion(F,I);let t=Cesium.Matrix3.multiplyByVector(I,D,new Cesium.Cartesian3);return Cesium.Cartesian3.normalize(t,t),V(e,t,e.length)}setInstances(e){if(this.destroyed)return;if(e.length>this.capacity)throw Error(`圆锥实例数量 ${e.length} 超出了容量限制 ${this.capacity}。`);for(let t of e)B(t);let t=this.instanceCount;for(let n=0;n<e.length;n+=1)this.packInstance(n,e[n],n>=t);this.instanceCount=e.length,t!==this.instanceCount&&(this.boundsDirty=!0);for(let e of this.dirtyIndices)e>=this.instanceCount&&this.dirtyIndices.delete(e);this.command&&(this.command.instanceCount=this.instanceCount)}updateInstances(e,t){if(!this.destroyed){if(!Number.isInteger(e)||e<0||e+t.length>this.instanceCount)throw Error(`圆锥更新区间超出了现有实例范围。`);for(let e of t)B(e);for(let n=0;n<t.length;n+=1)this.packInstance(e+n,t[n],!1)}}packInstance(e,t,n){let r=N;r[0]=t.start.x,r[1]=t.start.y,r[2]=t.start.z,r[3]=t.direction.x,r[4]=t.direction.y,r[5]=t.direction.z,r[6]=t.length,r[7]=t.startRadius,r[8]=t.angle,r[9]=t.color.red,r[10]=t.color.green,r[11]=t.color.blue,r[12]=t.color.alpha,r[13]=z(t.type),r[14]=t.animationSpeed,r[15]=t.materialCount;let i=e*M,a=n,o=n;for(let e=0;e<M;e+=1)this.snapshots[i+e]!==r[e]&&(e<9?a=!0:o=!0,this.snapshots[i+e]=r[e]);if(!a&&!o)return;this.dirtyIndices.add(e);let s=e*C,c=this.values;if(a){let n=R(t.start.x),r=R(t.start.y),i=R(t.start.z),a=H(t.direction,P),o=Math.tan(t.angle*.5);c[s]=n,c[s+1]=r,c[s+2]=i,c[s+3]=t.start.x-n,c[s+4]=t.start.y-r,c[s+5]=t.start.z-i,c[s+6]=a.x,c[s+7]=a.y,c[s+8]=a.z,c[s+9]=a.w,c[s+10]=t.length,c[s+11]=t.startRadius,c[s+12]=o,Cesium.Cartesian3.multiplyByScalar(O,t.length*.5,A),Cesium.Cartesian3.add(t.start,A,j);let l=e*4;this.instanceBounds[l]=j.x,this.instanceBounds[l+1]=j.y,this.instanceBounds[l+2]=j.z,this.instanceBounds[l+3]=Math.hypot(t.length*.5,t.startRadius+t.length*o),this.boundsDirty=!0}if(o)for(let e=9;e<M;e+=1)c[s+e+4]=r[e]}updateBounds(){let e=this.boundingVolume.center;Cesium.Cartesian3.clone(Cesium.Cartesian3.ZERO,e);let t=this.instanceBounds;for(let n=0;n<this.instanceCount;n+=1){let r=n*4;e.x+=t[r],e.y+=t[r+1],e.z+=t[r+2]}this.instanceCount>0&&Cesium.Cartesian3.divideByScalar(e,this.instanceCount,e);let n=0;for(let r=0;r<this.instanceCount;r+=1){let i=r*4;n=Math.max(n,Math.hypot(e.x-t[i],e.y-t[i+1],e.z-t[i+2])+t[i+3])}this.boundingVolume.radius=n,this.boundsDirty=!1}update(e){if(!(this.destroyed||!this.show)&&this.instanceCount!==0){if(this.shaderProgram||this.createResources(e.context),this.boundsDirty&&this.updateBounds(),this.dirtyIndices.size>0&&this.instanceBuffer){if(this.dirtyIndices.size>this.instanceCount/2||this.dirtyIndices.size>64)this.instanceBuffer.copyFromArrayView(this.values.subarray(0,this.instanceCount*C));else{let e=Array.from(this.dirtyIndices).sort((e,t)=>e-t);for(let t=0;t<e.length;t+=1){let n=e[t],r=n+1;for(;e[t+1]===r;)t+=1,r+=1;this.instanceBuffer.copyFromArrayView(this.values.subarray(n*C,r*C),n*w)}}this.dirtyIndices.clear()}e.passes.render&&this.command&&e.commandList.push(this.command)}}isDestroyed(){return this.destroyed}destroy(){this.destroyed||(this.destroyed=!0,this.dirtyIndices.clear(),this.vertexArray?.destroy(),this.vertexArray=void 0,this.instanceBuffer=void 0,this.command=void 0,this.positionBuffer?.destroy(),this.normalBuffer?.destroy(),this.indexBuffer?.destroy(),this.shaderProgram?.destroy(),this.positionBuffer=void 0,this.normalBuffer=void 0,this.indexBuffer=void 0,this.shaderProgram=void 0)}createResources(e){this.positionBuffer=L.Buffer.createVertexBuffer({context:e,typedArray:this.mesh.positions,usage:L.BufferUsage.STATIC_DRAW}),this.normalBuffer=L.Buffer.createVertexBuffer({context:e,typedArray:this.mesh.normals,usage:L.BufferUsage.STATIC_DRAW}),this.indexBuffer=L.Buffer.createIndexBuffer({context:e,typedArray:this.mesh.indices,usage:L.BufferUsage.STATIC_DRAW,indexDatatype:this.mesh.indices instanceof Uint32Array?Cesium.IndexDatatype.UNSIGNED_INT:Cesium.IndexDatatype.UNSIGNED_SHORT}),this.positionBuffer.vertexArrayDestroyable=!1,this.normalBuffer.vertexArrayDestroyable=!1,this.indexBuffer.vertexArrayDestroyable=!1;let t={position:0,normal:1,instancePositionHigh:2,instancePositionLow:3,instanceQuaternion:4,instanceShape:5,instanceColor:6,instanceMaterial:7};this.shaderProgram=L.ShaderProgram.fromCache({context:e,vertexShaderSource:new L.ShaderSource({defines:[`CESIUM_RUNTIME`],sources:[S]}),fragmentShaderSource:new L.ShaderSource({defines:[`CESIUM_RUNTIME`],sources:[x]}),attributeLocations:t}),this.instanceBuffer=L.Buffer.createVertexBuffer({context:e,sizeInBytes:this.values.byteLength,usage:L.BufferUsage.DYNAMIC_DRAW}),this.vertexArray=new L.VertexArray({context:e,indexBuffer:this.indexBuffer,attributes:[{index:0,vertexBuffer:this.positionBuffer,componentsPerAttribute:3,componentDatatype:Cesium.ComponentDatatype.FLOAT},{index:1,vertexBuffer:this.normalBuffer,componentsPerAttribute:3,componentDatatype:Cesium.ComponentDatatype.FLOAT},{index:2,vertexBuffer:this.instanceBuffer,componentsPerAttribute:3,componentDatatype:Cesium.ComponentDatatype.FLOAT,offsetInBytes:0,strideInBytes:w,instanceDivisor:1},{index:3,vertexBuffer:this.instanceBuffer,componentsPerAttribute:3,componentDatatype:Cesium.ComponentDatatype.FLOAT,offsetInBytes:12,strideInBytes:w,instanceDivisor:1},{index:4,vertexBuffer:this.instanceBuffer,componentsPerAttribute:4,componentDatatype:Cesium.ComponentDatatype.FLOAT,offsetInBytes:24,strideInBytes:w,instanceDivisor:1},{index:5,vertexBuffer:this.instanceBuffer,componentsPerAttribute:3,componentDatatype:Cesium.ComponentDatatype.FLOAT,offsetInBytes:40,strideInBytes:w,instanceDivisor:1},{index:6,vertexBuffer:this.instanceBuffer,componentsPerAttribute:4,componentDatatype:Cesium.ComponentDatatype.FLOAT,offsetInBytes:52,strideInBytes:w,instanceDivisor:1},{index:7,vertexBuffer:this.instanceBuffer,componentsPerAttribute:3,componentDatatype:Cesium.ComponentDatatype.FLOAT,offsetInBytes:68,strideInBytes:w,instanceDivisor:1}]});let n=L.RenderState.fromCache(this.renderStateOptions);this.command=new L.DrawCommand({owner:this,vertexArray:this.vertexArray,shaderProgram:this.shaderProgram,renderState:n,primitiveType:Cesium.PrimitiveType.TRIANGLES,pass:L.Pass.OPAQUE,instanceCount:this.instanceCount,count:this.mesh.indices.length,boundingVolume:this.boundingVolume,cull:!0,occlude:!0,modelMatrix:Cesium.Matrix4.IDENTITY})}},W={class:`panel`},G=g(u({__name:`index`,setup(u){let g=d(),b=n({count:12,length:55e3,startHeight:16e3,startRadius:3e3,angle:40,animationSpeed:1,materialCount:9,materialMode:`mixed`}),x=[`#36d9ff`,`#79f2c0`,`#ffd166`,`#a891ff`].map(e=>Cesium.Color.fromCssColorString(e)),S,C,w=!1,T=[];function E(e,t){let n=Cesium.Transforms.eastNorthUpToFixedFrame(e),r=Cesium.Matrix4.multiplyByPointAsVector(n,t,new Cesium.Cartesian3);return Cesium.Cartesian3.normalize(r,r)}function D(e){return b.materialMode===`mixed`?[`transparent`,`wave`,`gradient`][e%3]:b.materialMode}function O(){let e=Math.ceil(Math.sqrt(b.count*1.5));return Array.from({length:b.count},(t,n)=>{let r=n%e,i=Math.floor(n/e),a=115.25+r*.52,o=38.65+i*.42,s=Cesium.Cartesian3.fromDegrees(a,o,b.startHeight+n%3*1500),c=n*2.39996,l=b.length*(.82+n%4*.06),u=D(n),d=Cesium.Color.clone(x[n%x.length]);d.alpha=u===`transparent`?.32:u===`wave`?.78:.64;let f={color:d,position:s,startRadius:b.startRadius,type:u,animationSpeed:b.animationSpeed,materialCount:b.materialCount,angle:Cesium.Math.toRadians(b.angle)};if(n%2==0){let e=E(s,new Cesium.Cartesian3(Math.cos(c)*.78,Math.sin(c)*.78,-.46)),t=Cesium.Cartesian3.multiplyByScalar(e,l,new Cesium.Cartesian3),n=Cesium.Cartesian3.add(s,t,new Cesium.Cartesian3);return U.createFromEndPosition({...f,endPosition:n})}return U.createFromHeadingPitchRoll({...f,direction:new Cesium.HeadingPitchRoll(c,Cesium.Math.toRadians(58),0),length:l})})}function k(){T=O(),C?.setInstances(T)}return t(()=>[b.count,b.length,b.startHeight,b.startRadius,b.angle],k),t(()=>[b.animationSpeed,b.materialCount,b.materialMode],()=>{T.forEach((e,t)=>{e.type=D(t),e.animationSpeed=b.animationSpeed,e.materialCount=b.materialCount,e.color.alpha=e.type===`transparent`?.32:e.type===`wave`?.78:.64}),C?.setInstances(T)}),p(async()=>{let e=await v();w||!g.value||(S=new Cesium.Viewer(g.value,{animation:!1,timeline:!1,baseLayer:e.west,terrainProvider:new Cesium.EllipsoidTerrainProvider,baseLayerPicker:!1,geocoder:!1,navigationHelpButton:!1,sceneModePicker:!1,fullscreenButton:!1,infoBox:!1,selectionIndicator:!1,homeButton:!1,skyBox:!1,scene3DOnly:!0,contextOptions:{requestWebgl1:!1}}),y(S),_(S,e),S.scene.backgroundColor=Cesium.Color.fromCssColorString(`#030a14`),S.scene.globe.baseColor=Cesium.Color.fromCssColorString(`#0a2430`),S.scene.globe.showWaterEffect=!1,S.scene.globe.enableLighting=!1,S.scene.globe.depthTestAgainstTerrain=!0,C=S.scene.primitives.add(new U({slices:64,renderState:{depthTest:{enabled:!0},depthMask:!1,blending:Cesium.BlendingState.ALPHA_BLEND}})),k(),S.camera.lookAt(Cesium.Cartesian3.fromDegrees(116.55,39.15,18e3),new Cesium.HeadingPitchRange(Cesium.Math.toRadians(12),Cesium.Math.toRadians(-47),43e4)),S.camera.lookAtTransform(Cesium.Matrix4.IDENTITY))}),i(()=>{w=!0,S&&C&&S.scene.primitives.contains(C)&&S.scene.primitives.remove(C),C=void 0,T=[],S&&!S.isDestroyed()&&S.destroy(),S=void 0}),(t,n)=>(e(),s(f,null,[a(`div`,{ref_key:`container`,ref:g,class:`cesium-container`},null,512),a(`aside`,W,[n[17]||=c(`<div class="eyebrow" data-v-bad7cbad>CESIUM DRAWCOMMAND</div><h2 data-v-bad7cbad>批量方向圆锥</h2><p data-v-bad7cbad> position 是起始截面中心；圆锥末端会穿入地表，所有实例统一开启深度测试。 </p><div class="legend" data-v-bad7cbad><span data-v-bad7cbad><i class="transparent-dot" data-v-bad7cbad></i>透明圆锥</span><span data-v-bad7cbad><i class="wave-dot" data-v-bad7cbad></i>流动波纹</span><span data-v-bad7cbad><i class="gradient-dot" data-v-bad7cbad></i>分段渐变</span></div>`,4),a(`label`,null,[a(`span`,null,[n[8]||=l(`实例数量 `,-1),a(`output`,null,o(b.count),1)]),r(a(`input`,{"onUpdate:modelValue":n[0]||=e=>b.count=e,type:`range`,min:`2`,max:`48`,step:`2`},null,512),[[h,b.count,void 0,{number:!0}]])]),a(`label`,null,[a(`span`,null,[n[9]||=l(`圆锥长度 `,-1),a(`output`,null,o(Math.round(b.length/1e3))+` km`,1)]),r(a(`input`,{"onUpdate:modelValue":n[1]||=e=>b.length=e,type:`range`,min:`25000`,max:`90000`,step:`5000`},null,512),[[h,b.length,void 0,{number:!0}]])]),a(`label`,null,[a(`span`,null,[n[10]||=l(`起点高度 `,-1),a(`output`,null,o((b.startHeight/1e3).toFixed(0))+` km`,1)]),r(a(`input`,{"onUpdate:modelValue":n[2]||=e=>b.startHeight=e,type:`range`,min:`6000`,max:`30000`,step:`1000`},null,512),[[h,b.startHeight,void 0,{number:!0}]])]),a(`label`,null,[a(`span`,null,[n[11]||=l(`起点半径 `,-1),a(`output`,null,o((b.startRadius/1e3).toFixed(1))+` km`,1)]),r(a(`input`,{"onUpdate:modelValue":n[3]||=e=>b.startRadius=e,type:`range`,min:`0`,max:`12000`,step:`500`},null,512),[[h,b.startRadius,void 0,{number:!0}]])]),a(`label`,null,[a(`span`,null,[n[12]||=l(`圆锥张角 `,-1),a(`output`,null,o(b.angle)+`°`,1)]),r(a(`input`,{"onUpdate:modelValue":n[4]||=e=>b.angle=e,type:`range`,min:`12`,max:`80`,step:`2`},null,512),[[h,b.angle,void 0,{number:!0}]])]),a(`label`,null,[a(`span`,null,[n[13]||=l(`材质速度 `,-1),a(`output`,null,o(b.animationSpeed.toFixed(1))+`×`,1)]),r(a(`input`,{"onUpdate:modelValue":n[5]||=e=>b.animationSpeed=e,type:`range`,min:`0`,max:`3`,step:`0.1`},null,512),[[h,b.animationSpeed,void 0,{number:!0}]])]),a(`label`,null,[a(`span`,null,[n[14]||=l(`圆环 / 分段数量 `,-1),a(`output`,null,o(b.materialCount),1)]),r(a(`input`,{"onUpdate:modelValue":n[6]||=e=>b.materialCount=e,type:`range`,min:`2`,max:`24`,step:`1`},null,512),[[h,b.materialCount,void 0,{number:!0}]])]),a(`label`,null,[n[16]||=a(`span`,null,`材质组合`,-1),r(a(`select`,{"onUpdate:modelValue":n[7]||=e=>b.materialMode=e},[...n[15]||=[a(`option`,{value:`mixed`},`三种材质交错`,-1),a(`option`,{value:`transparent`},`全部透明`,-1),a(`option`,{value:`wave`},`全部波纹`,-1),a(`option`,{value:`gradient`},`全部分段渐变`,-1)]],512),[[m,b.materialMode]])]),n[18]||=a(`div`,{class:`api`},[a(`code`,null,`new DrawCommandConePrimitive({ renderState })`),a(`code`,null,`createFromEndPosition(options)`),a(`code`,null,`createFromHeadingPitchRoll(options)`),a(`code`,null,`primitive.setInstances(instances)`),a(`span`,null,`1 个 DrawCommand：共享 renderState，优先于标准透明 Pass 绘制`)],-1)])],64))}}),[[`__scopeId`,`data-v-bad7cbad`]]);export{G as default};