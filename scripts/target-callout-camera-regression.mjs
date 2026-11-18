import * as C from "cesium";
import { DEFAULT_CALLOUT_STYLE } from "../src/cesium/tools/target-callout/index.ts";
import { WorkerCalloutHandle } from "../src/cesium/tools/target-callout/workerHandle.ts";
import { ScreenBatchRenderer } from "../src/cesium/tools/target-callout/screenBatchRenderer.ts";
import { TargetCalloutHoverController } from "../src/cesium/tools/target-callout/hover.ts";
import { createLocalWorldBaseLayers, completeLocalWorldBaseLayer } from "../src/cesium/tools/localWorldImagery.ts";
const output=document.querySelector('#result'), results=[];
let viewer, worker, renderer;
function check(ok,message){if(!ok)throw new Error(message);results.push('PASS '+message);}
try{
  const base=await createLocalWorldBaseLayers();
  viewer=new C.Viewer('viewer',{baseLayer:base.west,baseLayerPicker:false,geocoder:false,animation:false,timeline:false});
  completeLocalWorldBaseLayer(viewer,base);
  const snapshot=()=>JSON.stringify({requestRenderMode:viewer.scene.requestRenderMode,maximumRenderTimeChange:viewer.scene.maximumRenderTimeChange,scale:viewer.resolutionScale,recommended:viewer.useBrowserRecommendedResolution,msaa:viewer.scene.msaaSamples,fxaa:viewer.scene.postProcessStages.fxaa.enabled,clock:viewer.clock.shouldAnimate,rotate:viewer.scene.screenSpaceCameraController.rotateEventTypes,tilt:viewer.scene.screenSpaceCameraController.tiltEventTypes});
  const defaults=snapshot();
  check(viewer.scene.requestRenderMode===false,'continuous rendering uses Viewer default');
  const canvas=viewer.canvas;
  renderer=new ScreenBatchRenderer(viewer.scene,1000,()=>frame,()=>handles);
  const origin=C.Cartesian3.fromDegrees(110,32,1800);
  worker=new Worker(new URL('../src/examples/primitive/target-callout/renderer.worker.ts',import.meta.url),{type:'module'});
  worker.postMessage({type:'init',config:{count:1000,columns:40,frame:C.Matrix4.toArray(C.Transforms.eastNorthUpToFixedFrame(origin))},style:{...DEFAULT_CALLOUT_STYLE}});
  let id=0, requests=0;
  async function step(patches=[],reuse){return new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(new Error('Worker timeout')),5000);
    worker.onmessage=e=>{clearTimeout(timeout);e.data.error?reject(new Error(e.data.error)):resolve(e.data)};
    worker.onerror=e=>{clearTimeout(timeout);reject(new Error(e.message))};
    requests++;
    worker.postMessage({type:'step',id:++id,seconds:0,patches,...reuse},reuse?[reuse.positions.buffer,reuse.instances.buffer]:[]);
  });}
  const patches=Array.from({length:1000},(_,index)=>({index,show:index===0}));
  patches[0]={index:0,show:true,position:[origin.x,origin.y,origin.z],lines:['目标 001','CAMERA SYNC'],style:{...DEFAULT_CALLOUT_STYLE,textColor:'transparent'}};
  const batch=await step(patches);
  const frame={positions:batch.positions,bounds:new Float32Array(5000)};
  const handles=Array.from({length:1000},(_,index)=>new WorkerCalloutHandle(index,()=>frame,()=>{}));
  renderer.update(batch,batch.enabled);
  const gl=viewer.scene.context._gl;
  function readPixel(x,y){const pixel=new Uint8Array(4);const ratio=canvas.width/viewer.canvas.clientWidth;gl.readPixels(Math.floor(x*ratio),canvas.height-1-Math.floor(y*ratio),1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);return pixel;}
  let maxError=0, pixelChecks=0, firstAnchor;
  const start=performance.now();
  for(const range of [6000,15000,80000])for(const heading of [0,.6,1.2,2.1]){
    viewer.camera.lookAt(origin,new C.HeadingPitchRange(heading,-.8,range));viewer.camera.lookAtTransform(C.Matrix4.IDENTITY);viewer.resize();viewer.render();
    handles[0].setOffset(new C.Cartesian2(40,-40));
    viewer.render();
    const screen=C.SceneTransforms.worldToWindowCoordinates(viewer.scene,origin);
    maxError=Math.max(maxError,Math.hypot(screen.x-frame.bounds[0],screen.y-frame.bounds[1]));
    const pixel=readPixel(screen.x+40+frame.bounds[2]/2,screen.y-41);
    if(pixel[0]>200&&pixel[3]>0)pixelChecks++;
    firstAnchor=screen;
  }
  // Actual panning: change target framing without returning to Worker.
  viewer.camera.moveRight(1000);viewer.render();viewer.render();
  const moved=C.SceneTransforms.worldToWindowCoordinates(viewer.scene,origin);
  maxError=Math.max(maxError,Math.hypot(moved.x-frame.bounds[0],moved.y-frame.bounds[1]));
  check(C.Cartesian2.distance(moved,firstAnchor)>1,'camera move changes screen anchor without data response');
  check(maxError<.01,`12 camera poses + pan have same-frame error ${maxError.toFixed(6)} CSS px`);
  check(pixelChecks===12,'GPU border pixels match current camera in all poses');
  for(const [x,y] of [[40,-40],[-200,-40],[-200,150],[40,150]]){
    handles[0].setOffset(new C.Cartesian2(x,y));viewer.render();
    const w=frame.bounds[2],h=frame.bounds[3];
    const corners=[[x,y],[x,y-h],[x+w,y-h],[x+w,y]].sort((a,b)=>a[0]**2+a[1]**2-b[0]**2-b[1]**2);
    const [cx,cy]=corners[0];const pixel=readPixel(moved.x+cx/2,moved.y+cy/2);
    check(pixel[0]>200&&pixel[3]>0,`GPU nearest corner follows drag ${x},${y} without Worker`);
  }
  const handle=handles[0];
  handle.setOffset(new C.Cartesian2(-frame.bounds[2]/2,frame.bounds[3]/2));viewer.render();
  const insideLine=readPixel(frame.bounds[0]-frame.bounds[2]/4,frame.bounds[1]+frame.bounds[3]/4);
  check(insideLine[0]>200&&insideLine[1]<50,'complete leader remains visible underneath a transparent panel');
  handle.setOffset(new C.Cartesian2(40,150));viewer.render();
  const panelPosition=()=>{const o=handle.getOffset();return new C.Cartesian2(frame.bounds[0]+o.x,frame.bounds[1]+o.y);};
  const pinned=panelPosition(), size=[frame.bounds[2],frame.bounds[3]];
  check(handle.setScreenFixed(true)&&!handles[1].isScreenFixed(),'pin affects only selected callout');
  viewer.camera.moveRight(500);viewer.camera.moveBackward(1000);viewer.render();viewer.render();
  check(C.Cartesian2.distance(pinned,panelPosition())<.01,'pinned panel stays at CSS position through camera pan and zoom');
  frame.positions[0]+=100;frame.positions[1]+=200;
  viewer.render();
  check(C.Cartesian2.distance(pinned,panelPosition())<.01&&frame.bounds[2]===size[0]&&frame.bounds[3]===size[1],'moving target preserves pinned position and size');
  const pinnedPixel=readPixel(pinned.x+size[0]/2,pinned.y-1);
  check(pinnedPixel[0]>200&&pinnedPixel[3]>0,'GPU draws border at pinned position');
  const offset=handle.getOffset();handle.setOffset(new C.Cartesian2(offset.x+20,offset.y+10));
  viewer.render();
  const dragged=panelPosition();
  check(C.Cartesian2.distance(dragged,new C.Cartesian2(pinned.x+20,pinned.y+10))<.01&&handle.isScreenFixed(),'drag repositions panel without clearing pin');
  handle.setScreenFixed(false);const released=handle.getOffset();
  check(C.Cartesian2.distance(dragged,panelPosition())<.01,'unpin has no position jump');
  viewer.camera.moveRight(500);viewer.render();viewer.render();
  check(C.Cartesian2.equals(released,handle.getOffset())&&C.Cartesian2.distance(dragged,panelPosition())>1,'unpin resumes following using current offset');
  check(requests===1,`all camera/drag/pin checks ran after one Worker update (${Math.round(performance.now()-start)}ms)`);
  check(snapshot()===defaults,'renderer leaves resolution, MSAA, FXAA, clock and camera mapping at default');
  check(viewer.container.querySelectorAll('canvas').length===1,'callouts use Cesium canvas and context, with no overlay canvas');
  const boundsForDepth=handle.getScreenBounds();
  const testX=boundsForDepth.left+boundsForDepth.width/2,testY=boundsForDepth.top+boundsForDepth.height-1;
  function occluder(depthDelta){
    const target=handle.getPosition(),eye=C.Matrix4.multiplyByPoint(viewer.camera.viewMatrix,target,new C.Cartesian3());
    const distance=-eye.z+depthDelta,vertices=[];
    for(const [dx,dy] of [[-12,-12],[12,-12],[12,12],[-12,12]]){
      const ray=viewer.camera.getPickRay(new C.Cartesian2(testX+dx,testY+dy));
      const t=distance/C.Cartesian3.dot(ray.direction,viewer.camera.directionWC);
      const point=C.Ray.getPoint(ray,t,new C.Cartesian3());vertices.push(point.x,point.y,point.z);
    }
    const geometry=new C.Geometry({attributes:{position:new C.GeometryAttribute({componentDatatype:C.ComponentDatatype.DOUBLE,componentsPerAttribute:3,values:new Float64Array(vertices)})},indices:new Uint16Array([0,1,2,0,2,3]),primitiveType:C.PrimitiveType.TRIANGLES,boundingSphere:C.BoundingSphere.fromVertices(vertices)});
    return viewer.scene.primitives.add(new C.Primitive({geometryInstances:new C.GeometryInstance({geometry,attributes:{color:C.ColorGeometryInstanceAttribute.fromColor(C.Color.CYAN)}}),appearance:new C.PerInstanceColorAppearance({flat:true,translucent:false,renderState:{depthTest:{enabled:true},cull:{enabled:false}}}),asynchronous:false}));
  }
  const logDepth=viewer.scene.logarithmicDepthBuffer;
  for(const mode of [true,false]){
    viewer.scene.logarithmicDepthBuffer=mode;
    const front=occluder(-1000);viewer.render();
    const frontPixel=readPixel(testX,testY);
    check(frontPixel[0]<80&&frontPixel[1]>150&&frontPixel[2]>150,`near opaque geometry covers callout (log depth ${mode}): ${frontPixel}`);
    viewer.scene.primitives.remove(front);
    const back=occluder(1000);viewer.render();
    const backPixel=readPixel(testX,testY);
    check(backPixel[0]>180&&backPixel[1]<100,`callout covers farther geometry (log depth ${mode}): ${backPixel}`);
    viewer.scene.primitives.remove(back);
  }
  viewer.scene.logarithmicDepthBuffer=logDepth;viewer.render();
  const hover=new TargetCalloutHoverController(viewer.container,viewer.canvas,()=>handles);
  const events=[];
  for(const type of ['mouseenter','mousemove','mouseleave','close','fixedchange'])hover.on(type,event=>events.push(event));
  const bounds=handle.getScreenBounds(),rect=viewer.canvas.getBoundingClientRect();
  const dragPosition=new C.Cartesian2(bounds.left,bounds.top+bounds.height);
  handle.setDragScreenPosition(dragPosition);
  let dragError=0;
  for(let i=0;i<60;i++){
    frame.positions[0]+=2;frame.positions[1]+=3;
    viewer.render();
    dragError=Math.max(dragError,C.Cartesian2.distance(dragPosition,panelPosition()));
  }
  check(dragError<.01,`stationary pointer holds panel through 60 target updates (${dragError.toFixed(6)} px)`);
  handle.setDragScreenPosition(undefined);
  check(!handle.isScreenFixed()&&C.Cartesian2.distance(dragPosition,panelPosition())<.01,'drag release preserves offset without changing pin state');
  viewer.canvas.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:rect.left+bounds.left+10,clientY:rect.top+bounds.top+10}));
  check(hover.element.style.display==='flex'&&events.some(e=>e.type==='mouseenter'&&e.callout===handle&&e.properties.index===0),'hover exposes instance and property snapshot');
  // Container capture still receives the event; prevent synthetic events reaching Cesium's native pointer capture.
  const stopDown=e=>e.stopImmediatePropagation();
  viewer.canvas.addEventListener('pointerdown',stopDown,true);
  viewer.canvas.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));
  viewer.canvas.removeEventListener('pointerdown',stopDown,true);
  const stopUp=e=>e.stopImmediatePropagation();
  viewer.canvas.addEventListener('pointerup',stopUp,true);
  viewer.canvas.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}));
  viewer.canvas.removeEventListener('pointerup',stopUp,true);
  check(hover.element.style.display==='flex','hover resumes on release even when drag stops pointerup propagation');
  hover.element.querySelector('button').click();
  check(handle.isScreenFixed()&&events.some(e=>e.type==='fixedchange'),'toolbar pin emits fixedchange');
  hover.element.querySelector('[aria-label="关闭当前标牌"]').click();
  check(!handle.getShow()&&!handle.hitTest(new C.Cartesian2(bounds.left+10,bounds.top+10))&&events.some(e=>e.type==='close'&&!e.properties.show),'close hides immediately and emits properties');
  check(hover.element.style.display==='none','toolbar disappears on close');
  const before=events.length;hover.destroy();
  viewer.canvas.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:rect.left+bounds.left+10,clientY:rect.top+bounds.top+10}));
  check(events.length===before&&!viewer.container.querySelector('.target-callout-actions'),'hover teardown removes toolbar and listeners');
  const second=await step([{index:0,lines:['目标 001','CAMERA SYNC']}],{positions:batch.positions,instances:batch.instances});
  check(batch.positions.byteLength===0&&batch.instances.byteLength===0,'both large buffers transferred back for reuse');
  check(!second.atlas,'unchanged glyph set reuses GPU atlas');
  second.atlas?.close();
  handle.setShow(true);handle.setScreenFixed(false);handle.setOffset(new C.Cartesian2(20,-20));
  for(const fontSize of [12,14,24,48]){
    const textBatch=await step([{index:0,show:true,style:{...DEFAULT_CALLOUT_STYLE,fontSize,textColor:'#ff0000',showBorder:false,showLeader:false}}]);
    frame.positions=textBatch.positions;renderer.update(textBatch,textBatch.enabled);viewer.render();
    const bounds=handle.getScreenBounds();
    const pixels=new Uint8Array(canvas.width*canvas.height*4);
    gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    const ratio=canvas.width/viewer.canvas.clientWidth;
    let core=0,edge=0;
    const coreIndices=[];
    for(let y=Math.ceil(bounds.top);y<Math.floor(bounds.top+bounds.height);y++)for(let x=Math.ceil(bounds.left);x<Math.floor(bounds.left+bounds.width);x++){
      const index=((canvas.height-1-Math.floor(y*ratio))*canvas.width+Math.floor(x*ratio))*4;
      const pixel=pixels.subarray(index,index+4);
      if(pixel[0]>230&&pixel[1]<25){core++;if(pixel[0]>=253&&pixel[1]<=1)coreIndices.push(index);}
      else if(pixel[0]>160&&pixel[1]<80)edge++;
    }
    check(core>40&&core>edge*2,`SDF Chinese/Latin ${fontSize}px has solid strokes: ${core} core / ${edge} edge pixels`);
    if(fontSize===14){
      const filled=await step([{index:0,style:{...DEFAULT_CALLOUT_STYLE,fontSize,textColor:'#ff0000',backgroundColor:'#0000ff',showBorder:false,showLeader:false}}]);
      frame.positions=filled.positions;renderer.update(filled,filled.enabled);viewer.render();
      gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
      const retained=coreIndices.filter(i=>pixels[i]>230&&pixels[i+1]<25&&pixels[i+2]<25).length;
      check(coreIndices.length>40&&retained>coreIndices.length*.95,`opaque glyph cores retain color over blue background: ${retained}/${coreIndices.length}`);
    }
  }
  for(const alpha of [0,.5,1]){
    const layered=await step([{index:0,lines:[' '],style:{...DEFAULT_CALLOUT_STYLE,textColor:'transparent',leaderColor:'#ff0000',borderColor:'#00ff00',backgroundColor:`rgba(0,0,255,${alpha})`}}]);
    frame.positions=layered.positions;renderer.update(layered,layered.enabled);viewer.render();
    handle.setOffset(new C.Cartesian2(-frame.bounds[2]/2,frame.bounds[3]/2));viewer.render();
    const pixel=readPixel(frame.bounds[0]-frame.bounds[2]/4,frame.bounds[1]+frame.bounds[3]/4);
    check(Math.abs(pixel[0]-255*(1-alpha))<8&&Math.abs(pixel[2]-255*alpha)<8,`panel source-over complete red leader at alpha ${alpha}: ${pixel}`);
  }
  renderer.destroy();renderer=undefined;
  check(snapshot()===defaults,'teardown leaves Viewer defaults intact');
  output.textContent=results.join('\n')+'\nALL PASSED';
}catch(error){output.textContent=results.join('\n')+'\nFAIL '+error.message+'\n'+error.stack;}
finally{worker?.terminate();renderer?.destroy();viewer?.destroy();}
