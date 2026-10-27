import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {Group,Mesh,BufferGeometry,Float32BufferAttribute,MeshBasicMaterial,DoubleSide,Raycaster,Vector3,Matrix4,Matrix3,PerspectiveCamera,Vector2} from 'three';
import {acceleratedRaycast,computeBoundsTree} from 'three-mesh-bvh/src/index.js';

const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc=await io.read('apps/web/public/models/su7-runtime.glb');
const reference=await io.readBinary(new Uint8Array(execFileSync('git',['show','v0.3.2-i3-complete:apps/web/public/models/su7-runtime.glb'],{maxBuffer:20*1024*1024})));
const nodes=doc.getRoot().listNodes(),originals=reference.getRoot().listNodes();
const mapping=JSON.parse(await readFile('docs/assets/vehicle-mapping.json','utf8'));
const audit=JSON.parse(await readFile('docs/assets/trunk-native-seams.json','utf8'));
assert.equal(audit.bisectOperations,0);assert.equal(mapping.trunk.nativeSeams,true);

function triangles(node){
  if(!node)return [];
  const world=new Matrix4().fromArray(node.getWorldMatrix()),normal=new Matrix3().getNormalMatrix(world),out=[];
  for(const p of node.getMesh()?.listPrimitives()??[]){
    const pos=p.getAttribute('POSITION'),norm=p.getAttribute('NORMAL'),uv=p.getAttribute('TEXCOORD_0'),idx=p.getIndices();
    for(let i=0;i<(idx?.getCount()??pos.getCount());i+=3){
      const face=[];
      for(let k=0;k<3;k++){
        const j=idx?idx.getArray()[i+k]:i+k;
        face.push({p:new Vector3().fromArray(pos.getArray(),j*3).applyMatrix4(world),n:new Vector3().fromArray(norm.getArray(),j*3).applyMatrix3(normal).normalize(),uv:uv?[uv.getArray()[j*2],uv.getArray()[j*2+1]]:[0,0]});
      }
      out.push(face);
    }
  }
  return out;
}
function excludeOriginalWipers(faces){
  const parent=[],keys=new Map(),points=[];
  const find=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
  const ids=faces.map(f=>f.map(({p})=>{const key=p.toArray().map(v=>Math.round(v*1e5)).join(',');if(!keys.has(key)){keys.set(key,points.length);parent.push(points.length);points.push(p);}return keys.get(key);}));
  for(const tri of ids)for(const i of tri.slice(1))parent[find(i)]=find(tri[0]);
  const groups=new Map();for(let f=0;f<ids.length;f++){const root=find(ids[f][0]);if(!groups.has(root))groups.set(root,[]);groups.get(root).push(f);}
  const remove=new Set();
  for(const fs of groups.values()){
    const pts=fs.flatMap(f=>faces[f].map(v=>v.p));
    if(Math.min(...pts.map(p=>p.y))>.83&&Math.max(...pts.map(p=>p.z))<-.98&&Math.min(...pts.map(p=>p.x))>-.75&&Math.max(...pts.map(p=>p.x))<.75)for(const f of fs)remove.add(f);
  }
  assert.equal(remove.size,536,'Original parked wipers must not be restored over the current real wipers');return faces.filter((_,i)=>!remove.has(i));
}
const permutations=[[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]];
let maxPositionError=0,maxUvError=0,maxNormalError=0;
const sourceChecks=[];
const nativeLampSources=mapping.materialRoles.nativeLampSources??[];
for(const name of new Set([...Object.keys(audit.panels),...nativeLampSources])){
  let expected=triangles(originals.find(n=>n.getName()===name));if(name==='Mesh24')expected=excludeOriginalWipers(expected);
  const actual=[...triangles(nodes.find(n=>n.getName()===name)),...triangles(nodes.find(n=>n.getName()==='TRUNK_'+name))];
  assert.equal(actual.length,expected.length,`No new cuts or missing original triangles: ${name}`);
  const bins=new Map(),centroid=f=>f.reduce((p,v)=>p.add(v.p),new Vector3()).multiplyScalar(1/3).toArray().map(v=>Math.floor(v*1000));
  for(const f of expected){const key=centroid(f).join(',');if(!bins.has(key))bins.set(key,[]);bins.get(key).push(f);}
  for(const face of actual){
    const c=centroid(face);let matched=false;
    search:for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++){
      const bin=bins.get([c[0]+x,c[1]+y,c[2]+z].join(','));if(!bin)continue;
      for(let f=0;f<bin.length;f++)for(const order of permutations){
        const old=bin[f],pe=Math.max(...face.map((v,i)=>v.p.distanceTo(old[order[i]].p))),ue=Math.max(...face.map((v,i)=>Math.hypot(v.uv[0]-old[order[i]].uv[0],v.uv[1]-old[order[i]].uv[1]))),ne=Math.max(...face.map((v,i)=>v.n.distanceTo(old[order[i]].n)));
        if(pe<2e-6&&ue<2e-6&&ne<.001){maxPositionError=Math.max(maxPositionError,pe);maxUvError=Math.max(maxUvError,ue);maxNormalError=Math.max(maxNormalError,ne);bin.splice(f,1);matched=true;break search;}
      }
    }
    assert.ok(matched,`Original position/UV/normal triangle mismatch: ${name} ${face.map(v=>v.p.toArray()).join(';')}`);
  }
  sourceChecks.push({name,triangles:actual.length,matchedOriginal:true});
}
// The existing four-door, glazing, lighting and real wiper geometry stays exact.
const baseline=JSON.parse(await readFile('docs/assets/trunk-correction-baseline.json','utf8'));
function signature(node){const arrays=node.getMesh()?.listPrimitives().map(p=>({positions:[...p.getAttribute('POSITION').getArray()],indices:p.getIndices()?[...p.getIndices().getArray()]:null,uv:p.getAttribute('TEXCOORD_0')?[...p.getAttribute('TEXCOORD_0').getArray()]:null,targets:p.listTargets().map(t=>[...t.getAttribute('POSITION').getArray()])}));return createHash('sha256').update(JSON.stringify({world:node.getWorldMatrix(),arrays,parent:node.getParentNode()?.getName()})).digest('hex');}
const intentionalLampChanges=new Set([...nativeLampSources,...(mapping.materialRoles.removedProxyNodes??[]),...(mapping.materialRoles.ambient.replacedNodes??[])]);
const unchanged=Object.entries(baseline.untouched).filter(([name])=>!intentionalLampChanges.has(name));
for(const [name,hash] of unchanged)assert.equal(signature(nodes.find(n=>n.getName()===name)),hash,`Unrelated node changed: ${name}`);

