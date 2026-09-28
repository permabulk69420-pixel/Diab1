import * as THREE from 'three';

const temp=new THREE.Vector3();
const supportLocal=new THREE.Vector3(0,-.145,0);

function makePad(){
  return {axes:[0,0,0,0],buttons:Array.from({length:6},()=>({value:0,pressed:false,touched:false}))};
}
function setGrip(pad,value){
  const b=pad.buttons[1];b.value=value;b.pressed=value>.5;b.touched=value>.05;
}

export function createVRProof({rig,camera,hands,swords}){
  const rightPad=makePad(),leftPad=makePad();
  for(const object of [...hands.controllers,...hands.grips]){
    object.visible=true;
    object.matrixAutoUpdate=true;
  }
  hands.controllers[0].dispatchEvent({type:'connected',data:{handedness:'right',gamepad:rightPad}});
  hands.controllers[1].dispatchEvent({type:'connected',data:{handedness:'left',gamepad:leftPad}});

  camera.position.set(0,1.68,0);
  camera.rotation.set(-.08,0,0);
  rig.rotation.set(0,0,0);
  rig.updateMatrixWorld(true);

  for(const id of ['loading','welcome','hud','hint','touch-pad','settings','map-panel','review']){
    const el=document.getElementById(id);if(el)el.hidden=true;
  }

  const right=()=>hands.getState('right');
  const left=()=>hands.getState('left');

  function update(){
    const entry=swords.entries?.[0],r=right(),l=left();
    if(!entry?.model||!r?.handRoot||!l?.handRoot)return;

    r.grip.rotation.set(-.18,.02,-.08);
    l.grip.rotation.set(-.18,-.02,.08);

    if(!entry.holder){
      entry.model.updateWorldMatrix(true,false);
      entry.model.getWorldPosition(temp);
      rig.worldToLocal(temp);
      r.grip.position.copy(temp);
      l.grip.position.set(-.25,1.02,-.58);
      setGrip(rightPad,1);
      setGrip(leftPad,0);
      return;
    }

    r.grip.position.set(.18,1.18,-.66);
    setGrip(rightPad,1);

    entry.model.updateWorldMatrix(true,false);
    temp.copy(supportLocal);
    entry.model.localToWorld(temp);
    rig.worldToLocal(temp);
    l.grip.position.copy(temp);
    setGrip(leftPad,1);

    window.__vrProofReady=!!entry.supporter;
  }

  return {update};
}
