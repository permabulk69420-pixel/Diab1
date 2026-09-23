import test from 'node:test';
import assert from 'node:assert/strict';
import {p,buildingLocal,segmentDistance,spawn,buildings,cathedral} from '../src/layout.js';
test('inverse isometric projection preserves orthogonal plan axes',()=>{
 assert.deepEqual(p(768,384),{x:0,z:0});assert.deepEqual(p(816,408),{x:10,z:0});assert.deepEqual(p(720,408),{x:0,z:10});
});
test('rotated building footprint conversion uses the same rotation as Three.js',()=>{
 const point=buildingLocal(5,2,{at:[768,384],angle:Math.PI/2});assert.ok(Math.abs(point.x+2)<1e-10);assert.ok(Math.abs(point.z-5)<1e-10);
});
test('reference-derived spawn is outside every principal building',()=>{
 for(const b of [...buildings,cathedral]){const q=buildingLocal(spawn.x,spawn.z,b);assert.ok(Math.abs(q.x)>b.w/2+.3||Math.abs(q.z)>b.d/2+.3,b.id||'cathedral');}
});
test('path distance clamps at both endpoints',()=>{
 assert.equal(segmentDistance(-2,0,{x:0,z:0},{x:10,z:0}),2);assert.equal(segmentDistance(5,3,{x:0,z:0},{x:10,z:0}),3);assert.equal(segmentDistance(12,0,{x:0,z:0},{x:10,z:0}),2);
});
