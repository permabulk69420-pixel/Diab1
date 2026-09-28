import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

const SPECS=[
  {name:'Ashen Claymore',file:'models/swords/ashen_claymore-1%20(1).glb',offset:[-.7,-1.2],lean:.16},
  {name:'Claymore',file:'models/swords/claymore.glb',offset:[.7,-1.2],lean:-.16}
];

const loader=new GLTFLoader();
const primaryWorld=new THREE.Vector3();
const secondaryWorld=new THREE.Vector3();
const candidateWorld=new THREE.Vector3();
const yAxis=new THREE.Vector3();
const zAxis=new THREE.Vector3();
const xAxis=new THREE.Vector3();
const referenceAxis=new THREE.Vector3();
const primaryGripQuat=new THREE.Quaternion();
const weaponQuat=new THREE.Quaternion();
const basis=new THREE.Matrix4();
const rotatedPrimary=new THREE.Vector3();
const LOCAL_Z=new THREE.Vector3(0,0,1);
const ONE_HAND_QUAT=new THREE.Quaternion().setFromEuler(new THREE.Euler(0,0,Math.PI));

function assetUrl(path){
  return new URL(path,document.baseURI).href;
}

function gripValue(state){
  return state.inputSource?.gamepad?.buttons?.[1]?.value??0;
}

function worldPoint(object,local,target){
  object.updateWorldMatrix(true,false);
  target.copy(local);
  return object.localToWorld(target);
}

function setGripPose(state,held){
  state.weaponHeld=Boolean(held);
}

