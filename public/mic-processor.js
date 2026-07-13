class MicProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 2048; // Send chunks roughly every ~42ms at 48kHz
    this.audioBuffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;
    this.sensitivity = 50;
    
    this.port.onmessage = (event) => {
      if (event.data.type === 'SET_SENSITIVITY') {
        this.sensitivity = event.data.value;
      }
    };
  }

  process(inputs, _outputs, _parameters) {
    const input = inputs[0];
    if (input && input.length > 0) {
      const channelData = input[0];
      if (channelData && channelData.length > 0) {
        let isSilent = false;
        if (this.sensitivity < 100) {
          let peak = 0;
          for (let i = 0; i < channelData.length; i++) {
            const val = Math.abs(channelData[i]);
            if (val > peak) peak = val;
          }
          const threshold = 0.001 + 0.1 * ((100 - this.sensitivity) / 100);
          if (peak < threshold) isSilent = true;
        }

        for (let i = 0; i < channelData.length; i++) {
          this.audioBuffer[this.bufferIndex++] = isSilent ? 0.0 : channelData[i];
          if (this.bufferIndex >= this.bufferSize) {
            this.port.postMessage({ 
              type: 'audio', 
              data: new Float32Array(this.audioBuffer),
              isSilent: isSilent
            });
            this.bufferIndex = 0;
          }
        }
      }
    }
    return true; // Keep processor alive
  }
}

registerProcessor('mic-processor', MicProcessor);
