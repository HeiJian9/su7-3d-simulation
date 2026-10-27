import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {Group,Mesh,BufferGeometry,Float32BufferAttribute,MeshBasicMaterial,DoubleSide,Raycaster,Vector3,Triangle} from 'three';

const doc=await new NodeIO().registerExtensions(ALL_EXTENSIONS).read('apps/web/public/models/su7-runtime.glb');
const nodes=doc.getRoot().listNodes();
const changed=new Set(['Paint5','Mesh17','Mesh18','Mesh19','Mesh20','Mesh21','Mesh23','Mesh24','Mesh25','Mesh58','Mesh71','Mesh52','Mesh55','Mesh56','TRUNK_REAR_ROOT','TURN_LEFT_REAR_BODY','TURN_RIGHT_REAR_BODY']);
function untouched(node){return !changed.has(node.getName())&&!node.getName().startsWith('TRUNK_')&&!node.getName().endsWith('_REAR_LID')&&!node.getName().startsWith('BODY_REAR_LAMP_END_');}
function signature(node){
  const arrays=node.getMesh()?.listPrimitives().map(p=>({
    positions:[...p.getAttribute('POSITION').getArray()],indices:p.getIndices()?[...p.getIndices().getArray()]:null,
    uv:p.getAttribute('TEXCOORD_0')?[...p.getAttribute('TEXCOORD_0').getArray()]:null,
    targets:p.listTargets().map(t=>[...t.getAttribute('POSITION').getArray()]),
  }));
  return createHash('sha256').update(JSON.stringify({world:node.getWorldMatrix(),arrays,parent:node.getParentNode()?.getName()})).digest('hex');
}
const baselinePath='docs/assets/trunk-correction-baseline.json';
if(process.argv.includes('--capture-baseline')){
  assert.ok(!nodes.find(n=>n.getName()==='TRUNK_BODY_FLANGE'),'Capture only the pre-correction model');
  await writeFile(baselinePath,JSON.stringify({sourceRevision:'b19870f',untouched:Object.fromEntries(nodes.filter(untouched).map(n=>[n.getName(),signature(n)]))},null,2)+'\n');
  console.log('Captured untouched geometry/UV/morph/transform signatures; no old asset copied.');
  process.exit(0);
}
const baseline=JSON.parse(await readFile(baselinePath,'utf8'));
for(const [name,hash] of Object.entries(baseline.untouched))assert.equal(signature(nodes.find(n=>n.getName()===name)),hash,`Unrelated component changed: ${name}`);
const mapping=JSON.parse(await readFile('docs/assets/vehicle-mapping.json','utf8'));
const objects=new Map(),ray=new Raycaster();
function convert(node){
  const out=new Group();out.name=node.getName();out.position.fromArray(node.getTranslation());out.quaternion.fromArray(node.getRotation());out.scale.fromArray(node.getScale());objects.set(out.name,out);
  for(const p of node.getMesh()?.listPrimitives()??[]){
    const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(p.getAttribute('POSITION').getArray(),3));if(p.getIndices())g.setIndex([...p.getIndices().getArray()]);
    const m=new Mesh(g,new MeshBasicMaterial({side:DoubleSide}));m.name=out.name;m.userData.glass=p.getMaterial()?.getAlphaMode()==='BLEND';out.add(m);
  }
  for(const child of node.listChildren())out.add(convert(child));return out;
}
const scene=new Group();for(const n of doc.getRoot().getDefaultScene().listChildren())scene.add(convert(n));scene.updateMatrixWorld(true);
const lid=objects.get(mapping.trunk.node);
assert.ok(!objects.has('TRUNK_SEAL'),'Old unsupported wire hoop must be removed');
for(const name of [...mapping.trunk.sourceParts,'TRUNK_INNER_SKIN','TRUNK_LID_EDGE_RETURNS','TRUNK_HINGE_LEFT','TRUNK_HINGE_RIGHT'])assert.ok(lid.getObjectByName(name),`Missing complete lid component ${name}`);
for(const name of ['TRUNK_BODY_FLANGE','TRUNK_BODY_GASKET','TRUNK_INNER_CAVITY','BODY_REAR_LAMP_END_LEFT','BODY_REAR_LAMP_END_RIGHT'])assert.equal(objects.get(name).parent,objects.get('SU7_ROOT'),`Fixed opening component ${name}`);
const points=(name)=>{const out=[];objects.get(name).traverse(o=>{const p=o.geometry?.getAttribute('position');if(p)for(let i=0;i<p.count;i++)out.push(new Vector3().fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld));});return out;};
const center=(name)=>{const p=points(name);return p.reduce((sum,v)=>sum.add(v),new Vector3()).divideScalar(p.length);};
const fixedNames=Object.keys(baseline.untouched),fixedCenters=Object.fromEntries(fixedNames.filter(n=>objects.get(n).children.some(c=>c.isMesh)).map(n=>[n,center(n)]));
function probe(x,y,z,dir){scene.updateMatrixWorld(true);ray.set(new Vector3(x,y,z),new Vector3(...dir).normalize());return ray.intersectObject(scene,true).filter(h=>!h.object.userData.glass).map(h=>({node:h.object.name,point:h.point.toArray()}));}
const closedBadges=Object.fromEntries(mapping.trunk.requiredMovingBadges.map(n=>[n,center(n)]));
const fascia=[-.45,0,.45].map(x=>({x,closed:probe(x,.68,3,[0,0,-1])[0]}));
for(const p of fascia)assert.ok(lid.getObjectByName(p.closed.node),`Rear fascia remains on body at ${p.x}`);
const rearBumper=probe(0,.57,3,[0,0,-1])[0];assert.ok(!lid.getObjectByName(rearBumper.node),'Lower bumper must stay fixed');
const states=[];
for(const amount of [0,.5,1]){
  lid.rotation.x=mapping.trunk.maxAngle*amount;scene.updateMatrixWorld(true);
  const badges=Object.fromEntries(Object.entries(closedBadges).map(([name,start])=>[name,{center:center(name).toArray(),travel:center(name).distanceTo(start)}]));
  if(amount>0)for(const b of Object.values(badges))assert.ok(b.travel>.25,'All rear badges must move with the whole lid');
  for(const [name,start] of Object.entries(fixedCenters))assert.ok(center(name).distanceTo(start)<1e-6,`Fixed body/glass or other rig moved: ${name}`);
  states.push({amount,badges});
}
const openings=fascia.map(p=>({x:p.x,hit:probe(p.x,.68,3,[0,0,-1])[0]}));
for(const p of openings){assert.equal(p.hit.node,'TRUNK_INNER_CAVITY');assert.ok(p.hit.point[2]<1.6,'Cargo must extend forward; no near-opening rectangular baffle');}
const cargo=points('TRUNK_INNER_CAVITY');assert.ok(Math.min(...cargo.map(v=>v.y))<.38);assert.ok(Math.min(...cargo.map(v=>v.z))<1.25);
lid.rotation.x=0;scene.updateMatrixWorld(true);
// The replacement gasket is supported by its flange, not a free-standing hoop.
const flange=objects.get('TRUNK_BODY_FLANGE').children[0],triangles=[],p=flange.geometry.getAttribute('position'),indices=flange.geometry.index;
for(let i=0;i<indices.count;i+=3)triangles.push(new Triangle(...[0,1,2].map(j=>new Vector3().fromBufferAttribute(p,indices.getX(i+j)).applyMatrix4(flange.matrixWorld))));
const tmp=new Vector3();let maxSealDistance=0;
for(const v of points('TRUNK_BODY_GASKET')){let distance=Infinity;for(const t of triangles)distance=Math.min(distance,t.closestPointToPoint(v,tmp).distanceTo(v));maxSealDistance=Math.max(maxSealDistance,distance);}
assert.ok(maxSealDistance<.012,`Unsupported gasket: ${maxSealDistance}`);
const audit=JSON.parse(await readFile('docs/assets/trunk-correction-audit.json','utf8'));
const maxSourceAreaDelta=Math.max(...Object.values(audit.afterSourceArea).map(p=>Math.abs(p.delta)));assert.ok(maxSourceAreaDelta<1e-5,'Original closed skin must not be deleted or duplicated');
const report={passed:true,actualExportedGlb:true,previousRevision:baseline.sourceRevision,unrelatedNodesUnchanged:fixedNames.length,checkedAttributes:['positions','indices','UV','wiper morph targets','world transforms','parents'],fascia,rearBumper,states,openings,maxSealDistance,maxSourceAreaDelta,oldHoopRemoved:true,visualReviewRequired:true};
await mkdir('docs/validation/trunk-correction',{recursive:true});await writeFile('docs/validation/trunk-correction/geometry.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
