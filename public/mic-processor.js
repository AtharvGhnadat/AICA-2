class MicProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 2048; // Send chunks roughly every ~42ms at 48kHz
    this.audioBuffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;
  }

  process(inputs, _outputs, _parameters) {
    const input = inputs[0];
    if (input && input.length > 0) {
      const channelData = input[0];
      if (channelData && channelData.length > 0) {
        for (let i = 0; i < channelData.length; i++) {
          this.audioBuffer[this.bufferIndex++] = channelData[i];
          if (this.bufferIndex >= this.bufferSize) {
            this.port.postMessage({ type: 'audio', data: new Float32Array(this.audioBuffer) });
            this.bufferIndex = 0;
          }
        }
      }
    }
    return true; // Keep processor alive
  }
}

registerProcessor('mic-processor', MicProcessor);
