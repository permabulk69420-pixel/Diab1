import * as THREE from 'three';

const temp=new THREE.Vector3();
const supportWorld=new THREE.Vector3();

function makePad(){
  return {axes:[0,0,0,0],buttons:Array.from({length:6},()=>({value:0,pressed:false,touched:false}))};
}
function setGrip(pad,value){
  const b=pad.buttons[1];b.value=value;b.pressed=value>.5;b.touched=value>.05;
}

export function createVRProof({rig,camera,hands,swords}){
  const mode=new URLSearchParams(location.search).get('vrproof')||'two';
  const rightPad=makePad(),leftPad=makePad();
  for(const object of [...hands.controllers,...hands.grips]){
    object.visible=true;
    object.matrixAutoUpdate=true;
  }

  hands.controllers[0].dispatchEvent({type:'connected',data:{handedness:'right',gamepad:rightPad}});
  hands.controllers[1].dispatchEvent({type:'connected',data:{handedness:'left',gamepad:leftPad}});

  camera.position.set(0,1.68,0);
  camera.rotation.set(0,0,0);
  rig.rotation.set(0,0,0);
  rig.updateMatrixWorld(true);

  for(const id of ['loading','welcome','hud','hint','touch-pad','settings','map-panel','review']){
    const el=document.getElementById(id);if(el)el.hidden=true;
  }

  const right=()=>hands.getState('right');
  const left=()=>hands.getState('left');
  let settled=0;

  function update(){
    const entry=swords.entries?.[0],r=right(),l=left();
    if(!entry?.model||!r?.handRoot||!l?.handRoot)return;

    r.grip.rotation.set(0,0,0);
    l.grip.rotation.set(0,0,0);

    // Stage 1: exercise the real pickup path by moving the right palm socket
    // onto the sword's primary handle point.
    if(!entry.holder){
      entry.model.updateWorldMatrix(true,false);
      temp.copy(entry.primaryLocal);
      entry.model.localToWorld(temp);
      rig.worldToLocal(temp);
      r.grip.position.copy(temp);
      l.grip.position.set(-.3,1.05,-1.15);
      setGrip(rightPad,1);
      setGrip(leftPad,0);
      settled=0;
      return;
    }

    // Stage 2: present the held sword in front of the proof camera.
    r.grip.position.set(.14,1.36,-1.15);
    setGrip(rightPad,1);

    if(mode==='one'){
      l.grip.position.set(-.28,1.08,-1.18);
      setGrip(leftPad,0);
      settled++;
      if(settled>20)window.__vrProofReady=true;
      return;
    }

    if(!entry.supporter){
      // Bring the left controller onto the *actual* secondary handle point.
      entry.model.updateWorldMatrix(true,false);
      supportWorld.copy(entry.secondaryLocal);
      entry.model.localToWorld(supportWorld);
      rig.worldToLocal(supportWorld);
      l.grip.position.copy(supportWorld);
      setGrip(leftPad,1);
      settled=0;
      return;
    }

    // Stage 3: once the real secondary-grip path has engaged, move both
    // controllers to a clear two-hand stance. The weapon must solve between
    // these two palm sockets without either hand being used as a fake pivot.
    r.grip.position.set(.13,1.38,-1.18);
    l.grip.position.set(.13,1.10,-1.18);
    setGrip(rightPad,1);
    setGrip(leftPad,1);

    settled++;
    if(settled>20)window.__vrProofReady=true;
  }

  return {update};
}
