import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const install = JSON.parse((await readFile('.tools/blender-install.json','utf8')).replace(/^\uFEFF/,''));
const result = spawnSync(install.executable,['--background','assets/source/blender/su7-enhanced.blend','--python','scripts/enhance_windows.py'],{encoding:'utf8',maxBuffer:8*1024*1024});
await writeFile('docs/validation/i2-blender-export.log',`${result.stdout}\n${result.stderr}`);
if(result.status!==0)throw Error('Blender export failed; see docs/validation/i2-blender-export.log');
for(const script of ['scripts/register-windows.mjs','scripts/check-assets.mjs']) {
  const check=spawnSync(process.execPath,[script],{stdio:'inherit'});
  if(check.status!==0)process.exit(check.status??1);
}
