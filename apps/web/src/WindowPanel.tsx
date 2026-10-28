import { useRef, useState } from 'react';
import { corners, manualWindow, useVehicle, windowLabels, type Corner } from './vehicle';

export function WindowPanel() {
  const [open, setOpen] = useState(true);
  const state = useVehicle((s) => s.state);
  const available = useVehicle((s) => s.available);
  const selected = useVehicle((s) => s.selected);
  const preview = useVehicle((s) => s.preview);
  const actual = useVehicle((s) => s.actual);
  const feedback = useVehicle((s) => s.feedback);
  const active = useRef(new Set<Corner>());
  const ready = available.length === 4;
  const commit = (corner: Corner) => {
    const value = useVehicle.getState().preview[corner];
    active.current.delete(corner);
    if (value !== undefined) manualWindow([corner], value);
  };
  return <aside className={`window-panel ${open ? 'is-open' : ''}`} aria-label="四窗控制" data-revision={state.revision} data-window-targets={JSON.stringify(state.windows)}>
    <button className="window-panel-heading" aria-expanded={open} onClick={() => setOpen(!open)}><span><small>WINDOW CONTROL / 01</small><strong>车窗开合</strong></span><span>{open ? '−' : '+'}</span></button>
    {open && <div className="window-panel-content"><div className="all-window-actions"><button disabled={!ready} onClick={() => manualWindow([...corners], 1)}>全部打开</button><button disabled={!ready} onClick={() => manualWindow([...corners], 0)}>全部关闭</button></div>
      <div className="window-list">{corners.map((corner) => <section className={`window-control ${selected === corner ? 'selected' : ''}`} key={corner} data-testid={`window-control-${corner}`}>
        <div className="window-row"><button className="window-select" aria-pressed={selected === corner} disabled={!ready} onClick={() => useVehicle.getState().select(corner)}>{windowLabels[corner]}<span>{corner.toUpperCase()}</span></button><output data-testid={`window-target-${corner}`}>{Math.round((preview[corner] ?? state.windows[corner].openness) * 100)}<small>%</small></output></div>
        <input aria-label={`${windowLabels[corner]}开度`} type="range" min="0" max="100" step="1" disabled={!ready} value={Math.round((preview[corner] ?? state.windows[corner].openness) * 100)}
          onPointerDown={(event) => { active.current.add(corner); useVehicle.getState().beginManual(corner); event.currentTarget.setPointerCapture(event.pointerId); }}
          onChange={(event) => { const value = Number(event.target.value) / 100; if (active.current.has(corner)) useVehicle.getState().setPreview(corner, value); else manualWindow([corner], value); }}
          onPointerUp={() => commit(corner)} onPointerCancel={() => { active.current.delete(corner); useVehicle.getState().setPreview(corner, undefined); }} />
        <div className="window-row window-meta"><span data-testid={`window-actual-${corner}`}>{Math.abs(actual[corner]-state.windows[corner].openness)>.015?'正在调整':actual[corner]<.01?'已关闭':actual[corner]>.99?'已全开':'已打开'}</span><div><button disabled={!ready} onClick={() => manualWindow([corner], 0)} aria-label={`关闭${windowLabels[corner]}`}>关</button><button disabled={!ready} onClick={() => manualWindow([corner], .5)} aria-label={`${windowLabels[corner]}打开一半`}>半开</button><button disabled={!ready} onClick={() => manualWindow([corner], 1)} aria-label={`完全打开${windowLabels[corner]}`}>开</button></div></div>
      </section>)}</div><p className="window-feedback" role="status" data-testid="vehicle-feedback">{feedback}</p><p className="window-note">可点击 3D 车窗选中 · 数值表示开度</p></div>}
  </aside>;
}
