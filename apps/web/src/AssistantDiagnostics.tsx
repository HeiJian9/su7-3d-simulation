import {useSpeech} from './speech';
import {useVehicle} from './vehicle';
import {capabilityRegistry} from '../../../packages/shared/src/capabilities';
export function AssistantDiagnostics(){
 const {routing,health,traces}=useSpeech(),capabilities=useVehicle(s=>s.capabilities);
 return <section className="assistant-diagnostics"><label>助手路由<select aria-label="助手路由" value={routing} onChange={e=>useSpeech.setState({routing:e.target.value as 'auto'|'llm'})}><option value="auto">自动路由</option><option value="llm">强制 LLM 验证</option></select></label><p>{health.intent?.model||'DeepSeek 待配置'} · {health.intent?.configured?'已配置，实际结果见调用记录':'未配置'}</p><details><summary>{capabilityRegistry.length} 项工具能力 · {capabilities.length} 组渲染部件</summary>{capabilityRegistry.map(c=><p key={c.name}><code>{c.name}</code> {c.description}</p>)}</details><details><summary>最近助手与语音记录</summary>{traces.slice(-30).reverse().map((t,i)=><p key={`${t.time}-${i}`}><code>{t.stage}</code> {t.detail}</p>)}</details></section>;
}
