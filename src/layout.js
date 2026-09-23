// Coordinates traced on the user's 1536 x 768 isometric reference.
// The image is a plan, not a ground texture. p() reverses its 2:1 projection.
// 160 m square is an artistic VR scale, not a canonical Diablo measurement.
export const WORLD_SIZE = 160;
export function p(sx, sy) {
  return {x: ((sx-768)/4.8 + (sy-384)/2.4)/2,
          z: ((sy-384)/2.4 - (sx-768)/4.8)/2};
}
export const buildings = [
  {id:'tavern',name:'Tavern of the Rising Sun',at:[700,450],w:8.2,d:10.5,h:4.4,r:4.7,angle:0,kind:'tavern'},
  {id:'smithy',name:"Griswold's smithy",at:[823,503],w:6.8,d:10.6,h:3.1,r:3.4,angle:Math.PI/2,kind:'smithy'},
  {id:'healer',name:"Pepin's house",at:[555,530],w:7.1,d:7.0,h:3.0,r:3.4,angle:Math.PI/2,kind:'healer'},
  {id:'north-house',name:'Northern house',at:[814,380],w:6.7,d:12.0,h:2.9,r:3.2,angle:Math.PI/2},
  {id:'west-house',name:'Western house',at:[555,423],w:6.1,d:7.4,h:2.7,r:3.0,angle:Math.PI/2},
  {id:'south-house',name:'Southern house',at:[690,598],w:6.1,d:7.5,h:2.7,r:3.0,angle:Math.PI/2},
  {id:'east-house',name:'Eastern house',at:[786,567],w:6.0,d:8.5,h:2.8,r:3.1,angle:0},
  {id:'northwest-house',name:'Old cottage',at:[590,313],w:5.6,d:6.8,h:2.6,r:3.1,angle:0},
  {id:'adria',name:"Adria's hut",at:[1240,380],w:5.0,d:5.5,h:2.6,r:1.5,angle:0,kind:'witch'},
  {id:'shed',name:'Pasture shed',at:[1005,276],w:3.4,d:3.8,h:2.2,r:1.9,angle:0,kind:'shed'}
];
export const cathedral = {at:[792,192],w:9.8,d:18,h:8.7,r:5.2,angle:0};
export const well = p(687,532);
export const spawn = p(700,554);
export const roads = [
 {width:3.0,points:[[678,590],[738,611],[820,573],[747,533],[849,479],[803,453],[845,430],[684,349],[749,333],[631,276],[735,224]]},
 {width:3.1,points:[[749,533],[590,454],[647,426],[569,388]]},
 {width:2.4,points:[[648,484],[599,509],[567,528]]},
 {width:1.8,points:[[845,430],[993,350],[1080,330],[1153,365],[1238,398]]},
 {width:2.4,points:[[569,388],[504,348],[476,291],[521,257]]},
 {width:5.5,points:[[802,711],[964,629],[1080,572]]},
 {width:4.0,points:[[1080,190],[1118,218],[1218,265]]}
];
export const riverTraces = [
 [[749,8],[750,48],[707,63],[684,102],[642,129],[630,153],[588,174],[548,176],[541,207],[522,230],[505,260],[485,276],[479,300],[454,327],[451,348],[422,380],[410,407],[386,432],[380,455],[358,474],[284,490],[270,515]],
 [[1261,248],[1270,270],[1233,292],[1230,313],[1205,338],[1168,348],[1142,375],[1096,400],[1059,403],[1034,433],[1001,441],[975,468],[965,493],[940,508],[929,533],[909,558],[890,585],[863,610],[837,636],[829,654],[778,661],[744,678],[711,684],[689,715]],
 [[1437,333],[1418,355],[1386,368],[1366,397],[1337,416],[1291,433],[1277,456],[1229,470],[1208,491],[1171,509],[1127,516],[1094,528],[1054,533],[1016,548],[965,553],[909,558]]
];
export const walls = [
 [[652,125],[725,162]],[[864,144],[961,190],[1037,151]],
 [[582,207],[652,243]],[[686,264],[747,294],[787,274]],
 [[819,294],[967,220],[912,193]],[[962,192],[1209,318]],[[973,190],[1092,165]],
 [[571,371],[598,385]],[[848,557],[829,530]]
];
export const graves = [
 {start:[793,272],cols:8,rows:5},
];
export const bridges = [
 {at:[1153,365],angle:1.18,length:6.2,width:2.9},
 {at:[505,260],angle:1.98,length:5.4,width:2.4}
];
export const views = {
 square:{at:[692,557],look:[697,446]},
 cathedral:{at:[691,278],look:[786,174]},
 smithy:{at:[740,540],look:[823,486]},
 adria:{at:[1175,393],look:[1240,374]},
 graveyard:{at:[866,302],look:[800,190]},
 west:{at:[552,444],look:[700,451]}
};
export function segmentDistance(x,z,a,b) {
 const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz||1)));
 return Math.hypot(x-a.x-t*dx,z-a.z-t*dz);
}
export function roadDistance(x,z) {
 let d=Infinity;
 for(const road of roads)for(let i=1;i<road.points.length;i++)d=Math.min(d,segmentDistance(x,z,p(...road.points[i-1]),p(...road.points[i]))-road.width*.5);
 return d;
}
export function buildingLocal(x,z,b) {
 const at=p(...b.at),c=Math.cos(b.angle||0),s=Math.sin(b.angle||0);
 return {x:c*(x-at.x)-s*(z-at.z),z:s*(x-at.x)+c*(z-at.z)};
}
