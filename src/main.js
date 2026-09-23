import * as THREE from 'three';
import {buildWorld,walkHeight,waterBlocked} from './world.js';
import {canStand} from './geometry.js';
import {spawn,p,views,buildings,cathedral,roads,riverTraces} from './layout.js';
const $=id=>document.getElementById(id);
const params=new URLSearchParams(location.search),review=params.has('review');
let renderer,scene,camera,rig,world,session=null,started=false,moveSpeed=2.4,turnSpeed=65*Math.PI/180,yaw=0,pitch=0;
let previousTime=0,elapsed=0,mapOpen=false,frames=0,frameTime=0,testWalk=0;
const keys=new Set(),touchMove={x:0,y:0},direction=new THREE.Vector3(),head=new THREE.Vector3(),afterTurn=new THREE.Vector3();
const coarse=matchMedia('(pointer:coarse)').matches;
let cameraMode='ground',overheadCamera,lights=[],previousA=false;
function showError(e){$('error').hidden=false;$('error').textContent='The town could not finish loading: '+(e.message||e)+'. Reload the page to try again.';console.error(e);}
addEventListener('error',e=>showError(e.error||e.message));
addEventListener('unhandledrejection',e=>showError(e.reason));
function sky(){
 const g=new THREE.SphereGeometry(300,32,16);
 const m=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:{},vertexShader:'varying vec3 vWorld; void main(){vWorld=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_Position.z=gl_Position.w;}',
 fragmentShader:'varying vec3 vWorld; float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}void main(){vec3 d=normalize(vWorld);float h=max(d.y,0.);vec3 c=mix(vec3(.19,.235,.25),vec3(.065,.092,.13),pow(h,.48));vec2 uv=d.xz/(max(d.y,.07)+.4)*2.2;float f=noise(uv)*.53+noise(uv*2.)*.25+noise(uv*4.)*.125+noise(uv*8.)*.06;c+=vec3(.07,.064,.057)*(smoothstep(.38,.76,f)-.4);gl_FragColor=vec4(c,1.);}'});
 scene.add(new THREE.Mesh(g,m));
}
function init(){
 renderer=new THREE.WebGLRenderer({canvas:$('world'),antialias:true,alpha:false,powerPreference:'high-performance'});
 renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.setSize(innerWidth,innerHeight);
 renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
 renderer.xr.enabled=true;renderer.xr.setReferenceSpaceType('local-floor');renderer.xr.setFramebufferScaleFactor(1);renderer.xr.setFoveation(.6);
 renderer.shadowMap.enabled=false;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;
 scene=new THREE.Scene();scene.fog=new THREE.Fog(0x38444a,36,142);sky();
 scene.add(new THREE.HemisphereLight(0xb2c3de,0x49412e,1.55));
 const moon=new THREE.DirectionalLight(0xb4c8ed,2.1);moon.position.set(-45,70,22);moon.castShadow=true;moon.shadow.mapSize.set(2048,2048);Object.assign(moon.shadow.camera,{left:-80,right:80,top:80,bottom:-80,near:1,far:160});moon.shadow.bias=-.0003;moon.shadow.normalBias=.035;scene.add(moon);
 camera=new THREE.PerspectiveCamera(72,innerWidth/innerHeight,.07,190);camera.rotation.order='YXZ';camera.position.y=1.68;
 rig=new THREE.Group();scene.add(rig);rig.add(camera);rig.position.set(spawn.x,0,spawn.z);
 world=buildWorld(scene);
 for(let i=0;i<2;i++){const l=new THREE.PointLight(0xff9c46,13,8,2);scene.add(l);lights.push(l);}
 const aspect=innerWidth/innerHeight;overheadCamera=new THREE.OrthographicCamera(-118*aspect,118*aspect,118,-118,.1,600);overheadCamera.position.set(135,170,135);overheadCamera.lookAt(0,0,0);
 setView('square');setupControls();
 $('loading').hidden=true;$('welcome').hidden=false;
 if(review){$('review').hidden=false;$('review-view').value=params.get('view')||'square';setView($('review-view').value);enterScreen();}
 renderer.setAnimationLoop(frame);probeVR();
}
function setView(id){
 if(id==='overhead'){cameraMode='overhead';scene.fog=null;return;}cameraMode='ground';scene.fog=new THREE.Fog(0x38444a,36,142);
 const view=views[id]||views.square,at=p(...view.at),target=p(...view.look);
 rig.position.set(at.x,walkHeight(at.x,at.z),at.z);yaw=Math.atan2(at.x-target.x,at.z-target.z);pitch=id==='cathedral'?.22:0;
 rig.rotation.y=yaw;camera.rotation.set(pitch,0,0);camera.position.set(0,1.68,0);
}
function enterScreen(){started=true;$('welcome').hidden=true;$('hud').hidden=false;$('hint').hidden=review;$('touch-pad').hidden=!coarse||review;}
async function probeVR(){
 const button=$('enter-vr');
 if(!isSecureContext){button.textContent='VR needs HTTPS';$('vr-note').textContent='Open the HTTPS version in Meta Quest Browser for VR.';return;}
 if(!navigator.xr){button.textContent='Enter VR on Quest';return;}
 try{const supported=await navigator.xr.isSessionSupported('immersive-vr');button.disabled=!supported;button.textContent=supported?'Enter VR':'Enter VR on Quest';if(supported)$('vr-note').textContent='Quest ready. Standing or room-scale play.';}
 catch(e){button.textContent='VR unavailable';$('vr-note').textContent=e.message;}
}
async function enterVR(){
 if(session)return;
 try{
  session=await navigator.xr.requestSession('immersive-vr',{requiredFeatures:['local-floor'],optionalFeatures:['bounded-floor']});
  const active=session;active.addEventListener('end',()=>{session=null;camera.position.set(0,1.68,0);camera.rotation.set(0,0,0);$('welcome').hidden=false;$('hud').hidden=true;started=false;previousA=false;});
  cameraMode='ground';pitch=0;camera.position.set(0,0,0);camera.rotation.set(0,0,0);rig.position.y=walkHeight(rig.position.x,rig.position.z);
  $('welcome').hidden=true;$('hud').hidden=true;$('hint').hidden=true;$('touch-pad').hidden=true;$('settings').hidden=true;$('map-panel').hidden=true;mapOpen=false;started=true;
  await renderer.xr.setSession(active);
  if(active.updateTargetFrameRate&&active.supportedFrameRates?.includes(90))try{await active.updateTargetFrameRate(90);}catch{}
 }catch(e){session=null;$('welcome').hidden=false;$('vr-note').textContent='Could not enter VR: '+e.message;}
}
function positionAllowed(x,z){return canStand(x,z,world.colliders)&&!waterBlocked(x,z);}
function move(dx,dz){
 const n=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.12));
 for(let i=0;i<n;i++){
  const current=renderer.xr.isPresenting?renderer.xr.getCamera(camera).getWorldPosition(head):rig.getWorldPosition(head);
  const mx=positionAllowed(current.x+dx/n,current.z)?dx/n:0;
  rig.position.x+=mx;
  if(positionAllowed(current.x+mx,current.z+dz/n))rig.position.z+=dz/n;
 }
 rig.position.y=walkHeight(rig.position.x,rig.position.z);
}
function deadzone(v){const a=Math.abs(v);return a<.16?0:Math.sign(v)*(a-.16)/.84;}
function xrInput(dt){
 let forward=0,strafe=0,turn=0,sprint=false,aPressed=false;
 for(const input of session.inputSources){
  const gp=input.gamepad;if(!gp)continue;const ax=gp.axes.length>=4?2:0;
  if(input.handedness==='left'){strafe=deadzone(gp.axes[ax]||0);forward=-deadzone(gp.axes[ax+1]||0);sprint=!!gp.buttons[3]?.pressed;}
  if(input.handedness==='right'){turn=deadzone(gp.axes[ax]||0);aPressed=!!gp.buttons[4]?.pressed;}
 }
 const xrCam=renderer.xr.getCamera(camera);
 if(turn){xrCam.getWorldPosition(head);rig.rotation.y-=turn*turnSpeed*dt;rig.updateMatrixWorld(true);xrCam.getWorldPosition(afterTurn);rig.position.x+=head.x-afterTurn.x;rig.position.z+=head.z-afterTurn.z;}
 xrCam.getWorldDirection(direction);direction.y=0;direction.normalize();
 const length=Math.max(1,Math.hypot(strafe,forward)),speed=(sprint?4:moveSpeed)*dt/length;
 move((direction.x*forward-direction.z*strafe)*speed,(direction.z*forward+direction.x*strafe)*speed);
 if(aPressed&&!previousA){rig.position.set(spawn.x,0,spawn.z);rig.rotation.y=0;}previousA=aPressed;
}
function frame(ms){
 const dt=Math.min((ms-previousTime)/1000||.016,.045);previousTime=ms;elapsed+=dt;
 if(renderer.xr.isPresenting&&session)xrInput(dt);
 else if(started&&cameraMode==='ground'&&$('settings').hidden&&!mapOpen){
  let f=(keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0)-touchMove.y;
  const s=(keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0)+touchMove.x;
  if(testWalk>0){testWalk-=dt;f=1;}
  if(keys.has('ArrowLeft'))yaw+=turnSpeed*dt;if(keys.has('ArrowRight'))yaw-=turnSpeed*dt;
  rig.rotation.y=yaw;camera.rotation.x=pitch;
  const speed=(keys.has('ShiftLeft')?4.2:moveSpeed)*dt/Math.max(1,Math.hypot(f,s));
  move((-Math.sin(yaw)*f+Math.cos(yaw)*s)*speed,(-Math.cos(yaw)*f-Math.sin(yaw)*s)*speed);
 }
 const fireSources=world.markers.filter(m=>m.kind==='light'||m.kind==='fire').sort((a,b)=>(a.x-rig.position.x)**2+(a.z-rig.position.z)**2-(b.x-rig.position.x)**2-(b.z-rig.position.z)**2);
 for(let i=0;i<lights.length;i++){const m=fireSources[i];if(m){lights[i].position.set(m.x,m.y,m.z);lights[i].intensity=(m.kind==='fire'?30:12)*(1+Math.sin(elapsed*5.7+i)*.035);}}
 const shader=world.materials.water.userData.shader;if(shader)shader.uniforms.uTime.value=elapsed;
 renderer.render(scene,cameraMode==='overhead'?overheadCamera:camera);
 frames++;frameTime+=dt;
 if(frames%20===0){
  const info=renderer.info.render,text=Math.round(frames/frameTime)+' fps · '+info.calls+' draws · '+Math.round(info.triangles/1000)+'k tris';
  $('stats').textContent=text+'\n'+rig.position.x.toFixed(1)+', '+rig.position.z.toFixed(1);
  if(review)$('review-status').textContent=text+' | '+rig.position.x.toFixed(1)+', '+rig.position.z.toFixed(1);
  if(mapOpen)drawMap();updateLocation();
 }
 if(frameTime>2){frames=0;frameTime=0;}
}
function updateLocation(){
 let label='TRISTRAM',best=14;
 for(const b of buildings){const pos=p(...b.at),d=Math.hypot(pos.x-rig.position.x,pos.z-rig.position.z);if(d<best){label=b.name.toUpperCase();best=d;}}
 const cat=p(...cathedral.at);if(Math.hypot(rig.position.x-cat.x,rig.position.z-cat.z)<26)label='THE CATHEDRAL';$('location').textContent=label;
}
function drawMap(){
 const c=$('town-map').getContext('2d'),S=520,to=v=>260+v*3.0;
 c.fillStyle='#1b2628';c.fillRect(0,0,S,S);c.strokeStyle='#82877433';c.strokeRect(20,20,480,480);
 for(const trace of riverTraces){c.strokeStyle='#658a9780';c.lineWidth=4;c.beginPath();trace.forEach((a,i)=>{const q=p(...a);i?c.lineTo(to(q.x),to(q.z)):c.moveTo(to(q.x),to(q.z));});c.stroke();}
 for(const road of roads){c.strokeStyle='#99896b70';c.lineWidth=3;c.beginPath();road.points.forEach((a,i)=>{const q=p(...a);i?c.lineTo(to(q.x),to(q.z)):c.moveTo(to(q.x),to(q.z));});c.stroke();}
 c.fillStyle='#b8a17c';
 for(const b of [...buildings,{...cathedral,name:'Cathedral'}]){const q=p(...b.at);c.save();c.translate(to(q.x),to(q.z));c.rotate(-(b.angle||0));c.fillRect(-b.w*1.5,-b.d*1.5,b.w*3,b.d*3);c.restore();}
 c.font='11px Georgia';c.textAlign='center';c.fillStyle='#d5cdb9';
 for(const [text,coord,ox,oy] of [['Cathedral',cathedral.at,0,-39],['Tavern',buildings[0].at,-10,-25],['Smithy',buildings[1].at,26,0],['Adria',buildings[8].at,0,-18],['Well',[687,532],-15,12]]){const q=p(...coord);c.fillText(text,to(q.x)+ox,to(q.z)+oy);}
 c.save();c.translate(to(rig.position.x),to(rig.position.z));c.rotate(-rig.rotation.y);c.fillStyle='#f0d596';c.beginPath();c.moveTo(0,-8);c.lineTo(-4,5);c.lineTo(4,5);c.closePath();c.fill();c.restore();
}
function toggleMap(){mapOpen=!mapOpen;$('map-panel').hidden=!mapOpen;if(mapOpen)drawMap();}
function setupControls(){
 $('explore').onclick=enterScreen;$('enter-vr').onclick=enterVR;
 $('menu-toggle').onclick=()=>{started=false;$('welcome').hidden=false;$('hud').hidden=true;$('hint').hidden=true;$('touch-pad').hidden=true;};
 $('settings-toggle').onclick=()=>{$('settings').hidden=!$('settings').hidden;};$('settings-close').onclick=()=>{$('settings').hidden=true;};
 $('map-toggle').onclick=toggleMap;$('map-close').onclick=toggleMap;
 for(const [id,callback] of [['move-speed',v=>{moveSpeed=+v;$('move-label').textContent=(+v).toFixed(1)+' m/s';}],['turn-speed',v=>{turnSpeed=+v*Math.PI/180;$('turn-label').textContent=v+'°/s';}],['brightness',v=>{renderer.toneMappingExposure=+v;$('brightness-label').textContent=Math.round(v*100)+'%';}]])$(id).oninput=e=>callback(e.target.value);
 $('quality').onchange=e=>{const high=e.target.value==='high';renderer.shadowMap.enabled=high;renderer.shadowMap.needsUpdate=true;renderer.setPixelRatio(Math.min(devicePixelRatio,high?2:1.6));};
 $('stats-toggle').onchange=e=>{$('stats').hidden=!e.target.checked;};
 addEventListener('keydown',e=>{if(['INPUT','SELECT'].includes(document.activeElement.tagName))return;keys.add(e.code);if(e.code==='KeyM'&&!e.repeat)toggleMap();if(e.code==='Escape'){$('settings').hidden=true;$('map-panel').hidden=true;mapOpen=false;}if(e.code.startsWith('Arrow'))e.preventDefault();});
 addEventListener('keyup',e=>keys.delete(e.code));addEventListener('blur',()=>{keys.clear();touchMove.x=touchMove.y=0;});
 let lookId=null,lastX=0,lastY=0;
 $('world').addEventListener('pointerdown',e=>{if(!started)return;lookId=e.pointerId;lastX=e.clientX;lastY=e.clientY;$('world').setPointerCapture(e.pointerId);});
 $('world').addEventListener('pointermove',e=>{if(lookId!==e.pointerId)return;yaw-=(e.clientX-lastX)*.003;pitch=THREE.MathUtils.clamp(pitch-(e.clientY-lastY)*.003,-1.35,1.35);lastX=e.clientX;lastY=e.clientY;});
 $('world').addEventListener('pointerup',()=>lookId=null);$('world').addEventListener('pointercancel',()=>lookId=null);
 let moveId=null;const pad=$('touch-pad'),knob=$('touch-knob');
 const joystick=e=>{const r=pad.getBoundingClientRect(),dx=e.clientX-r.left-r.width/2,dy=e.clientY-r.top-r.height/2,len=Math.max(40,Math.hypot(dx,dy));touchMove.x=dx/len;touchMove.y=dy/len;knob.style.transform='translate('+touchMove.x*35+'px,'+touchMove.y*35+'px)';};
 pad.addEventListener('pointerdown',e=>{moveId=e.pointerId;pad.setPointerCapture(e.pointerId);joystick(e);});pad.addEventListener('pointermove',e=>{if(e.pointerId===moveId)joystick(e);});
 for(const name of ['pointerup','pointercancel'])pad.addEventListener(name,()=>{moveId=null;touchMove.x=touchMove.y=0;knob.style.transform='';});
 addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);const ar=innerWidth/innerHeight;overheadCamera.left=-118*ar;overheadCamera.right=118*ar;overheadCamera.updateProjectionMatrix();});
 $('review-view').onchange=e=>{setView(e.target.value);};$('review-walk').onclick=()=>testWalk=3;
 $('review-collision').onclick=()=>{const problems=[];for(const spec of [...buildings,{...cathedral,id:'cathedral'}]){const q=p(...spec.at);if(positionAllowed(q.x,q.z))problems.push(spec.id+' has no collision');}if(!positionAllowed(spawn.x,spawn.z))problems.push('spawn obstructed');$('review-collision').textContent=problems.length?problems.join(', '):'Collision checks passed';};
}
requestAnimationFrame(()=>setTimeout(()=>{try{init();}catch(e){showError(e);}},40));
