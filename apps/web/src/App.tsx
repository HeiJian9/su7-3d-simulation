import { useEffect, useState, type ReactNode } from 'react';
import { assetSchema, type AssetManifest, MODEL_URL } from '../../../packages/shared/src/asset';
import { Scene } from './Scene';
import { MicrophoneProbe } from './MicrophoneProbe';
import { VehicleControls } from './VehicleControls';
import { ControlConsole } from './ControlConsole';
import { configureSpeech, useSpeech } from './speech';
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
    void fetch('/api/health', { signal: abort.signal }).then((res) => { if (!res.ok) throw new Error(); return res.json(); }).then((data: { providers: SpeechHealth }) => { if (active) { setHealth('本地服务在线'); configureSpeech(data.providers); } }).catch(() => { if (active) setHealth('服务未连接'); });
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
    const data = { exportedAt: new Date().toISOString(), increment: 'I6', userAgent: navigator.userAgent, asset,
      loadMs: state.loadMs, mode: state.mode, gesture: state.gesture, microphone: state.microphone, samples: state.samples,
      voice: { phase: voice.phase, transcript: voice.transcript, message: voice.message, errorCode: voice.errorCode, asrModel: voice.health.asr.model, ttsModel: voice.health.tts.model, mode: voice.health.mode, traces: voice.traces },
      vehicle: { revision: vehicle.state.revision, targets: vehicle.state.windows, actual: { ...windowPoses } },fullState:vehicle.state,actualParts:{...actualValues} };
    try {
      const response = await fetch('/api/diagnostics', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data), signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error('报告写入失败，请重试。');
      const result: { saved: string } = await response.json();
      setSavedReport(`已保存：${result.saved}`);
    } catch (error) { setSavedReport(error instanceof Error ? error.message : '报告写入失败'); }
  };

  return <main className="app current-increment">
    <header className="header">
      <a className="brand" href="/" aria-label="SU7 交互实验室首页"><span className="brand-mark">S<span>7</span></span><span>SU7 <span className="brand-cn">交互实验室</span><small>INTERACTION LAB</small></span></a>
      <div className="chapter"><span className="chapter-line" /> I4—I6 <span className="chapter-label">部件与语音</span></div>
      <div className="header-actions"><span className="service"><i />{health}</span><button className="icon-button" onClick={() => setHelp(true)} aria-label="操作帮助"><Icon name="info" /></button></div>
    </header>

    <section className="viewport" aria-label="SU7 展厅">
      <div className="scene"><Scene asset={asset} attempt={attempt} /></div>
      <div className="title-block"><p className="eyebrow">XIAOMI · VIRTUAL STUDIO / 001</p><h1>让每一次开合，<br /><span>都回应你。</span></h1><p className="intro">真实升降 · 独立控制 · 自由观察。</p><span className="mode-label"><i />{mode === 'orbit' ? '外观环绕' : '自由观察'}<span> / {mode === 'orbit' ? 'ORBIT' : 'EXPLORE'}</span></span></div>

      <VehicleControls />
      <aside className="asset-panel" aria-label="模型资产信息"><div className="panel-top"><span>ASSET / 01</span><span className={loaded ? 'asset-ready' : 'asset-pending'}>{loaded ? '已加载' : error ? '需重试' : '待加载'}</span></div><h2>Xiaomi SU7</h2><p>Mona x Supercars</p><div className="asset-meta"><span>模型来源</span><a href={MODEL_URL} target="_blank" rel="noreferrer">Sketchfab <Icon name="arrow" /></a><span>资源许可</span><a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0 <Icon name="arrow" /></a><span>运行资源</span><span>{asset?.bytes ? `${(asset.bytes / 1048576).toFixed(2)} MB · GLB` : '等待指定原始资产'}</span></div><p className="asset-note">{loaded ? '指定 SU7 部件与语音使用实际分件和局部增强资产。' : '资源状态以本地加载结果为准。'}</p></aside>

      {!loaded && <div className="loading-card" role="status" aria-live="polite"><span className="loading-index">SU7 / ASSET</span><h2>{error ? '模型加载未完成' : asset?.status === 'missing' ? '等待指定 SU7 资产' : '正在准备 SU7 场景'}</h2><p>{error || (asset?.status === 'missing' ? asset.message : `正在加载模型和材质 · ${progress}%`)}</p>{asset?.status === 'missing' && <p className="loading-detail">从正规入口下载后导入，便可开始探索。</p>}<button className="primary-button" onClick={reload}>{error ? '重新加载' : '检查资产并重试'}<Icon name="reset" /></button></div>}

      <div className="viewport-corner"><span className="crosshair">＋</span><span>Y ↑ / FRONT −Z</span></div>
      <div className="performance" data-testid="performance"><i />{metrics.fps || '—'} <span>FPS</span><span className="perf-divider" />WEBGL 2</div>
      <nav className="view-toolbar" aria-label="镜头控制">
        <div className="mode-switch"><button aria-pressed={mode === 'orbit' && !panTool} onClick={() => setMode('orbit')}><Icon name="orbit" />外观</button><button aria-pressed={panTool} onClick={() => useScene.getState().setPan()}><Icon name="move" />平移</button><button aria-pressed={mode === 'free'} onClick={() => setMode('free')}><Icon name="move" />自由观察</button></div>
        <span className="toolbar-divider" />
        <div className="view-presets" aria-label="方位视角">{views.map(([view, label]) => <button key={view} aria-label={`${label}方视角`} onClick={() => go(view)}>{label}</button>)}</div>
        <span className="toolbar-divider" />
        <button className="cabin-button" onClick={() => go('cabin')}><Icon name="cabin" />进入座舱</button>
        <button className="reset-button" onClick={() => go('overview')}><Icon name="reset" /><span>回到车辆</span></button>
      </nav>
      <div className="input-hints" aria-label="操作提示">{mode === 'orbit' ? <><span><span className="mouse-icon" />左键拖动 <em>{panTool ? "平移" : "旋转"}</em></span><span>右键拖动 <em>平移</em></span><span>滚轮 <em>缩放</em></span></> : <><span>点击场景后 <Key>W</Key><Key>A</Key><Key>S</Key><Key>D</Key> <em>移动</em></span><span><Key>Q</Key><Key>E</Key> <em>升降</em></span><span>左键拖动 <em>转头</em> · 滚轮 <em>前后</em></span></>}<span><Key>R</Key><em>返回</em></span></div>
      {mode === 'free' && <div className="speed-control"><label htmlFor="speed">移动速度 <span>{speed.toFixed(1)} m/s</span></label><input id="speed" type="range" min="0.2" max="4" step="0.2" value={speed} onChange={(e) => useScene.getState().setSpeed(Number(e.target.value))} /></div>}
    </section>

    <ControlConsole />
    <footer className="footer"><div><span className="footer-tag">VEHICLE INTERACTION</span><span className="footer-caption">本轮 · 门窗、灯光、车漆、氛围灯与雨刷</span></div><button className="debug-toggle" aria-expanded={debug} onClick={() => setDebug(!debug)}><span className="debug-symbol">⌘</span>{debug ? '收起记录' : '调试记录'}<span>{debug ? '−' : '+'}</span></button><span className="footer-version">v0.6.6 <span>/ LOCAL</span></span></footer>
    {debug && <aside className="debug-panel" aria-label="调试记录"><div className="panel-top"><strong>场景诊断</strong><button onClick={() => setDebug(false)} aria-label="关闭调试记录">×</button></div><dl><dt>资产状态</dt><dd data-testid="asset-status">{loaded ? 'ready / 实际 GLB 已加载' : asset?.status ?? 'connecting'}</dd><dt>SHA-256</dt><dd className="hash">{asset?.sha256 ?? '尚无运行资源'}</dd><dt>相机位置</dt><dd data-testid="camera-position">{metrics.position.join(', ')}</dd><dt>相机朝向</dt><dd data-testid="camera-rotation">{metrics.rotation.join(', ')}</dd><dt>渲染</dt><dd>{metrics.calls} calls · {metrics.triangles.toLocaleString()} triangles</dd><dt>GPU</dt><dd>{metrics.renderer}</dd><dt>手势</dt><dd data-testid="gesture">{gesture}</dd><dt>首帧模型</dt><dd>{useScene.getState().loadMs ?? "—"} ms / 页面导航起</dd><dt>累计运行</dt><dd>{metrics.elapsed}s</dd><dt>语音 / 控车</dt><dd>{providers.asr.configured && providers.tts.configured ? '车辆部件已接入 · 语音 API 已配置' : '车辆部件已接入 · 语音待配置'}</dd></dl><button className="primary-button" onClick={exportDiagnostics}>保存场景诊断 JSON <Icon name="arrow" /></button><p className="saved-report" role="status">{savedReport}</p><MicrophoneProbe /></aside>}
    {help && <div className="modal-backdrop" onClick={() => setHelp(false)}><section className="help-modal" role="dialog" aria-modal="true" aria-labelledby="help-title" onClick={(e) => e.stopPropagation()}><div className="panel-top"><span>HOW TO EXPLORE</span><button autoFocus onClick={() => setHelp(false)} aria-label="关闭帮助">×</button></div><h2 id="help-title">把视角交给自己。</h2><div className="help-row"><Icon name="orbit" /><div><h3>外观环绕</h3><p>左键旋转，右键平移，滚轮缩放。也可选择工具栏“平移”后用左键拖动。使用前、后、左、右按钮快速定位。</p></div></div><div className="help-row"><Icon name="move" /><div><h3>自由观察</h3><p>点击场景获得焦点。WASD 或方向键移动，Q/E 升降；左键拖动转头，右键拖动平移，滚轮向前或向后。可穿过车身进入座舱。</p></div></div><div className="help-row"><Icon name="reset" /><div><h3>随时返回</h3><p>点击“回到车辆”或在场景中按 R 恢复初始视角。座舱按钮自动切换为自由观察。</p></div></div><p className="help-note">点击 3D 车窗可选中；左侧滑块、开关和下方文字指令共用状态。点击麦克风开始录音，说完自动结束；可取消、手动结束或重新录音。</p><button className="primary-button" onClick={() => setHelp(false)}>开始探索 <Icon name="arrow" /></button></section></div>}
  </main>;
}
