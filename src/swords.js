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
const currentMidpoint=new THREE.Vector3();
const currentDirection=new THREE.Vector3();
const currentPrimaryQuat=new THREE.Quaternion();
const aimDelta=new THREE.Quaternion();
const predictedPrimaryQuat=new THREE.Quaternion();
const inversePredictedQuat=new THREE.Quaternion();
const residualQuat=new THREE.Quaternion();
const twistQuat=new THREE.Quaternion();
const fullDelta=new THREE.Quaternion();
const rotatedOffset=new THREE.Vector3();
const rotatedPrimary=new THREE.Vector3();
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

function extractTwist(quaternion,axis,target){
  const dot=quaternion.x*axis.x+quaternion.y*axis.y+quaternion.z*axis.z;
  target.set(axis.x*dot,axis.y*dot,axis.z*dot,quaternion.w);
  if(target.lengthSq()<1e-8)return target.identity();
  return target.normalize();
}

export function createSwords({scene,hands,spawn,height,onError=console.warn}){
  const entries=SPECS.map(spec=>{
    const x=spawn.x+spec.offset[0],z=spawn.z+spec.offset[1];
    const anchor=new THREE.Group();
    anchor.position.set(x,height(x,z),z);
    scene.add(anchor);

    const entry={
      spec,anchor,model:null,holder:null,supporter:null,twoHand:null,
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

      const size=scaledBox.getSize(new THREE.Vector3());

      // Model-local handle points. Do not derive these after parenting into the
      // world or the Tristram spawn height contaminates the grip coordinates.
      entry.primaryLocal.set(0,scaledBox.min.y+size.y*.225,0);
      entry.secondaryLocal.set(0,scaledBox.min.y+size.y*.14,0);

      entry.homeY=-scaledBox.min.y;
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
    entry.twoHand=null;
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
    entry.twoHand=null;
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

  function beginTwoHand(entry){
    const primary=entry.holder?.objectGrip||entry.holder?.grip;
    const secondary=entry.supporter?.objectGrip||entry.supporter?.grip;
    if(!primary||!secondary||!entry.model)return false;

    primary.getWorldPosition(primaryWorld);
    secondary.getWorldPosition(secondaryWorld);
    currentDirection.subVectors(primaryWorld,secondaryWorld);
    if(currentDirection.lengthSq()<.004)return false;
    currentDirection.normalize();

    const startObjectPosition=new THREE.Vector3();
    const startObjectQuaternion=new THREE.Quaternion();
    const startPrimaryQuaternion=new THREE.Quaternion();
    const startMidpoint=new THREE.Vector3()
      .copy(primaryWorld).add(secondaryWorld).multiplyScalar(.5);

    entry.model.getWorldPosition(startObjectPosition);
    entry.model.getWorldQuaternion(startObjectQuaternion);
    primary.getWorldQuaternion(startPrimaryQuaternion);

    entry.twoHand={
      startMidpoint,
      startDirection:currentDirection.clone(),
      startObjectPosition,
      startObjectQuaternion,
      startPrimaryQuaternion,
      startOffset:startObjectPosition.clone().sub(startMidpoint)
    };
    return true;
  }

  function solveTwoHand(entry){
    const primary=entry.holder?.objectGrip||entry.holder?.grip;
    const secondary=entry.supporter?.objectGrip||entry.supporter?.grip;
    const state=entry.twoHand;
    if(!primary||!secondary||!entry.model||!state)return;

    primary.getWorldPosition(primaryWorld);
    secondary.getWorldPosition(secondaryWorld);
    currentDirection.subVectors(primaryWorld,secondaryWorld);
    if(currentDirection.lengthSq()<.004)return;
    currentDirection.normalize();
    currentMidpoint.copy(primaryWorld).add(secondaryWorld).multiplyScalar(.5);

    // Two-grab transform: preserve the sword pose from the instant the second
    // hand joins, then apply relative two-hand motion. Translation follows the
    // centroid, so neither hand becomes an artificial pivot.
    aimDelta.setFromUnitVectors(state.startDirection,currentDirection);

    // The hand-to-hand line controls pitch/yaw. The primary palm contributes
    // only twist about that line so wrist roll still rolls the blade naturally.
    primary.getWorldQuaternion(currentPrimaryQuat);
    predictedPrimaryQuat.copy(aimDelta).multiply(state.startPrimaryQuaternion);
    inversePredictedQuat.copy(predictedPrimaryQuat).invert();
    residualQuat.copy(currentPrimaryQuat).multiply(inversePredictedQuat);
    extractTwist(residualQuat,currentDirection,twistQuat);
    fullDelta.copy(twistQuat).multiply(aimDelta);

    entry.model.quaternion.copy(fullDelta).multiply(state.startObjectQuaternion);
    rotatedOffset.copy(state.startOffset).applyQuaternion(fullDelta);
    entry.model.position.copy(currentMidpoint).add(rotatedOffset);
    entry.model.scale.set(1,1,1);
    entry.model.updateMatrixWorld(true);
  }

  function beginSupport(entry,state){
    if(entry.supporter||state===entry.holder)return;
    scene.attach(entry.model);
    entry.supporter=state;
    state.swordSupportEntry=entry;
    setGripPose(state,true);
    if(beginTwoHand(entry))solveTwoHand(entry);
    else clearSupport(entry);
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
