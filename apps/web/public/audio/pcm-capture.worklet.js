/* global AudioWorkletProcessor, registerProcessor */
class PcmCapture extends AudioWorkletProcessor {
  process(inputs) {
    if (inputs[0]?.[0]) this.port.postMessage(inputs[0][0].slice());
    return true;
  }
}
registerProcessor('su7-pcm-capture', PcmCapture);
