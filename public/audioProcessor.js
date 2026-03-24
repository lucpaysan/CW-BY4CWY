/**
 * Audio Processing Worklet
 * Replaces deprecated ScriptProcessorNode with AudioWorkletNode
 *
 * Receives audio samples from the main thread via MessagePort,
 * stores them in a circular buffer, and sends version updates back.
 */
class AudioProcessorWorklet extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 38400; // BUFFER_SAMPLES from const.ts
    this.buffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;
    this.version = 0;

    this.port.onmessage = (event) => {
      if (event.data.type === "getBuffer") {
        this.port.postMessage({
          type: "buffer",
          samples: this.buffer,
          version: this.version,
        });
      }
    };
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || !input[0]) {
      return true;
    }

    const channelData = input[0];
    const chunkLen = channelData.length;

    // Write to circular buffer
    for (let i = 0; i < chunkLen; i++) {
      this.buffer[this.bufferIndex] = channelData[i];
      this.bufferIndex = (this.bufferIndex + 1) % this.bufferSize;
    }

    this.version++;
    return true;
  }
}

registerProcessor("audio-processor", AudioProcessorWorklet);