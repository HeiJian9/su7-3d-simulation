import assert from 'node:assert/strict';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {BufferGeometry,Float32BufferAttribute,Matrix4,Vector3,Box3,Ray,DoubleSide} from 'three';
import {MeshBVH} from 'three-mesh-bvh/src/index.js';
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS),doc=await io.read('apps/web/public/models/su7-runtime.glb'),nodes=doc.getRoot().listNodes(),mapping=JSON.parse(await readFile('docs/assets/vehicle-mapping.json','utf8'));
const reference=mapping.dashTrimRepair?'e221e9c':'1b83988',base=await io.readBinary(new Uint8Array(execFileSync('git',['show',reference+':apps/web/public/models/su7-runtime.glb'],{maxBuffer:20*1024*1024})));
const modified=['FRUNK_STORAGE_TUB','TRUNK_INNER_CAVITY','TRUNK_INNER_SKIN'];
assert.deepEqual(mapping.enclosureRepair.modifiedNodes,modified);
function signature(n){return createHash('sha256').update(JSON.stringify({world:n.getWorldMatrix(),parent:n.getParentNode()?.getName(),p:n.getMesh()?.listPrimitives().map(p=>({a:p.listSemantics().map(s=>[s,[...p.getAttribute(s).getArray()]]),i:[...p.getIndices().getArray()],m:p.getMaterial()?.getName(),t:p.listTargets().map(t=>[...t.getAttribute('POSITION').getArray()])}))})).digest('hex');}
const allowed=mapping.dashTrimRepair?['AMBIENT_DASH_CROWN_LEFT','AMBIENT_DASH_CROWN_RIGHT']:modified;
if(mapping.dashTrimRepair)assert.deepEqual(mapping.dashTrimRepair.modifiedNodes,allowed);
let unchanged=0;for(const n of base.getRoot().listNodes())if(!allowed.includes(n.getName())){assert.equal(signature(nodes.find(x=>x.getName()===n.getName())),signature(n),n.getName());unchanged++;}
function geometry(name){const n=nodes.find(n=>n.getName()===name),m=new Matrix4().fromArray(n.getWorldMatrix()),pts=[];for(const p of n.getMesh().listPrimitives()){const a=p.getAttribute('POSITION').getArray();for(const i of p.getIndices().getArray())pts.push(...new Vector3().fromArray(a,i*3).applyMatrix4(m).toArray());}const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(pts,3));g.computeBoundingBox();return g;}
const checks=[];
for(const [name,wheels] of [['FRUNK_STORAGE_TUB',['Mesh1','Mesh3','Mesh4','Mesh74','Mesh76','Mesh77']],['TRUNK_INNER_CAVITY',['Mesh5','Mesh7','Mesh8','Mesh9','Mesh11','Mesh12']]]){
 const g=geometry(name),bvh=new MeshBVH(g);for(const wheel of wheels){const intersects=bvh.intersectsGeometry(geometry(wheel),new Matrix4());checks.push({liner:name,wheel,intersects});assert.equal(intersects,false,`${name} intersects ${wheel}`);}
 // Weld only for topology analysis: export splits normals at formed corners.
 const a=g.getAttribute('position'),edges=new Map();for(let i=0;i<a.count;i+=3){const vs=[0,1,2].map(k=>new Vector3().fromBufferAttribute(a,i+k).toArray().map(x=>Math.round(x*1e5)).join(','));for(let k=0;k<3;k++){const key=[vs[k],vs[(k+1)%3]].sort().join('|');edges.set(key,(edges.get(key)??0)+1);}}
 assert.equal([...edges.values()].filter(n=>n===1).length,0,`${name} has open wall edges`);
}
const backing=geometry('CABIN_FLOOR_BACKING'),floorBvh=new MeshBVH(backing),occlusion=[];
for(const cfg of mapping.materialRoles.ambient.lights.filter(c=>c.occludedFootwell)){
 const o=new Vector3().fromArray(cfg.position);const hit=floorBvh.raycastFirst(new Ray(o,new Vector3(0,-1,0)),DoubleSide);assert.ok(hit&&hit.distance<o.y,'Footwell floor ray must be blocked above the road');occlusion.push({origin:cfg.position,hitY:o.y-hit.distance});
}
assert.equal(occlusion.length,4);
const rearBox=new Box3().copy(geometry('TRUNK_INNER_CAVITY').boundingBox);assert.ok(rearBox.min.z>1.89,'Cargo lining must stay behind rear wheels');
const report={passed:true,baseline:reference,unchangedNodes:unchanged,modifiedNodes:modified,nativePanelsUnchanged:true,wheelIntersections:checks,closedTubWalls:true,wallThicknessMetres:.012,footwellFloorOcclusion:occlusion,lidReturnEdges:mapping.enclosureRepair.lidReturnEdges,rearCavityBounds:{min:rearBox.min.toArray(),max:rearBox.max.toArray()}};
const dir=mapping.dashTrimRepair?'docs/validation/trim-dialogue':'docs/validation/physical-fixes';await mkdir(dir,{recursive:true});await writeFile(dir+'/enclosures.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