const objects=new Map(),helpers=new Set(audit.helpers),scene=new Group(),ray=new Raycaster();ray.firstHitOnly=true;
function convert(n){
  const group=new Group();group.name=n.getName();group.position.fromArray(n.getTranslation());group.quaternion.fromArray(n.getRotation());group.scale.fromArray(n.getScale());objects.set(group.name,group);
  for(const p of n.getMesh()?.listPrimitives()??[]){const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(p.getAttribute('POSITION').getArray(),3));if(p.getIndices())geometry.setIndex([...p.getIndices().getArray()]);computeBoundsTree.call(geometry);const mesh=new Mesh(geometry,new MeshBasicMaterial({side:DoubleSide}));mesh.raycast=acceleratedRaycast;mesh.name=n.getName();mesh.userData.glass=p.getMaterial()?.getAlphaMode()==='BLEND';group.add(mesh);}
  for(const child of n.listChildren())group.add(convert(child));return group;
}
for(const n of doc.getRoot().getDefaultScene().listChildren())scene.add(convert(n));scene.updateMatrixWorld(true);
for(const name of audit.removedIncorrectHelpers)assert.ok(!objects.has(name),`Exterior patch cap remains: ${name}`);
const lid=objects.get(mapping.trunk.node);for(const name of mapping.trunk.sourceParts)assert.ok(lid.getObjectByName(name));
const allMeshes=[];scene.traverse(o=>{if(o.isMesh&&!o.userData.glass)allMeshes.push(o);});const nativeMeshes=allMeshes.filter(o=>!helpers.has(o.name));
const views=[{position:[0,1.25,4.2],target:[0,.95,2.2]},{position:[-2,1.6,4.1],target:[0,1,2.2]},{position:[2,1.6,4.1],target:[0,1,2.2]},{position:[0,3,3.8],target:[0,1,2.15]}],visibility=[];
const sourceNames=new Set(sourceChecks.flatMap(s=>[s.name,'TRUNK_'+s.name]));
for(const view of views){
  const camera=new PerspectiveCamera(42,1.5,.01,50);camera.position.fromArray(view.position);camera.lookAt(new Vector3(...view.target));camera.updateMatrixWorld(true);let checked=0,outsideTrunkRegionRays=0;const leaks=[];
  for(let y=0;y<144;y++)for(let x=0;x<192;x++){
    ray.setFromCamera(new Vector2((x+.5)/192*2-1,1-(y+.5)/144*2),camera);
    const original=ray.intersectObjects(nativeMeshes,false)[0];if(!original||!sourceNames.has(original.object.name))continue;
    // Existing gaps can see far wheel-well/interior faces (e.g. Y=.54 m).
    // Filling those gaps with the real cargo liner is valid; they are not the
    // exterior deck, lamp partition or badged lower panel being preserved.
    if(original.point.y<.60||original.point.z<1.90){outsideTrunkRegionRays++;continue;}
    checked++;const now=ray.intersectObjects(allMeshes,false)[0];if(now&&helpers.has(now.object.name)&&now.distance<original.distance-1e-5)leaks.push({x,y,helper:now.object.name,point:now.point.toArray(),coveredOriginal:original.object.name,originalPoint:original.point.toArray()});
  }
  assert.ok(checked>1000);visibility.push({...view,originalExteriorSurfaceRays:checked,outsideTrunkRegionRays,exteriorHelperLeaks:leaks.length,leaks});
}
await writeFile('.tools/native-seam-visibility-debug.json',JSON.stringify(visibility,null,2));
assert.equal(visibility.reduce((s,v)=>s+v.exteriorHelperLeaks,0),0,'Interior helper covers original closed exterior; see .tools/native-seam-visibility-debug.json');
const center=name=>{const ps=triangles(nodes.find(n=>n.getName()===name)).flatMap(f=>f.map(v=>v.p));return ps.reduce((sum,v)=>sum.add(v),new Vector3()).divideScalar(ps.length);};
const starts=Object.fromEntries(mapping.trunk.requiredMovingBadges.map(n=>[n,center(n)])),locals=Object.fromEntries(Object.entries(starts).map(([n,v])=>[n,lid.worldToLocal(v.clone())])),motion=[];
for(const value of [0,.5,1]){
  lid.rotation.x=mapping.trunk.maxAngle*value;scene.updateMatrixWorld(true);
  const badges={};for(const [name,start] of Object.entries(starts)){
    const moved=lid.localToWorld(locals[name].clone());
    badges[name]={position:moved.toArray(),travel:moved.distanceTo(start)};if(value>0)assert.ok(badges[name].travel>.25);
  }
  motion.push({value,badges});
}
const report={passed:true,actualExportedGlb:true,sourceRevision:'v0.3.2-i3-complete',sourceChecks,originalTrianglesMatched:sourceChecks.reduce((s,r)=>s+r.triangles,0),maxPositionError,maxUvError,maxNormalError,unrelatedNodesUnchanged:unchanged.length,nativeLampSourcesVerified:nativeLampSources,removedLampProxies:mapping.materialRoles.removedProxyNodes??[],visibility,motion,removedIncorrectHelpers:audit.removedIncorrectHelpers};
await mkdir('docs/validation/trunk-native-seams',{recursive:true});await writeFile('docs/validation/trunk-native-seams/geometry.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
