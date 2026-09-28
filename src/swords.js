import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

const SPECS=[
  {name:'Ashen Claymore',file:'models/swords/ashen_claymore-1%20(1).glb',offset:[-.7,-1.2],lean:.16},
  {name:'Claymore',file:'models/swords/claymore.glb',offset:[.7,-1.2],lean:-.16}
];

const loader=new GLTFLoader();
const handPos=new THREE.Vector3();
const swordPos=new THREE.Vector3();

function assetUrl(path){
  return new URL(path,document.baseURI).href;
}

export function createSwords({scene,hands,spawn,height,onError=console.warn}){
  const entries=SPECS.map(spec=>{
    const x=spawn.x+spec.offset[0],z=spawn.z+spec.offset[1];
    const anchor=new THREE.Group();
    anchor.position.set(x,height(x,z)+.05,z);
    scene.add(anchor);

    const entry={spec,anchor,model:null,holder:null};

    loader.load(assetUrl(spec.file),(gltf)=>{
      const sword=gltf.scene;
      const initialBox=new THREE.Box3().setFromObject(sword);
      const size=initialBox.getSize(new THREE.Vector3());
      sword.scale.setScalar(size.y>0?1.45/size.y:1);

      const box=new THREE.Box3().setFromObject(sword);
      const center=box.getCenter(new THREE.Vector3());
      sword.position.set(-center.x,-box.min.y,-center.z);

      const model=new THREE.Group();
      model.name=spec.name;
      model.add(sword);
      model.rotation.set(0,0,spec.lean);
      anchor.add(model);

      model.traverse(o=>{
        if(o.isMesh){
          o.castShadow=true;
          o.receiveShadow=false;
        }
      });

      entry.model=model;
    },undefined,error=>onError(`Could not load ${spec.name}: ${error.message||error}`));

    return entry;
  });

  const held=new Map();

  function returnSword(state){
    const entry=held.get(state);
    if(!entry||!entry.model)return;
    state.grip.remove(entry.model);
    entry.anchor.add(entry.model);
    entry.model.position.set(0,0,0);
    entry.model.rotation.set(0,0,entry.spec.lean);
    entry.holder=null;
    held.delete(state);
  }

  function update(_dt,inTown,isVR){
    for(const state of hands.states){
      const squeeze=state.inputSource?.gamepad?.buttons?.[1]?.value??0;
      const down=squeeze>.55;

      if(held.has(state)){
        if(!state.inputSource||!isVR||squeeze<.2)returnSword(state);
      }else if(isVR&&inTown&&down&&!state.swordGripDown){
        state.grip.getWorldPosition(handPos);
        let best=null,bestDistance=.45;

        for(const entry of entries){
          if(!entry.model||entry.holder)continue;
          entry.model.getWorldPosition(swordPos);
          const distance=handPos.distanceTo(swordPos);
          if(distance<bestDistance){
            best=entry;
            bestDistance=distance;
          }
        }

        if(best){
          best.anchor.remove(best.model);
          best.model.position.set(0,-.12,-.07);
          best.model.rotation.set(-.38,0,0);
          state.grip.add(best.model);
          best.holder=state;
          held.set(state,best);
        }
      }

      state.swordGripDown=down;
    }
  }

  return {update,entries};
}
