import * as THREE from 'three';
import {Builder,triangle} from './geometry.js';
import {makeMaterials,rng} from './materials.js';
import {house,cathedral as makeCathedral,townWell,grave,getSigns} from './architecture.js';
import {p,buildings,cathedral,well,roads,riverTraces,walls,bridges,roadDistance,buildingLocal} from './layout.js';
const rand=rng(19970923);
const smooth=(a,b,v)=>{const t=THREE.MathUtils.clamp((v-a)/(b-a),0,1);return t*t*(3-2*t);};
const streams=riverTraces.map(points=>{
 const curve=new THREE.CatmullRomCurve3(points.map(q=>{const v=p(...q);return new THREE.Vector3(v.x,0,v.z);}),false,'catmullrom',.2);
 return curve.getPoints(points.length*6).map(v=>({x:v.x,z:v.z}));
});
function streamInfo(x,z){
 let dist=Infinity,closest;
 for(const points of streams)for(let i=1;i<points.length;i++){
  const a=points[i-1],c=points[i],dx=c.x-a.x,dz=c.z-a.z;
  const t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz||1)));
  const d=Math.hypot(x-a.x-t*dx,z-a.z-t*dz);
  if(d<dist){dist=d;closest=i;}
 }return {dist,closest};
}
const terrainGrid=new Float32Array(321*321);
function rawGround(x,z){return .065*Math.sin(x*.14)*Math.cos(z*.18)+.025*Math.sin((x+z)*.83);}
function heightField(x,z){
 const river=streamInfo(x,z).dist;
 return rawGround(x,z)-.86*(1-smooth(.55,2.6,river));
}
for(let zi=0;zi<=320;zi++)for(let xi=0;xi<=320;xi++)terrainGrid[zi*321+xi]=heightField(xi*.5-80,zi*.5-80);
export function groundHeight(x,z){
 const fx=Math.max(0,Math.min(319.999,(x+80)*2)),fz=Math.max(0,Math.min(319.999,(z+80)*2)),ix=Math.floor(fx),iz=Math.floor(fz),u=fx-ix,v=fz-iz;
 return THREE.MathUtils.lerp(THREE.MathUtils.lerp(terrainGrid[iz*321+ix],terrainGrid[iz*321+ix+1],u),THREE.MathUtils.lerp(terrainGrid[(iz+1)*321+ix],terrainGrid[(iz+1)*321+ix+1],u),v);
}
export function onBridge(x,z){
 for(const br of bridges){const pos=p(...br.at),dx=x-pos.x,dz=z-pos.z,c=Math.cos(br.angle),s=Math.sin(br.angle);
  if(Math.abs(c*dx-s*dz)<br.width*.5-.2&&Math.abs(s*dx+c*dz)<br.length*.5+.7)return true;
 }return false;
}
export function walkHeight(x,z){return onBridge(x,z)?.22:Math.max(-.06,groundHeight(x,z));}
export function waterBlocked(x,z){return groundHeight(x,z)<-.32&&!onBridge(x,z);}
function avoidBuilding(x,z,margin=2){
 for(const spec of [...buildings,{...cathedral,w:19,d:29}]){const v=buildingLocal(x,z,spec);if(Math.abs(v.x)<spec.w/2+margin&&Math.abs(v.z)<spec.d/2+margin)return true;}
 return Math.hypot(x-well.x,z-well.z)<3;
}
function groundMesh(mat){
 const geo=new THREE.PlaneGeometry(160,160,200,200);geo.rotateX(-Math.PI/2);
 const pos=geo.attributes.position,colors=[],c=new THREE.Color(),base=new THREE.Color('#b6b49c');
 for(let i=0;i<pos.count;i++){
  const x=pos.getX(i),z=pos.getZ(i),y=groundHeight(x,z);pos.setY(i,y);
  let val=.72+.13*Math.sin(x*.39)*Math.sin(z*.3)+rand()*.1;
  if(y<-.1)val*=.55;
  for(const spec of buildings){const at=p(...spec.at),l=buildingLocal(x,z,spec);const d=Math.max(Math.abs(l.x)-spec.w/2,Math.abs(l.z)-spec.d/2);if(d<2.2)val*=.48+.52*smooth(-.3,2.2,d);}
  c.copy(base).multiplyScalar(val);colors.push(c.r,c.g,c.b);
 }
 geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geo.computeVertexNormals();
 geo.attributes.uv.array.forEach((v,i,a)=>a[i]=v*53);
 const mesh=new THREE.Mesh(geo,mat);mesh.receiveShadow=true;mesh.name='Undulating ground and recessed stream beds';return mesh;
}
function addRoad(b,road){
 for(let i=1;i<road.points.length;i++){
  const a=p(...road.points[i-1]),c=p(...road.points[i]),dx=c.x-a.x,dz=c.z-a.z,len=Math.hypot(dx,dz),nx=-dz/len,nz=dx/len,steps=Math.ceil(len/.6);
  for(let j=0;j<steps;j++){
   const t=j/steps,t2=(j+1)/steps,w=road.width/2,edge1=w*(.93+rand()*.14),edge2=w*(.93+rand()*.14);
   const vertices=[],uvs=[],cols=[];
   for(const [t0,e,s] of [[t,edge1,-1],[t,edge1,1],[t2,edge2,-1],[t2,edge2,1]]){
    const x=a.x+dx*t0+nx*e*s,z=a.z+dz*t0+nz*e*s;vertices.push(x,groundHeight(x,z)+.018,z);uvs.push((s+1)*w/2,t0*len/2);
   }
   const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.setIndex([0,1,2,2,1,3]);g.computeVertexNormals();b.add(g,'dirt',0,0,0,1,1,1,0,0,0,new THREE.Color().setScalar(.77+rand()*.09));g.dispose();
   if(j%3===0)for(const side of [-1,1]){const x=a.x+dx*t+nx*(w+.16)*side,z=a.z+dz*t+nz*(w+.16)*side;if(groundHeight(x,z)>-.2)b.box('dirt',x,groundHeight(x,z)+.021,z,.25+rand()*.3,.025,.18+rand()*.3,rand()*3);}
  }
 }
}
function tree(b,x,z,size=1,seed=5){
 const r=rng(seed),h=4.5*size,y=groundHeight(x,z),lean=(r()-.5)*.55;
 b.at(x,y,z,r()*6.28,()=>{
  const base=[0,0,0],mid=[lean,h*.55,.1],top=[lean+.15,h,-.13];
  b.beam('bark',base,mid,.19*size);b.beam('bark',mid,top,.105*size);
  for(let i=0;i<7;i++){
   const az=r()*Math.PI*2,yy=h*(.35+r()*.5),len=(.65+r()*.85)*size;
   const start=[lean*yy/h,yy,0],elbow=[start[0]+Math.cos(az)*len*.62,yy+len*.25,Math.sin(az)*len*.62],end=[start[0]+Math.cos(az)*len,yy+len*.95,Math.sin(az)*len];
   b.beam('bark',start,elbow,.065*size);b.beam('bark',elbow,end,.035*size);
   for(let j=0;j<3;j++){const a=az+(j-1)*.8,t=[end[0]+Math.cos(a)*size*.48,end[1]+size*(.3+r()*.5),end[2]+Math.sin(a)*size*.48];b.beam('bark',end,t,.013*size);}
   if(i%3===0&&r()>.45)for(let j=0;j<5;j++){
    const vx=end[0]+(r()-.5)*.55,vy=end[1]+(r()-.5)*.35,vz=end[2]+(r()-.5)*.55;
    const leaf=triangle([vx,vy,vz],[vx+.11,vy+.05,vz+.1],[vx+.04,vy+.19,vz]);b.add(leaf,'leaf');leaf.dispose();
   }
  }
  for(let i=0;i<4;i++){const a=i*Math.PI/2;b.beam('bark',[0,.12,0],[Math.sin(a)*.55*size,0,Math.cos(a)*.55*size],.07*size);}
 });
 if(size>.7)b.colliders.push({type:'circle',x,z,r:.22*size});
}
function rock(b,x,z,scale=1){
 const g=new THREE.DodecahedronGeometry(1,0),pos=g.attributes.position;
 for(let i=0;i<pos.count;i++){const n=.8+rand()*.24;pos.setXYZ(i,pos.getX(i)*n,pos.getY(i)*n,pos.getZ(i)*n);}g.computeVertexNormals();
 b.add(g,'rock',x,groundHeight(x,z)+scale*.35,z,scale,scale*.63,scale*.82,rand()*.3,rand()*6,rand()*.2,new THREE.Color().setScalar(.66+rand()*.35));g.dispose();
 if(scale>.68)b.colliders.push({type:'circle',x,z,r:scale*.65});
}
function stoneWall(b,a,c){
 const dx=c.x-a.x,dz=c.z-a.z,len=Math.hypot(dx,dz),angle=Math.atan2(dx,dz),n=Math.ceil(len/.85);
 for(let i=0;i<n;i++){
  const t=(i+.5)/n,x=a.x+dx*t,z=a.z+dz*t;if(groundHeight(x,z)<-.3)continue;
  const broken=rand()<.11;
  for(let row=0;row<(broken?1:3);row++)b.box('stone',x,groundHeight(x,z)+.17+row*.28,z,.58,.27,len/n*.94,angle,new THREE.Color().setScalar(.7+rand()*.3));
 }
 b.at((a.x+c.x)/2,0,(a.z+c.z)/2,angle,()=>b.collider(.66,len));
}
function bridge(b,br){
 const at=p(...br.at);
 b.at(at.x,.19,at.z,br.angle,()=>{
  for(let i=0;i<22;i++)b.box('wood',(rand()-.5)*.05,0,-br.length/2+(i+.5)*br.length/22,br.width,.13,br.length/22*.92);
  for(const x of [-br.width*.42,br.width*.42])b.box('darkwood',x,-.17,0,.2,.3,br.length+.35);
  for(const side of [-1,1]){
   for(const z of [-br.length/2,0,br.length/2]){b.box('darkwood',side*br.width/2,.45,z,.15,1.1,.15);}
   b.beam('wood',[side*br.width/2,.92,-br.length/2],[side*br.width/2,.92,br.length/2],.055);
  }
 });
}
function addWater(b){
 for(const points of streams)for(let i=1;i<points.length;i++){
  const a=points[i-1],c=points[i],dx=c.x-a.x,dz=c.z-a.z,len=Math.hypot(dx,dz),nx=-dz/(len||1),nz=dx/(len||1);
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([a.x+nx*.97,-.49,a.z+nz*.97,a.x-nx*.97,-.49,a.z-nz*.97,c.x+nx*.97,-.49,c.z+nz*.97,c.x-nx*.97,-.49,c.z-nz*.97],3));g.setAttribute('uv',new THREE.Float32BufferAttribute([a.x*.3,a.z*.3,a.x*.3+.5,a.z*.3,c.x*.3,c.z*.3,c.x*.3+.5,c.z*.3],2));g.setIndex([0,2,1,1,2,3]);g.computeVertexNormals();b.add(g,'water');g.dispose();
  if(i%3===0)for(const side of [-1,1]){const x=a.x+nx*1.7*side,z=a.z+nz*1.7*side;rock(b,x,z,.12+rand()*.15);}
 }
}
export function buildWorld(scene){
 const materials=makeMaterials(),b=new Builder(materials);
 // Gentle water normals without reflection passes, foam sprites or refraction.
 materials.water.onBeforeCompile=s=>{s.uniforms.uTime={value:0};materials.water.userData.shader=s;s.vertexShader='varying vec3 vWaterWorld;\n'+s.vertexShader.replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvWaterWorld=(modelMatrix*vec4(transformed,1.)).xyz;');s.fragmentShader='uniform float uTime; varying vec3 vWaterWorld;\n'+s.fragmentShader.replace('#include <normal_fragment_maps>','#include <normal_fragment_maps>\nnormal.x += sin(vWaterWorld.x*8.0+vWaterWorld.z*4.0+uTime*.7)*.055; normal.z+=sin(vWaterWorld.z*15.0-uTime*.8)*.038; normal=normalize(normal);');};
 scene.add(groundMesh(materials.ground));
 for(const road of roads)addRoad(b,road);
 // The bare, roughly square town commons.
 b.at(well.x,0,well.z,0,()=>{
  for(let ix=-7;ix<=7;ix++)for(let iz=-6;iz<=6;iz++)if(Math.abs(ix)+Math.abs(iz)*.55<9){
   b.box('dirt',ix*.64,.027,iz*.64,.67,.035,.67,0,new THREE.Color().setScalar(.8+rand()*.12));
  }
  townWell(b);
 });
 for(const spec of buildings){const at=p(...spec.at);b.at(at.x,0,at.z,spec.angle||0,()=>house(b,spec));}
 const cat=p(...cathedral.at);b.at(cat.x,0,cat.z,0,()=>makeCathedral(b));
 for(const line of walls)for(let i=1;i<line.length;i++)stoneWall(b,p(...line[i-1]),p(...line[i]));
 // Cemetery rows follow the isometric axes beside the cathedral.
 const cemetery=p(831,258);
 for(let row=0;row<5;row++)for(let col=0;col<7;col++){
  const x=cemetery.x+col*2.0-6,z=cemetery.z+row*2.5-5;
  b.at(x,groundHeight(x,z),z,(rand()-.5)*.12,()=>grave(b,row*7+col));
  b.colliders.push({type:'circle',x,z,r:.36});
 }
 addWater(b);for(const br of bridges)bridge(b,br);
 // Hand-placed trees preserve the recognizable open spaces and sight lines.
 const treeSpots=[[753,246],[671,312],[889,316],[926,395],[939,449],[966,476],[844,484],[805,545],[627,365],[615,485],[497,431],[691,630],[850,599],[1007,323],[1030,370],[1111,359],[1311,417],[1176,472],[1204,387],[1294,354],[910,96],[958,136],[583,140],[572,247],[590,334],[757,696],[1096,282],[689,138],[924,244],[787,322]];
 for(let i=0;i<treeSpots.length;i++){const at=p(...treeSpots[i]);if(!avoidBuilding(at.x,at.z,.8)&&groundHeight(at.x,at.z)>-.1)tree(b,at.x,at.z,.65+rand()*.45,700+i);}
 // Dense rocky western margin, sparse boulders in town, a few distant trees.
 for(let i=0;i<1120;i++){
  const x=rand()*156-78,z=rand()*156-78,edge=x<-51||z>65||z<-72||x>73;
  if(!edge&&rand()>.11)continue;
  if(avoidBuilding(x,z,2)||roadDistance(x,z)<1||groundHeight(x,z)<-.14)continue;
  rock(b,x,z,edge?.38+rand()*.9:.22+rand()*.62);
 }
 for(let i=0;i<210;i++){
  const x=rand()*150-75,z=rand()*150-75;
  if(avoidBuilding(x,z,4)||roadDistance(x,z)<3||groundHeight(x,z)<-.14)continue;
  const edge=x<-52||z>64||z<-65||x>67;
  if(!edge&&rand()>.36)continue;
  tree(b,x,z,.5+rand()*.85,i+429);
 }
 // Small grass tufts, roots, scattered pebbles; no expensive alpha foliage.
 for(let i=0;i<12500;i++){
  const x=rand()*150-75,z=rand()*150-75;
  if(avoidBuilding(x,z,.7)||roadDistance(x,z)<.3||groundHeight(x,z)<-.13)continue;
  const y=groundHeight(x,z),h=.08+rand()*.22;
  for(let j=0;j<2;j++){const a=rand()*6.28,dx=Math.cos(a)*.035,dz=Math.sin(a)*.035;const g=triangle([x-dx,y,z-dz],[x+dx,y,z+dz],[x+dx*2,y+h,z+dz*2]);b.add(g,'grass',0,0,0,1,1,1,0,0,0,new THREE.Color().setScalar(.5+rand()*.5));g.dispose();}
 }
 // Two abandoned handcarts, timber racks and stacked firewood.
 for(const at of [[633,391],[854,509]]){
  const pos=p(...at);b.at(pos.x,0,pos.z,-.2,()=>{
   b.box('wood',0,.6,0,1.25,.14,2.05);
   for(const x of [-.64,.64]){for(let i=0;i<3;i++)b.box('wood',x,.82+i*.2,0,.08,.15,2.1);
    const g=new THREE.TorusGeometry(.46,.065,6,16);b.add(g,'darkwood',x*1.25,.47,0,1,1,1,0,Math.PI/2);g.dispose();
    for(let i=0;i<8;i++){const a=i*Math.PI/4;b.beam('wood',[x*1.25,.47,0],[x*1.25,.47+Math.sin(a)*.43,Math.cos(a)*.43],.026);}
   }
   for(const x of [-.45,.45])b.beam('wood',[x,.5,1],[x,.2,2.7],.05);
   b.collider(1.8,2.3);
  });
 }
 const all=b.finish();all.name='Tristram architecture and landscape';scene.add(all);
 for(const sign of getSigns())scene.add(sign);
 // Strong close light pools are baked decals; only two live lights follow nearby fires.
 const glows=new THREE.Group();const cg=document.createElement('canvas');cg.width=cg.height=128;const cx=cg.getContext('2d'),grad=cx.createRadialGradient(64,64,2,64,64,64);grad.addColorStop(0,'rgba(255,145,57,.35)');grad.addColorStop(.5,'rgba(255,108,25,.13)');grad.addColorStop(1,'rgba(255,100,20,0)');cx.fillStyle=grad;cx.fillRect(0,0,128,128);
 const glowTex=new THREE.CanvasTexture(cg);
 for(const marker of b.markers.filter(m=>m.kind==='light'||m.kind==='fire')){
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(4.8,4.8),new THREE.MeshBasicMaterial({map:glowTex,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,polygonOffset:true,polygonOffsetFactor:-2}));
  mesh.rotation.x=-Math.PI/2;mesh.position.set(marker.x,.055,marker.z);glows.add(mesh);
 }
 scene.add(glows);
 return {colliders:b.colliders,markers:b.markers,materials,streams};
}
