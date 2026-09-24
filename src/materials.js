import * as THREE from 'three';
export function rng(seed=71491){return ()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t^=t+Math.imul(t^t>>>7,61|t);return ((t^t>>>14)>>>0)/4294967296;};}
const rand=rng(96);
function canvas(size=512){const c=document.createElement('canvas');c.width=c.height=size;return c;}
function noise(c,amount=16) {
 const ctx=c.getContext('2d'),im=ctx.getImageData(0,0,c.width,c.height);
 for(let i=0;i<im.data.length;i+=4){const n=(rand()-.5)*amount;for(let j=0;j<3;j++)im.data[i+j]+=n;}
 ctx.putImageData(im,0,0);
}
function texture(kind){
 const c=canvas(),g=c.getContext('2d'),s=512;
 if(kind==='stone'){
  g.fillStyle='#3b3c39';g.fillRect(0,0,s,s);
  for(let y=0;y<8;y++)for(let x=-1;x<7;x++){
   const px=x*87+(y%2)*43.5,py=y*64,v=77+rand()*36;
   g.fillStyle='rgb('+v+','+(v*.97)+','+(v*.9)+')';g.fillRect(px+3,py+3,80,57);
   g.strokeStyle='rgba(170,164,145,.25)';g.lineWidth=2;g.strokeRect(px+4,py+4,77,53);
   for(let k=0;k<35;k++){g.fillStyle=rand()>.5?'#ffffff0b':'#00000014';g.fillRect(px+5+rand()*73,py+5+rand()*50,rand()*12,1+rand()*4);}
   if(rand()<.7){g.strokeStyle='#1d252332';g.beginPath();g.moveTo(px+rand()*60,py+5);g.lineTo(px+43,py+26);g.lineTo(px+47,py+57);g.stroke();}
  }
 }else if(kind==='wood'){
  g.fillStyle='#504437';g.fillRect(0,0,s,s);
  for(let i=0;i<900;i++){const x=rand()*s,y=rand()*s;g.strokeStyle=rand()<.5?'rgba(13,13,10,.16)':'rgba(134,118,84,.14)';g.lineWidth=.5+rand()*1.8;g.beginPath();g.moveTo(x,y);g.bezierCurveTo(x+8,y+40,x-6,y+70,x+3,y+130);g.stroke();}
  for(let i=0;i<8;i++){g.fillStyle='#171715';g.fillRect(i*64,0,2,s);}
  for(let i=0;i<12;i++){g.strokeStyle='#211c1580';g.lineWidth=2;g.beginPath();g.ellipse(rand()*512,rand()*512,3+rand()*3,10+rand()*15,0,0,7);g.stroke();}
 }else if(kind==='plaster'){
  g.fillStyle='#93897a';g.fillRect(0,0,s,s);
  for(let i=0;i<16000;i++){const v=rand()>.5?255:0;g.fillStyle='rgba('+v+','+v+','+v+','+(rand()*.035)+')';g.beginPath();g.ellipse(rand()*s,rand()*s,rand()*20,rand()*6,0,0,7);g.fill();}
  for(let i=0;i<160;i++){g.fillStyle='rgba(37,43,29,.035)';g.fillRect(rand()*s,rand()*s,rand()*15,rand()*180);}
  for(let i=0;i<14;i++){let x=rand()*s,y=rand()*s;g.strokeStyle='#37342b60';g.lineWidth=.5;g.beginPath();g.moveTo(x,y);for(let j=0;j<6;j++){x+=(rand()-.5)*20;y+=rand()*18;g.lineTo(x,y);}g.stroke();}
 }else if(kind==='roof'||kind==='slate'){
  g.fillStyle='#1e201d';g.fillRect(0,0,s,s);
  for(let y=0;y<16;y++)for(let x=-1;x<12;x++){
   const px=x*48+(y%2)*24,py=y*32,v=53+rand()*26,sl=kind==='slate';
   g.fillStyle='rgb('+(sl?v*.81:v*1.12)+','+(sl?v*.91:v*.91)+','+(sl?v*1.1:v*.66)+')';g.fillRect(px+1,py+1,45,30);
   g.fillStyle='#c2bca52b';g.fillRect(px+2,py+1,44,2);
   for(let j=0;j<4;j++){g.fillStyle='#07080526';g.fillRect(px+rand()*44,py+1,1,30);}
   g.fillStyle='#0b0e0b99';g.fillRect(px+2,py+30,44,2);
  }
 }else if(kind==='ground'){
  g.fillStyle='#5b5b47';g.fillRect(0,0,s,s);
  for(let i=0;i<45000;i++){const v=rand();g.fillStyle=v<.3?'#252b2240':v<.7?'#8f896f2b':'#bbb08a24';g.fillRect(rand()*s,rand()*s,1+rand()*4,1+rand()*2);}
  for(let i=0;i<2200;i++){g.strokeStyle='#292f2840';g.beginPath();const x=rand()*s,y=rand()*s;g.moveTo(x,y);g.lineTo(x+rand()*5,y-rand()*7);g.stroke();}
 }else if(kind==='dirt'){
  g.fillStyle='#6c5949';g.fillRect(0,0,s,s);
  for(let i=0;i<29000;i++){const v=rand();g.fillStyle=v<.4?'#3c352d50':v<.8?'#b4a18638':'#77736a';const x=rand()*s,y=rand()*s;g.fillRect(x,y,1+rand()*4,1+rand()*3);}
 }else if(kind==='flagstone'){
  // Irregular worn slabs, 512 px = 4 m of floor.
  g.fillStyle='#1b1a18';g.fillRect(0,0,s,s);
  let y=0;
  while(y<s){const rh=Math.min(s-y,56+Math.floor(rand()*60));let x=-Math.floor(rand()*60);
   while(x<s){const rw=60+Math.floor(rand()*110),v=58+rand()*30,warm=rand()*6;
    g.fillStyle='rgb('+(v+warm)+','+(v*.96+warm*.5)+','+(v*.9)+')';g.fillRect(x+3,y+3,rw-5,rh-5);
    for(let k=0;k<22;k++){g.fillStyle=rand()>.5?'#ffffff08':'#0000001a';g.beginPath();g.ellipse(x+rand()*rw,y+rand()*rh,2+rand()*14,1+rand()*6,rand()*3,0,7);g.fill();}
    if(rand()<.35){g.strokeStyle='#0c0b0a90';g.lineWidth=1.2;g.beginPath();let cx=x+rand()*rw,cy=y+3;g.moveTo(cx,cy);for(let j=0;j<5;j++){cx+=(rand()-.5)*26;cy+=rh/5;g.lineTo(cx,cy);}g.stroke();}
    g.fillStyle='#00000030';g.fillRect(x+3,y+rh-6,rw-5,3);g.fillStyle='#ffffff0c';g.fillRect(x+3,y+3,rw-5,2);
    x+=rw;}
   y+=rh;}
  for(let i=0;i<9000;i++){g.fillStyle=rand()<.5?'#0a090822':'#9a8e7a14';g.fillRect(rand()*s,rand()*s,1+rand()*2,1+rand()*2);}
 }else if(kind==='ashlar'){
  // Big dressed blocks with damp streaks; 512 px = 2 m of wall.
  g.fillStyle='#161513';g.fillRect(0,0,s,s);
  for(let row=0;row<6;row++){const py=row*86,off=(row%2)*70+rand()*20;
   for(let x=-160;x<s+160;){const bw=110+rand()*90,v=60+rand()*26,px=x+off;
    g.fillStyle='rgb('+(v*1.02)+','+(v*.97)+','+(v*.9)+')';g.fillRect(px+3,py+3,bw-6,80);
    const grd=g.createLinearGradient(0,py,0,py+86);grd.addColorStop(0,'#ffffff10');grd.addColorStop(1,'#00000030');g.fillStyle=grd;g.fillRect(px+3,py+3,bw-6,80);
    for(let k=0;k<40;k++){g.fillStyle=rand()>.55?'#ffffff09':'#00000018';g.fillRect(px+5+rand()*(bw-12),py+5+rand()*72,rand()*10,1+rand()*3);}
    if(rand()<.25){g.fillStyle='#0000002a';g.beginPath();g.moveTo(px+rand()*bw,py+3);g.lineTo(px+rand()*bw,py+83);g.lineTo(px+rand()*bw,py+83);g.fill();}
    x+=bw;}
  }
  for(let i=0;i<34;i++){const x=rand()*s;const grd=g.createLinearGradient(0,0,0,s);grd.addColorStop(0,'#1a201800');grd.addColorStop(.6,'#1a20182a');grd.addColorStop(1,'#10140f55');g.fillStyle=grd;g.fillRect(x,rand()*s*.5,4+rand()*16,s);}
 }else if(kind==='bark'){
  g.fillStyle='#443d32';g.fillRect(0,0,s,s);
  for(let i=0;i<2200;i++){g.strokeStyle=rand()<.5?'#120f0c40':'#99907730';g.lineWidth=1+rand()*3;g.beginPath();let x=rand()*s,y=rand()*s;g.moveTo(x,y);g.lineTo(x+rand()*12,y+20+rand()*90);g.stroke();}
 }
 noise(c,18);
 const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=4;return t;
}
export function makeMaterials(){
 const m={};
 function make(name,color,map,more={}){
  m[name]=new THREE.MeshStandardMaterial({color,map,roughness:.94,vertexColors:true,...more});m[name].name=name;return m[name];
 }
 for(const k of ['stone','wood','plaster','roof','slate','ground','dirt','bark']){const t=texture(k);make(k,0xffffff,t,{bumpMap:t,bumpScale:k==='stone'?.07:k==='wood'?.035:.025});}
 make('darkwood',0x504638,m.wood.map,{bumpMap:m.wood.map,bumpScale:.04});
 make('iron',0x343b3d,null,{roughness:.7,metalness:.65});
 make('rock',0x626871,m.stone.map,{bumpMap:m.stone.map,bumpScale:.05});
 make('mortar',0x595a53);
 make('dark',0x131817);
 make('gold',0x8c7041,null,{metalness:.65,roughness:.55});
 make('window',0xc47a30,null,{emissive:0xf78b2a,emissiveIntensity:.5,roughness:.6});
 make('redglass',0x691c17,null,{emissive:0xdc2d14,emissiveIntensity:.55});
 make('grass',0x757455);
 make('leaf',0x68503a);
 make('ember',0xf57a1a,null,{emissive:0xff5c05,emissiveIntensity:2.8});
 make('water',0x273e46,null,{roughness:.24,metalness:.48});
 make('bone',0xa79f85);
 return m;
}
export function makeSign(){
 const c=canvas(512),g=c.getContext('2d');g.fillStyle='#302b20';g.fillRect(0,0,512,512);
 g.strokeStyle='#a69156';g.lineWidth=12;g.strokeRect(22,22,468,468);g.strokeStyle='#796838';g.lineWidth=3;g.strokeRect(42,42,428,428);
 g.save();g.translate(256,224);g.fillStyle='#c4a461';g.beginPath();g.arc(0,0,69,Math.PI,Math.PI*2);g.fill();
 g.strokeStyle='#b29550';g.lineWidth=7;
 for(let i=0;i<11;i++){const a=Math.PI+i*Math.PI/10;g.beginPath();g.moveTo(Math.cos(a)*85,Math.sin(a)*85);g.lineTo(Math.cos(a)*116,Math.sin(a)*116);g.stroke();}
 g.beginPath();g.moveTo(-130,8);g.lineTo(130,8);g.stroke();g.restore();
 g.textAlign='center';g.fillStyle='#cebd8d';g.font='30px Georgia';g.fillText('THE RISING SUN',256,308);g.font='22px Georgia';g.fillText('T A V E R N',256,352);noise(c,13);
 const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;
 return new THREE.MeshStandardMaterial({map:t,roughness:.9});
}

