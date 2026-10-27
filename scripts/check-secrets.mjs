// Read local credential values only in memory to check deliverables; never print them.
import {execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {loadProjectEnv} from '../apps/server/src/speech/config.ts';
loadProjectEnv(process.cwd());
const credentials=['ASR_API_KEY','TTS_API_KEY','INTENT_API_KEY'].map(k=>process.env[k]).filter(v=>v&&v.length>=12);
const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
const leaks=[];let checked=0;
for(const file of new Set(files)){
  if(file==='.env')continue;
  try{const bytes=await readFile(file);checked++;if(credentials.some(value=>bytes.includes(Buffer.from(value))))leaks.push(file);}catch(error){if(error.code!=='ENOENT')throw Error(`Cannot inspect deliverable ${file}`);}
}
const report={at:new Date().toISOString(),scope:'Git tracked and nonignored untracked deliverables; local .env excluded',checked,credentialValuesPrinted:false,leakFiles:leaks,passed:leaks.length===0};
await writeFile('docs/validation/i4-i6/secret-scan.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({checked,leakFiles:leaks,passed:report.passed}));if(!report.passed)process.exitCode=1;
