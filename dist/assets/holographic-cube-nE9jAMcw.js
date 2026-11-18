import{E as e,F as t,G as n,R as r,T as i,a,bt as o,c as s,f as c,m as l,q as u,t as d,w as f}from"./runtime-core.esm-bundler-DkML_vOj.js";import{l as p,n as m}from"./index-X3oIGtop.js";import{n as h,r as g,t as _}from"./viewerConfig-D2DHbJkY.js";function v(){let e=new Float32Array(192),t=new Uint16Array(36),n=[{n:[1,0,0],u:[0,0,-1],v:[0,1,0]},{n:[-1,0,0],u:[0,0,1],v:[0,1,0]},{n:[0,1,0],u:[1,0,0],v:[0,0,-1]},{n:[0,-1,0],u:[1,0,0],v:[0,0,1]},{n:[0,0,1],u:[1,0,0],v:[0,1,0]},{n:[0,0,-1],u:[-1,0,0],v:[0,1,0]}],r=[[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]],i=0;for(let t=0;t<n.length;t+=1){let{n:a,u:o,v:s}=n[t];for(let t=0;t<r.length;t+=1){let[n,c]=r[t];e[i+0]=a[0]*.5+o[0]*n+s[0]*c,e[i+1]=a[1]*.5+o[1]*n+s[1]*c,e[i+2]=a[2]*.5+o[2]*n+s[2]*c,e[i+3]=a[0],e[i+4]=a[1],e[i+5]=a[2],e[i+6]=n+.5,e[i+7]=c+.5,i+=8}}let a=0;for(let e=0;e<6;e+=1){let n=e*4;t[a+0]=n+0,t[a+1]=n+1,t[a+2]=n+2,t[a+3]=n+0,t[a+4]=n+2,t[a+5]=n+3,a+=6}return{vertices:e,indices:t}}var y=Cesium,b=`// ============================================================================\r
// 顶点着色器（单个全息立方体）\r
// ============================================================================\r
// 这是「原始」GLSL。Cesium 的 ShaderSource 在编译前会替我们做三件事：\r
//   1. 自动在开头注入 \`#version 300 es\`（WebGL2 / GLSL ES 3.00）；\r
//   2. 自动注入 czm_* 自动 uniform（czm_modelViewRelativeToEye 等）的声明\r
//      以及内置函数实现；\r
//   3. 根据 TS 里传入的 attributeLocations，把下面的 in 变量名映射到\r
//      VertexArray 中对应的 attribute 编号。\r
// 所以这里直接用 in/out 语法，不要自己写 #version，也不要重复声明 czm_*。\r
// ============================================================================\r
\r
// 顶点属性（location 由 ShaderProgram 的 attributeLocations 指定）\r
in vec3 position; // 局部空间坐标（单位立方体，半边长 0.5）\r
in vec3 normal;   // 局部空间法线\r
in vec2 st;       // 面内纹理坐标\r
\r
// 传给片元着色器的 varying（顶点着色器 out，片元着色器 in，类型一致）\r
out vec3 v_normalEC;      // 眼空间法线（用于光照 / 菲涅尔等）\r
out vec2 v_st;            // 面内 UV（网格 / 边框 / 扫描线）\r
out vec3 v_localPosition; // 局部坐标（用于跨面的彩虹渐变）\r
out vec4 v_color;         // 顶点颜色（单个立方体恒为白色）\r
\r
void main() {\r
  // 局部坐标原样传出，片元着色器用它做随位置变化的彩虹渐变\r
  v_localPosition = position;\r
\r
  // czm_normal：Cesium 自动注入的「法线矩阵」（modelView 的逆转置 3x3）。\r
  // 它把局部法线变换到眼空间；即使 modelMatrix 带非均匀缩放也能得到正确方向。\r
  // normalize 抵消非均匀缩放带来的长度变化。\r
  v_normalEC = normalize(czm_normal * normal);\r
\r
  // 面内 UV 原样传出\r
  v_st = st;\r
\r
  // 单个立方体没有实例颜色，传白色（片元着色器乘它不会改变色相）\r
  v_color = vec4(1.0);\r
\r
  // 关键：用「相对相机位置」的 modelView 矩阵计算眼空间坐标。\r
  // 地球尺度下坐标绝对值极大，直接 czm_modelView * pos 会因 float 精度不足\r
  // 而抖动；czm_modelViewRelativeToEye 先平移使坐标靠近原点，从而保持精度。\r
  vec4 positionEC = czm_modelViewRelativeToEye * vec4(position, 1.0);\r
\r
  // 眼空间 -> 裁剪空间（gl_Position 是顶点着色器必须写出的内建输出）\r
  gl_Position = czm_projection * positionEC;\r
}\r
`,x=`// ============================================================================\r
// 片元着色器（全息立方体材质，单个与实例版共用）\r
// ============================================================================\r
// 效果：随时间旋转的彩虹渐变 + 面内网格 + 棱边高光 + 循环扫描线 + 呼吸脉冲，\r
// 最终用 v_color 染色。全部基于局部坐标 / UV / 时间，无需任何纹理贴图。\r
// ============================================================================\r
\r
in vec3 v_normalEC;\r
in vec2 v_st;\r
in vec3 v_localPosition;\r
in vec4 v_color;\r
\r
// 输出片段颜色。Cesium 检测到代码里写了 out_FragColor 后，会在 WebGL2 下\r
// 自动补上 \`layout(location = 0) out vec4 out_FragColor;\`，这里直接赋值即可。\r
// （若运行在 WebGL1 下，它会自动把 out_FragColor 映射回 gl_FragColor。）\r
\r
// HSV 转 RGB：用于生成随时间旋转的彩虹色相（h 在 [0,1]，s/v 在 [0,1]）\r
vec3 hsv2rgb(vec3 c) {\r
  vec3 rgb = clamp(abs(mod(c.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);\r
  return c.z * mix(vec3(1.0), rgb, c.y);\r
}\r
\r
void main() {\r
  vec3 normalEC = normalize(v_normalEC);\r
\r
  // 动画时间：czm_frameNumber 是 Cesium 每帧递增的自动 uniform（float）。\r
  // 乘以 0.016 把它近似换算成秒（60fps 下约等于 wall-clock 秒）。\r
  // 想要真正的挂钟时间，可以改用一个每帧更新的 u_time uniform。\r
  float time = czm_frameNumber * 0.016;\r
\r
  // 1) 彩虹色相：用局部坐标三个分量的混合作为色相输入，让六个面呈现不同\r
  //    颜色，并随时间缓慢旋转。\r
  float hue = fract(v_localPosition.x * 0.08 +\r
    v_localPosition.y * 0.06 +\r
    v_localPosition.z * 0.05 +\r
    time * 0.06);\r
  vec3 baseColor = hsv2rgb(vec3(hue, 0.72, 0.95));\r
\r
  // 2) 面内网格：对 UV 取小数部分，用 fwidth 计算抗锯齿线宽，画出细网格线。\r
  vec2 gridCoord = v_st * 8.0;\r
  vec2 gridDist = abs(fract(gridCoord - 0.5) - 0.5) / max(fwidth(gridCoord), vec2(0.0001));\r
  float gridLine = 1.0 - min(min(gridDist.x, gridDist.y), 1.0);\r
\r
  // 3) 棱边高光：UV 越接近 0 或 1（即越靠近面的边缘）越亮，勾勒立方体棱边。\r
  float edgeDistance = min(min(v_st.x, 1.0 - v_st.x), min(v_st.y, 1.0 - v_st.y));\r
  float edge = 1.0 - smoothstep(0.0, 0.14, edgeDistance);\r
\r
  // 4) 扫描线：一道亮带沿 V 方向循环扫过每个面。\r
  float scan = 1.0 - smoothstep(0.0, 0.08, abs(fract(v_st.y - time * 0.45) - 0.5));\r
\r
  // 5) 呼吸脉冲：整体亮度缓慢起伏。\r
  float pulse = 0.82 + 0.18 * sin(time * 2.2);\r
\r
  // 6) 组合：基础彩虹按网格提亮，叠加青色棱边光与扫描带，再乘脉冲。\r
  vec3 color = baseColor * (0.5 + 0.5 * gridLine);\r
  color += vec3(0.35, 0.9, 1.0) * edge * 0.95; // 青色棱边光\r
  color += baseColor * scan * 0.55;            // 扫描带提亮\r
  color *= pulse;\r
\r
  // 用顶点 / 实例颜色染色（单个立方体 v_color 为白色，等价于不染色）\r
  color *= v_color.rgb;\r
\r
  // 半透明：棱边更实、内部更透，营造全息投影感\r
  float alpha = 0.72 + 0.28 * edge;\r
\r
  out_FragColor = vec4(color, alpha);\r
}\r
`,S=8*Float32Array.BYTES_PER_ELEMENT,C=class{show=!0;mesh=v();boundingVolume=new Cesium.BoundingSphere;modelMatrix;vertexArray;shaderProgram;command;destroyed=!1;constructor(e){Cesium.Cartesian3.clone(e.position,this.boundingVolume.center),this.boundingVolume.radius=Cesium.Cartesian3.magnitude(e.dimensions)*.5,this.modelMatrix=w(e.position,e.dimensions,e.orientation)}setTransform(e,t,n){this.destroyed||(Cesium.Cartesian3.clone(e,this.boundingVolume.center),this.boundingVolume.radius=Cesium.Cartesian3.magnitude(t)*.5,this.modelMatrix=w(e,t,n),this.command&&(this.command.modelMatrix=this.modelMatrix,this.command.boundingVolume=this.boundingVolume))}update(e){this.destroyed||!this.show||(this.command||this.createResources(e.context),e.passes.render&&this.command&&e.commandList.push(this.command))}isDestroyed(){return this.destroyed}destroy(){this.destroyed||(this.destroyed=!0,this.vertexArray?.destroy(),this.shaderProgram?.destroy(),this.vertexArray=void 0,this.shaderProgram=void 0,this.command=void 0)}createResources(e){let t=y.Buffer.createVertexBuffer({context:e,typedArray:this.mesh.vertices,usage:y.BufferUsage.STATIC_DRAW}),n=y.Buffer.createIndexBuffer({context:e,typedArray:this.mesh.indices,usage:y.BufferUsage.STATIC_DRAW,indexDatatype:Cesium.IndexDatatype.UNSIGNED_SHORT});this.vertexArray=new y.VertexArray({context:e,indexBuffer:n,attributes:[{index:0,vertexBuffer:t,componentsPerAttribute:3,offsetInBytes:0,strideInBytes:S},{index:1,vertexBuffer:t,componentsPerAttribute:3,offsetInBytes:12,strideInBytes:S},{index:2,vertexBuffer:t,componentsPerAttribute:2,offsetInBytes:24,strideInBytes:S}]}),this.shaderProgram=y.ShaderProgram.fromCache({context:e,vertexShaderSource:new y.ShaderSource({defines:[`CESIUM_RUNTIME`],sources:[b]}),fragmentShaderSource:new y.ShaderSource({defines:[`CESIUM_RUNTIME`],sources:[x]}),attributeLocations:{position:0,normal:1,st:2}});let r=y.RenderState.fromCache({depthTest:{enabled:!0},depthMask:!1,cull:{enabled:!1},blending:Cesium.BlendingState.ALPHA_BLEND});this.command=new y.DrawCommand({owner:this,vertexArray:this.vertexArray,shaderProgram:this.shaderProgram,renderState:r,primitiveType:Cesium.PrimitiveType.TRIANGLES,pass:y.Pass.TRANSLUCENT,count:this.mesh.indices.length,boundingVolume:this.boundingVolume,modelMatrix:this.modelMatrix})}};function w(e,t,n){let r=n??new Cesium.HeadingPitchRoll,i=Cesium.Transforms.headingPitchRollToFixedFrame(e,r,Cesium.Ellipsoid.WGS84,void 0,new Cesium.Matrix4),a=Cesium.Matrix4.fromScale(t,new Cesium.Matrix4);return Cesium.Matrix4.multiply(i,a,new Cesium.Matrix4)}var T=`// ============================================================================\r
// 实例化顶点着色器（批量全息立方体）\r
// ============================================================================\r
// 与单个立方体的差异：额外接收 5 组「逐实例」属性（instanceDivisor=1），\r
// 把同一份单位立方体网格，按每个实例的位置 / 姿态 / 缩放 / 颜色，\r
// 分别变换到各自的世界坐标，从而在【一次 draw call】里画出成千上万个立方体。\r
// ============================================================================\r
\r
in vec3 position;\r
in vec3 normal;\r
in vec2 st;\r
\r
// 逐实例属性（每个实例取一次，而非每个顶点取一次）\r
in vec3 instancePositionHigh; // 实例世界坐标的高位部分（大坐标拆分，保证精度）\r
in vec3 instancePositionLow;  // 实例世界坐标的低位部分\r
in vec4 instanceQuaternion;   // 实例姿态四元数\r
in vec3 instanceScale;        // 实例三轴缩放\r
in vec4 instanceColor;        // 实例颜色\r
\r
out vec3 v_normalEC;\r
out vec2 v_st;\r
out vec3 v_localPosition;\r
out vec4 v_color;\r
\r
// 用四元数旋转一个向量（GLSL 无内建，手动展开旋转公式）\r
vec3 rotateByQuaternion(vec3 value, vec4 quaternion) {\r
  return value + 2.0 * cross(quaternion.xyz, cross(quaternion.xyz, value) + quaternion.w * value);\r
}\r
\r
void main() {\r
  // 1) 缩放局部坐标，得到实例尺度下的局部位置\r
  vec3 localPosition = position * instanceScale;\r
\r
  // 2) 四元数旋转到世界方向\r
  vec3 worldOffset = rotateByQuaternion(localPosition, instanceQuaternion);\r
\r
  // 3) 相对眼位置平移：instancePositionHigh/Low 是同一个大坐标拆成的两段，\r
  //    czm_translateRelativeToEye 把它们合并起来并相对相机平移，避免精度丢失。\r
  vec4 positionRTE = czm_translateRelativeToEye(\r
    instancePositionHigh,\r
    instancePositionLow + worldOffset\r
  );\r
\r
  // 4) 法线：局部法线除以缩放（近似抵消非均匀缩放），归一化后旋转到世界方向，\r
  //    再用 czm_viewRotation（世界 -> 眼空间的旋转矩阵）转到眼空间。\r
  vec3 localNormal = normalize(normal / max(instanceScale, vec3(0.0001)));\r
  vec3 worldNormal = rotateByQuaternion(localNormal, instanceQuaternion);\r
  v_normalEC = normalize(czm_viewRotation * worldNormal);\r
\r
  // 5) 其余 varying：UV 原样；局部坐标用未缩放的单位立方体坐标（保证颜色\r
  //    渐变尺度一致）；颜色用实例颜色染色。\r
  v_st = st;\r
  v_localPosition = position;\r
  v_color = instanceColor;\r
\r
  // 6) 投影：相对眼 modelViewProjection，一步到位。\r
  gl_Position = czm_modelViewProjectionRelativeToEye * positionRTE;\r
}\r
`,E=8*Float32Array.BYTES_PER_ELEMENT,D=17,O=D*Float32Array.BYTES_PER_ELEMENT,k=2e3,A=Cesium.Color.fromCssColorString(`#2ac8ff`).withAlpha(.85),j=new Cesium.HeadingPitchRoll,M=new Cesium.Quaternion;function N(e){return e>=0?Math.floor(e/65536)*65536:-Math.floor(-e/65536)*65536}var P=class{show=!0;capacity;mesh=v();instanceValues;boundingVolume=new Cesium.BoundingSphere;defaultColor;instanceCount=0;instanceBuffer;vertexArray;shaderProgram;command;dataDirty=!0;destroyed=!1;constructor(e={}){this.capacity=Math.max(1,Math.floor(e.capacity??k)),this.instanceValues=new Float32Array(this.capacity*D),this.defaultColor=Cesium.Color.clone(e.color??A)}set(e){if(this.destroyed)return;if(e.length>this.capacity)throw Error(`Holographic cube data length ${e.length} exceeds capacity ${this.capacity}.`);this.instanceCount=e.length;let t=0;e.length>0&&Cesium.Cartesian3.clone(e[0].position,this.boundingVolume.center);for(let n=0;n<e.length;n+=1){let r=e[n],i=n*D,a=N(r.position.x),o=N(r.position.y),s=N(r.position.z),c=r.orientation??j;Cesium.Transforms.headingPitchRollQuaternion(r.position,c,Cesium.Ellipsoid.WGS84,void 0,M);let l=typeof r.scale==`number`?r.scale:r.scale.x,u=typeof r.scale==`number`?r.scale:r.scale.y,d=typeof r.scale==`number`?r.scale:r.scale.z,f=r.color??this.defaultColor,p=this.instanceValues;p[i+0]=a,p[i+1]=o,p[i+2]=s,p[i+3]=r.position.x-a,p[i+4]=r.position.y-o,p[i+5]=r.position.z-s,p[i+6]=M.x,p[i+7]=M.y,p[i+8]=M.z,p[i+9]=M.w,p[i+10]=l,p[i+11]=u,p[i+12]=d,p[i+13]=f.red,p[i+14]=f.green,p[i+15]=f.blue,p[i+16]=f.alpha,t=Math.max(t,Cesium.Cartesian3.distance(this.boundingVolume.center,r.position)+Math.max(l,u,d))}this.boundingVolume.radius=t,this.dataDirty=!0,this.command&&(this.command.instanceCount=this.instanceCount,this.command.boundingVolume=this.boundingVolume)}update(e){this.destroyed||!this.show||this.instanceCount===0||(this.command||this.createResources(e.context),this.dataDirty&&this.instanceBuffer&&(this.instanceBuffer.copyFromArrayView(this.instanceValues.subarray(0,this.instanceCount*D)),this.dataDirty=!1),e.passes.render&&this.command&&e.commandList.push(this.command))}isDestroyed(){return this.destroyed}destroy(){this.destroyed||(this.destroyed=!0,this.vertexArray?.destroy(),this.shaderProgram?.destroy(),this.vertexArray=void 0,this.shaderProgram=void 0,this.instanceBuffer=void 0,this.command=void 0)}createResources(e){let t=y.Buffer.createVertexBuffer({context:e,typedArray:this.mesh.vertices,usage:y.BufferUsage.STATIC_DRAW}),n=y.Buffer.createIndexBuffer({context:e,typedArray:this.mesh.indices,usage:y.BufferUsage.STATIC_DRAW,indexDatatype:Cesium.IndexDatatype.UNSIGNED_SHORT});this.instanceBuffer=y.Buffer.createVertexBuffer({context:e,sizeInBytes:this.instanceValues.byteLength,usage:y.BufferUsage.DYNAMIC_DRAW}),this.vertexArray=new y.VertexArray({context:e,indexBuffer:n,attributes:[{index:0,vertexBuffer:t,componentsPerAttribute:3,offsetInBytes:0,strideInBytes:E},{index:1,vertexBuffer:t,componentsPerAttribute:3,offsetInBytes:12,strideInBytes:E},{index:2,vertexBuffer:t,componentsPerAttribute:2,offsetInBytes:24,strideInBytes:E},{index:3,vertexBuffer:this.instanceBuffer,componentsPerAttribute:3,offsetInBytes:0,strideInBytes:O,instanceDivisor:1},{index:4,vertexBuffer:this.instanceBuffer,componentsPerAttribute:3,offsetInBytes:12,strideInBytes:O,instanceDivisor:1},{index:5,vertexBuffer:this.instanceBuffer,componentsPerAttribute:4,offsetInBytes:24,strideInBytes:O,instanceDivisor:1},{index:6,vertexBuffer:this.instanceBuffer,componentsPerAttribute:3,offsetInBytes:40,strideInBytes:O,instanceDivisor:1},{index:7,vertexBuffer:this.instanceBuffer,componentsPerAttribute:4,offsetInBytes:52,strideInBytes:O,instanceDivisor:1}]}),this.shaderProgram=y.ShaderProgram.fromCache({context:e,vertexShaderSource:new y.ShaderSource({defines:[`CESIUM_RUNTIME`],sources:[T]}),fragmentShaderSource:new y.ShaderSource({defines:[`CESIUM_RUNTIME`],sources:[x]}),attributeLocations:{position:0,normal:1,st:2,instancePositionHigh:3,instancePositionLow:4,instanceQuaternion:5,instanceScale:6,instanceColor:7}});let r=y.RenderState.fromCache({depthTest:{enabled:!0},depthMask:!1,cull:{enabled:!1},blending:Cesium.BlendingState.ALPHA_BLEND});this.command=new y.DrawCommand({owner:this,vertexArray:this.vertexArray,shaderProgram:this.shaderProgram,renderState:r,primitiveType:Cesium.PrimitiveType.TRIANGLES,pass:y.Pass.TRANSLUCENT,instanceCount:this.instanceCount,count:this.mesh.indices.length,boundingVolume:this.boundingVolume,modelMatrix:Cesium.Matrix4.IDENTITY})}},F={class:`panel`},I={class:`metrics`},L=m(l({__name:`index`,setup(l){let m=u(),v=n({size:6e5,instancedCount:400,showField:!0}),y,b,x,S=[],w,T=!1,E=Cesium.Cartesian3.fromDegrees(108.5,30,19e5),D=new Cesium.HeadingPitchRoll,O=[`#19cfff`,`#50f2b3`,`#ffd166`,`#8d9eff`,`#ff6bd6`].map(e=>Cesium.Color.fromCssColorString(e).withAlpha(.85));function k(e){let t=[],n=Math.ceil(Math.sqrt(e*1.6)),r=Math.ceil(e/n);for(let i=0;i<e;i+=1){let e=i%n,a=Math.floor(i/n),o=100+e/Math.max(n-1,1)*17,s=22+a/Math.max(r-1,1)*16,c=12e4+i%9*22e3;t.push({id:`cube-${i}`,position:Cesium.Cartesian3.fromDegrees(o,s,16e5),orientation:new Cesium.HeadingPitchRoll(i*.4,i*.23,i*.17),scale:new Cesium.Cartesian3(c,c*.8,c),color:O[i%O.length]})}return t}return t(()=>v.instancedCount,e=>{S=k(e),x?.set(S)}),t(()=>v.size,e=>{b?.setTransform(E,new Cesium.Cartesian3(e,e,e),D)}),t(()=>v.showField,e=>{x&&(x.show=e)}),f(async()=>{let e=await g();if(T||!m.value)return;y=new Cesium.Viewer(m.value,{animation:!1,timeline:!1,baseLayer:e.west,baseLayerPicker:!1,geocoder:!1,navigationHelpButton:!1,sceneModePicker:!1,fullscreenButton:!1,infoBox:!1,selectionIndicator:!1,homeButton:!1,skyBox:!1,scene3DOnly:!0,contextOptions:{requestWebgl1:!1}}),_(y),h(y,e),y.scene.backgroundColor=Cesium.Color.fromCssColorString(`#050d17`),y.scene.globe.baseColor=Cesium.Color.fromCssColorString(`#0c2335`),y.scene.globe.showWaterEffect=!1,y.scene.globe.enableLighting=!1,b=y.scene.primitives.add(new C({position:E,dimensions:new Cesium.Cartesian3(v.size,v.size,v.size),orientation:D})),x=y.scene.primitives.add(new P({capacity:2e3})),S=k(v.instancedCount),x?.set(S);let t=performance.now();w=y.scene.preRender.addEventListener(()=>{let e=(performance.now()-t)*.001;D.heading=e*.12,D.pitch=Math.sin(e*.2)*.15,b?.setTransform(E,new Cesium.Cartesian3(v.size,v.size,v.size),D);for(let e=0;e<S.length;e+=1){let t=S[e];t.orientation&&(t.orientation.heading+=.004)}x?.set(S)}),y.camera.setView({destination:Cesium.Cartesian3.fromDegrees(108.5,30,65e5),orientation:{heading:0,pitch:Cesium.Math.toRadians(-62),roll:0}})}),i(()=>{T=!0,w?.(),w=void 0,y&&b&&y.scene.primitives.contains(b)&&y.scene.primitives.remove(b),y&&x&&y.scene.primitives.contains(x)&&y.scene.primitives.remove(x),b=void 0,x=void 0,y&&!y.isDestroyed()&&y.destroy(),y=void 0}),(t,n)=>(e(),s(d,null,[a(`div`,{ref_key:`container`,ref:m,class:`cesium-container`},null,512),a(`aside`,F,[n[8]||=a(`div`,{class:`eyebrow`},`WEBGL2 · CUSTOM DRAWCOMMAND`,-1),n[9]||=a(`h2`,null,`全息立方体`,-1),n[10]||=a(`p`,null,`完全封装 Cesium 底层渲染管线，用自定义 GLSL 着色器绘制全息立方体，并演示 GPU Instancing 批量绘制。`,-1),a(`div`,I,[a(`div`,null,[a(`strong`,null,o(v.instancedCount),1),n[3]||=a(`span`,null,`实例立方体`,-1)]),a(`div`,null,[a(`strong`,null,o(v.showField?2:1),1),n[4]||=a(`span`,null,`DrawCommand`,-1)]),n[5]||=a(`div`,null,[a(`strong`,null,`1`),a(`span`,null,`共享网格`)],-1)]),a(`label`,null,[a(`span`,null,[n[6]||=c(`主体尺寸 `,-1),a(`output`,null,o(Math.round(v.size/1e3))+` km`,1)]),r(a(`input`,{"onUpdate:modelValue":n[0]||=e=>v.size=e,type:`range`,min:`100000`,max:`1000000`,step:`50000`},null,512),[[p,v.size,void 0,{number:!0}]])]),a(`label`,null,[a(`span`,null,[n[7]||=c(`实例数量 `,-1),a(`output`,null,o(v.instancedCount),1)]),r(a(`input`,{"onUpdate:modelValue":n[1]||=e=>v.instancedCount=e,type:`range`,min:`0`,max:`2000`,step:`100`},null,512),[[p,v.instancedCount,void 0,{number:!0}]])]),a(`button`,{type:`button`,onClick:n[2]||=e=>v.showField=!v.showField},o(v.showField?`隐藏实例场`:`显示实例场`),1),n[11]||=a(`div`,{class:`api`},[a(`code`,null,`new HolographicCubePrimitive(...)`),a(`span`,null,`单个立方体 · Buffer → VertexArray → ShaderProgram → DrawCommand`)],-1),n[12]||=a(`div`,{class:`api`},[a(`code`,null,`new InstancedHolographicCubePrimitive(...)`),a(`span`,null,`批量立方体 · 一次 draw call 绘制 N 个实例`)],-1)])],64))}}),[[`__scopeId`,`data-v-15a41ecc`]]);export{L as default};