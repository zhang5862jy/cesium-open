import * as C from "cesium";
import { DEFAULT_CALLOUT_STYLE } from "../src/cesium/tools/target-callout/index.ts";
import { WorkerCalloutHandle } from "../src/cesium/tools/target-callout/workerHandle.ts";
import { WorkerCalloutRenderer } from "../src/cesium/tools/target-callout/workerRenderer.ts";
import { createLocalWorldBaseLayers, completeLocalWorldBaseLayer } from "../src/cesium/tools/localWorldImagery.ts";
import { applyDefaultViewerConfig } from "../src/cesium/tools/viewerConfig.ts";
const output = document.querySelector('#result'), results = [];
let viewer, worker;
function check(ok, message) { if (!ok) throw new Error(message); results.push('PASS ' + message); }
try {
  const base = await createLocalWorldBaseLayers();
  viewer = new C.Viewer('viewer', { baseLayer: base.west, baseLayerPicker: false, geocoder: false, animation: false, timeline: false, useDefaultRenderLoop: false });
  applyDefaultViewerConfig(viewer); completeLocalWorldBaseLayer(viewer, base);
  const origin = C.Cartesian3.fromDegrees(110,32,1800), frame = C.Transforms.eastNorthUpToFixedFrame(origin);
  viewer.camera.lookAt(origin,new C.HeadingPitchRange(0,-Math.PI/2,800000));
  viewer.camera.lookAtTransform(C.Matrix4.IDENTITY); viewer.resize(); viewer.render();
  const config = { count:1000, columns:40, frame:C.Matrix4.toArray(frame) };
  let vp = C.Matrix4.toArray(C.Matrix4.multiply(viewer.camera.frustum.projectionMatrix,viewer.camera.viewMatrix,new C.Matrix4()));
  const camera=()=>[viewer.camera.positionWC.x,viewer.camera.positionWC.y,viewer.camera.positionWC.z];
  worker=new Worker(new URL('../src/examples/primitive/target-callout/simulation.worker.ts',import.meta.url),{type:'module'});
  const offscreen=new OffscreenCanvas(1,1);
  worker.postMessage({type:'init',canvas:offscreen,style:{...DEFAULT_CALLOUT_STYLE},config},[offscreen]);
  let id=0, latest;
  async function step(seconds,patches=[],buffers) {
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('Worker timeout')),5000);
      worker.onerror=e=>{clearTimeout(timer);reject(new Error(e.message));};
      worker.onmessage=e=>{clearTimeout(timer);latest=e.data;resolve(latest);};
      worker.postMessage({type:'step',request:{id:++id,seconds,viewProjection:vp,camera:camera()},patches,
        width:viewer.canvas.clientWidth,height:viewer.canvas.clientHeight,ratio:2,...buffers},buffers?[buffers.positions.buffer,buffers.bounds.buffer]:[]);
    });
  }
  const first=await step(0);
  check(first.visible===1000,'all 1000 targets visible; no per-target Cesium objects');
  check(viewer.entities.values.length===0,'zero Entity instances');
  let maxError=0;
  for(let i=0;i<1000;i++) {
    const expected=C.Matrix4.multiplyByPoint(frame,new C.Cartesian3((i%40-19.5)*8000+1000*Math.cos(i*.7),(Math.floor(i/40)-12)*8000+700*Math.sin(i*.7),0),new C.Cartesian3());
    check(C.Cartesian3.distance(expected,C.Cartesian3.fromElements(...first.positions.slice(i*3,i*3+3)))<1e-6,`position ${i}`);
    const screen=C.SceneTransforms.worldToWindowCoordinates(viewer.scene,expected);
    maxError=Math.max(maxError,Math.hypot(screen.x-first.bounds[i*5],screen.y-first.bounds[i*5+1]));
  }
  results.splice(2,1000,'PASS 1000 Worker ECEF positions match Cesium < 1e-6m');
  check(maxError<.01,`screen projection error ${maxError.toFixed(6)} CSS px`);
  const paused=await step(0);
  check(paused.positions.every((n,i)=>n===first.positions[i]),'paused positions remain identical');
  const changed=await step(1,[{index:0,position:[origin.x,origin.y,origin.z],lines:['CUSTOM DATA'],x:-200,y:100,style:{...DEFAULT_CALLOUT_STYLE,fontSize:24,paddingLeft:30}}],{positions:first.positions,bounds:first.bounds});
  check(first.positions.byteLength===0,'transfer detaches and recycles buffers');
  check(changed.positions[0]===origin.x,'external data overrides simulated positions');
  let patch;
  const handle=new WorkerCalloutHandle(0,()=>latest,p=>patch=p);
  handle.setOffset(new C.Cartesian2(-200,100));
  const anchor=handle.getTargetScreenPosition();
  check(handle.hitTest(new C.Cartesian2(anchor.x-195,anchor.y+95)),'transparent interior hit test');
  handle.setLines(['replacement']);check(patch.lines[0]==='replacement','data update API queues text');
  const hidden=await step(1,[{index:0,show:false}]); check(hidden.bounds[4]===0,'explicit visibility update');
  viewer.camera.setView({destination:C.Cartesian3.negate(C.Cartesian3.multiplyByScalar(origin,2,new C.Cartesian3()),new C.Cartesian3()),orientation:{direction:C.Cartesian3.normalize(origin,new C.Cartesian3()),up:C.Cartesian3.UNIT_Z}});
  viewer.render();vp=C.Matrix4.toArray(C.Matrix4.multiply(viewer.camera.frustum.projectionMatrix,viewer.camera.viewMatrix,new C.Matrix4()));
  const backside=await step(1);check(backside.visible===0,'ellipsoid hides far-side targets');
  // Real Canvas2D pixels verify nearest-corner leader geometry without a GPU readback.
  const canvas=new OffscreenCanvas(500,500), renderer=new WorkerCalloutRenderer(canvas);
  const matrix=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
  const geometry=new Float32Array(5);
  for(const [x,y] of [[40,-40],[-150,-40],[-150,150],[40,150]]) {
    renderer.draw([{x,y,style:{...DEFAULT_CALLOUT_STYLE,showBorder:false,textColor:'transparent'},lines:['AB']}],new Float64Array([0,0,0]),new Uint8Array([1]),matrix,500,500,2,geometry);
    const corners=[[x,y],[x,y-geometry[3]],[x+geometry[2],y-geometry[3]],[x+geometry[2],y]];
    corners.sort((a,b)=>a[0]**2+a[1]**2-b[0]**2-b[1]**2);
    const [cx,cy]=corners[0];const pixel=canvas.getContext('2d').getImageData(Math.round((250+cx/2)*2),Math.round((250+cy/2)*2),1,1).data;
    check(pixel[0]>200&&pixel[3]>0,`nearest-corner leader ${x},${y}`);
  }
  check(canvas.width===1000&&canvas.height===1000,'DPR=2 canvas retains fixed bounded dimensions');
  output.textContent=results.join('\n')+'\nALL PASSED';
} catch(error) { output.textContent=results.join('\n')+'\nFAIL '+error.stack; }
finally {worker?.terminate();viewer?.destroy();}
