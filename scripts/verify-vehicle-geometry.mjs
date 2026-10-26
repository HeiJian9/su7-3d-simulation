import {readFile,writeFile} from 'node:fs/promises';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {Group,Mesh,BufferGeometry,Float32BufferAttribute,MeshBasicMaterial,DoubleSide,Raycaster,Vector3,Quaternion} from 'three';
import assert from 'node:assert/strict';
const doc=await new NodeIO().registerExtensions(ALL_EXTENSIONS).read('apps/web/public/models/su7-runtime.glb');
const mapping=JSON.parse(await readFile('docs/assets/vehicle-mapping.json','utf8')),windows=JSON.parse(await readFile('docs/assets/window-mapping.json','utf8'));
const objects=new Map(),ray=new Raycaster();
function convert(node){const out=new Group();out.name=node.getName();out.position.fromArray(node.getTranslation());out.quaternion.fromArray(node.getRotation());out.scale.fromArray(node.getScale());objects.set(out.name,out);
  for(const p of node.getMesh()?.listPrimitives()??[]){const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(p.getAttribute('POSITION').getArray(),3));if(p.getIndices())g.setIndex([...p.getIndices().getArray()]);const m=new Mesh(g,new MeshBasicMaterial({side:DoubleSide}));m.name=out.name;m.userData.glass=p.getMaterial()?.getAlphaMode()==='BLEND';out.add(m);}
  for(const child of node.listChildren())out.add(convert(child));return out;
}
const scene=new Group();for(const node of doc.getRoot().getDefaultScene().listChildren())scene.add(convert(node));scene.updateMatrixWorld(true);
const records=[];
for(const [corner,cfg] of Object.entries(mapping.doors)){
  const door=objects.get(cfg.node),outer=objects.get(cfg.sourceOuter),wcfg=windows.windows[corner],window=objects.get(wcfg.node),original=window.position.clone();
  assert.equal(outer.parent,door);assert.equal(window.parent,door);
  for(const name of cfg.sourceRelated)assert.ok(door.getObjectByName(name),`missing related ${corner} ${name}`);
  const side=corner.endsWith('l')?-1:1,z=corner.startsWith('f')?-.35:.70;
  const hits=(y)=>{scene.updateMatrixWorld(true);ray.set(new Vector3(side*1.6,y,z),new Vector3(-side,0,0));return ray.intersectObject(scene,true).filter(h=>!h.object.userData.glass).map(h=>({name:h.object.name,x:h.point.x,distance:h.distance}));};
  const closed=hits(.70);assert.equal(closed[0]?.name,cfg.sourceOuter,`closed door probe ${corner}`);
  for(const openness of [0,.5,1]){
    door.rotation.y=cfg.maxAngle*openness;scene.updateMatrixWorld(true);
    const origin=window.getWorldPosition(new Vector3());
    for(const value of [0,.5,1]){
      window.position.copy(original).addScaledVector(new Vector3().fromArray(wcfg.travel),value);scene.updateMatrixWorld(true);
      const actual=window.getWorldPosition(new Vector3()),expected=new Vector3().fromArray(wcfg.travel).multiplyScalar(value).applyQuaternion(door.getWorldQuaternion(new Quaternion()));
      assert.ok(actual.clone().sub(origin).distanceTo(expected)<1e-5,'door-local glass travel');
    }
    window.position.copy(original);
  }
  const open=hits(.70);assert.ok(!open.some(h=>Math.abs(h.x-side*.94)<.08),'residual external door surface blocks opening');
  records.push({corner,closed:closed.slice(0,3),open:open.slice(0,3),doorWindowCombinations:9});door.rotation.y=0;
}
const lid=objects.get(mapping.trunk.node);for(const name of mapping.trunk.sourceParts)assert.ok(lid.getObjectByName(name));assert.ok(objects.get('TRUNK_INNER_CAVITY'));assert.ok(objects.get('TRUNK_INNER_SKIN'));
// Probe down into the source deck at the central trunk opening.
function trunkProbe(){scene.updateMatrixWorld(true);ray.set(new Vector3(0,1.12,3),new Vector3(0,-.5,-1).normalize());return ray.intersectObject(scene,true).filter(h=>!h.object.userData.glass).map(h=>({name:h.object.name,y:h.point.y}));}
const closed=trunkProbe();assert.equal(closed[0]?.name,'TRUNK_Paint5');lid.rotation.x=mapping.trunk.maxAngle;const open=trunkProbe();assert.equal(open[0]?.name,'TRUNK_INNER_CAVITY');assert.ok(open[0].y<.8);
let materialRoles;
if(mapping.materialRoles){
  const roles=mapping.materialRoles;const paintNodes=doc.getRoot().listNodes().filter(n=>n.getMesh()?.listPrimitives().some(p=>p.getMaterial()?.getName()===roles.paint.material)).map(n=>n.getName()).sort();
  assert.deepEqual(paintNodes,[...roles.paint.nodes].sort(),'paint whitelist membership');
  for(const name of roles.ambient.nodes)assert.ok(objects.get(name));
  for(const c of ['fl','fr','rl','rr'])assert.equal(objects.get(`AMBIENT_DOOR_${c.toUpperCase()}`).parent,objects.get(mapping.doors[c].node));
  for(const cfg of Object.values(roles.turnSignals))for(const name of cfg.nodes)assert.ok(objects.get(name));
  materialRoles={paintNodes,ambientStrips:roles.ambient.nodes.length,independentMaterialNames:doc.getRoot().listMaterials().map(m=>m.getName())};
}
const report={stage:mapping.version,source:'actual exported GLB; no proxy animation',doorRecords:records,trunk:{closed:closed.slice(0,4),open:open.slice(0,4)},materialRoles,passed:true};
await writeFile(`docs/assets/${mapping.version.split('.')[0].toLowerCase()}-geometry-verification.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
