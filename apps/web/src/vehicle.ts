import { create } from 'zustand';
import { CommandLedger, corners, defaultWindows, parseWindowText, windowLabels, type Corner, type CommandRequest, type Execution, type WindowCommand, type WindowContext, type WindowState } from '../../../packages/shared/src/windows';

const ledger = new CommandLedger();
const waiters = new Map<string, Array<(execution: Execution) => void>>();
export const windowPoses: Record<Corner, number> = { fl: 0, fr: 0, rl: 0, rr: 0 };
interface VehicleStore {
  state: WindowState;
  available: Corner[];
  selected: Corner | null;
  preview: Partial<Record<Corner, number>>;
  context: WindowContext;
  epoch: number;
  executions: Execution[];
  messages: Array<{ id: string; input: string; output: string; origin: string; status: string }>;
  actual: Record<Corner, number>;
  feedback: string;
  register: (available: Corner[]) => void;
  beginManual: (corner?: Corner) => void;
  select: (corner: Corner) => void;
  setPreview: (corner: Corner, value?: number) => void;
  submit: (request: CommandRequest) => Execution | null;
  text: (input: string, origin?: 'text' | 'voice', guard?: { revision: number; epoch: number; requestId?: string }) => { kind: string; message: string; execution?: Execution };
  finish: (id: string, status: Execution['status'], message?: string) => void;
  sample: () => void;
  say: (message: string) => void;
  newConversation: () => void;
}
export const useVehicle = create<VehicleStore>((set, get) => ({
  state: defaultWindows(), available: [], selected: null, preview: {}, context: {}, epoch: 0, executions: [], messages: [],
  actual: { ...windowPoses }, feedback: '选择车窗，拖动滑块，或输入一句指令。',
  register: (available) => {
    set({ available });
    if (!available.length) for (const execution of get().executions) if (execution.status === 'animating') get().finish(execution.requestId, 'failed', '模型已卸载，车窗动作未确认完成。');
  },
  beginManual: (corner) => set((s) => ({ epoch: s.epoch + 1, context: { focus: corner ? { targets: [corner], updatedAt: Date.now() } : s.context.focus }, ...(corner ? { selected: corner } : {}) })),
  select: (corner) => { get().beginManual(corner); set({ feedback: `已选择${windowLabels[corner]}，可使用滑块或文字调节。` }); },
  setPreview: (corner, value) => set((s) => { const preview = { ...s.preview }; if (value === undefined) delete preview[corner]; else preview[corner] = value; return { preview }; }),
  submit: (request) => {
    const result = ledger.apply(get().state, request, new Set(get().available));
    if (!result.ok) { set({ feedback: result.message }); return null; }
    if (result.duplicate) return get().executions.find((e) => e.requestId === request.requestId) ?? result.execution;
    const execution = { ...result.execution, status: result.execution.query ? 'completed' as const : 'animating' as const };
    if (!execution.query) for (const old of get().executions) {
      if (old.status === 'animating' && old.targets.some((c) => execution.targets.includes(c))) get().finish(old.requestId, 'superseded', '此动作已由新的目标替代。');
    }
    set((s) => ({ state: result.state, context: { focus: { targets: execution.targets, updatedAt: Date.now() } },
      executions: [...s.executions.slice(-79), execution], feedback: execution.query ? execution.message : `正在调整${execution.targets.map((c) => windowLabels[c]).join('、')}…` }));
    return execution;
  },
  text: (input, origin = 'text', guard) => {
    const current = get();
    if (guard && (guard.revision !== current.state.revision || guard.epoch !== current.epoch)) return { kind: 'stale', message: '语音期间车辆已被手动或文字操作，此次旧结果已丢弃。' };
    if (origin === 'text') get().beginManual();
    const parsed = parseWindowText(input, current.context);
    let execution: Execution | undefined;
    let message: string;
    if (parsed.kind === 'clarify') { set({ context: { ...get().context, pending: parsed.pending } }); message = parsed.message; }
    else if (parsed.kind === 'execute') {
      execution = get().submit({ requestId: guard?.requestId ?? crypto.randomUUID(), baseRevision: get().state.revision, origin, route: 'rules', commands: parsed.commands }) ?? undefined;
      message = get().feedback;
    } else { message = parsed.message; set({ context: { focus: get().context.focus } }); }
    set((s) => ({ feedback: message, messages: [...s.messages.slice(-19), { id: execution?.requestId ?? crypto.randomUUID(), input, output: message, origin, status: execution?.status ?? parsed.kind }] }));
    return { kind: execution ? 'execute' : parsed.kind === 'execute' ? 'failed' : parsed.kind, message, execution };
  },
  finish: (id, status, message) => {
    const old = get().executions.find((e) => e.requestId === id);
    if (!old || old.status !== 'animating') return;
    const execution = { ...old, status, message: message ?? old.message };
    set((s) => ({ executions: s.executions.map((e) => e.requestId === id ? execution : e),
      messages: s.messages.map((m) => m.id === id ? { ...m, output: execution.message, status } : m),
      ...(s.executions.at(-1)?.requestId === id ? { feedback: execution.message } : {}) }));
    waiters.get(id)?.forEach((resolve) => resolve(execution)); waiters.delete(id);
  },
  sample: () => set({ actual: { ...windowPoses } }),
  say: (feedback) => set({ feedback }),
  newConversation: () => set((s) => ({ context: {}, messages: [], epoch: s.epoch + 1, feedback: '新对话已开始，车辆状态保持不变。' })),
}));
export function manualWindow(targets: Corner[], value: number): Execution | null {
  const store = useVehicle.getState();
  store.beginManual(targets.length === 1 ? targets[0] : undefined);
  const commands: WindowCommand[] = [{ component: 'window', targets, operation: 'set', property: 'openness', value }];
  for (const c of targets) store.setPreview(c, undefined);
  return store.submit({ requestId: crypto.randomUUID(), baseRevision: store.state.revision, origin: 'manual', route: 'manual', commands });
}
export function waitForWindowExecution(execution: Execution): Promise<Execution> {
  const current = useVehicle.getState().executions.find((e) => e.requestId === execution.requestId) ?? execution;
  if (current.status !== 'animating') return Promise.resolve(current);
  return new Promise((resolve) => {
    const timeout = setTimeout(() => useVehicle.getState().finish(current.requestId, 'failed', '车窗动作超时，未确认执行成功。'), 6500);
    const done = (result: Execution) => { clearTimeout(timeout); resolve(result); };
    waiters.set(current.requestId, [...waiters.get(current.requestId) ?? [], done]);
  });
}
export { corners, windowLabels };
export type { Corner };