export function createSwords({scene,hands,spawn,height,onError=console.warn}){
  const entries=SPECS.map(spec=>{
    const x=spawn.x+spec.offset[0],z=spawn.z+spec.offset[1];
    const anchor=new THREE.Group();
    anchor.position.set(x,height(x,z),z);
    scene.add(anchor);

    const entry={
      spec,anchor,model:null,holder:null,supporter:null,
      primaryLocal:new THREE.Vector3(),
      secondaryLocal:new THREE.Vector3(),
      homeY:0
    };

    loader.load(assetUrl(spec.file),(gltf)=>{
      const sword=gltf.scene;
      const firstBox=new THREE.Box3().setFromObject(sword);
      const firstSize=firstBox.getSize(new THREE.Vector3());
      sword.scale.setScalar(firstSize.y>0?1.45/firstSize.y:1);

      const scaledBox=new THREE.Box3().setFromObject(sword);
      const center=scaledBox.getCenter(new THREE.Vector3());
      sword.position.x-=center.x;
      sword.position.z-=center.z;

      const model=new THREE.Group();
      model.name=spec.name;
      model.add(sword);
      anchor.add(model);

      const box=new THREE.Box3().setFromObject(model);
      const size=box.getSize(new THREE.Vector3());

      // Both supplied swords are authored lengthwise on local +Y. These two
      // points sit in the handle, not at the wrist/controller origin.
      entry.primaryLocal.set(0,box.min.y+size.y*.225,0);
      entry.secondaryLocal.set(0,box.min.y+size.y*.14,0);

      entry.homeY=-box.min.y;
      model.position.set(0,entry.homeY,0);
      model.rotation.set(0,0,spec.lean);

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

  function clearSupport(entry){
    const state=entry?.supporter;
    if(!state)return;
    state.swordSupportEntry=null;
    setGripPose(state,false);
    entry.supporter=null;
  }

  function attachOneHand(entry,state){
    const socket=state.objectGrip||state.grip;
    scene.attach(entry.model);
    socket.add(entry.model);
    entry.model.quaternion.copy(ONE_HAND_QUAT);
    rotatedPrimary.copy(entry.primaryLocal).applyQuaternion(ONE_HAND_QUAT);
    entry.model.position.copy(rotatedPrimary).multiplyScalar(-1);
    entry.model.scale.set(1,1,1);
    entry.model.updateMatrixWorld(true);
    entry.holder=state;
    held.set(state,entry);
    setGripPose(state,true);
  }

  function returnSword(state){
    const entry=held.get(state);
    if(!entry?.model)return;
    clearSupport(entry);
    held.delete(state);
    setGripPose(state,false);
    scene.attach(entry.model);
    entry.anchor.add(entry.model);
    entry.model.position.set(0,entry.homeY,0);
    entry.model.rotation.set(0,0,entry.spec.lean);
    entry.model.scale.set(1,1,1);
    entry.holder=null;
  }

  function solveTwoHand(entry){
    const primary=entry.holder?.objectGrip||entry.holder?.grip;
    const secondary=entry.supporter?.objectGrip||entry.supporter?.grip;
    if(!primary||!secondary||!entry.model)return;

    primary.getWorldPosition(primaryWorld);
    secondary.getWorldPosition(secondaryWorld);

    // Local +Y runs from pommel toward blade. The primary hand is the upper
    // hand and the support hand is lower, so +Y points support -> primary.
    yAxis.subVectors(primaryWorld,secondaryWorld);
    if(yAxis.lengthSq()<.004)return;
    yAxis.normalize();

    // Preserve roll from the primary palm socket while the second hand controls
    // the weapon's long axis. This is a rigid two-point solve in world space,
    // not a child pivot under either controller.
    primary.getWorldQuaternion(primaryGripQuat);
    referenceAxis.copy(LOCAL_Z).applyQuaternion(primaryGripQuat);
    zAxis.copy(referenceAxis).addScaledVector(yAxis,-referenceAxis.dot(yAxis));
    if(zAxis.lengthSq()<.0001){
      referenceAxis.set(1,0,0).applyQuaternion(primaryGripQuat);
      zAxis.copy(referenceAxis).addScaledVector(yAxis,-referenceAxis.dot(yAxis));
    }
    zAxis.normalize();
    xAxis.crossVectors(yAxis,zAxis).normalize();
    zAxis.crossVectors(xAxis,yAxis).normalize();

    basis.makeBasis(xAxis,yAxis,zAxis);
    weaponQuat.setFromRotationMatrix(basis);

    entry.model.quaternion.copy(weaponQuat);
    rotatedPrimary.copy(entry.primaryLocal).applyQuaternion(weaponQuat);
    entry.model.position.copy(primaryWorld).sub(rotatedPrimary);
    entry.model.updateMatrixWorld(true);
  }

  function beginSupport(entry,state){
    if(entry.supporter||state===entry.holder)return;
    scene.attach(entry.model);
    entry.supporter=state;
    state.swordSupportEntry=entry;
    setGripPose(state,true);
    solveTwoHand(entry);
  }

  function endSupport(entry){
    const primary=entry.holder;
    clearSupport(entry);
    if(primary)attachOneHand(entry,primary);
  }

  function update(_dt,inTown,isVR){
    for(const entry of entries){
      if(!entry.model||!entry.holder)continue;

      if(!entry.holder.inputSource||!isVR||gripValue(entry.holder)<.2){
        returnSword(entry.holder);
        continue;
      }

      if(entry.supporter){
        if(!entry.supporter.inputSource||gripValue(entry.supporter)<.2){
          endSupport(entry);
        }else{
          solveTwoHand(entry);
        }
      }else{
        worldPoint(entry.model,entry.secondaryLocal,candidateWorld);
        let best=null,bestDistance=.17;
        for(const state of hands.states){
          if(state===entry.holder||!state.inputSource||held.has(state))continue;
          if(gripValue(state)<.45)continue;
          const socket=state.objectGrip||state.grip;
          socket.getWorldPosition(secondaryWorld);
          const d=secondaryWorld.distanceTo(candidateWorld);
          if(d<bestDistance){best=state;bestDistance=d;}
        }
        if(best)beginSupport(entry,best);
      }
    }

    for(const state of hands.states){
      const squeeze=gripValue(state);
      const down=squeeze>.55;

      if(!held.has(state)&&!state.swordSupportEntry&&isVR&&inTown&&down&&!state.swordGripDown){
        const socket=state.objectGrip||state.grip;
        socket.getWorldPosition(primaryWorld);

        let best=null,bestDistance=.30;
        for(const entry of entries){
          if(!entry.model||entry.holder)continue;
          worldPoint(entry.model,entry.primaryLocal,candidateWorld);
          const d=primaryWorld.distanceTo(candidateWorld);
          if(d<bestDistance){best=entry;bestDistance=d;}
        }

        if(best)attachOneHand(best,state);
      }

      state.swordGripDown=down;
    }
  }

  return {update,entries};
}
