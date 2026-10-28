import { useEffect, useState, type FormEvent } from 'react';
import { corners, useVehicle, windowLabels } from './vehicle';
import { speechCoordinator, useSpeech, type SpeechPhase } from './speech';
import { doorLabels } from '../../../packages/shared/src/vehicle';
import {useWake,wakeListener,destroyWakeListener} from './audio/wake';

const phaseLabels: Record<SpeechPhase, string> = { idle: '准备就绪', requesting: '等待权限', recording: '正在录音', transcribing: '正在识别', resolving: '正在理解', executing: '正在执行', clarifying: '等待回答', synthesizing: '正在准备回复', speaking: '正在播报', error: '需要重试' };

export function ControlConsole() {
  const [input, setInput] = useState('');
  const [history, setHistory] = useState(false);
  const pending = useVehicle((s) => s.context.pending);
  const assistantPending=useVehicle(s=>s.context.assistantPending);
  const messages = useVehicle((s) => s.messages);
  const ready = useVehicle((s) => s.available.length === 4);
  const feedback = useVehicle((s) => s.feedback);
  const speech = useSpeech();
  const wake=useWake();
  const coordinator = speechCoordinator();
  useEffect(()=>()=>{destroyWakeListener();coordinator.cancel();},[coordinator]);
  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => useVehicle.setState((s) => ({ context: { focus: s.context.focus } })), Math.max(0, pending.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [pending]);
  const submit = (event: FormEvent) => { event.preventDefault(); if (input.trim()) { void coordinator.text(input); setInput(''); } };
  return <section className="control-console" aria-label="文字与语音控制">
    <div className="console-main"><div className="voice-entry"><button className={`mic-button ${speech.phase === 'recording' ? 'recording' : ''}`} disabled={speech.phase === 'requesting' || !ready} aria-label={speech.phase === 'recording' ? '结束录音' : '开始录音'} onClick={() => { if (speech.phase === 'recording') void coordinator.stopRecording(); else void coordinator.start(); }}><svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/></svg></button><div><strong>{speech.phase === 'recording' ? '我在听，请说' : '小爱语音助手'}</strong><small data-testid="speech-phase">{phaseLabels[speech.phase]}{speech.phase === 'recording' ? ` · ${(speech.durationMs / 1000).toFixed(1)}s` : ''}</small></div><div className="audio-meter" aria-label="麦克风音量"><i style={{ height: `${Math.min(100, Math.max(speech.rms,wake.rms) * 900)}%` }} /></div></div>
      <form className="command-form" onSubmit={submit}><label className="sr-only" htmlFor="window-command">车辆文字指令</label><input id="window-command" value={input} onChange={(e) => setInput(e.target.value)} placeholder="试试：左前车窗打开一半" autoComplete="off" maxLength={200} /><button disabled={!ready || !input.trim()} type="submit">发送 <span>↗</span></button></form>
      {(speech.phase !== 'idle' && speech.phase !== 'error' && speech.phase !== 'clarifying') && <button className="voice-cancel" onClick={() => coordinator.cancel()} aria-label="取消语音">取消</button>}
      {(speech.phase === 'speaking' || speech.phase === 'synthesizing') && <button className="voice-cancel" onClick={() => coordinator.stopSpeaking()}>停止播报</button>}
      <button className="history-button" aria-expanded={history} onClick={() => setHistory(!history)}>指令记录 <span>{messages.length.toString().padStart(2, '0')}</span></button><button className="new-chat" onClick={() => { coordinator.cancel(); useVehicle.getState().newConversation(); }}>新对话</button>
    </div>
    <p className="console-feedback" role="status" data-testid="console-feedback">{feedback}</p>
    <div className="speech-status-row"><span hidden={speech.health.mode!=='test-mock'&&speech.health.asr.configured&&speech.health.tts.configured} className={`provider-badge ${speech.health.mode === 'test-mock' ? 'mock-mode' : ''}`} data-testid="speech-mode">{speech.health.mode === 'test-mock' ? '测试 Mock · 不计真实 API 验收' : speech.health.asr.configured && speech.health.tts.configured ? '语音服务已配置' : '语音待配置'}</span><span className={speech.phase === 'error' ? 'speech-error' : ''} role="status" data-testid="speech-message">{speech.message}</span>{speech.transcript && <span className="transcript" data-testid="transcript">听到：{speech.transcript}</span>}<label className="tts-toggle"><input type="checkbox" checked={speech.enabled} onChange={(e) => { useSpeech.setState({ enabled: e.target.checked }); if (!e.target.checked) coordinator.stopSpeaking(); }} />语音反馈</label><button className="tts-replay" disabled={!speech.health.tts.configured || !speech.lastFeedback} onClick={() => void coordinator.replay()}>重播</button><label className="wake-control" data-listening={wake.status==='listening'}><input type="checkbox" aria-label="小爱同学唤醒" checked={wake.enabled} onChange={e=>{if(e.target.checked)void wakeListener().enable();else wakeListener().disable();}}/>小爱同学<span role="status" data-testid="wake-status">{wake.message}</span></label></div>
    {assistantPending&&<div className="clarification" role="group" aria-label="助手追问"><span>{useVehicle.getState().context.assistantPending?.question} 可用文字或麦克风回答。</span><button onClick={()=>coordinator.cancelClarification()}>取消这条指令</button></div>}
    {pending?.component==='cabinLight'&&<div className="clarification" role="group" aria-label="请选择顶灯"><span>前排还是后排？可点麦克风回答。</span>{['前排主灯','后排主灯','所有顶灯'].map(label=><button key={label} onClick={()=>void coordinator.text(label)}>{label}</button>)}<button onClick={()=>coordinator.cancelClarification()}>取消这条指令</button></div>}
    {pending && pending.component!=='cabinLight' && <div className="clarification" role="group" aria-label={pending.component==='door'?'请选择车门':'请选择车窗'}><span>需要哪一扇？可点麦克风回答。</span>{corners.map((c) => <button key={c} onClick={() => void coordinator.text(pending.component==='door'?doorLabels[c]:windowLabels[c])}>{pending.component==='door'?doorLabels[c]:windowLabels[c]}</button>)}<button onClick={()=>coordinator.cancelClarification()}>取消这条指令</button></div>}
    {history && <aside className="command-history" aria-label="指令记录"><div className="panel-top"><span>最近对话</span><button onClick={() => setHistory(false)} aria-label="关闭指令记录">×</button></div>{messages.length ? messages.slice(-8).reverse().map((m) => <div className="conversation-row" key={m.id}><p>{m.input}</p><small>{m.output}</small><span>{m.origin==='voice'?'语音':m.origin==='manual'?'手动':'文字'} · {({completed:'已完成',animating:'调整中',accepted:'已接收',superseded:'已更新',failed:'未完成',query:'查询',clarify:'待回答',clarifying:'待回答',unsupported:'暂不支持',not_understood:'请再说一遍',chat:'已回复',cancelled:'已取消'} as Record<string,string>)[m.status]??'已回复'}</span></div>) : <p className="empty-history">说出你的想法，对话记录会保存在这里。</p>}</aside>}
  </section>;
}
