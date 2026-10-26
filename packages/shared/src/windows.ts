import { z } from 'zod';

export const corners = ['fl', 'fr', 'rl', 'rr'] as const;
export type Corner = typeof corners[number];
export const cornerSchema = z.enum(corners);
export const windowLabels: Record<Corner, string> = { fl: '左前车窗', fr: '右前车窗', rl: '左后车窗', rr: '右后车窗' };
const common = { component: z.literal('window'), targets: z.array(cornerSchema).min(1).max(4), property: z.literal('openness') };
export const windowCommandSchema = z.discriminatedUnion('operation', [
  z.object({ ...common, operation: z.literal('set'), value: z.number().min(0).max(1) }).strict(),
  z.object({ ...common, operation: z.literal('adjust'), value: z.number().min(-1).max(1) }).strict(),
  z.object({ ...common, operation: z.literal('query') }).strict(),
]);
export type WindowCommand = z.infer<typeof windowCommandSchema>;
export const commandRequestSchema = z.object({
  requestId: z.string().min(1).max(128), baseRevision: z.number().int().nonnegative(),
  origin: z.enum(['manual', 'text', 'voice']), route: z.enum(['manual', 'rules']),
  commands: z.array(windowCommandSchema).min(1).max(16),
}).strict().superRefine((r, ctx) => {
  if ((r.origin === 'manual') !== (r.route === 'manual')) ctx.addIssue({ code: 'custom', message: '入口与路由不一致' });
});
export type CommandRequest = z.infer<typeof commandRequestSchema>;
export interface WindowState { revision: number; windows: Record<Corner, { openness: number }> }
export const defaultWindows = (): WindowState => ({ revision: 0, windows: { fl: { openness: 0 }, fr: { openness: 0 }, rl: { openness: 0 }, rr: { openness: 0 } } });
export interface Execution {
  requestId: string;
  status: 'accepted' | 'animating' | 'completed' | 'superseded' | 'failed';
  revision: number;
  origin: CommandRequest['origin'];
  route: CommandRequest['route'];
  targets: Corner[];
  values: Partial<Record<Corner, number>>;
  query: boolean;
  boundary: boolean;
  message: string;
}
export type ApplyResult = { ok: true; state: WindowState; execution: Execution; duplicate: boolean } | { ok: false; code: string; message: string };
export function describeWindows(values: Partial<Record<Corner, number>>) {
  return corners.filter((c) => values[c] !== undefined).map((c) => `${windowLabels[c]}${values[c] === 0 ? '已关闭' : values[c] === 1 ? '已完全打开' : `已打开到 ${Math.round(values[c]! * 100)}%`}`).join('，');
}
export class CommandLedger {
  private requests = new Map<string, { fingerprint: string; result: ApplyResult }>();
  clear() { this.requests.clear(); }
  apply(state: WindowState, input: unknown, available: ReadonlySet<Corner> = new Set(corners)): ApplyResult {
    const parsed = commandRequestSchema.safeParse(input);
    if (!parsed.success) return { ok: false, code: 'INVALID_COMMAND', message: '指令格式或数值无效，车辆未改变。' };
    const request = parsed.data;
    const fingerprint = JSON.stringify(request);
    const existing = this.requests.get(request.requestId);
    if (existing) return existing.fingerprint === fingerprint ? { ...existing.result, ...(existing.result.ok ? { state, duplicate: true } : {}) } : { ok: false, code: 'REQUEST_ID_CONFLICT', message: '请求编号已被其他指令使用。' };
    if (request.baseRevision !== state.revision) return { ok: false, code: 'STALE_REVISION', message: '车辆状态已改变，请重新发出指令。' };
    const targetSet = new Set(request.commands.flatMap((c) => c.targets));
    if ([...targetSet].some((c) => !available.has(c))) return { ok: false, code: 'COMPONENT_UNAVAILABLE', message: '车窗模型尚未就绪，请待加载完成后重试。' };
    const next = structuredClone(state);
    let boundary = false;
    for (const command of request.commands) {
      for (const c of new Set(command.targets)) {
        if (command.operation === 'query') continue;
        const old = next.windows[c].openness;
        const proposed = command.operation === 'set' ? command.value : old + command.value;
        const value = Math.round(Math.min(1, Math.max(0, proposed)) * 10000) / 10000;
        if (command.operation === 'adjust' && (proposed < 0 || proposed > 1 || (value === old && command.value !== 0))) boundary = true;
        next.windows[c].openness = value;
      }
    }
    const changed = corners.some((c) => next.windows[c].openness !== state.windows[c].openness);
    if (changed) next.revision++;
    const targets = [...targetSet];
    const values = Object.fromEntries(targets.map((c) => [c, next.windows[c].openness]));
    const query = request.commands.every((c) => c.operation === 'query');
    const execution: Execution = {
      requestId: request.requestId, status: query ? 'completed' : 'accepted', revision: next.revision,
      origin: request.origin, route: request.route, targets, values, query, boundary,
      message: query ? targets.map((c) => `${windowLabels[c]}目标开度为 ${Math.round(values[c] * 100)}%`).join('，') + '。' : `${describeWindows(values)}${boundary ? '，已到达调节边界' : ''}。`,
    };
    const result: ApplyResult = { ok: true, state: next, execution, duplicate: false };
    this.requests.set(request.requestId, { fingerprint, result });
    if (this.requests.size > 256) this.requests.delete(this.requests.keys().next().value!);
    return result;
  }
}

