import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
const install=JSON.parse((await readFile('.tools/blender-install.json','utf8')).replace(/^\uFEFF/,''));
const result=spawnSync(install.executable,['--background','assets/source/blender/su7-enhanced.blend','--python-exit-code','1','--python','scripts/export_current.py'],{encoding:'utf8',maxBuffer:8*1024*1024});
const reportDir='docs/validation/trim-dialogue';await mkdir(reportDir,{recursive:true});await writeFile(reportDir+'/blender-export.log',`${result.stdout}\n${result.stderr}`);
if(result.status!==0)throw Error('Enhanced Blender export failed.');
const mapping=JSON.parse(await readFile('docs/assets/vehicle-mapping.json','utf8'));
const checks=['scripts/register-vehicle.mjs','scripts/check-assets.mjs','scripts/verify-vehicle-geometry.mjs'];
if(mapping.wipers)checks.push('scripts/verify-wiper-glb.mjs');
if(mapping.trunk.requiredMovingBadges)checks.push('scripts/verify-trunk-correction.mjs');
if(mapping.materialRoles.nativeLampSources)checks.push('scripts/verify-native-lamps.mjs');
if(mapping.materialRoles.ambient.audit)checks.push('scripts/verify-cabin-lighting.mjs');
if(mapping.cabinLights)checks.push('scripts/verify-dome-tail.mjs');
if(mapping.frunk)checks.push('scripts/verify-frunk.mjs');
if(mapping.enclosureRepair)checks.push('scripts/verify-enclosures.mjs');
for(const script of checks){const r=spawnSync(process.execPath,[script],{stdio:'inherit'});if(r.status!==0)process.exit(r.status??1);}
