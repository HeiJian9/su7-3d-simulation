import { describe, expect, it } from 'vitest';
import { CommandLedger, defaultWindows, parseWindowText, type CommandRequest, type WindowContext } from '../../packages/shared/src/windows';

function request(id: string, revision: number, targets = ['fl'], value = 0.5, operation = 'set'): unknown {
  return { requestId: id, baseRevision: revision, origin: 'text', route: 'rules', commands: [{ component: 'window', targets, operation, property: 'openness', value }] };
}
describe('unified window executor', () => {
  it('updates only the explicit window and preserves boundaries', () => {
    const ledger = new CommandLedger();
    const result = ledger.apply(defaultWindows(), request('half', 0));
    expect(result.ok).toBe(true); if (!result.ok) return;
    expect(result.state.windows.fl.openness).toBe(.5); expect(result.state.windows.rr.openness).toBe(0);
    const max = ledger.apply(result.state, request('more', 1, ['fl'], .8, 'adjust'));
    expect(max.ok && max.state.windows.fl.openness).toBe(1);
    expect(max.ok && max.execution.boundary).toBe(true);
  });
  it('deduplicates relative changes and never restores an old state', () => {
    const ledger = new CommandLedger(); const input=request('once',0,['fl'],.1,'adjust');
    const one=ledger.apply(defaultWindows(),input);if(!one.ok)throw Error();
    const two=ledger.apply(one.state,request('newer',1,['rr'],1));if(!two.ok)throw Error();
    const duplicate=ledger.apply(two.state,input);
    expect(duplicate.ok && duplicate.duplicate).toBe(true);
    expect(duplicate.ok && duplicate.state).toEqual(two.state);
    expect(ledger.apply(two.state,request('once',0,['fl'],.2,'adjust')).ok).toBe(false);
  });
  it('rejects stale, unavailable, unknown and partly invalid batches atomically', () => {
    const ledger=new CommandLedger(),state=defaultWindows();
    expect(ledger.apply(state,request('stale',1)).ok).toBe(false);
    expect(ledger.apply(state,request('missing',0),new Set()).ok).toBe(false);
    const valid=request('batch',0) as CommandRequest;
    expect(ledger.apply(state,{...valid,commands:[...valid.commands,{component:'door',targets:['fl'],operation:'set',value:1}]}).ok).toBe(false);
    expect(state.revision).toBe(0);
  });
  it('computes ordered operations in one transaction; unchanged targets still wait for actual animation', () => {
    const ledger=new CommandLedger(),base=request('ordered',0) as CommandRequest;
    const result=ledger.apply(defaultWindows(),{...base,commands:[...base.commands,{...base.commands[0],operation:'adjust',value:.1}]});
    expect(result.ok && result.state.windows.fl.openness).toBe(.6);
    if(!result.ok)return;
    const same=ledger.apply(result.state,request('same',1,['fl'],.6));
    expect(same.ok && same.execution.status).toBe('accepted');
  });
});
describe('complete Chinese four-window rules', () => {
  it.each([
    ['左前窗开一半','fl',.5],['右后窗关闭','rr',0],['主驾车窗打开','fl',1],['副驾窗开到百分之五十','fr',.5],['左后车窗打开到30%','rl',.3],
    ['关闭右后方车窗','rr',0],['打开右后方的车窗','rr',1],['左前方的窗户打开一半','fl',.5],
  ])('%s', (text,target,value) => {
    const r=parseWindowText(text);expect(r.kind).toBe('execute');
    if(r.kind==='execute'){expect(r.commands[0].targets).toEqual([target]);expect('value' in r.commands[0] && r.commands[0].value).toBe(value);}
  });
  it('clarifies missing targets and carries the original request through the answer', () => {
    const r=parseWindowText('打开车窗',{},100);expect(r.kind).toBe('clarify');if(r.kind!=='clarify')return;
    const ctx:WindowContext={pending:r.pending};const answer=parseWindowText('左后那个',ctx,200);
    expect(answer.kind==='execute'&&answer.commands[0].targets).toEqual(['rl']);
    const override=parseWindowText('左后那个，开一半',ctx,200);
    expect(override.kind==='execute'&&'value' in override.commands[0]&&override.commands[0].value).toBe(.5);
    const all=parseWindowText('所有车窗',ctx,200);expect(all.kind==='execute'&&all.targets).toEqual(['fl','fr','rl','rr']);
  });
  it('uses fresh focus, expires it, and opens all only when explicitly requested', () => {
    const focus={focus:{targets:['fr'] as const,updatedAt:0}};
    const r=parseWindowText('再关一点',{focus:{...focus.focus,targets:['fr']}},1000);
    expect(r.kind==='execute'&&r.commands[0]).toMatchObject({targets:['fr'],operation:'adjust',value:-.1});
    expect(parseWindowText('再关一点',{focus:{targets:['fr'],updatedAt:0}},130000).kind).toBe('clarify');
    const all=parseWindowText('打开所有车窗');expect(all.kind==='execute'&&all.targets.length).toBe(4);
  });
  it('does not execute negations or silently drop unknown clauses', () => {
    expect(parseWindowText('不要打开左前车窗').kind).toBe('noop');
    expect(parseWindowText('左前开一半，顺便开灯').kind).toBe('unsupported');
    expect(parseWindowText('不要打开左前车窗并且启动雨刷').kind).toBe('unsupported');
    const mixed=parseWindowText('不要打开左前车窗，右后关闭');
    expect(mixed.kind==='execute'&&mixed.targets).toEqual(['rr']);
    expect(parseWindowText('左前开到150%').kind).toBe('unsupported');
  });
  it('asks again after a bulk selection and clears an unresolved request on spoken cancellation',()=>{
    expect(parseWindowText('打开车窗',{focus:{targets:['fl','fr','rl','rr'],updatedAt:100}},200).kind).toBe('clarify');
    const question=parseWindowText('打开车窗',{},100);if(question.kind!=='clarify')throw Error('Expected clarification');
    const cancel=parseWindowText('取消这条指令',{pending:question.pending},200);expect(cancel.kind).toBe('noop');
  });
});
