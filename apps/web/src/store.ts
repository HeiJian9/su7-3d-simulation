import { create } from 'zustand';

export type CameraMode = 'orbit' | 'free';
export type View = 'overview' | 'front' | 'rear' | 'left' | 'right' | 'cabin';
export interface Metrics {
  fps: number;
  calls: number;
  triangles: number;
  position: number[];
  rotation: number[];
  renderer: string;
  elapsed: number;
  focused: boolean;
  viewport: number[];
}
interface SceneState {
  mode: CameraMode;
  panTool: boolean;
  view: View;
  request: number;
  speed: number;
  loaded: boolean;
  progress: number;
  loadError: string | null;
  metrics: Metrics;
  gesture: string;
  samples: Metrics[];
  loadMs: number | null;
  microphone: { status: string; peakRms: number; samples: number; durationMs: number; message: string };
  setMicrophone: (probe: SceneState['microphone']) => void;
  setMode: (mode: CameraMode) => void;
  setPan: () => void;
  go: (view: View) => void;
  setSpeed: (speed: number) => void;
  patch: (state: Partial<Pick<SceneState, 'loaded' | 'progress' | 'loadError' | 'metrics' | 'gesture' | 'loadMs'>>) => void;
  record: (metrics: Metrics) => void;
}
export const useScene = create<SceneState>((set) => ({
  mode: 'orbit', panTool: false, view: 'overview', request: 0, speed: 1.4, loaded: false, progress: 0, loadError: null,
  metrics: { fps: 0, calls: 0, triangles: 0, position: [], rotation: [], renderer: '检测中', elapsed: 0, focused: false, viewport: [] },
  samples: [], loadMs: null,
  microphone: { status: 'unverified', peakRms: 0, samples: 0, durationMs: 0, message: '尚未检测' },
  setMicrophone: (microphone) => set({ microphone }),
  gesture: '尚无手势',
  setMode: (mode) => set({ mode, panTool: false }),
  setPan: () => set({ mode: 'orbit', panTool: true }),
  go: (view) => set((state) => ({ view, panTool: false, mode: view === 'cabin' ? 'free' : 'orbit', request: state.request + 1 })),
  setSpeed: (speed) => set({ speed }),
  patch: (state) => set(state),
  record: (metrics) => set((state) => ({ metrics, samples: [...state.samples.slice(-359), metrics] })),
}));
