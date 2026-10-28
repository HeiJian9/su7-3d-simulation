import {test,expect} from '@playwright/test';
test('local KWS keeps a real connection through sustained loud PCM, then releases tracks and worker on disable',async({page})=>{
 test.setTimeout(70000);
 await page.addInitScript(()=>{
  const streams:MediaStreamTrack[]=[];(window as unknown as {wakeTracks:MediaStreamTrack[]}).wakeTracks=streams;
  navigator.mediaDevices.getUserMedia=async()=>{const context=new AudioContext(),destination=context.createMediaStreamDestination(),oscillator=context.createOscillator(),gain=context.createGain();gain.gain.value=4;oscillator.frequency.value=1000;oscillator.connect(gain).connect(destination);oscillator.start();for(const track of destination.stream.getTracks()){streams.push(track);const stop=track.stop.bind(track);track.stop=()=>{stop();oscillator.disconnect();void context.close();};}return destination.stream;};
 });
 await page.goto('/');await expect(page.getByRole('button',{name:'开始录音',exact:true})).toBeEnabled();await page.getByRole('checkbox',{name:'小爱同学唤醒',exact:true}).check();await expect(page.getByTestId('wake-status')).toContainText('正在监听',{timeout:25000});
 await page.waitForTimeout(30000);await expect(page.getByTestId('wake-status')).toContainText('正在监听');expect((await page.request.get('/api/wake/status').then(r=>r.json())).connections).toBe(1);
 await page.getByRole('checkbox',{name:'小爱同学唤醒',exact:true}).uncheck();await expect(page.getByTestId('wake-status')).toHaveText('唤醒已关闭');await expect.poll(()=>page.evaluate(()=>(window as unknown as {wakeTracks:MediaStreamTrack[]}).wakeTracks.every(t=>t.readyState==='ended'))).toBe(true);await expect.poll(async()=>(await page.request.get('/api/wake/status').then(r=>r.json())).connections).toBe(0);
});
