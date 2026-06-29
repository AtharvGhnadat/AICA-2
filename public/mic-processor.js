/**
 * AudioWorklet processor for capturing microphone audio.
 * Implements an intelligent Noise Gate to filter out background friends/noise.
 */
class MicProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.threshold = 0.01; // Default threshold
    this.framesSinceLastLoud = 1000;
    this.holdFrames = 150; // ~400ms hold time to prevent clipping during speech
    
    this.port.onmessage = (event) => {
      if (event.data && event.data.type === 'SET_SENSITIVITY') {
        // sensitivity is 0 to 100.
        // 100 means picks up everything -> threshold ~ 0.0001
        // 0 means only very loud -> threshold ~ 0.02
        this.threshold = 0.0001 + ((100 - event.data.value) / 100) * 0.02;
      }
    };
  }

  process(inputs, _outputs, _parameters) {
    const input = inputs[0];
    if (input && input.length > 0) {
      const channelData = input[0];
      // Only send if there's actual data
      if (channelData && channelData.length > 0) {
        let sumSquare = 0;
        for (let i = 0; i < channelData.length; i++) {
          sumSquare += channelData[i] * channelData[i];
        }
        const rms = Math.sqrt(sumSquare / channelData.length);
        
        if (rms > this.threshold) {
          this.framesSinceLastLoud = 0;
        } else {
          this.framesSinceLastLoud++;
        }

        // If it's been quiet for longer than the hold time, send absolute silence
        if (this.framesSinceLastLoud > this.holdFrames) {
          this.port.postMessage(new Float32Array(channelData.length));
        } else {
          // Copy the data since the buffer will be reused
          this.port.postMessage(new Float32Array(channelData));
        }
      }
    }
    return true; // Keep processor alive
  }
}

registerProcessor('mic-processor', MicProcessor);
