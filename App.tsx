import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Blob } from '@google/genai';
import { DeviceStatus, Settings, TranscriptionItem } from './types';
import { DEFAULT_SETTINGS, AUDIO_SAMPLE_RATE_INPUT, AUDIO_SAMPLE_RATE_OUTPUT } from './constants';
import SettingsMenu from './components/SettingsMenu';
import { SplitRobotLayout } from './components/SplitRobotLayout';
import { RobotFacePanel } from './components/RobotFacePanel';
import { VisualContextPanel } from './components/VisualContextPanel';
import { visualContextService } from './services/visualContextService';
import { topicRelevanceService } from './services/topicRelevanceService';
import { VisualContext } from './types/visualContext';
import { clsx } from 'clsx';

// ─── Audio Utils ──────────────────────────────────────────────────────────────

function base64Decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function base64Encode(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function decodeAudioBuffer(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): AudioBuffer {
  const dataInt16 = new Int16Array(data.buffer, data.byteOffset, data.byteLength / 2);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

function createPCMBlob(data: Float32Array, sampleRate: number): Blob {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    const s = Math.max(-1, Math.min(1, data[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return {
    data: base64Encode(new Uint8Array(int16.buffer)),
    mimeType: `audio/pcm;rate=${sampleRate}`,
  };
}

function downsampleBuffer(buffer: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return buffer;
  const ratio = fromRate / toRate;
  const newLength = Math.round(buffer.length / ratio);
  const result = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    const pos = i * ratio;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const a = buffer[idx] ?? 0;
    const b = buffer[idx + 1] ?? a;
    result[i] = a + frac * (b - a);
  }
  return result;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const POST_SPEECH_DELAY_MS = 30;
const THINKING_TIMEOUT_MS = 8000;
const RECONNECT_DELAY_MS = 3000;
const MAX_RECONNECT_ATTEMPTS = 5;

// ─── Persistent Storage Helpers ──────────────────────────────────────────────

const STORAGE_KEY_NAME = 'emo_robot_name_swastik';

function loadSavedName(): string {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_NAME);
    if (saved && saved.trim().length > 0) return saved.trim();
  } catch (_) { /* localStorage unavailable */ }
  return DEFAULT_SETTINGS.deviceName;
}

function persistName(name: string) {
  try {
    localStorage.setItem(STORAGE_KEY_NAME, name.trim());
  } catch (_) { /* localStorage unavailable */ }
}

const STORAGE_KEY_GEMINI = 'emo_robot_gemini_api_key_swastik';
const STORAGE_KEY_SERPER = 'emo_robot_serper_api_key_swastik';

function loadSavedGeminiKey(): string {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_GEMINI);
    if (saved && saved.trim().length > 0) return saved.trim();
  } catch (_) { }
  return '';
}

function persistGeminiKey(key: string) {
  try {
    localStorage.setItem(STORAGE_KEY_GEMINI, key.trim());
  } catch (_) { }
}

function loadSavedSerperKey(): string {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_SERPER);
    if (saved && saved.trim().length > 0) return saved.trim();
  } catch (_) { }
  return '';
}

function persistSerperKey(key: string) {
  try {
    localStorage.setItem(STORAGE_KEY_SERPER, key.trim());
  } catch (_) { }
}

