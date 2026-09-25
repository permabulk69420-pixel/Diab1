import * as THREE from 'three';
import {createVRHands} from './hands.js';
import {createMagicBlast} from './magic/magic-blast.js';
import {createAreaHitTest} from './magic/area-hit.js';
import {buildWorld,walkHeight,waterBlocked} from './world.js';
import {canStand} from './geometry.js';
import {spawn,p,views,buildings,cathedral,roads,riverTraces} from './layout.js';
import {createDungeonArea} from './dungeon/area.js';
import {MAX_LEVEL} from './dungeon/generate.js';
const $=id=>document.getElementById(id);
const params=new URLSearchParams(location.search),review=params.has('review');
let magic,renderer,scene,townScene,camera,rig,hands,world,area,townArea,dungeonArea=null,fader,lantern,vrMap,vrMapTex,transition=null,session=null,started=false,moveSpeed=2.4,turnSpeed=65*Math.PI/180,yaw=0,pitch=0;
let previousTime=0,elapsed=0,mapOpen=false,frames=0,frameTime=0,testWalk=0;
const keys=new Set(),touchMove={x:0,y:0},direction=new THREE.Vector3(),head=new THREE.Vector3(),afterTurn=new THREE.Vector3();
const vrVelocity=new THREE.Vector3(),vrTarget=new THREE.Vector3(),vrForward=new THREE.Vector3(),vrRight=new THREE.Vector3(),worldUp=new THREE.Vector3(0,1,0);
const coarse=matchMedia('(pointer:coarse)').matches;
let cameraMode='ground',overheadCamera,lights=[],previousA=false,sprintActive=false,sprintButtonDown=false,mapHeld=false;
const runSeed=(+params.get('seed')>>>0)||((Math.random()*2**31)>>>0);
function showError(e){$('error').hidden=false;$('error').textContent='The town could not finish loading: '+(e.message||e)+'. Reload the page to try again.';console.error(e);}
addEventListener('error',e=>showError(e.error||e.message));
addEventListener('unhandledrejection',e=>showError(e.reason));
function sky(){
 const g=new THREE.SphereGeometry(300,48,24);
 const m=new THREE.ShaderMaterial({
  side:THREE.BackSide,
  depthWrite:false,
  vertexShader:'varying vec3 vDir; void main(){vDir=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_Position.z=gl_Position.w;}',
  fragmentShader:'varying vec3 vDir; void main(){vec3 d=normalize(vDir);float h=clamp(d.y*.5+.5,0.,1.);vec3 horizon=vec3(.17,.205,.215);vec3 zenith=vec3(.038,.055,.078);vec3 c=mix(horizon,zenith,smoothstep(.18,.9,h));float band1=sin(d.x*5.1+d.z*3.7+d.y*1.4);float band2=sin(d.x*8.3-d.z*4.6+d.y*2.1+1.7);float band3=sin((d.x+d.z)*11.2-d.y*3.3+.8);float cloud=band1*.50+band2*.30+band3*.20;cloud=smoothstep(.22,.82,cloud*.5+.5);float cloudMask=(1.-smoothstep(.62,.98,h))*smoothstep(.03,.34,h);c+=vec3(.055,.058,.056)*cloud*cloudMask;c-=vec3(.018,.020,.022)*(1.-cloud)*cloudMask;float glow=pow(max(dot(d,normalize(vec3(-.42,.72,.25))),0.),24.);c+=vec3(.10,.115,.13)*glow;gl_FragColor=vec4(c,1.);}'
 });
 scene.add(new THREE.Mesh(g,m));
}
function init(){
 renderer=new THREE.WebGLRenderer({canvas:$('world'),antialias:true,alpha:false,powerPreference:'high-performance'});
 renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.setSize(innerWidth,innerHeight);
 renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
 renderer.xr.enabled=true;renderer.xr.setReferenceSpaceType('local-floor');renderer.xr.setFramebufferScaleFactor(1);renderer.xr.setFoveation(.6);
 renderer.shadowMap.enabled=false;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;
 townScene=scene=new THREE.Scene();scene.fog=new THREE.Fog(0x38444a,36,142);sky();
 scene.add(new THREE.HemisphereLight(0xb2c3de,0x49412e,1.55));
 const moon=new THREE.DirectionalLight(0xb4c8ed,2.1);moon.position.set(-45,70,22);moon.castShadow=true;moon.shadow.mapSize.set(2048,2048);Object.assign(moon.shadow.camera,{left:-80,right:80,top:80,bottom:-80,near:1,far:160});moon.shadow.bias=-.0003;moon.shadow.normalBias=.035;scene.add(moon);
 camera=new THREE.PerspectiveCamera(72,innerWidth/innerHeight,.07,190);camera.rotation.order='YXZ';camera.position.y=1.68;
 rig=new THREE.Group();scene.add(rig);rig.add(camera);rig.position.set(spawn.x,0,spawn.z);
 hands=createVRHands({renderer,parent:rig,onError:message=>console.warn('[Diab1 hands]',message)});
 world=buildWorld(scene);
 for(let i=0;i<2;i++){const l=new THREE.PointLight(0xff9c46,13,8,2);scene.add(l);lights.push(l);}
 townArea=createTownArea();area=townArea;
 // Playground's gesture-charged magic blast (hold A, palms facing, oscillate, push to fire).
 magic=createMagicBlast({scene,renderer,camera,rig,hands,hitTest:createAreaHitTest(()=>area)});window.diabMagic=magic;
 // Head-locked helpers: a fade shell for area changes, the carried light, and the VR automap.
 fader=new THREE.Mesh(new THREE.SphereGeometry(.3,16,8),new THREE.MeshBasicMaterial({color:0,transparent:true,opacity:0,side:THREE.BackSide,depthTest:false,depthWrite:false,fog:false}));
 fader.renderOrder=1000;fader.visible=false;camera.add(fader);
 lantern=new THREE.PointLight(0xffd2a8,15,12,1.5);lantern.position.set(.12,-.25,-.15);lantern.visible=false;camera.add(lantern);
 const mc=document.createElement('canvas');mc.width=mc.height=512;vrMapTex=new THREE.CanvasTexture(mc);vrMapTex.colorSpace=THREE.SRGBColorSpace;
 vrMap=new THREE.Mesh(new THREE.PlaneGeometry(.36,.36),new THREE.MeshBasicMaterial({map:vrMapTex,transparent:true,opacity:.93,depthTest:false,depthWrite:false,fog:false}));
 vrMap.position.set(0,-.07,-.5);vrMap.rotation.x=-.18;vrMap.renderOrder=999;vrMap.visible=false;camera.add(vrMap);
 const aspect=innerWidth/innerHeight;overheadCamera=new THREE.OrthographicCamera(-118*aspect,118*aspect,118,-118,.1,600);overheadCamera.position.set(135,170,135);overheadCamera.lookAt(0,0,0);
 setView('square');setupControls();
 $('loading').hidden=true;$('welcome').hidden=false;
 if(review){window.__diab={place:(x,z,y)=>placePlayer(x,z,y),look:v=>{pitch=v;},enter:t=>enterArea(t),area:()=>area};$('review').hidden=false;$('review-view').value=params.get('view')||'square';setView($('review-view').value);enterScreen();}
 renderer.setAnimationLoop(frame);probeVR();
}
function setView(id){
 if(id.startsWith('dungeon')){cameraMode='ground';enterArea({to:'dungeon',level:+id.slice(7)||1,arrive:'up'});return;}
 if(area!==townArea)enterArea({to:'town',arrive:'square'});
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
  const active=session;active.addEventListener('end',()=>{session=null;camera.position.set(0,1.68,0);camera.rotation.set(0,0,0);vrVelocity.set(0,0,0);sprintActive=false;sprintButtonDown=false;$('welcome').hidden=false;$('hud').hidden=true;started=false;previousA=false;});
  cameraMode='ground';if(area===townArea)scene.fog=new THREE.Fog(0x38444a,36,142);pitch=0;camera.position.set(0,0,0);camera.rotation.set(0,0,0);rig.rotation.set(0,0,0);vrVelocity.set(0,0,0);sprintActive=false;sprintButtonDown=false;rig.position.y=area.height(rig.position.x,rig.position.z);
  $('welcome').hidden=true;$('hud').hidden=true;$('hint').hidden=true;$('touch-pad').hidden=true;$('settings').hidden=true;$('map-panel').hidden=true;mapOpen=false;started=true;
  await renderer.xr.setSession(active);
  if(active.updateTargetFrameRate&&active.supportedFrameRates?.includes(90))try{await active.updateTargetFrameRate(90);}catch{}
 }catch(e){session=null;$('welcome').hidden=false;$('vr-note').textContent='Could not enter VR: '+e.message;}
}
function positionAllowed(x,z){return area.allowed(x,z);}
function move(dx,dz){
 const n=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.12));
 for(let i=0;i<n;i++){
  const current=renderer.xr.isPresenting?renderer.xr.getCamera(camera).getWorldPosition(head):rig.getWorldPosition(head);
  const mx=positionAllowed(current.x+dx/n,current.z)?dx/n:0;
  rig.position.x+=mx;
  if(positionAllowed(current.x+mx,current.z+dz/n))rig.position.z+=dz/n;
 }
 rig.position.y=area.height(rig.position.x,rig.position.z);
}
function deadzone(v,dz=.16){const a=Math.abs(v);return a<dz?0:Math.sign(v)*(a-dz)/(1-dz);}
function moveXR(dx,dz){
 const n=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.12));
 let x=head.x,z=head.z,movedX=0,movedZ=0;
 for(let i=0;i<n;i++){
  const sx=dx/n,sz=dz/n;
  if(positionAllowed(x+sx,z)){x+=sx;movedX+=sx;}
  if(positionAllowed(x,z+sz)){z+=sz;movedZ+=sz;}
 }
 rig.position.x+=movedX;rig.position.z+=movedZ;
 head.x=x;head.z=z;
 rig.position.y=area.height(x,z);
 rig.updateMatrixWorld(true);
}
function xrInput(dt){
 const activeSession=renderer.xr.getSession();
 if(!activeSession||activeSession.visibilityState==='hidden')return;

 // Same XR camera refresh used by Oasis before reading the physical head pivot.
 rig.updateMatrixWorld(true);
 renderer.xr.updateCamera(camera);
 const activeCamera=renderer.xr.getCamera();
 activeCamera.getWorldPosition(head);

 let x=0,z=0,turn=0,aPressed=false,sprintPressed=false;mapHeld=false;
 if(transition){vrVelocity.set(0,0,0);return;}
 for(const source of activeSession.inputSources){
  if(source.handedness!=='left'&&source.handedness!=='right')continue;
  const pad=source.gamepad;if(!pad)continue;
  const axes=pad.axes||[];
  const axis=axes.length>=4?axes.length-2:0;
  if(source.handedness==='left'){
   if(axes.length>=2){x=deadzone(axes[axis]||0,.15);z=deadzone(axes[axis+1]||0,.15);}
   sprintPressed=!!pad.buttons[3]?.pressed;
   mapHeld=!!(pad.buttons[4]?.pressed||pad.buttons[5]?.pressed);
  }else{
   if(axes.length>=2)turn=deadzone(axes[axis]||0,.15);
   aPressed=!!pad.buttons[5]?.pressed; // B: back to the start point (A is the magic blast)
  }
 }

 if(sprintPressed&&!sprintButtonDown)sprintActive=!sprintActive;
 sprintButtonDown=sprintPressed;

 // Same smooth-turn pivot as Oasis: rotate the virtual rig around the physical head.
 const radians=-turn*turnSpeed*dt;
 if(radians){
  const dx=rig.position.x-head.x,dz=rig.position.z-head.z,c=Math.cos(radians),s=Math.sin(radians);
  rig.position.x=head.x+c*dx+s*dz;
  rig.position.z=head.z-s*dx+c*dz;
  rig.rotation.y+=radians;
  rig.updateMatrixWorld(true);
 }

 // Same Oasis ground locomotion: stick movement follows virtual body yaw, not head gaze.
 vrForward.set(-Math.sin(rig.rotation.y),0,-Math.cos(rig.rotation.y));
 vrRight.crossVectors(vrForward,worldUp).normalize();
 vrTarget.copy(vrRight).multiplyScalar(x).addScaledVector(vrForward,-z);
 if(vrTarget.lengthSq()>1)vrTarget.normalize();
 vrTarget.multiplyScalar(sprintActive?4:moveSpeed);
 vrVelocity.lerp(vrTarget,1-Math.exp(-dt*(vrTarget.lengthSq()?18:28)));
 moveXR(vrVelocity.x*dt,vrVelocity.z*dt);

 if(aPressed&&!previousA&&!transition){const h=area.home;placePlayer(h.x,h.z,h.yaw);}
 previousA=aPressed;
}
function frame(ms,xrFrame){
 const dt=Math.min((ms-previousTime)/1000||.016,.045);previousTime=ms;elapsed+=dt;
 if(renderer.xr.isPresenting&&session)xrInput(dt);
 else if(started&&!transition&&cameraMode==='ground'&&$('settings').hidden&&!mapOpen){
  let f=(keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0)-touchMove.y;
  const s=(keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0)+touchMove.x;
  if(testWalk>0){testWalk-=dt;f=1;}
  if(keys.has('ArrowLeft'))yaw+=turnSpeed*dt;if(keys.has('ArrowRight'))yaw-=turnSpeed*dt;
  rig.rotation.y=yaw;camera.rotation.x=pitch;
  const speed=(keys.has('ShiftLeft')?4.2:moveSpeed)*dt/Math.max(1,Math.hypot(f,s));
  move((-Math.sin(yaw)*f+Math.cos(yaw)*s)*speed,(-Math.cos(yaw)*f-Math.sin(yaw)*s)*speed);
 }
 const pos=playerPosition();
 area.update(dt,elapsed,pos);
 if(started&&!transition&&cameraMode==='ground'){const t=area.trigger(pos.x,pos.z);if(t)beginTransition(t);}
 updateTransition(dt);
 if(renderer.xr.isPresenting){vrMap.visible=mapHeld&&!transition;if(vrMap.visible&&frames%6===0){area.drawMap(vrMapTex.image.getContext('2d'),512,pos,playerYaw());vrMapTex.needsUpdate=true;}}else vrMap.visible=false;
 lantern.visible=area!==townArea;lantern.intensity=15*(1+Math.sin(elapsed*6.1)*.03);
 magic.update(dt,xrFrame);
 hands?.update(dt);
 renderer.render(scene,cameraMode==='overhead'?overheadCamera:camera);
 frames++;frameTime+=Math.max(.001,(ms-(frame.lastMs||ms-16))/1000);frame.lastMs=ms;
 if(frames%20===0){
  const info=renderer.info.render,text=Math.round(frames/frameTime)+' fps · '+info.calls+' draws · '+Math.round(info.triangles/1000)+'k tris';
  $('stats').textContent=text+'\n'+rig.position.x.toFixed(1)+', '+rig.position.z.toFixed(1)+(area===townArea?'':' · seed '+runSeed);
  if(review)$('review-status').textContent=text+' | '+rig.position.x.toFixed(1)+', '+rig.position.z.toFixed(1)+' | '+area.label();
  if(mapOpen)drawMap();updateLocation();
 }
 if(frameTime>2){frames=0;frameTime=0;}
}
function updateLocation(){
 if(area!==townArea){$('location').textContent=area.label();return;}
 let label='TRISTRAM',best=14;
 for(const b of buildings){const pos=p(...b.at),d=Math.hypot(pos.x-rig.position.x,pos.z-rig.position.z);if(d<best){label=b.name.toUpperCase();best=d;}}
 const cat=p(...cathedral.at);if(Math.hypot(rig.position.x-cat.x,rig.position.z-cat.z)<26)label='THE CATHEDRAL';$('location').textContent=label;
}
function drawMap(){
 const c=$('town-map').getContext('2d');
 if(area!==townArea){area.drawMap(c,520,playerPosition(),playerYaw());return;}
 drawTownMap(c,520,rig.position,rig.rotation.y);
}
function drawTownMap(c,S,pos,heading){
 const to=v=>260+v*3.0;
 c.fillStyle='#1b2628';c.fillRect(0,0,S,S);c.strokeStyle='#82877433';c.strokeRect(20,20,480,480);
 for(const trace of riverTraces){c.strokeStyle='#658a9780';c.lineWidth=4;c.beginPath();trace.forEach((a,i)=>{const q=p(...a);i?c.lineTo(to(q.x),to(q.z)):c.moveTo(to(q.x),to(q.z));});c.stroke();}
 for(const road of roads){c.strokeStyle='#99896b70';c.lineWidth=3;c.beginPath();road.points.forEach((a,i)=>{const q=p(...a);i?c.lineTo(to(q.x),to(q.z)):c.moveTo(to(q.x),to(q.z));});c.stroke();}
 c.fillStyle='#b8a17c';
 for(const b of [...buildings,{...cathedral,name:'Cathedral'}]){const q=p(...b.at);c.save();c.translate(to(q.x),to(q.z));c.rotate(-(b.angle||0));c.fillRect(-b.w*1.5,-b.d*1.5,b.w*3,b.d*3);c.restore();}
 c.font='11px Georgia';c.textAlign='center';c.fillStyle='#d5cdb9';
 for(const [text,coord,ox,oy] of [['Cathedral',cathedral.at,0,-39],['Tavern',buildings[0].at,-10,-25],['Smithy',buildings[1].at,26,0],['Adria',buildings[8].at,0,-18],['Well',[687,532],-15,12]]){const q=p(...coord);c.fillText(text,to(q.x)+ox,to(q.z)+oy);}
 c.save();c.translate(to(pos.x),to(pos.z));c.rotate(-heading);c.fillStyle='#f0d596';c.beginPath();c.moveTo(0,-8);c.lineTo(-4,5);c.lineTo(4,5);c.closePath();c.fill();c.restore();
}
function toggleMap(){mapOpen=!mapOpen;$('map-panel').hidden=!mapOpen;$('map-panel').querySelector('h2').textContent=area===townArea?'Tristram':'Cathedral';if(mapOpen)drawMap();}
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
 $('review-collision').onclick=()=>{if(area!==townArea){$('review-collision').textContent='Town only';return;}const problems=[];for(const spec of [...buildings,{...cathedral,id:'cathedral'}]){const q=p(...spec.at);if(positionAllowed(q.x,q.z))problems.push(spec.id+' has no collision');}if(!positionAllowed(spawn.x,spawn.z))problems.push('spawn obstructed');$('review-collision').textContent=problems.length?problems.join(', '):'Collision checks passed';};
}
// ---- areas: the town and the cathedral levels beneath it ----------------------------
function createTownArea(){
 const cat=p(...cathedral.at),door={x:cat.x,z:cat.z+13.3};
 return {
  id:'town',scene:townScene,far:190,
  arrivals:{square:{x:spawn.x,z:spawn.z,yaw:0},cathedral:{x:door.x,z:door.z+2.6,yaw:Math.PI}},
  get home(){return this.arrivals.square;},
  allowed:(x,z)=>canStand(x,z,world.colliders)&&!waterBlocked(x,z),
  solid:(x,z)=>!canStand(x,z,world.colliders,.04),
  height:walkHeight,
  // Walking into the cathedral's great doors takes you down into level 1.
  trigger:(x,z)=>Math.abs(x-door.x)<1.4&&z<door.z+.55&&z>door.z-1.5?{to:'dungeon',level:1,arrive:'up'}:null,
  label:()=>'TRISTRAM',
  update(dt,t,pos){
   const fire=world.markers.filter(m=>m.kind==='light'||m.kind==='fire').sort((a,b)=>(a.x-pos.x)**2+(a.z-pos.z)**2-(b.x-pos.x)**2-(b.z-pos.z)**2);
   for(let i=0;i<lights.length;i++){const m=fire[i];if(m){lights[i].position.set(m.x,m.y,m.z);lights[i].intensity=(m.kind==='fire'?30:12)*(1+Math.sin(t*5.7+i)*.035);}}
   const shader=world.materials.water.userData.shader;if(shader)shader.uniforms.uTime.value=t;
  },
  drawMap:(c,S,pos,heading)=>drawTownMap(c,S,pos,heading)
 };
}
function playerPosition(){
 if(renderer.xr.isPresenting)return renderer.xr.getCamera().getWorldPosition(head);
 return rig.getWorldPosition(head);
}
function playerYaw(){
 if(!renderer.xr.isPresenting)return rig.rotation.y;
 return rig.rotation.y+new THREE.Euler().setFromQuaternion(camera.quaternion,'YXZ').y;
}
/** Put the player's head (not the rig origin) at x,z facing yaw, respecting room-scale offset in VR. */
function placePlayer(x,z,faceYaw){
 if(renderer.xr.isPresenting){
  const local=camera.position,headYaw=new THREE.Euler().setFromQuaternion(camera.quaternion,'YXZ').y,ry=faceYaw-headYaw,c=Math.cos(ry),s=Math.sin(ry);
  rig.rotation.set(0,ry,0);
  rig.position.set(x-(c*local.x+s*local.z),area.height(x,z),z-(-s*local.x+c*local.z));
  vrVelocity.set(0,0,0);
 }else{rig.position.set(x,area.height(x,z),z);yaw=faceYaw;rig.rotation.set(0,yaw,0);pitch=0;camera.rotation.set(0,0,0);}
 rig.updateMatrixWorld(true);
}
function enterArea(target){
 let next;
 if(target.to==='town')next=townArea;
 else{
  const level=Math.max(1,Math.min(MAX_LEVEL,target.level));
  if(!dungeonArea||dungeonArea.level!==level){dungeonArea?.dispose();dungeonArea=createDungeonArea({level,runSeed,baseMaterials:world.materials});}
  next=dungeonArea;
 }
 if(next===townArea&&dungeonArea){dungeonArea.dispose();dungeonArea=null;}
 area=next;scene=next.scene;scene.add(rig);magic.setScene(scene);
 camera.far=next.far;camera.updateProjectionMatrix();
 const a=next.arrivals[target.arrive]||next.home;placePlayer(a.x,a.z,a.yaw);
 if(mapOpen)toggleMap();updateLocation();
}
function beginTransition(target){transition={target,phase:'out',t:0};fader.visible=true;}
function updateTransition(dt){
 if(!transition){return;}
 transition.t+=dt/.45;
 if(transition.phase==='out'){
  fader.material.opacity=Math.min(1,transition.t);
  if(transition.t>=1.15){try{enterArea(transition.target);}catch(e){showError(e);}transition.phase='in';transition.t=0;}
 }else{
  fader.material.opacity=Math.max(0,1-transition.t);
  if(transition.t>=1){transition=null;fader.visible=false;}
 }
}
requestAnimationFrame(()=>setTimeout(()=>{try{init();}catch(e){showError(e);}},40));
