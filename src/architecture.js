import * as THREE from 'three';
import {triangle} from './geometry.js';
import {rng,makeSign} from './materials.js';
const random=rng(1996);
const signObjects=[];
export function getSigns(){return signObjects;}
export function roof(b,w,d,eave,rise,material='roof',over=.5){
 const hw=w/2+over,hd=d/2+over;
 // Solid end gables, textured on both ends.
 for(const z of [-d/2,d/2]){
  const a=[-w/2,eave,z],c=[w/2,eave,z],top=[0,eave+rise,z];
  const g=z>0?triangle(a,c,top):triangle(c,a,top);
  b.add(g,'plaster',0,0,0,1,1,1,0,0,0,null,[w/2,rise/2]);g.dispose();
  b.beam('darkwood',a,top,.11);b.beam('darkwood',c,top,.11);b.beam('darkwood',[0,eave,z],top,.1);
  b.box('darkwood',0,eave+.02,z,w+.2,.2,.2);
 }
 const slope=Math.hypot(hw,rise),rows=Math.ceil(slope/.47),cols=Math.ceil((d+over*2)/.42);
 // Every shingle has a small overlap and its own silhouette. Batched by material.
 for(const side of [-1,1]) {
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([0,eave+rise,-hd,side*hw,eave,-hd,side*hw,eave,hd,0,eave+rise,hd],3));g.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,slope/3,0,slope/3,d/3,0,d/3],2));g.setIndex(side===1?[0,3,2,0,2,1]:[0,1,2,0,2,3]);g.computeVertexNormals();b.add(g,material);g.dispose();
  for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
   const t=(row+.45)/rows,tw=(2*hd)/cols,zz=-hd+(col+.5)*tw;
   const jitter=(random()-.5)*.035,y=eave+rise*(1-t)+.027+jitter,x=side*hw*t;
   const tile=new THREE.BoxGeometry(hw/rows*1.12,.028,tw*.96);
   const tilt=side*Math.atan2(-rise,hw);
   b.add(tile,material,x,y,zz,1,1,1,0,0,tilt, new THREE.Color().setScalar(.76+random()*.3),[.09,.1]);tile.dispose();
  }
  for(const z of [-hd,hd])b.beam('darkwood',[0,eave+rise+.02,z],[side*hw,eave-.02,z],.09);
  b.beam('darkwood',[side*hw,eave,-hd],[side*hw,eave,hd],.13);
 }
 b.beam(material,[0,eave+rise+.05,-hd-.1],[0,eave+rise+.05,hd+.1],.14);
}
function archShape(w,h){
 const s=new THREE.Shape();s.moveTo(-w/2,0);s.lineTo(w/2,0);s.lineTo(w/2,h*.64);s.quadraticCurveTo(w*.37,h*.85,0,h);s.quadraticCurveTo(-w*.37,h*.85,-w/2,h*.64);s.closePath();return s;
}
export function arch(b,mat,x,y,z,w,h,depth=.09){
 const g=new THREE.ExtrudeGeometry(archShape(w,h),{depth,bevelEnabled:false,curveSegments:8});b.add(g,mat,x,y,z);g.dispose();
}
function archFrame(b,x,y,z,w,h,mat='stone'){
 const points=[[-w/2,0],[-w/2,h*.64],[-w*.4,h*.8],[0,h],[w*.4,h*.8],[w/2,h*.64],[w/2,0]];
 for(let i=1;i<points.length;i++)b.beam(mat,[x+points[i-1][0],y+points[i-1][1],z],[x+points[i][0],y+points[i][1],z],.12);
}
export function door(b,x,z,y=0,w=1.12,h=2.15,arched=false){
 if(arched){arch(b,'darkwood',x,y,z,w,h);archFrame(b,x,y,z+.1,w+.14,h+.12);}
 else {b.box('darkwood',x,y+h/2,z,w,h,.12);for(const dx of [-w/2-.09,w/2+.09])b.box('wood',x+dx,y+h/2,z+.1,.17,h+.1,.22);b.box('wood',x,y+h+.05,z+.1,w+.34,.18,.22);}
 for(let i=0;i<6;i++)b.box('wood',x-w*.46+i*w*.18,y+h*.47,z+.09,.016,h*.91,.025);
 for(const yy of [y+.4,y+h*.75])b.box('iron',x,yy,z+.13,w*.8,.06,.025);
 b.cylinder('iron',x+w*.25,y+1,z+.15,.045,.045,.08,8);
 b.box('stone',x,y+.045,z+.4,w+.55,.09,.75);
}
function window(b,x,y,z,w=.8,h=1.05,glow=true){
 b.box('darkwood',x,y,z,w+.22,h+.22,.16);
 b.box(glow?'window':'dark',x,y,z+.09,w,h,.035);
 for(const xx of [-w/2,w/2])b.box('wood',x+xx,y,z+.12,.085,h+.15,.1);
 for(const yy of [-h/2,h/2])b.box('wood',x,y+yy,z+.12,w+.12,.085,.12);
 b.box('iron',x,y,z+.13,.036,h,.025);
 b.box('iron',x,y,z+.13,w,.036,.025);
 for(let j=-2;j<3;j++){const yy=y+j*.23;b.beam('iron',[x-w/2,yy-.2,z+.14],[x+w/2,yy+.2,z+.14],.009);}
 b.box('wood',x,y-h/2-.07,z+.16,w+.4,.13,.3);
 for(const side of [-1,1]){b.box('wood',x+side*(w*.75+.12),y,z+.035,w*.42,h+.1,.09,side*.1);for(const oy of [-.34,.34])b.box('iron',x+side*(w*.75+.12),y+oy*h,z+.09,w*.4,.045,.02);}
}
export function lantern(b,x,y,z){
 b.beam('iron',[x,y+.3,z-.3],[x,y+.3,z+.1],.025);
 b.box('iron',x,y+.2,z,.23,.08,.25);b.box('window',x,y,z,.16,.3,.16);
 for(const dx of [-.1,.1])for(const dz of [-.1,.1])b.box('iron',x+dx,y,z+dz,.023,.37,.023);
 b.box('iron',x,y-.2,z,.25,.06,.25);
 const pos=new THREE.Vector3(x,y,z).applyMatrix4(b.root);b.markers.push({kind:'light',x:pos.x,y:pos.y,z:pos.z,color:0xffa14f});
}
function barrel(b,x,z,scale=1){
 b.cylinder('wood',x,.47*scale,z,.34*scale,.29*scale,.94*scale,12);
 for(const y of [.12,.38,.72,.87]){const g=new THREE.TorusGeometry(.34*scale,.018*scale,4,14);b.add(g,'iron',x,y*scale,z,1,1,1,Math.PI/2);g.dispose();}
 b.cylinder('darkwood',x,.95*scale,z,.31*scale,.31*scale,.025,12);
}
function chimney(b,x,z,h){
 b.box('stone',x,h/2,z,.78,h,.9);
 b.box('stone',x,h-.15,z,1.05,.25,1.14);
 b.box('dark',x,h+.015,z,.57,.04,.69);
 const pos=new THREE.Vector3(x,h+.1,z).applyMatrix4(b.root);b.markers.push({kind:'smoke',...pos});
}
export function house(b,spec){
 const {w,d,h,r,kind}=spec;
 b.box('stone',0,.24,0,w+.22,.5,d+.22);
 b.box(kind==='shed'||kind==='witch'?'wood':'plaster',0,(h+.45)/2,0,w,h-.45,d);
 b.collider(w,d);
 for(const x of [-w/2,w/2])for(const z of [-d/2,d/2])b.box('darkwood',x,h/2,z,.22,h,.22);
 for(const z of [-d/2,d/2]){
  b.box('darkwood',0,.6,z,w+.1,.19,.16);b.box('darkwood',0,h-.07,z,w+.1,.22,.2);
  for(let x=-w/2+1.8;x<w/2;x+=1.8)b.box('darkwood',x,h/2,z,.13,h,.16);
  if(kind!=='shed')for(const side of [-1,1]){b.beam('darkwood',[side*w*.45,.7,z+.02],[side*w*.22,h-.15,z+.02],.065);}
 }
 for(const x of [-w/2,w/2]){
  b.box('darkwood',x,.6,0,.17,.19,d);b.box('darkwood',x,h-.07,0,.19,.22,d);
  for(let z=-d/2+2;z<d/2;z+=2)b.box('darkwood',x,h/2,z,.16,h,.15);
 }
 roof(b,w,d,h,r,kind==='witch'?'slate':'roof');
 door(b,kind==='tavern'?-1:0,d/2+.05,0,kind==='tavern'?1.35:1.05,2.15,kind==='tavern');
 if(kind!=='shed'){
  for(const x of [-w*.3,w*.3])window(b,x,1.9,d/2+.1,.68,.95,kind!=='north-house');
  window(b,0,h+r*.38,d/2+.08,.6,.75,true);
  for(const side of [-1,1])b.at(side*w/2,0,0,side*Math.PI/2,()=>{
   for(const z of [-d*.23,d*.23])window(b,z,2,0,.7,1.0,kind==='tavern'||kind==='healer');
  });
  lantern(b,kind==='tavern'?.1:1.1,2.3,d/2+.48);
 }
 if(kind!=='shed'&&kind!=='witch')chimney(b,-w*.31,-d*.2,h+r*.75);
 if(kind==='tavern'){
  b.at(-w/2-1.7,0,-1.2,0,()=>{b.box('plaster',0,1.4,0,3.4,2.8,6.7);b.collider(3.4,6.7);roof(b,3.4,6.7,2.8,2.6);door(b,0,3.4);window(b,0,3.8,3.4,.5,.6);});
  // A projecting gable at the public entrance.
  b.at(-1,0,d/2+1,0,()=>{roof(b,2.7,2.4,2.7,1.4);for(const x of [-1.35,1.35])b.box('darkwood',x,1.4,1, .13,2.8,.13);});
  b.beam('iron',[w/2-.5,3.6,d/2+.1],[w/2-.5,3.6,d/2+2.0],.035);
  b.beam('iron',[w/2-.5,4.05,d/2+.1],[w/2-.5,3.6,d/2+1.9],.025);
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(.85,1.05,.07),makeSign());mesh.position.set(w/2-.5,2.98,d/2+1.55);mesh.applyMatrix4(b.root);signObjects.push(mesh);
  barrel(b,-w/2-.55,d/2+1);barrel(b,-w/2-1.3,d/2+.8,.85);
  b.box('wood',2,.58,d/2+1.3,2.5,.16,.55);for(const x of [1,3])b.box('darkwood',x,.28,d/2+1.3,.18,.55,.4);
 }else if(kind==='smithy'){
  // Open smithing bay beside the enclosed dwelling.
  b.at(-w/2-2.2,0,.8,0,()=>{
   b.box('stone',0,.12,0,4.4,.24,6.8);roof(b,4.6,7.0,3.3,2.0);
   for(const x of [-2.05,2.05])for(const z of [-3.15,3.15]){b.box('darkwood',x,1.6,z,.2,3.2,.2);}
   b.box('stone',0,.65,-1.8,2.4,1.3,1.7);
   b.box('dark',0,1.31,-1.8,1.85,.02,1.2);
   for(let i=0;i<26;i++)b.add(new THREE.DodecahedronGeometry(.10,0),'ember',(random()-.5)*1.45,1.34,-1.8+(random()-.5)*.85);
   b.box('stone',0,2.45,-2.55,2.5,2.9,.4);b.box('stone',-1.08,1.95,-1.9,.35,1.4,1.4);b.box('stone',1.08,1.95,-1.9,.35,1.4,1.4);b.box('stone',0,2.68,-1.9,2.5,.3,1.6);chimney(b,0,-2,5.7);
   b.collider(2.6,2,0,-1.9);
   b.cylinder('bark',0,.45,1.2,.42,.48,.9,10);
   b.box('iron',0,1.05,1.2,.52,.28,.75);b.box('iron',0,1.23,1.2,.68,.14,1.05);b.cylinder('iron',0,.92,1.2,.22,.32,.12,8);
   const horn=new THREE.ConeGeometry(.22,.55,8);b.add(horn,'iron',0,1.19,1.95,1,1,1,Math.PI/2);horn.dispose();
   b.beam('wood',[-1.4,1.1,1.3],[-.8,1.1,1.3],.045);b.box('iron',-1.4,1.1,1.3,.18,.22,.38);
   barrel(b,1.45,2.5,.85);
   b.box('wood',-1.65,.9,.3,.55,.11,2.1);for(const z of [-.5,1.1])b.box('wood',-1.65,.44,z,.14,.88,.14);
   const flame=new THREE.Vector3(0,1.45,-1.8).applyMatrix4(b.root);b.markers.push({kind:'fire',...flame});
  });
 }else if(kind==='healer'){
  barrel(b,-w/2-.5,d/2,.7);
  b.box('wood',2,.83,d/2+1.0,1.5,.12,.6);for(const dx of [1.45,2.55])b.box('darkwood',dx,.42,d/2+1,.1,.84,.5);
  for(let i=0;i<7;i++)b.cylinder(i%2?'redglass':'window',1.5+i*.16,1.03,d/2+.95,.047,.08,.3,8);
 }else if(kind==='witch'){
  b.at(0,0,d/2+1.3,0,()=>{
   b.box('wood',0,.16,0,w+.8,.25,2.8);
   for(const x of [-w/2,w/2])b.beam('darkwood',[x,0,1.4],[x+.1,3.0,1.3],.095);
   b.box('slate',0,3,0,w+.9,.13,3.1);
   b.cylinder('iron',-.9,.55,.6,.6,.46,.65,18);
   b.cylinder('water',-.9,.9,.6,.51,.51,.03,18);
   barrel(b,1.2,.4,.7);
   for(let i=0;i<4;i++)b.beam('bark',[.3+i*.24,2.7,.1],[.35+i*.24,2.05,.1],.026);
  });
 }
}
export function cathedral(b){
 const w=9.8,d=18,h=8.7,r=5.2;
 b.box('stone',0,.4,0,w+.9,.8,d+1);b.box('stone',0,h/2,0,w,h,d);b.collider(w,d);
 roof(b,w,d,h,r,'slate',.35);
 // A lower aisle on each side with stepped external buttresses.
 for(const side of [-1,1]){
  b.at(side*6.45,0,-1,0,()=>{b.box('stone',0,2.6,0,3.1,5.2,15.8);b.collider(3.1,15.8);roof(b,3.3,16,5.2,2.0,'slate',.25);});
  for(let z=-8;z<=8;z+=4){
   b.box('stone',side*8.4,2.2,z,1.0,4.4,1.0);
   b.box('stone',side*8.2,4.2,z,.8,.6,.88);
   b.box('stone',side*5.2,5.8,z,.6,5.9,.65);
  }
  for(let z=-6;z<=6;z+=4)b.at(side*8.04,0,z,side*Math.PI/2,()=>{arch(b,'dark',0,2.0,0,1.0,2.5);arch(b,'redglass',0,2.12,.04,.7,2.2);archFrame(b,0,2,.13,1.15,2.7);b.box('iron',0,3.1,.18,.045,2.1,.06);});
  for(let z=-6;z<=6;z+=4)b.at(side*4.92,0,z,side*Math.PI/2,()=>{arch(b,'dark',0,6.5,.02,1.0,1.8);arch(b,'redglass',0,6.6,.06,.7,1.6);});
 }
 // Projecting entry, rounded apse-like chapel, stairs and pointed stone portals.
 b.at(0,0,11,0,()=>{
  b.box('stone',0,2.8,0,5.3,5.6,4.1);b.collider(5.3,4.1);
  roof(b,5.3,4.1,5.6,3.1,'slate',.35);
  arch(b,'dark',0,.1,2.1,2.8,4.3,.15);archFrame(b,0,.1,2.29,3.2,4.65);
  arch(b,'darkwood',0,.12,2.25,2.25,3.8,.08);
  b.box('iron',0,1.9,2.36,.07,3.5,.04);
  for(const x of [-.55,.55])for(const y of [.8,2.4])b.box('iron',x,y,2.39,.9,.08,.06);
  for(let i=0;i<4;i++)b.box('stone',0,.06+i*.04,3.4-i*.31,3.6-i*.15,.12+i*.08,.65);
  lantern(b,-1.95,2.8,2.65);lantern(b,1.95,2.8,2.65);
 });
 // The square bell tower is offset on the west of the nave as in the original.
 b.at(-6.6,0,-4.7,0,()=>{
  const th=22.5,tw=4.1;b.box('stone',0,th/2,0,tw,th,tw);b.collider(tw,tw);
  for(const y of [1.1,8,14.5,21.7])b.box('stone',0,y,0,tw+.34,.38,tw+.34);
  for(const side of [-1,1])for(const z of [-tw/2,tw/2])b.box('stone',side*tw/2,th/2,z,.42,th,.42);
  for(const a of [0,Math.PI/2,Math.PI,-Math.PI/2])b.at(0,0,0,a,()=>{
   for(const x of [-.9,.9]){
    arch(b,'dark',x,17.6,tw/2+.025,.72,2.75);archFrame(b,x,17.6,tw/2+.1,.85,2.9);
    for(let i=0;i<7;i++)b.box('darkwood',x,17.8+i*.24,tw/2+.16,.68,.075,.08);
   }
   arch(b,'dark',0,10.6,tw/2+.03,.7,1.6);arch(b,'redglass',0,10.72,tw/2+.06,.4,1.3);
  });
  const pyramid=new THREE.ConeGeometry(3.25,4.6,4);b.add(pyramid,'slate',0,th+2.1,0,1,1,1,0,Math.PI/4);pyramid.dispose();
  b.beam('iron',[0,th+4.3,0],[0,th+6.0,0],.055);b.beam('iron',[-.38,th+5.35,0],[.38,th+5.35,0],.05);
 });
 for(const x of [-3.4,3.4])b.box('stone',x,5.3,9.2,.7,10.6,.85);
 arch(b,'dark',0,8.9,9.06,2.0,2.4);arch(b,'redglass',0,9.02,9.12,1.5,2.05);archFrame(b,0,8.9,9.26,2.15,2.65);
 // Narrow mullions, cross and chipped cap stones.
 b.box('stone',0,10.0,9.3,.12,1.9,.16);b.box('stone',0,9.8,9.3,1.5,.12,.16);
 b.beam('iron',[0,13.7,8.8],[0,15.3,8.8],.06);b.beam('iron',[-.4,14.8,8.8],[.4,14.8,8.8],.05);
}
export function townWell(b){
 b.cylinder('stone',0,.08,0,1.25,1.35,.16,16);
 // Open ring rather than a solid cylinder.
 for(let row=0;row<3;row++)for(let i=0;i<16;i++){const a=i*Math.PI/8+(row%2)*Math.PI/16;const rad=.9;b.box('stone',Math.sin(a)*rad,.2+row*.25,Math.cos(a)*rad,.38,.24,.27,a,new THREE.Color().setScalar(.82+random()*.3));}
 b.cylinder('dark',0,.05,0,.75,.75,.04,24);b.cylinder('water',0,.11,0,.7,.7,.025,24);
 for(const x of [-1.02,1.02])b.box('wood',x,.93,0,.14,1.86,.14);
 b.beam('wood',[-1.18,1.76,0],[1.18,1.76,0],.085);
 b.beam('wood',[.3,1.8,0],[.3,.65,0],.018);
 b.cylinder('wood',.3,.6,0,.2,.15,.28,10);
 b.colliders.push({type:'circle',x:b.root.elements[12],z:b.root.elements[14],r:1.08});
}
export function grave(b,style=0){
 b.box('stone',0,.045,.23,.65,.09,1.45);
 if(style%3===0){
  b.box('stone',0,.5,0,.55,.95,.13);const g=new THREE.CylinderGeometry(.275,.275,.14,12,1,false,0,Math.PI);b.add(g,'stone',0,.95,0,1,1,1,Math.PI/2);g.dispose();
 }else if(style%3===1){b.box('stone',0,.62,0,.17,1.2,.18);b.box('stone',0,.87,0,.68,.17,.18);}
 else {b.box('stone',0,.37,0,.55,.7,.16);b.box('stone',0,.75,0,.64,.12,.22);}
 b.box('dark',0,.62,.075,.035,.25,.015);b.box('dark',0,.69,.075,.2,.025,.015);
 for(let i=0;i<3;i++)b.box('dark',0,.43-i*.06,.08,.2-i*.025,.012,.015);
}
