export type WiperMode='off'|'intermittent'|'low'|'high';
const duration:Record<Exclude<WiperMode,'off'>,number>={intermittent:1.6,low:1.4,high:.7};
/** One phase is one complete out-and-return sweep. Gear changes only alter rate. */
export class WiperMotion {
  phase=0;active=false;waiting=0;cycles=0;completedOnce=0;
  private assignedOnce=0;
  private movingMode:Exclude<WiperMode,'off'>='low';
  step(seconds:number,mode:WiperMode,onceSequence:number){
    if(!Number.isFinite(seconds)||seconds<0)throw Error('Invalid animation delta');
    if(mode!=='off')this.movingMode=mode;
    if(mode!=='intermittent')this.waiting=0;
    let dt=seconds;
    for(let guard=0;guard<100&&dt>=0;guard++){
      if(!this.active){
        if(mode==='off'&&onceSequence<=this.completedOnce)break;
        if(this.waiting>0&&onceSequence<=this.completedOnce){const wait=Math.min(this.waiting,dt);this.waiting-=wait;dt-=wait;if(this.waiting>1e-8||dt===0)break;}
        this.active=true;this.phase=0;this.assignedOnce=onceSequence>this.completedOnce?onceSequence:0;
        if(mode==='off')this.movingMode='low';
      }
      const period=duration[this.movingMode],remaining=(1-this.phase)*period;
      if(dt<remaining-1e-10){this.phase+=dt/period;break;}
      dt-=remaining;this.phase=0;this.active=false;this.cycles++;
      if(this.assignedOnce)this.completedOnce=Math.max(this.completedOnce,this.assignedOnce);
      this.assignedOnce=0;this.waiting=mode==='intermittent'?2.2:0;
      if(dt<1e-10)break;
    }
    const parked=!this.active;
    return {phase:this.phase,fraction:this.active?(1-Math.cos(this.phase*2*Math.PI))/2:0,parked,waiting:this.waiting,cycles:this.cycles,completedOnce:this.completedOnce,appliedMode:mode==='off'&&!parked?this.movingMode:mode};
  }
}
