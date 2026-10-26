import { useEffect, useState, type FormEvent } from 'react';
import { corners, useVehicle, windowLabels } from './vehicle';
import { speechCoordinator, useSpeech, type SpeechPhase } from './speech';

const phaseLabels: Record<SpeechPhase, string> = { idle: '准备就绪', requesting: '等待权限', recording: '正在录音', transcribing: '正在转写', resolving: '规则解析', executing: '正在执行', clarifying: '等待澄清', synthesizing: '生成播报', speaking: '正在播报', error: '需要重试' };

export function ControlConsole() {
  const [input, setInput] = useState('');
  const [history, setHistory] = useState(false);
  const pending = useVehicle((s) => s.context.pending);
  const messages = useVehicle((s) => s.messages);
  const ready = useVehicle((s) => s.available.length === 4);
  const feedback = useVehicle((s) => s.feedback);
  const speech = useSpeech();
  const coordinator = speechCoordinator();
  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => useVehicle.setState((s) => ({ context: { focus: s.context.focus } })), Math.max(0, pending.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [pending]);
  const submit = (event: FormEvent) => { event.preventDefault(); if (input.trim()) { void coordinator.text(input); setInput(''); } };
  return <section className="control-console" aria-label="文字与语音控制">
    <div className="console-main"><div className="voice-entry"><button className={`mic-button ${speech.phase === 'recording' ? 'recording' : ''}`} disabled={speech.phase === 'requesting' || !ready} aria-label={speech.phase === 'recording' ? '结束录音' : '开始录音'} onClick={() => { if (speech.phase === 'recording') void coordinator.stopRecording(); else void coordinator.start(); }}><svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/></svg></button><div><strong>{speech.phase === 'recording' ? '说完，便会回应。' : '先从一句话开始'}</strong><small data-testid="speech-phase">{phaseLabels[speech.phase]}{speech.phase === 'recording' ? ` · ${(speech.durationMs / 1000).toFixed(1)}s` : ''}</small></div><div className="audio-meter" aria-label="麦克风音量"><i style={{ height: `${Math.min(100, speech.rms * 900)}%` }} /></div></div>
      <form className="command-form" onSubmit={submit}><label className="sr-only" htmlFor="window-command">车窗文字指令</label><input id="window-command" value={input} onChange={(e) => setInput(e.target.value)} placeholder="试试：左前车窗打开一半" autoComplete="off" maxLength={200} /><button disabled={!ready || !input.trim()} type="submit">发送 <span>↗</span></button></form>
      {(speech.phase !== 'idle' && speech.phase !== 'error' && speech.phase !== 'clarifying') && <button className="voice-cancel" onClick={() => coordinator.cancel()} aria-label="取消语音">取消</button>}
      {(speech.phase === 'speaking' || speech.phase === 'synthesizing') && <button className="voice-cancel" onClick={() => coordinator.stopSpeaking()}>停止播报</button>}
      <button className="history-button" aria-expanded={history} onClick={() => setHistory(!history)}>指令记录 <span>{messages.length.toString().padStart(2, '0')}</span></button><button className="new-chat" onClick={() => { coordinator.cancel(); useVehicle.getState().newConversation(); }}>新对话</button>
    </div>
    <p className="console-feedback" role="status" data-testid="console-feedback">{feedback}</p>
    <div className="speech-status-row"><span className={`provider-badge ${speech.health.mode === 'test-mock' ? 'mock-mode' : ''}`} data-testid="speech-mode">{speech.health.mode === 'test-mock' ? '测试 Mock · 不计真实 API 验收' : speech.health.asr.configured && speech.health.tts.configured ? '语音服务已配置' : 'ASR / TTS 待配置'}</span><span className={speech.phase === 'error' ? 'speech-error' : ''} role="status" data-testid="speech-message">{speech.message}</span>{speech.transcript && <span className="transcript" data-testid="transcript">转写：{speech.transcript}</span>}<label className="tts-toggle"><input type="checkbox" checked={speech.enabled} onChange={(e) => { useSpeech.setState({ enabled: e.target.checked }); if (!e.target.checked) coordinator.stopSpeaking(); }} />语音反馈</label><button className="tts-replay" disabled={!speech.health.tts.configured || !speech.lastFeedback} onClick={() => void coordinator.replay()}>重播</button></div>
    {pending && <div className="clarification" role="group" aria-label="请选择车窗"><span>需要哪一扇？可点麦克风回答。</span>{corners.map((c) => <button key={c} onClick={() => void coordinator.text(windowLabels[c])}>{windowLabels[c]}</button>)}<button onClick={()=>coordinator.cancelClarification()}>取消这条指令</button></div>}
    {history && <aside className="command-history" aria-label="指令记录"><div className="panel-top"><span>CONVERSATION / RULES</span><button onClick={() => setHistory(false)} aria-label="关闭指令记录">×</button></div>{messages.length ? messages.slice(-8).reverse().map((m) => <div className="conversation-row" key={m.id}><p>{m.input}</p><small>{m.output}</small><span>{m.origin} · {m.status}</span></div>) : <p className="empty-history">输入一句话，查看规则解析与执行结果。</p>}</aside>}
  </section>;
}
