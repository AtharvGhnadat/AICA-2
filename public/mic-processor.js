/**
 * AudioWorklet processor for capturing microphone audio.
 * Streams ALL audio to the server - the server's built-in VAD handles speech detection.
 */
class MicProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // Performance optimization: Buffer audio to avoid spamming postMessage
    this.bufferSize = 1024;
    this.audioBuffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;

    this.port.onmessage = (event) => {
      // Keep SET_SENSITIVITY handler for compatibility, but we don't use it for gating anymore
      if (event.data && event.data.type === 'SET_SENSITIVITY') {
        // No-op - server handles VAD
      }
    };
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
    return true;
  }
}

registerProcessor('mic-processor', MicProcessor);
