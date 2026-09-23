import * as THREE from 'three';
const unitBox=new THREE.BoxGeometry(1,1,1);
const v=new THREE.Vector3(),n=new THREE.Vector3(),normalMatrix=new THREE.Matrix3();
const color=new THREE.Color(),white=new THREE.Color(1,1,1);
export class Builder {
 constructor(materials){this.materials=materials;this.batches=new Map();this.root=new THREE.Matrix4();this.colliders=[];this.markers=[];}
 at(x,y,z,angle,fn){const prev=this.root;this.root=prev.clone().multiply(new THREE.Matrix4().compose(new THREE.Vector3(x,y,z),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),angle||0),new THREE.Vector3(1,1,1)));fn();this.root=prev;}
 add(geo,material,x=0,y=0,z=0,sx=1,sy=1,sz=1,rx=0,ry=0,rz=0,tint=null,uvScale=null){
  const mat=new THREE.Matrix4().compose(new THREE.Vector3(x,y,z),new THREE.Quaternion().setFromEuler(new THREE.Euler(rx,ry,rz)),new THREE.Vector3(sx,sy,sz));mat.premultiply(this.root);normalMatrix.getNormalMatrix(mat);
  const pos=geo.attributes.position,nor=geo.attributes.normal,uv=geo.attributes.uv,ix=geo.index;
  const origin=new THREE.Vector3().setFromMatrixPosition(mat),key=material+':'+Math.floor(origin.x/24)+':'+Math.floor(origin.z/24);
  let b=this.batches.get(key);if(!b){b={material,p:[],n:[],uv:[],c:[]};this.batches.set(key,b);}
  const c=tint?color.set(tint):white;
  const count=ix?ix.count:pos.count;
  for(let i=0;i<count;i++){const j=ix?ix.getX(i):i;v.fromBufferAttribute(pos,j).applyMatrix4(mat);n.fromBufferAttribute(nor,j).applyMatrix3(normalMatrix).normalize();b.p.push(v.x,v.y,v.z);b.n.push(n.x,n.y,n.z);b.c.push(c.r,c.g,c.b);b.uv.push(uv?uv.getX(j)*(uvScale?.[0]||1):0,uv?uv.getY(j)*(uvScale?.[1]||1):0);}
 }
 box(mat,x,y,z,w,h,d,rot=0,tint=null){
  const geo=unitBox.clone(),uv=geo.attributes.uv;
  for(let f=0;f<6;f++){const u=f<2?d:w,v=f>=2&&f<4?d:h;for(let j=0;j<4;j++){const i=f*4+j;uv.setXY(i,uv.getX(i)*u/2,uv.getY(i)*v/2);}}
  this.add(geo,mat,x,y,z,w,h,d,0,rot,0,tint);geo.dispose();
 }
 beam(mat,a,b,r=.12,tint=null){
  const aV=new THREE.Vector3(...a),bV=new THREE.Vector3(...b),dir=bV.clone().sub(aV),mid=aV.clone().add(bV).multiplyScalar(.5);
  const geo=new THREE.CylinderGeometry(r,r*1.1,dir.length(),6);geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),dir.normalize()));this.add(geo,mat,mid.x,mid.y,mid.z,1,1,1,0,0,0,tint);geo.dispose();
 }
 cylinder(mat,x,y,z,rt,rb,h,segs=12,tint=null){const g=new THREE.CylinderGeometry(rt,rb,h,segs);this.add(g,mat,x,y,z,1,1,1,0,0,0,tint);g.dispose();}
 collider(w,d,x=0,z=0,angle=0){
  const pos=new THREE.Vector3(x,0,z).applyMatrix4(this.root),e=new THREE.Euler().setFromRotationMatrix(this.root);
  this.colliders.push({x:pos.x,z:pos.z,w,d,angle:angle+e.y,type:'box'});
 }
 finish(){
  const group=new THREE.Group();
  for(const [name,b] of this.batches){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(b.p,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(b.n,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(b.uv,2));g.setAttribute('color',new THREE.Float32BufferAttribute(b.c,3));g.computeBoundingSphere();const mesh=new THREE.Mesh(g,this.materials[b.material]);mesh.name=name;mesh.castShadow=!['grass','water','window','ember'].includes(b.material);mesh.receiveShadow=true;group.add(mesh);}
  this.batches.clear();return group;
 }
}
export function triangle(a,b,c){
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([...a,...b,...c],3));g.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,.5,1],2));g.computeVertexNormals();return g;
}
export function canStand(x,z,colliders,r=.26){
 if(Math.abs(x)>77||Math.abs(z)>77)return false;
 for(const c of colliders){
  if(c.type==='circle'){if(Math.hypot(x-c.x,z-c.z)<r+c.r)return false;continue;}
  const co=Math.cos(c.angle),si=Math.sin(c.angle),dx=x-c.x,dz=z-c.z;
  const lx=co*dx-si*dz,lz=si*dx+co*dz;
  if(Math.abs(lx)<c.w/2+r&&Math.abs(lz)<c.d/2+r)return false;
 }return true;
}
