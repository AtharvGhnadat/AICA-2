import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Blob } from '@google/genai';
import { App as CapacitorApp } from '@capacitor/app';
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
  const [isMuted, setIsMuted] = useState(false);

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
  const isMutedRef = useRef(false);
  const isTurnCompleteRef = useRef(true);
  const toolCallInProgressRef = useRef(false);
  const reconnectAttemptsRef = useRef(0);
  const textBufferRef = useRef<string>("");
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const thinkingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const postSpeechTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visualContextRef = useRef<Partial<VisualContext> | null>(null);

  const currentInputTranscription = useRef('');

  useEffect(() => { statusRef.current = status; }, [status]);
  useEffect(() => { 
    settingsRef.current = settings; 
    if (workletNodeRef.current) {
      workletNodeRef.current.port.postMessage({ type: 'SET_SENSITIVITY', value: settings.sensitivity });
    }
  }, [settings]);
  useEffect(() => { isConnectedRef.current = isConnected; }, [isConnected]);
  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);
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
      if (cur !== 'error' && cur !== 'idle') {
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

  // Robust Fallback: If we are stuck in 'speaking' but no audio is playing, force back to listening.
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (status === 'speaking') {
      interval = setInterval(() => {
        if (activeSourcesRef.current.size === 0 && !toolCallInProgressRef.current) {
          console.warn("Fallback: Audio finished but stuck in speaking state. Forcing listening transition.");
          isTurnCompleteRef.current = true;
          transitionToListening();
        }
      }, 1500); // 1.5 seconds of silence while "speaking" triggers a force-reset
    }
    return () => { if (interval) clearInterval(interval); };
  }, [status, transitionToListening]);

  // ─── Visual Context Logic ────────────────────────────────────────────────

  const triggerImageSearch = async (text: string): Promise<Partial<VisualContext> | null> => {
    setVisualStatus('loading');
    setVisualContext({ active: true, searchQuery: text, imageSource: 'none', title: '', explanation: '', imageUrl: '' });
    const result = await visualContextService.searchImage(text, settingsRef.current.serperApiKey);
    if (result) {
      setVisualContext({ ...result, active: true });
      setVisualStatus('success');

      // No need to inject clientContent anymore, we return the context directly in the tool response because it's so fast now!
      return result;

    } else {
      setVisualStatus('error');
      setTimeout(() => {
        setVisualContext(prev => prev ? { ...prev, active: false } : null);
        setVisualStatus('idle');
      }, 3000);
      return null;
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
          systemInstruction: `You are ${currentSettings.deviceName}, a world-class, friendly AI teacher assistant built by Atharv, Pruthviraj, Abhilesh (Professor. Vikramsinh Saste). You speak in a warm, friendly male voice.

CRITICAL IDENTITY & LANGUAGE:
- Your primary languages are Marathi and English. You must effortlessly understand both. Explain complex topics using a natural mix of simple Marathi and English (Hinglish/Maringlish style) to make it feel like a real Indian teacher.
- Your name is ${currentSettings.deviceName}.
- ABSOLUTELY NO INTERNAL MONOLOGUE OR NARRATION: You are on a live voice call. NEVER output your internal thoughts, plans, actions, or formatting like "**Shifting Focus**". Never say "I will retrieve an image" or "I am pulling up a diagram". Speak directly to the user as a human teacher would.

CORE BEHAVIORS:
1. EXTREME SPEED & PARALLEL EXPLANATION: Respond instantly. Keep answers short (1-2 sentences). When asked to explain something, IMMEDIATELY start explaining the concept out loud. Do NOT wait for an image to appear to start teaching!
2. VISUAL INTENT DETECTION: If the user asks for a NEW topic (e.g., "Explain OSI model"), you MUST call "show_visual" IN PARALLEL while you start your verbal explanation. Do not announce that you are showing an image. Just call the tool and keep talking. HOWEVER, if an image is ALREADY on screen and the user asks "explain this image", DO NOT call "show_visual" again! Just explain the current image verbally.
3. IMAGE EXPLANATION: When "show_visual" is called and an image appears, explain it in a student-friendly way. If you forget what's currently on screen, call "check_visual".
4. BLINDNESS WORKAROUND: You cannot actually see the image pixels. If the user asks a specific visual question (e.g., "what is the green part?"), DO NOT EVER say "I cannot see the image". Instead, call "check_visual", read the title, and use your vast general knowledge to make a confident, educated guess about what they are looking at. Play along as if you can see it.
5. CLOSING: To close the screen, call the "close_visual" tool if the user changes to an unrelated topic.
6. SINGLE QUESTION FOCUS: If you hear a "stack of questions" or a long rambling conversation (like the user talking to friends), DO NOT try to answer everything! ONLY respond to the final, most direct question addressed to you. Ignore all background chatter.`,
          tools: [
            { googleSearch: {} },
            {
              functionDeclarations: [
                {
                  name: "show_visual",
                  description: "Displays a relevant image on the user's screen. Call this when explaining educational concepts.",
                  parameters: {
                    type: "OBJECT",
                    properties: { topic: { type: "STRING", description: "The exact Google Images search query to find the best image (e.g., 'Photosynthesis simple diagram', 'Human heart anatomy'). Be specific to get a good educational image." } },
                    required: ["topic"]
                  }
                },
                {
                  name: "close_visual",
                  description: "Closes the image panel on the screen.",
                  parameters: { type: "OBJECT", properties: {} }
                },
                {
                  name: "check_visual",
                  description: "Checks what image is currently displayed on the screen.",
                  parameters: { type: "OBJECT", properties: {} }
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
              workletNode.port.postMessage({ type: 'SET_SENSITIVITY', value: settingsRef.current.sensitivity });
              workletNodeRef.current = workletNode;

              let micBuffer: Float32Array[] = [];
              let micBufferLength = 0;
              const TARGET_BUFFER_LENGTH = 4096; // Accumulate ~85ms to prevent WebSocket spam

              workletNode.port.onmessage = (ev: MessageEvent<any>) => {
                if (!isConnectedRef.current) return;

                if (ev.data.event === 'speech_start') {
                  // User started speaking. If we were thinking, go back to listening.
                  if (statusRef.current === 'thinking' || statusRef.current === 'idle') {
                    setStatus('listening');
                    statusRef.current = 'listening';
                  }
                  return;
                } else if (ev.data.event === 'speech_end') {
                  // User finished speaking. Stay in 'listening' mode to remove the "processing" visual bug.
                  // We MUST NOT send turnComplete because it crashes the Gemini Live session when using realtimeInput!
                  // We rely entirely on the server's VAD, which has a small natural delay.
                  return;
                }

                if (ev.data.type === 'audio') {
                  let dataToPush = ev.data.data as Float32Array;
                  // If muted or AI is speaking, send absolute silence (zeros) instead of dropping the packet.
                  // DO NOT zero out if 'thinking', because 'thinking' means the user is speaking or AI is processing!
                  if (isMutedRef.current || statusRef.current === 'speaking') {
                    dataToPush = new Float32Array(dataToPush.length); // Zeros out the audio
                  }

                  micBuffer.push(dataToPush);
                  micBufferLength += dataToPush.length;

                  if (micBufferLength >= TARGET_BUFFER_LENGTH) {
                    const mergedBuffer = new Float32Array(micBufferLength);
                    let offset = 0;
                    for (const b of micBuffer) {
                      mergedBuffer.set(b, offset);
                      offset += b.length;
                    }

                    const downsampledData = downsampleBuffer(mergedBuffer, nativeRate, AUDIO_SAMPLE_RATE_INPUT);
                    const pcmBlob = createPCMBlob(downsampledData, AUDIO_SAMPLE_RATE_INPUT);
                    
                    try {
                      sessionRef.current?.sendRealtimeInput({ media: pcmBlob });
                    } catch (err) { }

                    micBuffer = [];
                    micBufferLength = 0;
                  }
                }
              };

              const source = inputCtx.createMediaStreamSource(stream);
              sourceNodeRef.current = source;
              source.connect(workletNode);
            };

            setupWorklet().catch(console.error);
          },
          onmessage: (message: LiveServerMessage) => {
            
            if (message.toolCall) {
              const calls = message.toolCall.functionCalls;
              if (calls) {
                for (const call of calls) {
                  toolCallInProgressRef.current = true;
                  if (call.name === 'show_visual') {
                    const args = call.args as { topic: string };
                    if (args.topic) {
                      // Await the search so the AI knows if it succeeded or failed!
                      triggerImageSearch(args.topic).then((result) => {
                        if (result) {
                          try {
                            sessionRef.current?.send({
                              toolResponse: {
                                functionResponses: [{ 
                                  id: call.id, 
                                  name: call.name, 
                                  response: { 
                                    result: {
                                      status: "SUCCESS",
                                      message: "Image is now visible on the user's screen. If you are already speaking, just naturally weave this into your explanation (e.g. 'As you can see on the screen...'). Do not restart your explanation."
                                    }
                                  } 
                                }]
                              }
                            });
                          } catch (e) {}
                        } else {
                          // Search failed
                          try {
                            sessionRef.current?.send({
                              toolResponse: {
                                functionResponses: [{ 
                                  id: call.id, 
                                  name: call.name, 
                                  response: { 
                                    result: {
                                      status: "FAILED",
                                      message: "No image could be found. SYSTEM DIRECTIVE: Do not mention an image. Briefly apologize that you couldn't find a picture, and then verbally explain the topic anyway."
                                    }
                                  } 
                                }]
                              }
                            });
                          } catch (e) {}
                        }
                      }).catch(console.error).finally(() => {
                        toolCallInProgressRef.current = false;
                      });
                    } else {
                      toolCallInProgressRef.current = false;
                    }
                  } else if (call.name === 'close_visual') {
                    setVisualContext(prev => prev ? { ...prev, active: false } : null);
                    try {
                      sessionRef.current?.send({
                        toolResponse: {
                          functionResponses: [{ id: call.id, name: call.name, response: { result: "Closed." } }]
                        }
                      });
                    } catch (e) {}
                    toolCallInProgressRef.current = false;
                  } else if (call.name === 'check_visual') {
                    const currentCtx = visualContextRef.current;
                    const resultText = currentCtx?.active 
                      ? `Image titled "${currentCtx.title}". Background info: ${currentCtx.explanation}.`
                      : `No image currently on screen.`;
                    try {
                      sessionRef.current?.send({
                        toolResponse: {
                          functionResponses: [{ id: call.id, name: call.name, response: { result: resultText } }]
                        }
                      });
                    } catch (e) {}
                    toolCallInProgressRef.current = false;
                  } else {
                    // Fallback
                    try {
                      sessionRef.current?.send({
                        toolResponse: {
                          functionResponses: [{ id: call.id, name: call.name, response: { result: "OK" } }]
                        }
                      });
                    } catch (e) {}
                    toolCallInProgressRef.current = false;
                  }
                }
              }
            }


            const audioData = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audioData) {
              isTurnCompleteRef.current = false;
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
                if (activeSourcesRef.current.size === 0 && isTurnCompleteRef.current) {
                  transitionToListening();
                }
              };

              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += audioBuffer.duration;
            }

            if (message.serverContent?.modelTurn?.parts) {
              for (const part of message.serverContent.modelTurn.parts) {
                if (part.text) {
                  isTurnCompleteRef.current = false;
                  textBufferRef.current += part.text;
                  console.log("AI Text Output:", part.text);
                }
              }
            }

            if (message.serverContent?.turnComplete) {
              isTurnCompleteRef.current = true;
              if (thinkingTimerRef.current) { clearTimeout(thinkingTimerRef.current); thinkingTimerRef.current = null; }
              if (activeSourcesRef.current.size === 0) {
                transitionToListening();
              }
              // Reset text buffer at the end of the turn
              textBufferRef.current = "";
            }

            if (message.serverContent?.interrupted) {
              isTurnCompleteRef.current = true;
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

  const handleSettingsSave = (newSettings: Settings) => {
    const oldName = settings.deviceName;
    setSettings(newSettings);
    setIsSettingsOpen(false);
    
    // Dynamically inject the new name into the AI's brain without dropping the call
    if (newSettings.deviceName !== oldName && isConnected && sessionRef.current) {
      try {
        sessionRef.current.send({
          clientContent: {
            turns: [{
              role: 'user',
              parts: [{ text: `SYSTEM OVERRIDE: The user just changed your name in the system settings! Forget your old name. Your NEW name is now strictly "${newSettings.deviceName}". Please immediately say a short greeting (in Marathi/English) introducing yourself with your new name to confirm you learned it! ALWAYS speak at an extremely fast, rapid-fire conversational pace.` }]
            }],
            turnComplete: true
          }
        });
      } catch (e) {
        console.error("Failed to inject new name", e);
      }
    }
  };

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
            aria-label={isMuted ? "Resume Microphone" : "Pause Microphone"}
            onClick={(e) => { e.stopPropagation(); setIsMuted(!isMuted); }}
            title={isMuted ? "Resume Microphone" : "Pause Microphone"}
            className={clsx(
              "w-10 h-10 flex items-center justify-center rounded-xl transition-colors border-2",
              isMuted 
                ? "bg-amber-600 hover:bg-amber-500 border-amber-400 text-white" 
                : "bg-zinc-800 hover:bg-zinc-700 border-zinc-600 text-zinc-300 hover:text-white"
            )}
          >
            {isMuted ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="22"></line></svg>
            )}
          </button>
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
            onClick={(e) => { 
              e.stopPropagation(); 
              if ((window as any).electronAPI) {
                (window as any).electronAPI.close();
              } else {
                try {
                  CapacitorApp.exitApp();
                } catch (err) {
                  // Fallbacks if they haven't rebuilt the APK yet
                  if ((navigator as any).app) {
                    (navigator as any).app.exitApp();
                  } else {
                    window.close();
                  }
                }
              }
            }}
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
