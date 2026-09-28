import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

const SWORDS = [
  {name:'Ashen Claymore',file:'/models/swords/ashen_claymore-1%20(1).glb',offset:[-2.1,-1.6],color:0x87d6ca},
  {name:'Claymore',file:'/models/swords/claymore.glb',offset:[1.5,-2.1],color:0xe6b87e}
];
const gripPoint=new THREE.Vector3();
const handPoint=new THREE.Vector3();

function signTexture(title){
 const canvas=document.createElement('canvas');canvas.width=512;canvas.height=160;
 const c=canvas.getContext('2d');c.clearRect(0,0,512,160);
 c.fillStyle='#171e22';c.fillRect(0,0,512,160);
 c.strokeStyle='#b39b72';c.lineWidth=5;c.strokeRect(4,4,504,152);
 c.textAlign='center';c.fillStyle='#fff2d0';c.font='bold 40px Georgia';c.fillText(title,256,68);
 c.fillStyle='#b5c8c8';c.font='30px sans-serif';c.fillText('SQUEEZE GRIP TO PICK UP',256,122);
 const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;return tex;
}

export function createSwordTrial({scene,hands,spawn,height,onError=console.warn}){
 const loader=new GLTFLoader();
 const entries=SWORDS.map((spec,i)=>{
  const x=spawn.x+spec.offset[0],z=spawn.z+spec.offset[1];
  const root=new THREE.Group();root.position.set(x,height(x,z),z);scene.add(root);
  const stone=new THREE.Mesh(new THREE.BoxGeometry(.48,.72,.48),new THREE.MeshStandardMaterial({color:0x625d51,roughness:.92}));
  stone.position.y=.36;root.add(stone);
  const marker=new THREE.Mesh(new THREE.TorusGeometry(.068,.008,5,20),new THREE.MeshBasicMaterial({color:spec.color}));
  marker.rotation.x=Math.PI/2;marker.position.y=1.0;root.add(marker);
  const label=new THREE.Sprite(new THREE.SpriteMaterial({map:signTexture(`${i+1}. ${spec.name}`),transparent:true,depthWrite:false}));
  label.scale.set(.9,.281,1);label.position.set(0,.55,.35);root.add(label);
  const entry={spec,root,marker,model:null,holder:null,loading:true};
  loader.load(spec.file,(gltf)=>{
   const model=new THREE.Group();model.name=spec.name;
   const sword=gltf.scene,box=new THREE.Box3().setFromObject(sword);
   const size=box.getSize(new THREE.Vector3());
   // Both exports have the blade along +Y. Keep a common display height so
   // their different dimensions do not decide the visual comparison.
   const scale=1.55/size.y;
   sword.scale.setScalar(scale);
   sword.position.set(-(box.min.x+box.max.x)*.5*scale,-(box.min.y+size.y*.19)*scale,-(box.min.z+box.max.z)*.5*scale);
   model.add(sword);model.position.y=1.0;root.add(model);
   model.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=false;}});
   entry.model=model;entry.loading=false;
  },undefined,error=>{entry.loading=false;onError(`Could not load ${spec.name}: ${error.message||error}`);});
  return entry;
 });

 const held=new Map();
 function returnSword(state){
  const entry=held.get(state);if(!entry)return;
  state.weaponHeld=false;entry.holder=null;
  state.grip.remove(entry.model);entry.root.add(entry.model);
  entry.model.position.set(0,1,0);entry.model.rotation.set(0,0,0);
  entry.marker.visible=true;held.delete(state);
 }
 function update(dt,inTown,isVR){
  for(const state of hands.states){
   const squeeze=state.inputSource?.gamepad?.buttons[1]?.value??0;
   const pressed=squeeze>.55;
   if(held.has(state)){
    if(!state.inputSource||!isVR||squeeze<.25)returnSword(state);
   }else if(isVR&&inTown&&pressed&&!state.swordGripDown){
    state.grip.getWorldPosition(handPoint);
    let closest=null,distance=.42;
    for(const entry of entries){
     if(!entry.model||entry.holder)continue;
     entry.model.getWorldPosition(gripPoint);
     const d=handPoint.distanceTo(gripPoint);
     if(d<distance){closest=entry;distance=d;}
    }
    if(closest){
     const entry=closest;entry.root.remove(entry.model);
     entry.model.position.set(0,-.12,-.07);
     entry.model.rotation.set(-.38,0,0);
     state.grip.add(entry.model);entry.marker.visible=false;
     entry.holder=state;state.weaponHeld=true;held.set(state,entry);
    }
   }
   state.swordGripDown=pressed;
  }
  for(const entry of entries)if(!entry.holder)entry.marker.rotation.z+=dt*1.7;
 }
 return {update,entries};
}
