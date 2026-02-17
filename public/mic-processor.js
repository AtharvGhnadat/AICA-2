/**
 * AudioWorklet processor for capturing microphone audio.
 * Runs off the main thread — no UI jank on Raspberry Pi 5.
 * Replaces the deprecated ScriptProcessorNode.
 */
class MicProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
  }

  process(inputs, _outputs, _parameters) {
    const input = inputs[0];
    if (input && input.length > 0) {
      const channelData = input[0];
      // Only send if there's actual data
      if (channelData && channelData.length > 0) {
        // Copy the data since the buffer will be reused
        this.port.postMessage(new Float32Array(channelData));
      }
    }
    return true; // Keep processor alive
  }
}

registerProcessor('mic-processor', MicProcessor);