let dungeonCache=null;
/** Cathedral-level materials, layered on top of the town set (shared textures stay shared). */
export function makeDungeonMaterials(base){
 if(dungeonCache)return dungeonCache;
 const m=Object.assign({},base);
 const mk=(name,mat)=>{mat.name=name;m[name]=mat;return mat;};
 const flag=texture('flagstone'),ash=texture('ashlar');
 mk('flag',new THREE.MeshStandardMaterial({color:0xb9b8b2,map:flag,bumpMap:flag,bumpScale:.05,roughness:.92,vertexColors:true}));
 mk('ashlar',new THREE.MeshStandardMaterial({color:0xa9a6a0,map:ash,bumpMap:ash,bumpScale:.06,roughness:.95,vertexColors:true}));
 mk('vault',new THREE.MeshStandardMaterial({color:0x6d675f,map:ash,roughness:1,vertexColors:true}));
 mk('blood',new THREE.MeshStandardMaterial({color:0x2c0504,roughness:.32,metalness:.1,vertexColors:true,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}));
 mk('cloth',new THREE.MeshStandardMaterial({color:0x5a1110,roughness:.85,vertexColors:true}));
 mk('wax',new THREE.MeshStandardMaterial({color:0xd8cdb0,roughness:.6,emissive:0x3a2208,emissiveIntensity:.4,vertexColors:true}));
 mk('void',new THREE.MeshBasicMaterial({color:0x000000,vertexColors:true}));
 mk('daylight',new THREE.MeshBasicMaterial({color:0x9aa9b6,vertexColors:true,fog:false}));
 // Merged torch flames: additive, vertex-wobbled by uv.y (0 at the base, 1 at the tip).
 const flame=mk('flame',new THREE.MeshBasicMaterial({color:0xffffff,vertexColors:true,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,fog:true}));
 flame.onBeforeCompile=sh=>{sh.uniforms.uTime={value:0};flame.userData.shader=sh;
  sh.vertexShader='uniform float uTime;\n'+sh.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nfloat fPh=position.x*3.7+position.z*2.3;float fT=uv.y*uv.y;transformed.x+=sin(uTime*11.0+fPh)*.045*fT;transformed.z+=cos(uTime*8.7+fPh*1.7)*.045*fT;transformed.y+=sin(uTime*14.0+fPh)*.03*fT;');};
 return dungeonCache=m;
}
