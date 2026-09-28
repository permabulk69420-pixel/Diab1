import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

const SPECS=[
  {name:'Ashen Claymore',file:'models/swords/ashen_claymore-1%20(1).glb',offset:[-.7,-1.2],lean:.16},
  {name:'Claymore',file:'models/swords/claymore.glb',offset:[.7,-1.2],lean:-.16}
];

const loader=new GLTFLoader();
const handPos=new THREE.Vector3();
const otherHandPos=new THREE.Vector3();
const swordPos=new THREE.Vector3();
const supportPos=new THREE.Vector3();
const up=new THREE.Vector3();
const zAxis=new THREE.Vector3();
const xAxis=new THREE.Vector3();
const parentQuat=new THREE.Quaternion();
const worldQuat=new THREE.Quaternion();
const localQuat=new THREE.Quaternion();
const rotMatrix=new THREE.Matrix4();
const WORLD_UP=new THREE.Vector3(0,1,0);
const LOCAL_Y=new THREE.Vector3(0,1,0);
const LOCAL_Z=new THREE.Vector3(0,0,1);
const ONE_HAND_ROT=new THREE.Quaternion().setFromEuler(new THREE.Euler(-.38,0,0));
const SUPPORT_LOCAL=new THREE.Vector3(0,-.145,0);

function assetUrl(path){
  return new URL(path,document.baseURI).href;
}

function gripValue(state){
  return state.inputSource?.gamepad?.buttons?.[1]?.value??0;
}

function worldPoint(object,local,target){
  target.copy(local);
  return object.localToWorld(target);
}

function setTwoHandOrientation(entry){
  const primary=entry.holder,secondary=entry.supporter;
  if(!primary||!secondary||!entry.model)return;

  primary.grip.getWorldPosition(handPos);
  secondary.grip.getWorldPosition(otherHandPos);
  up.subVectors(handPos,otherHandPos);
  if(up.lengthSq()<.006)return;
  up.normalize();

  // Preserve the primary controller's roll as much as possible, but make the
  // sword's long axis run through both physical hands.
  primary.grip.getWorldQuaternion(parentQuat);
  zAxis.copy(LOCAL_Z).applyQuaternion(parentQuat);
  zAxis.addScaledVector(up,-zAxis.dot(up));
  if(zAxis.lengthSq()<.01){
    zAxis.copy(WORLD_UP).addScaledVector(up,-WORLD_UP.dot(up));
  }
  if(zAxis.lengthSq()<.01)zAxis.set(0,0,1);
  zAxis.normalize();
  xAxis.crossVectors(up,zAxis).normalize();
  zAxis.crossVectors(xAxis,up).normalize();

  rotMatrix.makeBasis(xAxis,up,zAxis);
  worldQuat.setFromRotationMatrix(rotMatrix);
  parentQuat.invert();
  localQuat.copy(parentQuat).multiply(worldQuat);
  entry.model.quaternion.copy(localQuat);
}

export function createSwords({scene,hands,spawn,height,onError=console.warn}){
  const entries=SPECS.map(spec=>{
    const x=spawn.x+spec.offset[0],z=spawn.z+spec.offset[1];
    const anchor=new THREE.Group();
    anchor.position.set(x,height(x,z)+.05,z);
    scene.add(anchor);

    const entry={spec,anchor,model:null,holder:null,supporter:null,homeY:0};

    loader.load(assetUrl(spec.file),(gltf)=>{
      const sword=gltf.scene;
      const initialBox=new THREE.Box3().setFromObject(sword);
      const size=initialBox.getSize(new THREE.Vector3());
      sword.scale.setScalar(size.y>0?1.45/size.y:1);

      // Put the model origin in the actual hand-grip region instead of at the
      // pommel. The old version used this ~19% point and it lines the palm up
      // with the leather handle rather than making the blade grow through it.
      const scaledBox=new THREE.Box3().setFromObject(sword);
      const scaledSize=scaledBox.getSize(new THREE.Vector3());
      const center=scaledBox.getCenter(new THREE.Vector3());
      const gripY=scaledBox.min.y+scaledSize.y*.19;
      sword.position.set(-center.x,-gripY,-center.z);

      const model=new THREE.Group();
      model.name=spec.name;
      model.add(sword);

      // Rest the sword on the ground when it is not held.
      const localBox=new THREE.Box3().setFromObject(model);
      entry.homeY=-localBox.min.y;
      model.position.set(0,entry.homeY,0);
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

  function clearSupport(entry){
    if(!entry?.supporter)return;
    entry.supporter.swordSupportEntry=null;
    entry.supporter=null;
  }

  function returnSword(state){
    const entry=held.get(state);
    if(!entry||!entry.model)return;
    clearSupport(entry);
    state.weaponHeld=false;
    state.grip.remove(entry.model);
    entry.anchor.add(entry.model);
    entry.model.position.set(0,entry.homeY,0);
    entry.model.rotation.set(0,0,entry.spec.lean);
    entry.holder=null;
    held.delete(state);
  }

  function takeSword(state,entry){
    entry.anchor.remove(entry.model);
    entry.model.position.set(0,-.015,-.045);
    entry.model.quaternion.copy(ONE_HAND_ROT);
    state.grip.add(entry.model);
    entry.holder=state;
    state.weaponHeld=true;
    held.set(state,entry);
  }

  function findSupporter(entry){
    if(!entry?.model||!entry.holder)return null;
    worldPoint(entry.model,SUPPORT_LOCAL,supportPos);

    let best=null,bestDistance=.19;
    for(const state of hands.states){
      if(state===entry.holder||!state.inputSource||held.has(state))continue;
      if(gripValue(state)<.45)continue;
      state.grip.getWorldPosition(otherHandPos);
      const distance=otherHandPos.distanceTo(supportPos);
      if(distance<bestDistance){
        best=state;
        bestDistance=distance;
      }
    }
    return best;
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
          clearSupport(entry);
          entry.model.quaternion.copy(ONE_HAND_ROT);
        }else{
          setTwoHandOrientation(entry);
        }
      }else{
        const supporter=findSupporter(entry);
        if(supporter){
          entry.supporter=supporter;
          supporter.swordSupportEntry=entry;
          setTwoHandOrientation(entry);
        }
      }
    }

    for(const state of hands.states){
      const squeeze=gripValue(state);
      const down=squeeze>.55;

      if(!held.has(state)&&!state.swordSupportEntry&&isVR&&inTown&&down&&!state.swordGripDown){
        state.grip.getWorldPosition(handPos);
        let best=null,bestDistance=.38;

        for(const entry of entries){
          if(!entry.model||entry.holder)continue;
          entry.model.getWorldPosition(swordPos);
          const distance=handPos.distanceTo(swordPos);
          if(distance<bestDistance){
            best=entry;
            bestDistance=distance;
          }
        }

        if(best)takeSword(state,best);
      }

      state.swordGripDown=down;
    }
  }

  return {update,entries};
}
