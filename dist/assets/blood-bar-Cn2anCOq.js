import{E as e,F as t,G as n,R as r,T as i,a,bt as o,c as s,f as c,m as l,q as u,t as d,w as f}from"./runtime-core.esm-bundler-DkML_vOj.js";import{l as p,n as m}from"./index-X3oIGtop.js";import{n as h,r as g,t as _}from"./viewerConfig-D2DHbJkY.js";function v(){return{vertices:new Float32Array([-.5,-.5,.5,-.5,.5,.5,-.5,.5]),indices:new Uint16Array([0,1,2,0,2,3])}}var y=Cesium,b=`// ============================================================================\r
// 血条顶点着色器（广告牌式：始终面向屏幕）\r
// ============================================================================\r
// Cesium 的 ShaderSource 在编译前会替我们：注入 #version 300 es、注入 czm_*\r
// 自动 uniform 与内置函数、把 in 变量名映射到 VertexArray 的 attribute 编号。\r
// 所以这里直接用 in/out 语法，不要自己写 #version，也不要重复声明 czm_*。\r
//\r
// 「始终面向屏幕」的实现思路：不旋转网格，而是把网格放到【眼空间】里摆放。\r
// 在眼空间中，相机右方向恒为 +X、上方向恒为 +Y，因此只要把四个角沿 X/Y\r
// 偏移，矩形就天然始终正对相机——这正是 Cesium Billboard 的做法。\r
// ============================================================================\r
\r
// 逐顶点属性：单位四边形的角坐标，范围 [-0.5, 0.5]\r
in vec2 corner;\r
\r
// 逐实例属性（instanceDivisor = 1，每个实例取一次）\r
in vec3 instancePositionHigh; // 实例世界坐标高位（大坐标拆分，保证精度）\r
in vec3 instancePositionLow;  // 实例世界坐标低位\r
in vec3 instanceScale;        // 实例三轴缩放（x->宽，y->高，z 暂不使用）\r
in vec2 instanceOffset;       // 实例自身 xy 偏移（屏幕平面内，米）\r
in float instancePercent;     // 血量百分比 [0, 1]\r
in float instanceShowHeight;  // 显隐高度（相机眼高度超过则隐藏）\r
\r
// 传给片元着色器的 varying\r
out vec2 v_uv;     // 血条内部 UV（x: 0 左 -> 1 右，y: 0 下 -> 1 上）\r
out float v_percent; // 血量百分比\r
\r
// 整条血条共享的默认宽高（构造时传入，逐实例 scale 再乘到上面）\r
uniform float u_width;\r
uniform float u_height;\r
\r
void main() {\r
  // 1) 实例锚点的眼空间坐标（相对相机，避免大世界坐标的 float 精度丢失）。\r
  //    czm_translateRelativeToEye(high, low)：把拆分的高低两段合并，并相对\r
  //    相机平移，得到一个「以相机为原点、世界轴向」的小向量；\r
  //    czm_modelViewRelativeToEye：再把它旋转到眼空间（相机轴向）。\r
  vec3 anchorEC = (\r
    czm_modelViewRelativeToEye *\r
    czm_translateRelativeToEye(instancePositionHigh, instancePositionLow)\r
  ).xyz;\r
\r
  // 2) 沿眼空间的 +X（右）/ +Y（上）摆放四个角，实现广告牌效果。\r
  //    corner.x * u_width * scale.x 把角坐标从 [-0.5,0.5] 映射到实际半宽；\r
  //    instanceOffset 在屏幕平面内整体平移血条自身。\r
  vec3 offsetEC = vec3(\r
    corner.x * u_width * instanceScale.x + instanceOffset.x,\r
    corner.y * u_height * instanceScale.y + instanceOffset.y,\r
    0.0\r
  );\r
\r
  // 3) UV 与百分比交给片元着色器。corner + 0.5 把 [-0.5,0.5] 映射到 [0,1]。\r
  v_uv = corner + 0.5;\r
  v_percent = clamp(instancePercent, 0.0, 1.0);\r
\r
  // 4) 眼空间 -> 裁剪空间。\r
  vec4 clipPosition = czm_projection * vec4(anchorEC + offsetEC, 1.0);\r
\r
  // 5) 显隐：czm_eyeHeight 是相机相对椭球面的高度。超过该实例的显隐高度时，\r
  //    把整条血条的四个角都推到裁剪体之外（四个角落于同一点，三角形退化为\r
  //    零面积），从而不产生任何像素——这是 GPU Instancing 里隐藏单个实例的\r
  //    常用技巧（无法在一条 draw call 里跳过某个实例，只能让它退化）。\r
  if (czm_eyeHeight > instanceShowHeight) {\r
    clipPosition = vec4(2.0, 2.0, 2.0, 1.0);\r
  }\r
\r
  gl_Position = clipPosition;\r
}\r
`,x=`// ============================================================================\r
// 血条片元着色器：背景色 + 按百分比填充的血量颜色 + 细边框\r
// ============================================================================\r
// Cesium 检测到代码里写了 out_FragColor 后，会在 WebGL2 下自动补上\r
// \`layout(location = 0) out vec4 out_FragColor;\`，这里直接赋值即可。\r
\r
in vec2 v_uv;      // 血条内部 UV（x: 0 左 -> 1 右）\r
in float v_percent; // 血量百分比 [0, 1]\r
\r
// 整条血条共享的颜色（构造时传入）\r
uniform vec4 u_backgroundColor; // 背景颜色（未填充部分）\r
uniform vec4 u_color;           // 血量颜色（填充部分）\r
uniform float u_width;\r
uniform float u_height;\r
\r
void main() {\r
  // 1) 血量从左向右填充。小于 percent 的左侧区域为血量色，其余为背景色。\r
  //    fwidth(v_uv.x) 给出当前像素覆盖的 UV 宽度，用于软化填充边界。\r
  float aa = fwidth(v_uv.x);\r
  float fill = 1.0 - smoothstep(v_percent - aa, v_percent + aa, v_uv.x);\r
  vec3 rgb = mix(u_backgroundColor.rgb, u_color.rgb, fill);\r
  float alpha = mix(u_backgroundColor.a, u_color.a, fill);\r
\r
  // 2) 在血条实际宽高的局部空间中构造圆角矩形 SDF。直接按米计算可保持\r
  //    圆角为圆形，不会因为血条宽高比很大而在 UV 空间里被拉成椭圆。\r
  vec2 size = vec2(u_width, u_height);\r
  vec2 halfSize = size * 0.5;\r
  float radius = min(size.x, size.y) * 0.5;\r
  vec2 point = (v_uv - 0.5) * size;\r
  vec2 rounded = abs(point) - (halfSize - vec2(radius));\r
  float distanceToEdge =\r
    length(max(rounded, vec2(0.0))) +\r
    min(max(rounded.x, rounded.y), 0.0) -\r
    radius;\r
\r
  // 3) 仅对圆角外轮廓做导数抗锯齿，不额外绘制或压暗边框。\r
  float edgeAA = max(fwidth(distanceToEdge), 0.0001);\r
  float shapeMask = 1.0 - smoothstep(-edgeAA, edgeAA, distanceToEdge);\r
\r
  out_FragColor = vec4(rgb, alpha * shapeMask);\r
}\r
`,S=2*Float32Array.BYTES_PER_ELEMENT,C=13,w=C*Float32Array.BYTES_PER_ELEMENT,T=2e3,E=80,D=10,O=Cesium.Color.fromCssColorString(`#14202b`).withAlpha(.9),k=Cesium.Color.fromCssColorString(`#3dff6b`).withAlpha(.95);function A(e){return e>=0?Math.floor(e/65536)*65536:-Math.floor(-e/65536)*65536}var j=class{show=!0;capacity;width;height;backgroundColor;color;mesh=v();instanceValues;boundingVolume=new Cesium.BoundingSphere;instanceCount=0;instanceBuffer;vertexArray;shaderProgram;command;dataDirty=!0;destroyed=!1;constructor(e={}){this.capacity=Math.max(1,Math.floor(e.capacity??T)),this.width=e.width??E,this.height=e.height??D,this.backgroundColor=Cesium.Color.clone(e.backgroundColor??O),this.color=Cesium.Color.clone(e.color??k),this.instanceValues=new Float32Array(this.capacity*C)}setSize(e,t){this.destroyed||(this.width=Math.max(0,e),this.height=Math.max(0,t))}set(e){if(this.destroyed)return;if(e.length>this.capacity)throw Error(`Blood bar data length ${e.length} exceeds capacity ${this.capacity}.`);this.instanceCount=e.length;let t=0;e.length>0&&Cesium.Cartesian3.clone(e[0].position,this.boundingVolume.center);for(let n=0;n<e.length;n+=1){let r=e[n],i=n*C,a=A(r.position.x),o=A(r.position.y),s=A(r.position.z),c=typeof r.scale==`number`?r.scale:r.scale.x,l=typeof r.scale==`number`?r.scale:r.scale.y,u=typeof r.scale==`number`?r.scale:r.scale.z,d=this.instanceValues;d[i+0]=a,d[i+1]=o,d[i+2]=s,d[i+3]=r.position.x-a,d[i+4]=r.position.y-o,d[i+5]=r.position.z-s,d[i+6]=c,d[i+7]=l,d[i+8]=u,d[i+9]=r.offset.x,d[i+10]=r.offset.y,d[i+11]=r.percent,d[i+12]=r.showHeight;let f=Math.max(this.width*c,this.height*l),p=Math.hypot(r.offset.x,r.offset.y);t=Math.max(t,Cesium.Cartesian3.distance(this.boundingVolume.center,r.position)+f+p)}this.boundingVolume.radius=t,this.dataDirty=!0,this.command&&(this.command.instanceCount=this.instanceCount,this.command.boundingVolume=this.boundingVolume)}update(e){this.destroyed||!this.show||this.instanceCount===0||(this.command||this.createResources(e.context),this.dataDirty&&this.instanceBuffer&&(this.instanceBuffer.copyFromArrayView(this.instanceValues.subarray(0,this.instanceCount*C)),this.dataDirty=!1),e.passes.render&&this.command&&e.commandList.push(this.command))}isDestroyed(){return this.destroyed}destroy(){this.destroyed||(this.destroyed=!0,this.vertexArray?.destroy(),this.shaderProgram?.destroy(),this.vertexArray=void 0,this.shaderProgram=void 0,this.instanceBuffer=void 0,this.command=void 0)}createResources(e){let t=y.Buffer.createVertexBuffer({context:e,typedArray:this.mesh.vertices,usage:y.BufferUsage.STATIC_DRAW}),n=y.Buffer.createIndexBuffer({context:e,typedArray:this.mesh.indices,usage:y.BufferUsage.STATIC_DRAW,indexDatatype:Cesium.IndexDatatype.UNSIGNED_SHORT});this.instanceBuffer=y.Buffer.createVertexBuffer({context:e,sizeInBytes:this.instanceValues.byteLength,usage:y.BufferUsage.DYNAMIC_DRAW}),this.vertexArray=new y.VertexArray({context:e,indexBuffer:n,attributes:[{index:0,vertexBuffer:t,componentsPerAttribute:2,offsetInBytes:0,strideInBytes:S},{index:1,vertexBuffer:this.instanceBuffer,componentsPerAttribute:3,offsetInBytes:0,strideInBytes:w,instanceDivisor:1},{index:2,vertexBuffer:this.instanceBuffer,componentsPerAttribute:3,offsetInBytes:12,strideInBytes:w,instanceDivisor:1},{index:3,vertexBuffer:this.instanceBuffer,componentsPerAttribute:3,offsetInBytes:24,strideInBytes:w,instanceDivisor:1},{index:4,vertexBuffer:this.instanceBuffer,componentsPerAttribute:2,offsetInBytes:36,strideInBytes:w,instanceDivisor:1},{index:5,vertexBuffer:this.instanceBuffer,componentsPerAttribute:1,offsetInBytes:44,strideInBytes:w,instanceDivisor:1},{index:6,vertexBuffer:this.instanceBuffer,componentsPerAttribute:1,offsetInBytes:48,strideInBytes:w,instanceDivisor:1}]}),this.shaderProgram=y.ShaderProgram.fromCache({context:e,vertexShaderSource:new y.ShaderSource({defines:[`CESIUM_RUNTIME`],sources:[b]}),fragmentShaderSource:new y.ShaderSource({defines:[`CESIUM_RUNTIME`],sources:[x]}),attributeLocations:{corner:0,instancePositionHigh:1,instancePositionLow:2,instanceScale:3,instanceOffset:4,instancePercent:5,instanceShowHeight:6}});let r=y.RenderState.fromCache({depthTest:{enabled:!0},depthMask:!1,cull:{enabled:!1},blending:Cesium.BlendingState.ALPHA_BLEND});this.command=new y.DrawCommand({owner:this,vertexArray:this.vertexArray,shaderProgram:this.shaderProgram,renderState:r,primitiveType:Cesium.PrimitiveType.TRIANGLES,pass:y.Pass.TRANSLUCENT,instanceCount:this.instanceCount,count:this.mesh.indices.length,boundingVolume:this.boundingVolume,modelMatrix:Cesium.Matrix4.IDENTITY,uniformMap:{u_width:()=>this.width,u_height:()=>this.height,u_backgroundColor:()=>this.backgroundColor,u_color:()=>this.color}})}},M={class:`panel`},N={class:`metrics`},P=m(l({__name:`index`,setup(l){let m=u(),v=n({width:8e3,height:1200,count:200,showHeight:3e5,animate:!0}),y,b,x=[],S,C=!1,w=Cesium.Color.fromCssColorString(`#3dff6b`);function T(e){let t=[],n=Math.ceil(Math.sqrt(e*1.7)),r=Math.ceil(e/n);for(let i=0;i<e;i+=1){let e=i%n,a=Math.floor(i/n),o=108+e/Math.max(n-1,1)*2.6,s=29+a/Math.max(r-1,1)*2.4,c=.15+i*37%85/100,l=.8+i*13%7*.1;t.push({id:`bar-${i}`,position:Cesium.Cartesian3.fromDegrees(o,s,1200+i%5*260),scale:new Cesium.Cartesian3(l,l,1),offset:new Cesium.Cartesian2(0,1500),percent:c,showHeight:15e4+i*29%4*2e5})}return t}return t(()=>v.count,e=>{x=T(e),b?.set(x)}),t(()=>[v.width,v.height],([e,t])=>{b&&(b.setSize(e,t),b.set(x))}),t(()=>v.showHeight,e=>{for(let t of x)t.showHeight=e;b?.set(x)}),f(async()=>{let e=await g();if(C||!m.value)return;y=new Cesium.Viewer(m.value,{animation:!1,timeline:!1,baseLayer:e.west,baseLayerPicker:!1,geocoder:!1,navigationHelpButton:!1,sceneModePicker:!1,fullscreenButton:!1,infoBox:!1,selectionIndicator:!1,homeButton:!1,skyBox:!1,scene3DOnly:!0,contextOptions:{requestWebgl1:!1}}),_(y),h(y,e),y.scene.backgroundColor=Cesium.Color.fromCssColorString(`#050d17`),y.scene.globe.baseColor=Cesium.Color.fromCssColorString(`#0c2335`),y.scene.globe.showWaterEffect=!1,y.scene.globe.enableLighting=!1,b=y.scene.primitives.add(new j({capacity:1e3,width:v.width,height:v.height,backgroundColor:Cesium.Color.fromCssColorString(`#14202b`).withAlpha(.9),color:w})),x=T(v.count),b?.set(x);let t=performance.now();S=y.scene.preRender.addEventListener(()=>{if(!v.animate)return;let e=(performance.now()-t)*.001;for(let t=0;t<x.length;t+=1){let n=t*.37;x[t].percent=.15+.85*(.5+.5*Math.sin(e*.9+n))}b?.set(x)}),y.camera.setView({destination:Cesium.Cartesian3.fromDegrees(109.3,30.2,24e4),orientation:{heading:0,pitch:Cesium.Math.toRadians(-62),roll:0}})}),i(()=>{C=!0,S?.(),S=void 0,y&&b&&y.scene.primitives.contains(b)&&y.scene.primitives.remove(b),b=void 0,y&&!y.isDestroyed()&&y.destroy(),y=void 0}),(t,n)=>(e(),s(d,null,[a(`div`,{ref_key:`container`,ref:m,class:`cesium-container`},null,512),a(`aside`,M,[n[12]||=a(`div`,{class:`eyebrow`},`WEBGL2 · CUSTOM DRAWCOMMAND`,-1),n[13]||=a(`h2`,null,`批量血条`,-1),n[14]||=a(`p`,null,`用自定义 DrawCommand + GPU Instancing 绘制始终面向屏幕的广告牌式血条，逐实例控制位置、缩放、偏移、血量百分比与显隐高度。`,-1),a(`div`,N,[a(`div`,null,[a(`strong`,null,o(v.count),1),n[5]||=a(`span`,null,`血条实例`,-1)]),n[6]||=a(`div`,null,[a(`strong`,null,`1`),a(`span`,null,`DrawCommand`)],-1),n[7]||=a(`div`,null,[a(`strong`,null,`1`),a(`span`,null,`共享四边形网格`)],-1)]),a(`label`,null,[a(`span`,null,[n[8]||=c(`默认宽度 `,-1),a(`output`,null,o(Math.round(v.width))+` m`,1)]),r(a(`input`,{"onUpdate:modelValue":n[0]||=e=>v.width=e,type:`range`,min:`1000`,max:`16000`,step:`500`},null,512),[[p,v.width,void 0,{number:!0}]])]),a(`label`,null,[a(`span`,null,[n[9]||=c(`默认高度 `,-1),a(`output`,null,o(Math.round(v.height))+` m`,1)]),r(a(`input`,{"onUpdate:modelValue":n[1]||=e=>v.height=e,type:`range`,min:`200`,max:`2400`,step:`100`},null,512),[[p,v.height,void 0,{number:!0}]])]),a(`label`,null,[a(`span`,null,[n[10]||=c(`血条数量 `,-1),a(`output`,null,o(v.count),1)]),r(a(`input`,{"onUpdate:modelValue":n[2]||=e=>v.count=e,type:`range`,min:`0`,max:`800`,step:`20`},null,512),[[p,v.count,void 0,{number:!0}]])]),a(`label`,null,[a(`span`,null,[n[11]||=c(`显隐高度 `,-1),a(`output`,null,o(v.showHeight>=1e7?`∞`:v.showHeight+` m`),1)]),r(a(`input`,{"onUpdate:modelValue":n[3]||=e=>v.showHeight=e,type:`range`,min:`50000`,max:`10000000`,step:`50000`},null,512),[[p,v.showHeight,void 0,{number:!0}]])]),a(`button`,{type:`button`,onClick:n[4]||=e=>v.animate=!v.animate},o(v.animate?`暂停动画`:`播放动画`),1),n[15]||=a(`div`,{class:`api`},[a(`code`,null,`new BloodBarPrimitive({ width, height, backgroundColor, color })`),a(`span`,null,`构造时传入默认宽高与两种颜色，走 uniformMap 注入着色器`)],-1),n[16]||=a(`div`,{class:`api`},[a(`code`,null,`bloodBars.set(BloodBarData[])`),a(`span`,null,`position / scale(xyz) / offset(xy) / percent / showHeight`)],-1)])],64))}}),[[`__scopeId`,`data-v-abcd6f84`]]);export{P as default};