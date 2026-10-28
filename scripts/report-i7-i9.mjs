import {readFile,writeFile} from 'node:fs/promises';
import {registeredTools,capabilityRegistry} from '../packages/shared/src/capabilities.ts';
const base='docs/validation/i7-i9/';
const sources=['live-capabilities-segment-0-39.json','live-capabilities-range-40-99.json','live-capabilities-range-95-99.json'];
const rows=[];let total=0,llm=0;const runs=[];
for(const file of sources){const report=JSON.parse(await readFile(base+file,'utf8'));runs.push({file,recordedPassedCases:report.cases.length,runPassed:report.passed,interrupted:report.interrupted??false,error:report.error});
 for(const [index,c]of report.cases.entries())if(c.passed){total++;if(c.plan)llm++;for(const call of c.plan?.calls??[]){if(call.function.name==='assistant_reply')continue;const args=JSON.parse(call.function.arguments);for(const action of args.actions)for(const target of action.targets){const key=`${action.component}:${target}:${action.property??'swipe'}`;rows.push({key,tool:call.function.name,operation:action.operation,value:action.value??action.action??null,actual:c.actual[key],status:c.receipts.results.find(r=>r.tool_call_id===call.id)?.status,evidence:`${file}#cases[${index}]`,tool_call_id:call.id,input:c.input});}}}
}
const keys=[...new Set(rows.map(r=>r.key))].sort(),coverage=keys.map(key=>({key,tool:rows.find(r=>r.key===key).tool,operations:[...new Set(rows.filter(r=>r.key===key).map(r=>r.operation))],evidence:rows.filter(r=>r.key===key)}));
const tools=registeredTools();await writeFile(base+'tools.json',JSON.stringify(tools,null,2)+'\n');
await writeFile(base+'capability-coverage.json',JSON.stringify({at:new Date().toISOString(),mode:'real-API+actual-WebGL-text-input',human:false,passedCases:total,llmRounds:llm,registeredControlTools:capabilityRegistry.length,coveredTools:new Set(rows.map(r=>r.tool)).size,runs,coverage},null,2)+'\n');
const lines=['# 实际能力 → 工具 → 参数 → 效果 → 证据','',`共 ${total} 个已通过案例，其中 ${llm} 个真实 LLM 工具回合；取消为本地规则。分三个会话保存，不能当作一个连续会话。源报告包含首次歧义失败和中断信息；只将逐案例成功记录计入覆盖，修正后的追问在最后一段复测。真人与固定音频另列。`,'','| 实际属性 | 工具 | 真实调用操作 | 真实结果证据 |','|---|---|---|---|'];
for(const row of coverage){const examples=row.operations.map(op=>{const e=row.evidence.find(e=>e.operation===op);return `[${op}](validation/i7-i9/${e.evidence.split('#')[0]})（case ${Number(e.evidence.match(/\[(\d+)\]/)[1])+1}）`;});lines.push(`| ${row.key} | ${row.tool} | ${row.operations.join(' / ')} | ${examples.join('；')} |`);}
lines.push('','工具 Schema 与单位见 [LLM_TOOLS.md](LLM_TOOLS.md)。每条机器记录保留 tool_call_id、参数、实际驱动值、完成状态和原文件索引。灯光强度另有实际 SpotLight／灯面／散射数据和双分辨率像素差验证，见 I7–I9 验收报告。','', '真实固定音频完整链路：[18 条语音](validation/i7-i9/live-speech.json)；[真实关键词与六组固定输入](validation/i7-i9/wake-fixed-audio.json)；[唤醒完整周期](validation/i7-i9/wake-cycle-fixed-audio.json)。这些均不标为真人。');
await writeFile('docs/CAPABILITY_COVERAGE.md',lines.join('\n')+'\n');console.log(JSON.stringify({passedCases:total,llmRounds:llm,properties:keys.length,tools:new Set(rows.map(r=>r.tool)).size}));