const App: React.FC = () => {
  const [status, setStatus] = useState<DeviceStatus>('idle');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<Settings>(() => ({
    ...DEFAULT_SETTINGS,
    deviceName: loadSavedName() || 'Swastik',
    voiceName: 'Puck',
    geminiApiKey: loadSavedGeminiKey(),
    serperApiKey: loadSavedSerperKey(),
  }));
  const [isConnected, setIsConnected] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Visual Context State
  const [visualContext, setVisualContext] = useState<Partial<VisualContext> | null>(null);
  const [visualStatus, setVisualStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  const inputContextRef = useRef<AudioContext | null>(null);
  const outputContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const sessionRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);

  const statusRef = useRef<DeviceStatus>('idle');
  const settingsRef = useRef<Settings>(DEFAULT_SETTINGS);
  const isConnectedRef = useRef(false);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const thinkingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const postSpeechTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visualContextRef = useRef<Partial<VisualContext> | null>(null);

  const currentInputTranscription = useRef('');

  useEffect(() => { statusRef.current = status; }, [status]);
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => { isConnectedRef.current = isConnected; }, [isConnected]);
  useEffect(() => { visualContextRef.current = visualContext; }, [visualContext]);

  const clearTimers = useCallback(() => {
    if (thinkingTimerRef.current) { clearTimeout(thinkingTimerRef.current); thinkingTimerRef.current = null; }
    if (postSpeechTimerRef.current) { clearTimeout(postSpeechTimerRef.current); postSpeechTimerRef.current = null; }
    if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
  }, []);

  const handleUpdateSettings = (updates: Partial<Settings>) => {
    if (updates.deviceName !== undefined) {
      persistName(updates.deviceName);
    }
    if (updates.geminiApiKey !== undefined) {
      persistGeminiKey(updates.geminiApiKey);
    }
    if (updates.serperApiKey !== undefined) {
      persistSerperKey(updates.serperApiKey);
    }
    setSettings(prev => ({ ...prev, ...updates }));
  };

  const lastTapRef = useRef(0);

  const stopActiveAudio = useCallback(() => {
    activeSourcesRef.current.forEach(source => {
      try { source.stop(); } catch (_) { }
    });
    activeSourcesRef.current.clear();
    nextStartTimeRef.current = 0;
  }, []);

  const transitionToListening = useCallback(() => {
    if (postSpeechTimerRef.current) clearTimeout(postSpeechTimerRef.current);
    postSpeechTimerRef.current = setTimeout(() => {
      const cur = statusRef.current;
      if (cur === 'speaking' || cur === 'thinking') {
        setStatus('listening');
      }
      postSpeechTimerRef.current = null;
    }, POST_SPEECH_DELAY_MS);
  }, []);

  const startThinkingTimeout = useCallback(() => {
    if (thinkingTimerRef.current) clearTimeout(thinkingTimerRef.current);
    thinkingTimerRef.current = setTimeout(() => {
      if (statusRef.current === 'thinking') {
        setStatus('listening');
      }
      thinkingTimerRef.current = null;
    }, THINKING_TIMEOUT_MS);
  }, []);

  // ─── Visual Context Logic ────────────────────────────────────────────────

  const triggerImageSearch = async (text: string): Promise<boolean> => {
    setVisualStatus('loading');
    setVisualContext({ active: true, searchQuery: text, imageSource: 'none', title: '', explanation: '', imageUrl: '' });
    const result = await visualContextService.searchImage(text, settingsRef.current.serperApiKey);
    if (result) {
      setVisualContext({ ...result, active: true });
      setVisualStatus('success');

      // Inform the model about the visual context shown on the screen
      try {
        const contextMessage = `[System context: The image related to "${result.title || result.searchQuery}" has now successfully loaded and appeared on the user's screen. You should now say "Here is the image" and briefly explain what they are seeing.]`;
        if (sessionRef.current && sessionRef.current.send) {
          sessionRef.current.send({
            clientContent: {
              turns: [{ role: 'user', parts: [{ text: contextMessage }] }]
            }
          });
        }
      } catch (err) {
        console.warn('Failed to send visual context to model:', err);
      }
      return true;

    } else {
      setVisualStatus('error');
      setTimeout(() => {
        setVisualContext(prev => prev ? { ...prev, active: false } : null);
        setVisualStatus('idle');
      }, 3000);
      return false;
    }
  };

  const handleUserTurn = async (text: string) => {
    const currentCtx = visualContextRef.current;
    
    // Check if the user is asking a question that should trigger a visual search
    // We allow more flexible patterns like "can you explain", "what's", "show me", etc.
    const isVisualQuestion = /(what is|what's|who is|who's|explain|tell me about|show me|how does|what does|diagram of|picture of|image of|can you show)/i.test(text);

    if (currentCtx?.active) {
      const relevance = await topicRelevanceService.checkRelevance(currentCtx.title || currentCtx.searchQuery || '', text);
      if (relevance.action === 'close_visual_panel') {
        setVisualContext(prev => prev ? { ...prev, active: false } : null);
        if (isVisualQuestion) {
          await triggerImageSearch(text);
        }
      }
    } else {
      if (isVisualQuestion) {
        await triggerImageSearch(text);
      }
    }
  };

  // ─── Session Lifecycle ────────────────────────────────────────────────────

  const endSession = useCallback(() => {
    clearTimers();
    if (sessionRef.current) {
      try { sessionRef.current.close(); } catch (_) { }
      sessionRef.current = null;
    }
    if (workletNodeRef.current) {
      try { workletNodeRef.current.disconnect(); } catch (_) { }
      workletNodeRef.current = null;
    }
    if (sourceNodeRef.current) {
      try { sourceNodeRef.current.disconnect(); } catch (_) { }
      sourceNodeRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    stopActiveAudio();
    setIsConnected(false);
    setStatus('idle');
  }, [stopActiveAudio, clearTimers]);

  const scheduleReconnect = useCallback(() => {
    if (reconnectTimerRef.current) return;
    if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
      setErrorMessage('Connection lost – tap to retry');
      return;
    }
    reconnectAttemptsRef.current++;
    const delay = RECONNECT_DELAY_MS * reconnectAttemptsRef.current;
    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      if (!isConnectedRef.current && statusRef.current !== 'thinking') {
        startSession();
      }
    }, delay);
  }, []);

  const startSession = useCallback(async () => {
    if (isConnectedRef.current) return;
    endSession();
    setErrorMessage(null);

    try {
      setStatus('thinking');
      startThinkingTimeout();

      if (inputContextRef.current?.state === 'suspended') await inputContextRef.current.resume();
      if (outputContextRef.current?.state === 'suspended') await outputContextRef.current.resume();

      if (!inputContextRef.current || inputContextRef.current.state === 'closed') {
        inputContextRef.current = new (window.AudioContext || window.webkitAudioContext!)({ latencyHint: 'interactive' });
      }
      if (!outputContextRef.current || outputContextRef.current.state === 'closed') {
        outputContextRef.current = new (window.AudioContext || window.webkitAudioContext!)({ sampleRate: AUDIO_SAMPLE_RATE_OUTPUT, latencyHint: 'interactive' });
      }

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Cannot access microphone.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      });
      streamRef.current = stream;

      const currentSettings = settingsRef.current;
      const apiKey = currentSettings.geminiApiKey || import.meta.env.VITE_GEMINI_API_KEY || process.env.API_KEY || import.meta.env.VITE_API_KEY;
      if (!apiKey) throw new Error("API key missing. Enter it in Settings.");

      const ai = new GoogleGenAI({ apiKey });

      const session = await ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: currentSettings.voiceName } } },
          systemInstruction: `You are ${currentSettings.deviceName}, a friendly male AI companion robot built by Atharv, Pruthviraj, Abhilesh (Professor. Vikramsinh Saste). You speak in a warm, friendly male voice. Reply in 1-2 sentences, match user's language (Marathi/Hindi/English). Be concise and natural. Your name is ${currentSettings.deviceName}. When the user asks for a picture, diagram, or asks an educational question where an image would be helpful, use the show_visual_context tool to search for an image. When you call this tool, it will return immediately saying the search has started. You should then say "Let me pull that up for you" or similar. A few seconds later, the system will send you a message saying the image has appeared, at which point you should say "Here is the image" and explain it.`,
          tools: [
            { googleSearch: {} },
            {
              functionDeclarations: [
                {
                  name: "show_visual_context",
                  description: "Initiates a search for a visual image panel to display on the screen. Call this tool when the user asks for a picture or educational diagram. After calling this, acknowledge to the user that you are finding the image. You will receive a follow-up system message when the image actually appears.",
                  parameters: {
                    type: "OBJECT",
                    properties: {
                      topic: {
                        type: "STRING",
                        description: "The topic or subject to show an image of (e.g. 'photosynthesis', 'human heart')"
                      }
                    },
                    required: ["topic"]
                  }
                },
                {
                  name: "close_visual_context",
                  description: "Closes the visual image panel on the screen. Call this tool when the user asks to close the image, or changes the topic to something unrelated to the current visual.",
                  parameters: {
                    type: "OBJECT",
                    properties: {}
                  }
                }
              ]
            }
          ],
        },
        callbacks: {
          onopen: () => {
            setIsConnected(true);
            reconnectAttemptsRef.current = 0;
            setStatus('listening');
            if (thinkingTimerRef.current) { clearTimeout(thinkingTimerRef.current); thinkingTimerRef.current = null; }

            const inputCtx = inputContextRef.current!;
            const nativeRate = inputCtx.sampleRate;

            const setupWorklet = async () => {
              try {
                await inputCtx.audioWorklet.addModule('./mic-processor.js');
              } catch (_) { }

              const workletNode = new AudioWorkletNode(inputCtx, 'mic-processor');
              workletNodeRef.current = workletNode;

              workletNode.port.onmessage = (ev: MessageEvent<Float32Array>) => {
                if (!isConnectedRef.current) return;

                const inputData = ev.data;
                const downsampledData = downsampleBuffer(inputData, nativeRate, AUDIO_SAMPLE_RATE_INPUT);
                const pcmBlob = createPCMBlob(downsampledData, AUDIO_SAMPLE_RATE_INPUT);
                
                try {
                  sessionRef.current?.sendRealtimeInput({ media: pcmBlob });
                } catch (err) { }
              };

              const source = inputCtx.createMediaStreamSource(stream);
              sourceNodeRef.current = source;
              source.connect(workletNode);
            };

            setupWorklet().catch(console.error);
          },
          onmessage: (message: LiveServerMessage) => {
            
            // Handle Tool Calls (e.g. show_visual_context)
            if (message.toolCall) {
              const calls = message.toolCall.functionCalls;
              if (calls) {
                for (const call of calls) {
                  if (call.name === 'show_visual_context') {
                    const args = call.args as { topic: string };
                    
                    const handleSync = async () => {
                      // Immediately respond so the AI can say "Let me pull that up for you"
                      try {
                        sessionRef.current?.send({
                          toolResponse: {
                            functionResponses: [{
                              id: call.id,
                              name: call.name,
                              response: { result: "Search initiated. Please acknowledge this to the user." }
                            }]
                          }
                        });
                      } catch (e) {}

                      if (args.topic) {
                        // Let the image search run in the background. 
                        // Once it's done, it will inject a user turn telling the model the image is visible.
                        triggerImageSearch(args.topic).catch(console.error);
                      }
                    };
                    handleSync();
                  } else if (call.name === 'close_visual_context') {
                    setVisualContext(prev => prev ? { ...prev, active: false } : null);
                    try {
                      sessionRef.current?.send({
                        toolResponse: {
                          functionResponses: [{
                            id: call.id,
                            name: call.name,
                            response: { result: "Image panel closed." }
                          }]
                        }
                      });
                    } catch (e) {}
                  }
                }
              }
            }

            if (message.serverContent?.turnComplete) {
              if (thinkingTimerRef.current) { clearTimeout(thinkingTimerRef.current); thinkingTimerRef.current = null; }
              if (activeSourcesRef.current.size === 0) {
                transitionToListening();
              }
            }

            const audioData = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audioData) {
              if (thinkingTimerRef.current) { clearTimeout(thinkingTimerRef.current); thinkingTimerRef.current = null; }
              setStatus('speaking');

              const ctx = outputContextRef.current!;
              const now = ctx.currentTime;
              if (nextStartTimeRef.current < now) nextStartTimeRef.current = now;

              const audioBuffer = decodeAudioBuffer(base64Decode(audioData), ctx, AUDIO_SAMPLE_RATE_OUTPUT, 1);
              const source = ctx.createBufferSource();
              source.buffer = audioBuffer;

              const gainNode = ctx.createGain();
              gainNode.gain.value = settingsRef.current.volume / 100;
              source.connect(gainNode);
              gainNode.connect(ctx.destination);

              activeSourcesRef.current.add(source);

              source.onended = () => {
                activeSourcesRef.current.delete(source);
                if (activeSourcesRef.current.size === 0) {
                  transitionToListening();
                }
              };

              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += audioBuffer.duration;
            }

            if (message.serverContent?.interrupted) {
              stopActiveAudio();
              if (thinkingTimerRef.current) { clearTimeout(thinkingTimerRef.current); thinkingTimerRef.current = null; }
              if (postSpeechTimerRef.current) { clearTimeout(postSpeechTimerRef.current); postSpeechTimerRef.current = null; }
              setStatus('listening');
            }
          },
          onerror: (e: any) => {
            setErrorMessage('Connection Error');
            setStatus('error');
            setIsConnected(false);
            sessionRef.current = null;
            scheduleReconnect();
          },
          onclose: (e: any) => {
            setIsConnected(false);
            sessionRef.current = null;
            if (statusRef.current !== 'error') {
              setStatus('idle');
              scheduleReconnect();
            }
          },
        },
      });

      sessionRef.current = session;
    } catch (err: any) {
      setErrorMessage(err?.message?.includes('microphone') ? 'Microphone access denied' : 'Init Failed – check API key & network');
      setStatus('error');
      scheduleReconnect();
    }
  }, [endSession, startThinkingTimeout, stopActiveAudio, transitionToListening]);

  useEffect(() => {
    return () => {
      clearTimers();
      endSession();
    };
  }, []);

  useEffect(() => {
    setStatus('idle');
  }, []);

  const handleInteraction = useCallback(() => {
    if (!inputContextRef.current || inputContextRef.current.state === 'closed') {
      inputContextRef.current = new (window.AudioContext || window.webkitAudioContext!)({ latencyHint: 'interactive' });
    }
    if (!outputContextRef.current || outputContextRef.current.state === 'closed') {
      outputContextRef.current = new (window.AudioContext || window.webkitAudioContext!)({ sampleRate: AUDIO_SAMPLE_RATE_OUTPUT, latencyHint: 'interactive' });
    }

    if (inputContextRef.current?.state === 'suspended') inputContextRef.current.resume().catch(() => { });
    if (outputContextRef.current?.state === 'suspended') outputContextRef.current.resume().catch(() => { });

    if (!isConnected && status !== 'thinking') {
      reconnectAttemptsRef.current = 0;
      setErrorMessage(null);
      startSession();
    }
  }, [isConnected, status, startSession]);

  const handleScreenTap = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    // Only handle double tap to open settings if clicking empty space (not a button)
    const target = e.target as HTMLElement;
    if (target.closest('button')) return;

    const now = Date.now();
    const timeSinceLastTap = now - lastTapRef.current;
    lastTapRef.current = now;

    if (timeSinceLastTap < 400 && timeSinceLastTap > 50) {
      e.preventDefault();
      e.stopPropagation();
      setIsSettingsOpen(true);
      return;
    }

    handleInteraction();
  }, [handleInteraction]);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsSettingsOpen(true);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        handleInteraction();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleInteraction]);

  const handleReboot = useCallback((newSettings: Settings) => {
    setIsSettingsOpen(false);
    settingsRef.current = newSettings;
    setSettings(newSettings);
    endSession();
    setTimeout(() => {
      reconnectAttemptsRef.current = 0;
      setErrorMessage(null);
      startSession();
    }, 300);
  }, [endSession, startSession]);

  const statusLabel = status === 'idle' ? 'TAP TO START' : status === 'listening' ? 'LISTENING' : status === 'speaking' ? 'SPEAKING' : status === 'thinking' ? 'PROCESSING' : status === 'error' ? 'ERROR' : 'STARTING';
  const statusDotColor = status === 'listening' ? 'bg-emerald-400' : status === 'speaking' ? 'bg-cyan-400' : status === 'thinking' ? 'bg-amber-400' : status === 'error' ? 'bg-red-400' : 'bg-zinc-600';
  const statusGlow = status === 'listening' ? 'shadow-[0_0_6px_rgba(52,211,153,0.8)]' : status === 'speaking' ? 'shadow-[0_0_6px_rgba(34,211,238,0.8)]' : '';

  return (
    <div
      className="relative h-[100dvh] w-full flex flex-col items-center justify-center bg-black overflow-hidden select-none"
      onClick={handleScreenTap}
      onContextMenu={handleContextMenu}
    >
      {/* Top bar */}
      <div
        className={clsx(
          "absolute top-0 left-0 z-50 flex items-center justify-between px-2 py-2 pointer-events-none transition-all duration-300",
          visualContext?.active ? "md:right-1/2 right-0" : "right-0"
        )}
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div className="flex items-center gap-2 pointer-events-auto" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <button
            aria-label="Minimize to Desktop"
            onClick={(e) => { e.stopPropagation(); (window as any).electronAPI?.minimize(); }}
            className="flex items-center gap-2 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-2xl transition-all active:scale-95 border-2 border-zinc-600 shadow-lg shadow-black/50"
          >
            <span className="text-[11px] font-bold uppercase tracking-wide">Desktop</span>
          </button>
        </div>

        <div className="flex items-center gap-2 pointer-events-auto" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <button
            aria-label="Open Settings"
            onClick={(e) => { e.stopPropagation(); setIsSettingsOpen(true); }}
            className="w-10 h-10 flex items-center justify-center rounded-xl bg-zinc-800 hover:bg-zinc-700 transition-colors border-2 border-zinc-600"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-zinc-300" aria-hidden="true">
              <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" stroke="currentColor" strokeWidth="2" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" stroke="currentColor" strokeWidth="2" />
            </svg>
          </button>
          <button
            aria-label="Toggle Fullscreen"
            onClick={(e) => { e.stopPropagation(); (window as any).electronAPI?.maximizeToggle(); }}
            className="w-10 h-10 flex items-center justify-center rounded-xl bg-zinc-800 hover:bg-zinc-700 transition-colors border-2 border-zinc-600"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-zinc-300" aria-hidden="true">
              <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            aria-label="Close Application"
            onClick={(e) => { e.stopPropagation(); (window as any).electronAPI?.close(); }}
            className="w-10 h-10 flex items-center justify-center rounded-xl bg-zinc-800 hover:bg-red-600 transition-colors border-2 border-zinc-600"
          >
            <svg width="16" height="16" viewBox="0 0 18 18" className="text-zinc-300" aria-hidden="true">
              <line x1="4" y1="4" x2="14" y2="14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <line x1="14" y1="4" x2="4" y2="14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      <SplitRobotLayout
        isSplitView={!!visualContext?.active}
        leftPanel={
          <RobotFacePanel 
            status={status}
            settings={settings}
            errorMessage={errorMessage}
            statusLabel={statusLabel}
            statusDotColor={statusDotColor}
            statusGlow={statusGlow}
          />
        }
        rightPanel={
          <VisualContextPanel 
            context={visualContext}
            status={visualStatus}
            onClose={() => setVisualContext(prev => prev ? { ...prev, active: false } : null)}
          />
        }
      />

      {isSettingsOpen && (
        <SettingsMenu
          settings={settings}
          onClose={() => setIsSettingsOpen(false)}
          onUpdate={handleUpdateSettings}
          onReboot={handleReboot}
        />
      )}
    </div>
  );
};

export default App;