export interface WindowContext {
  focus?: { targets: Corner[]; updatedAt: number };
  pending?: { commands: WindowCommand[]; expiresAt: number };
}
export type RuleResult = { kind: 'execute'; commands: WindowCommand[]; targets: Corner[] } | { kind: 'clarify'; message: string; pending: NonNullable<WindowContext['pending']> } | { kind: 'noop' | 'unsupported'; message: string };
const aliases: Array<[Corner, RegExp]> = [
  ['fl', /左前|前左|主驾(?:驶)?(?:位)?|驾驶位/], ['fr', /右前|前右|副驾(?:驶)?(?:位)?/],
  ['rl', /左后|后左/], ['rr', /右后|后右/],
];
function targetsIn(text: string): Corner[] {
  if (/(全部|所有|四个|四扇|四面)(?:的)?(?:车)?窗/.test(text)) return [...corners];
  return aliases.filter(([, pattern]) => pattern.test(text)).map(([c]) => c);
}
const numbers: Record<string, number> = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
function chineseNumber(text: string): number | undefined {
  if (/^\d+(?:\.\d+)?$/.test(text)) return Number(text);
  if (text === '一百' || text === '百') return 100;
  if (text.includes('十')) { const [a, b] = text.split('十'); return (a ? numbers[a] : 1) * 10 + (b ? numbers[b] : 0); }
  return numbers[text];
}
export function parseWindowText(raw: string, context: WindowContext = {}, now = Date.now()): RuleResult {
  const text = raw.trim().replace(/[\s。！!？?]/g, '').replace(/(左前|右前|左后|右后|前左|前右|后左|后右)方/g,'$1').replace(/百分之([零一二两三四五六七八九十百\d.]+)/g, (_, n: string) => `${chineseNumber(n) ?? n}%`).replace(/(左前|右前|左后|右后)(?:那个)?[，,](?=开|关|升|降)/g, '$1');
  if (!text) return { kind: 'noop', message: '请输入车窗指令。' };
  if (/^(取消|算了|不用了|停止操作|取消这条指令|取消刚才的指令)$/.test(text)) return { kind: 'noop', message: '已取消待确认指令，车窗目标保持不变。' };
  // An implicit target must identify one window. A previous bulk action is not consent to act on all again.
  const freshFocus = context.focus && context.focus.targets.length === 1 && now - context.focus.updatedAt < 120000 ? context.focus.targets : undefined;
  if (context.pending && context.pending.expiresAt > now) {
    const allAnswer=/^(全部|所有|四个|四扇|四面)(?:的)?(?:车窗|窗户|窗|玻璃)?$/.test(text);
    const answerTargets = allAnswer ? [...corners] : targetsIn(text);
    const justTarget = allAnswer ? '' : text.replace(/(?:左前|右前|左后|右后|前左|前右|后左|后右|主驾(?:驶)?(?:位)?|副驾(?:驶)?(?:位)?|驾驶位)(?:那个|那个窗|车窗|窗户|窗|玻璃)?/g, '').replace(/的|那个/g, '');
    if (answerTargets.length && !justTarget) {
      const commands = context.pending.commands.map((c) => ({ ...c, targets: c.targets.length ? c.targets : answerTargets }) as WindowCommand);
      return { kind: 'execute', commands, targets: answerTargets };
    }
  }
  const clauses = text.split(/[，,；;]|然后|接着|并且|同时/).filter(Boolean);
  const commands: WindowCommand[] = [];
  let unresolved = false;
  let inherited = freshFocus;
  let negated = false;
  for (const clause of clauses) {
    if (/(不要|先别|先不要|别|不用|不需要|不想)/.test(clause)) {
      const positive = parseWindowText(clause.replace(/先不要|先别|不要|不需要|不用|不想|别/g, ''), {}, now);
      if (positive.kind === 'unsupported' || positive.kind === 'noop') return { kind: 'unsupported', message: '否定子句未被完整识别，车辆未改变。请明确具体车窗和动作。' };
      negated = true; continue;
    }
    const explicit = targetsIn(clause);
    const targets = explicit.length ? explicit : inherited;
    const cleaned = clause.replace(/请|帮我|麻烦|把|将/g, '').replace(/(?:左前|右前|左后|右后|前左|前右|后左|后右|主驾(?:驶)?(?:位)?|副驾(?:驶)?(?:位)?|驾驶位)/g, '').replace(/(?:全部|所有|四个|四扇|四面)(?:的)?/g, '').replace(/车窗|窗户|窗|玻璃|那个|这个|它|的/g, '').replace(/一下|吧|谢谢/g, '');
    let operation: 'set' | 'adjust' | 'query' = 'set';
    let value: number | undefined;
    const percent = cleaned.match(/(\d+(?:\.\d+)?)%/);
    if (percent && Number(percent[1]) > 100) return { kind: 'unsupported', message: '车窗开度应在 0% 到 100% 之间。' };
    const relative = /再|一点|一些|大点|小点/.test(cleaned);
    if (/^(?:查看|查询|看看|现在|当前|开了多少|开度|状态|是多少|怎么样)+$/.test(cleaned)) operation = 'query';
    else if (/^(?:打开|开启|开|降下|降低|下降|降|关闭|关上|关|升起|升高|上升|升|完全|全部|全|到|至|成|为|设为|设置为|一半|半|再|一点|一些|大点|小点|回去|0|\d|\.|%)+$/.test(cleaned)) {
      const closing = /关|升|上升/.test(cleaned);
      const opening = /开|降|下降/.test(cleaned);
      if (!closing && !opening && !/设为|设置为/.test(cleaned)) return { kind: 'unsupported', message: '请明确打开、关闭或设置开度。' };
      if (relative) { operation = 'adjust'; value = (closing ? -1 : 1) * (percent ? Number(percent[1]) / 100 : 0.1); }
      else if (/一半|半/.test(cleaned)) value = 0.5;
      else value = percent ? Number(percent[1]) / 100 : closing ? 0 : 1;
    } else return { kind: 'unsupported', message: '这条表达尚未被四窗规则完整覆盖，车辆未改变。可说“左前车窗打开一半”。' };
    const base = operation === 'query' ? { component: 'window' as const, operation, property: 'openness' as const } : { component: 'window' as const, operation, property: 'openness' as const, value: value! };
    commands.push({ ...base, targets: targets ? [...targets] : [] } as WindowCommand);
    if (!targets?.length) unresolved = true;
    else inherited = targets;
  }
  if (unresolved) return { kind: 'clarify', message: '需要调整哪一扇车窗？请选择左前、右前、左后或右后。', pending: { commands, expiresAt: now + 120000 } };
  if (!commands.length) return { kind: 'noop', message: negated ? '已保留否定要求，车窗没有改变。' : '没有需要执行的车窗指令。' };
  return { kind: 'execute', commands, targets: [...new Set(commands.flatMap((c) => c.targets))] };
}
