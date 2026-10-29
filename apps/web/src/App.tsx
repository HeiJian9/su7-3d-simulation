import {useWake} from './audio/wake';
import { useEffect, useState, type ReactNode } from 'react';
import { assetSchema, type AssetManifest, MODEL_URL } from '../../../packages/shared/src/asset';
import { Scene } from './Scene';
import { MicrophoneProbe } from './MicrophoneProbe';
import { VehicleControls } from './VehicleControls';
import { ControlConsole } from './ControlConsole';
import { configureSpeech, useSpeech } from './speech';
import {AssistantDiagnostics} from './AssistantDiagnostics';
import type { SpeechHealth } from '../../../packages/shared/src/speech';
import { useScene, type View } from './store';
import { actualValues, useVehicle, windowPoses } from './vehicle';

function Icon({ name }: { name: 'orbit' | 'move' | 'reset' | 'cabin' | 'info' | 'arrow' }) {
  const paths = {
    orbit: <><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(-35 12 12)" /><ellipse cx="12" cy="12" rx="4" ry="10" transform="rotate(-35 12 12)" /><circle cx="12" cy="12" r="1" /></>,
    move: <><path d="M12 2v20M2 12h20M8 6l4-4 4 4M8 18l4 4 4-4M6 8l-4 4 4 4M18 8l4 4-4 4" /></>,
    reset: <><path d="M3 10a9 9 0 1 1 2 8M3 4v6h6" /></>,
    cabin: <><path d="M5 20h14M7 16V5a2 2 0 0 1 4 0v7h5a3 3 0 0 1 3 3v2H8a3 3 0 0 1-3-3V9" /></>,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7v1" /></>,
    arrow: <><path d="M5 19 19 5M5 5h14v14" /></>,
  };
  return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
function Key({ children }: { children: ReactNode }) { return <kbd>{children}</kbd>; }

export function App() {
  const [asset, setAsset] = useState<AssetManifest | null>(null);
  const [assetError, setAssetError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [help, setHelp] = useState(false);
  const [debug, setDebug] = useState(false);
  const [health, setHealth] = useState('连接中');
  const providers = useSpeech((s)=>s.health);
  const [savedReport, setSavedReport] = useState('');
  const mode = useScene((s) => s.mode);
  const panTool = useScene((s) => s.panTool);
  const showHotspots=useScene(s=>s.showHotspots);
  const loaded = useScene((s) => s.loaded);
  const progress = useScene((s) => s.progress);
  const loadError = useScene((s) => s.loadError);
  const metrics = useScene((s) => s.metrics);
  const speed = useScene((s) => s.speed);
  const gesture = useScene((s) => s.gesture);
  const go = useScene((s) => s.go);
  const setMode = useScene((s) => s.setMode);
  const error = assetError || loadError;

  useEffect(() => {
    let active = true;
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 8000);
    setAssetError('');
    void fetch('/api/asset', { signal: abort.signal }).then(async (res) => {
      if (!res.ok) throw new Error((await res.json()).message ?? `资产服务错误：${res.status}`);
      return res.json();
    }).then((data: unknown) => { setAsset(assetSchema.parse(data)); }).catch((err: unknown) => {
      if (!active) return;
      if (!abort.signal.aborted) setAssetError(err instanceof Error ? err.message : '无法读取模型资产清单');
      else setAssetError('资产服务连接超时，请重试');
    }).finally(() => clearTimeout(timeout));
    void fetch('/api/health', { signal: abort.signal }).then((res) => { if (!res.ok) throw new Error(); return res.json(); }).then((data: { providers: SpeechHealth }) => { if (active) { setHealth('车辆已连接'); configureSpeech(data.providers); } }).catch(() => { if (active) setHealth('连接已断开'); });
    return () => { active = false; clearTimeout(timeout); abort.abort(); };
  }, [attempt]);

  useEffect(() => {
    if (!help) return;
    const listener = (event: KeyboardEvent) => { if (event.key === 'Escape') setHelp(false); };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [help]);

  const views: [View, string][] = [['front', '前'], ['rear', '后'], ['left', '左'], ['right', '右']];
  const reload = () => { useScene.getState().patch({ loadError: null, loaded: false }); setAttempt((s) => s + 1); };
  const exportDiagnostics = async () => {
    const state = useScene.getState();
    const voice = useSpeech.getState(), vehicle = useVehicle.getState();
    const data = { exportedAt: new Date().toISOString(), increment: 'I7–I9', userAgent: navigator.userAgent, asset,
      loadMs: state.loadMs, mode: state.mode, gesture: state.gesture, microphone: state.microphone, samples: state.samples,
      voice: { phase: voice.phase, transcript: voice.transcript, message: voice.message, errorCode: voice.errorCode, asrModel: voice.health.asr.model, ttsModel: voice.health.tts.model, mode: voice.health.mode, traces: voice.traces },
      vehicle: { revision: vehicle.state.revision, targets: vehicle.state.windows, actual: { ...windowPoses } },wake:useWake.getState(),fullState:vehicle.state,actualParts:{...actualValues} };
    try {
      const response = await fetch('/api/diagnostics', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data), signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error('报告写入失败，请重试。');
      const result: { saved: string } = await response.json();
      setSavedReport(`已保存：${result.saved}`);
    } catch (error) { setSavedReport(error instanceof Error ? error.message : '报告写入失败'); }
  };

  return <main className="app current-increment polished-app">
    <header className="header">
      <a className="brand" href="/" aria-label="SU7 智能座舱首页"><span className="brand-wordmark">SU<span>7</span></span><span className="brand-divider"/><span className="brand-cn">智能座舱<small>YOUR SPACE. YOUR DRIVE.</small></span></a>
      <nav className="experience-nav" aria-label="体验视角"><button aria-pressed={mode==='orbit'} onClick={()=>go('overview')}>外观总览</button><button aria-pressed={mode==='free'} onClick={()=>go('cabin')}>座舱视角</button><button onClick={()=>{go('lounge');useScene.setState({showHotspots:false});useVehicle.getState().selectPart('ambient:cabin');}}>氛围空间<span aria-hidden="true">↗</span></button></nav>
      <div className="header-actions"><span className={`service ${health==='连接已断开'?'disconnected':''}`}><i />{health}</span><button className="icon-button" onClick={() => setHelp(true)} aria-label="操作帮助" title="使用指南与关于"><Icon name="info" /></button></div>
    </header>

    <section className="viewport" aria-label="SU7 展厅">
      <div className="scene"><Scene asset={asset} attempt={attempt} /></div>
      <div className="scene-context"><span className="scene-context-line"/><div><h1>{mode==='orbit'?'全景驾控':'沉浸座舱'}</h1><p>{mode==='orbit'?'从每一个角度，了解你的 SU7':'让光线，延伸空间的温度'}</p></div></div>

      <VehicleControls />

      {!loaded && <div className="loading-card" role="status" aria-live="polite"><span className="loading-index">SU7</span><h2>{error ? '模型加载未完成' : asset?.status === 'missing' ? '等待指定 SU7 资产' : '正在为你准备座舱'}</h2><p>{error || (asset?.status === 'missing' ? asset.message : `正在加载模型和材质 · ${progress}%`)}</p>{asset?.status === 'missing' && <p className="loading-detail">从正规入口下载后导入，便可开始探索。</p>}<button className="primary-button" onClick={reload}>{error ? '重新加载' : '检查资产并重试'}<Icon name="reset" /></button></div>}

      <nav className="view-toolbar" aria-label="镜头控制">
        <div className="mode-switch"><button aria-pressed={mode === 'orbit' && !panTool} onClick={() => setMode('orbit')}><Icon name="orbit" />外观</button><button aria-pressed={panTool} onClick={() => useScene.getState().setPan()}><Icon name="move" />平移</button><button aria-pressed={mode === 'free'} onClick={() => setMode('free')}><Icon name="move" />自由观察</button></div>
        <span className="toolbar-divider" />
        <div className="view-presets" aria-label="方位视角">{views.map(([view, label]) => <button key={view} aria-label={`${label}方视角`} onClick={() => go(view)}>{label}</button>)}</div>
        <span className="toolbar-divider" />
        <button className="cabin-button" onClick={() => go('cabin')}><Icon name="cabin" />进入座舱</button>
        <button className="reset-button" onClick={() => go('overview')}><Icon name="reset" /><span>回到车辆</span></button>
        <button className="hotspot-toggle" aria-label="模型标记" aria-pressed={showHotspots} onClick={()=>useScene.getState().toggleHotspots()}>标记<span aria-hidden="true">{showHotspots?'●':'○'}</span></button>
      </nav>
      <div className="input-hints" aria-label="操作提示">{mode === 'orbit' ? <><span><span className="mouse-icon" />左键拖动 <em>{panTool ? "平移" : "旋转"}</em></span><span>右键拖动 <em>平移</em></span><span>滚轮 <em>缩放</em></span></> : <><span>点击场景后 <Key>W</Key><Key>A</Key><Key>S</Key><Key>D</Key> <em>移动</em></span><span><Key>Q</Key><Key>E</Key> <em>升降</em></span><span>左键拖动 <em>转头</em> · 滚轮 <em>前后</em></span></>}<span><Key>R</Key><em>返回</em></span></div>
      {mode === 'free' && <div className="speed-control"><label htmlFor="speed">移动速度 <span>{speed.toFixed(1)} m/s</span></label><input id="speed" type="range" min="0.2" max="4" step="0.2" value={speed} onChange={(e) => useScene.getState().setSpeed(Number(e.target.value))} /></div>}
    </section>

    <ControlConsole />
    {debug && <aside className="debug-panel" aria-label="调试记录"><div className="panel-top"><strong>场景诊断</strong><button onClick={() => setDebug(false)} aria-label="关闭调试记录">×</button></div><AssistantDiagnostics/><div className="performance" data-testid="performance"><i />{metrics.fps || '—'} <span>FPS</span><span className="perf-divider" />WEBGL 2</div><dl><dt>资产状态</dt><dd data-testid="asset-status">{loaded ? 'ready / 实际 GLB 已加载' : asset?.status ?? 'connecting'}</dd><dt>SHA-256</dt><dd className="hash">{asset?.sha256 ?? '尚无运行资源'}</dd><dt>相机位置</dt><dd data-testid="camera-position">{metrics.position.join(', ')}</dd><dt>相机朝向</dt><dd data-testid="camera-rotation">{metrics.rotation.join(', ')}</dd><dt>渲染</dt><dd>{metrics.calls} calls · {metrics.triangles.toLocaleString()} triangles</dd><dt>GPU</dt><dd>{metrics.renderer}</dd><dt>手势</dt><dd data-testid="gesture">{gesture}</dd><dt>首帧模型</dt><dd>{useScene.getState().loadMs ?? "—"} ms / 页面导航起</dd><dt>累计运行</dt><dd>{metrics.elapsed}s</dd><dt>语音 / 控车</dt><dd>{providers.asr.configured && providers.tts.configured ? '车辆部件已接入 · 语音 API 已配置' : '车辆部件已接入 · 语音待配置'}</dd></dl><button className="primary-button" onClick={exportDiagnostics}>保存场景诊断 JSON <Icon name="arrow" /></button><p className="saved-report" role="status">{savedReport}</p><MicrophoneProbe /></aside>}
    {help && <div className="modal-backdrop" onClick={() => setHelp(false)}><section className="help-modal" role="dialog" aria-modal="true" aria-labelledby="help-title" onClick={(e) => e.stopPropagation()}><div className="panel-top"><span>SU7 · 使用指南</span><button autoFocus onClick={() => setHelp(false)} aria-label="关闭帮助">×</button></div><h2 id="help-title">每一项操作，都在手边。</h2><div className="help-row"><Icon name="orbit" /><div><h3>外观环绕</h3><p>左键旋转，右键平移，滚轮缩放。也可选择工具栏“平移”后用左键拖动。使用前、后、左、右按钮快速定位。</p></div></div><div className="help-row"><Icon name="move" /><div><h3>自由观察</h3><p>点击场景获得焦点。WASD 或方向键移动，Q/E 升降；左键拖动转头，右键拖动平移，滚轮向前或向后。可穿过车身进入座舱。</p></div></div><div className="help-row"><Icon name="reset" /><div><h3>随时返回</h3><p>点击“回到车辆”或在场景中按 R 恢复初始视角。座舱按钮自动切换为自由观察。</p></div></div><p className="help-note">点击 3D 车窗可选中；左侧滑块、开关和下方文字指令共用状态。点击麦克风开始录音，说完自动结束；可取消、手动结束或重新录音。</p><div className="about-credits" aria-label="关于与模型署名"><strong>关于 SU7 智能座舱</strong><p>三维车辆交互体验 · 语音助手与环绕氛围照明</p><p>模型：<a href={MODEL_URL} target="_blank" rel="noreferrer">Xiaomi SU7 — Mona x Supercars</a><br/>原作来源 Sketchfab · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a> · 本项目已作交互与灯光增强。</p><div className="about-meta"><span>版本 0.7.6</span><button aria-label="调试记录" onClick={()=>{setHelp(false);setDebug(true);}}>连接与诊断</button></div></div><button className="primary-button" onClick={() => setHelp(false)}>继续体验 <Icon name="arrow" /></button></section></div>}
  </main>;
}
