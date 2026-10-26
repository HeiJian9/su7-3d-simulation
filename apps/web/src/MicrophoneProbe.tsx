import { useEffect, useRef, useState } from 'react';
import { useScene } from './store';

/** I0 environment probe only: no recording, transcription, API or saved audio. */
export function MicrophoneProbe() {
  const [busy, setBusy] = useState(false);
  const probe = useScene((state) => state.microphone);
  const resources = useRef<{ stream?: MediaStream; context?: AudioContext }>({});
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      resources.current.stream?.getTracks().forEach((track) => track.stop());
      void resources.current.context?.close();
    };
  }, []);
  const start = async () => {
    setBusy(true);
    const update = useScene.getState().setMicrophone;
    update({ status: 'requesting', peakRms: 0, samples: 0, durationMs: 0, message: '等待本机麦克风权限…' });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current) { stream.getTracks().forEach((track) => track.stop()); return; }
      const context = new AudioContext();
      resources.current = { stream, context };
      await context.resume();
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      context.createMediaStreamSource(stream).connect(analyser);
      const values = new Float32Array(analyser.fftSize);
      const started = performance.now();
      let peakRms = 0;
      let samples = 0;
      update({ status: 'measuring', peakRms, samples, durationMs: 0, message: '正在本地测量 3 秒，请发声。' });
      await new Promise<void>((resolve) => {
        const timer = setInterval(() => {
          analyser.getFloatTimeDomainData(values);
          const rms = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length);
          peakRms = Math.max(peakRms, rms); samples++;
          if (!mounted.current || performance.now() - started >= 3000) { clearInterval(timer); resolve(); }
        }, 40);
      });
      const durationMs = Math.round(performance.now() - started);
      update({ status: peakRms > 0.0005 ? 'signal-detected' : 'silent', peakRms, samples, durationMs,
        message: peakRms > 0.0005 ? '已收到真实输入信号，麦克风已释放。此检查不验证语音转写。' : '权限可用，但未检测到输入信号；请发声后重试。' });
    } catch (error) {
      update({ status: 'error', peakRms: 0, samples: 0, durationMs: 0, message: error instanceof Error ? `${error.name}：${error.message}` : '麦克风检测失败' });
    } finally {
      resources.current.stream?.getTracks().forEach((track) => track.stop());
      if (resources.current.context?.state !== 'closed') await resources.current.context?.close();
      resources.current = {};
      if (mounted.current) setBusy(false);
    }
  };
  return <section className="mic-probe" aria-label="I0 麦克风环境检查"><p>I0 环境检查 · 仅在本机分析 3 秒，不上传或保存音频。</p><button disabled={busy} onClick={() => void start()}>{busy ? '正在检测…' : '检测本机麦克风'}</button><p role="status" data-testid="microphone-result">{probe.message} {probe.samples > 0 && `峰值 RMS ${probe.peakRms.toFixed(5)} · ${probe.samples} 次采样`}</p></section>;
}
