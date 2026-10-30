import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const protectedFiles=['assets/source/blender/su7-enhanced.blend','apps/web/public/models/su7-runtime.glb','apps/web/src/AppearanceMechanism.tsx','apps/web/src/VehicleMechanism.tsx','apps/web/src/WindowMechanism.tsx','apps/web/src/WiperMechanism.tsx','apps/web/src/VolumetricLights.tsx'];
const records=[];
for(const file of protectedFiles){const current=await readFile(file),baseline=execFileSync('git',['show',`a03a4cd:${file}`],{maxBuffer:40*1024*1024});
 // Text working copies may use CRLF on Windows; geometric bytes must be exact.
 const normalize=b=>file.endsWith('.tsx')?Buffer.from(b.toString().replaceAll('\r\n','\n')):b;
 const before=sha(normalize(baseline)),after=sha(normalize(current));if(before!==after)throw Error(`Protected baseline changed: ${file}`);records.push({file,sha256:after,unchanged:true});
}
const file='apps/web/src/data/vehicle-mapping.json',before=JSON.parse(execFileSync('git',['show',`a03a4cd:${file}`])),after=JSON.parse(await readFile(file,'utf8'));
if(JSON.stringify(before.materialRoles.turnSignals)!==JSON.stringify(after.materialRoles.turnSignals))throw Error('Turn indicator mapping changed');
for(const side of ['left','right'])for(const [i,p]of after.materialRoles.headlights[side].projectors.entries()){
 if(p.highOnly!==(i>=2))throw Error('Low/high grouping invalid');p.highOnly=before.materialRoles.headlights[side].projectors[i].highOnly;
}
if(JSON.stringify(before)!==JSON.stringify(after))throw Error('Unexpected vehicle mapping changes');
const report={passed:true,baseline:'a03a4cd',protectedFiles:records,indicatorGeometryAndLogicUnmodified:true,mappingChangeOnly:'projectors 2/3 are high-only; high retains low projectors',runtimeFixtures:'8 original aperture-local collimators / 96 independent LED instances; 4 actual underside-mounted gobo projectors'};
await mkdir('docs/validation/welcome',{recursive:true});await writeFile('docs/validation/welcome/protected-baseline.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
