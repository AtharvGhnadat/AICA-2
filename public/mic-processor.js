/**
 * AudioWorklet processor for capturing microphone audio.
 * Implements an intelligent Noise Gate to filter out background friends/noise.
 */
class MicProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.threshold = 0.01; // Default threshold
    this.framesSinceLastLoud = 1000;
    this.holdFrames = 50; // ~130ms hold time to drastically speed up silence detection
    
    // Performance optimization: Buffer audio to avoid spamming postMessage
    this.bufferSize = 1024;  // Halved for faster voice detection (~21ms chunks)
    this.audioBuffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;
    
    this.port.onmessage = (event) => {
      if (event.data && event.data.type === 'SET_SENSITIVITY') {
        this.threshold = 0.0001 + ((100 - event.data.value) / 100) * 0.02;
      }
    };
  }

  process(inputs, _outputs, _parameters) {
    const input = inputs[0];
    if (input && input.length > 0) {
      const channelData = input[0];
      // Only process if there's actual data
      if (channelData && channelData.length > 0) {
        let sumSquare = 0;
        for (let i = 0; i < channelData.length; i++) {
          sumSquare += channelData[i] * channelData[i];
        }
        const rms = Math.sqrt(sumSquare / channelData.length);
        
        if (rms > this.threshold) {
          if (this.framesSinceLastLoud > this.holdFrames) {
            this.port.postMessage({ event: 'speech_start' });
          }
          this.framesSinceLastLoud = 0;
        } else {
          this.framesSinceLastLoud++;
        }

        if (this.framesSinceLastLoud === this.holdFrames + 1) {
          this.port.postMessage({ event: 'speech_end' });
        }

        // Apply Noise Gate: If silence is detected, send absolute zeros.
        // Sending raw room noise or random white noise bloats the AI's context window 
        // with high-entropy data, causing response times to skyrocket to 30-40 seconds!
        // Zeros are perfectly compressed by the neural network and take 0 compute.
        const isSilent = this.framesSinceLastLoud > this.holdFrames;
        
        // If it's silent, just don't send anything. 
        // Zero-filled arrays cause Google to crash the socket. White noise bloats the context.
        // Dropping packets entirely is the only safe way.
        if (isSilent) {
           return true; // Keep processor alive, but do no work.
        }

        for (let i = 0; i < channelData.length; i++) {
          this.audioBuffer[this.bufferIndex++] = channelData[i];
          
          if (this.bufferIndex >= this.bufferSize) {
            // Send chunk to main thread (huge CPU optimization)
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
