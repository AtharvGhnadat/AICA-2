
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Blob } from '@google/genai';
import { DeviceStatus, Settings, TranscriptionItem } from './types';
import { DEFAULT_SETTINGS, AUDIO_SAMPLE_RATE_INPUT, AUDIO_SAMPLE_RATE_OUTPUT } from './constants';
import EyeDisplay from './components/EyeDisplay';
import SettingsMenu from './components/SettingsMenu';

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

/**
 * Downsample a Float32Array from one sample rate to another using linear interpolation.
 * The mic captures at 44100/48000Hz but Gemini expects 16000Hz.
 */
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

/** After last audio chunk finishes playing, wait before re-enabling mic */
const POST_SPEECH_DELAY_MS = 30;
/** If stuck in 'thinking' this long with no audio, fall back to 'listening' */
const THINKING_TIMEOUT_MS = 8000;
/** Auto-reconnect delay base */
const RECONNECT_DELAY_MS = 3000;
/** Maximum consecutive reconnect attempts */
const MAX_RECONNECT_ATTEMPTS = 5;

// ─── Persistent Storage Helpers ──────────────────────────────────────────────

const STORAGE_KEY_NAME = 'emo_robot_name';

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

const App: React.FC = () => {
  const [status, setStatus] = useState<DeviceStatus>('idle');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<Settings>(() => ({
    ...DEFAULT_SETTINGS,
    deviceName: loadSavedName(),
  }));
  const [transcriptions, setTranscriptions] = useState<TranscriptionItem[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const inputContextRef = useRef<AudioContext | null>(null);
  const outputContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const sessionRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);

  // Refs that track state without triggering re-renders – prevents stale closures
  const statusRef = useRef<DeviceStatus>('idle');
  const settingsRef = useRef<Settings>(DEFAULT_SETTINGS);
  const isConnectedRef = useRef(false);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const thinkingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const postSpeechTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentInputTranscription = useRef('');
  const currentOutputTranscription = useRef('');

  // Keep refs in sync with state
  useEffect(() => { statusRef.current = status; }, [status]);
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => { isConnectedRef.current = isConnected; }, [isConnected]);

  // ─── Helpers ──────────────────────────────────────────────────────────────

  const clearTimers = useCallback(() => {
    if (thinkingTimerRef.current) { clearTimeout(thinkingTimerRef.current); thinkingTimerRef.current = null; }
    if (postSpeechTimerRef.current) { clearTimeout(postSpeechTimerRef.current); postSpeechTimerRef.current = null; }
    if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
  }, []);

  const handleUpdateSettings = (updates: Partial<Settings>) => {
    if (updates.deviceName !== undefined) {
      persistName(updates.deviceName);
    }
    setSettings(prev => ({ ...prev, ...updates }));
  };

  // Double-tap ref (handler defined after handleInteraction)
  const lastTapRef = useRef(0);

  const stopActiveAudio = useCallback(() => {
    activeSourcesRef.current.forEach(source => {
      try { source.stop(); } catch (_) { /* already stopped */ }
    });
    activeSourcesRef.current.clear();
    nextStartTimeRef.current = 0;
  }, []);

  /**
   * Safely transition to 'listening' with a short debounce delay.
   * This avoids the mic catching the last reverb of the speaker.
   */
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

  /**
   * Start a safety timeout: if we stay in 'thinking' too long with no response,
   * force-transition to 'listening' so the mic isn't permanently blocked.
   * THIS FIXES THE CORE BUG.
   */
  const startThinkingTimeout = useCallback(() => {
    if (thinkingTimerRef.current) clearTimeout(thinkingTimerRef.current);
    thinkingTimerRef.current = setTimeout(() => {
      if (statusRef.current === 'thinking') {
        console.warn('[Emo] Thinking timeout – forcing transition to listening');
        setStatus('listening');
      }
      thinkingTimerRef.current = null;
    }, THINKING_TIMEOUT_MS);
  }, []);

  // ─── Session Lifecycle ────────────────────────────────────────────────────

  const endSession = useCallback(() => {
    clearTimers();
    if (sessionRef.current) {
      try { sessionRef.current.close(); } catch (_) {}
      sessionRef.current = null;
    }
    if (workletNodeRef.current) {
      try { workletNodeRef.current.disconnect(); } catch (_) {}
      workletNodeRef.current = null;
    }
    if (sourceNodeRef.current) {
      try { sourceNodeRef.current.disconnect(); } catch (_) {}
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
      console.warn('[Emo] Max reconnect attempts reached');
      setErrorMessage('Connection lost – tap to retry');
      return;
    }
    reconnectAttemptsRef.current++;
    const delay = RECONNECT_DELAY_MS * reconnectAttemptsRef.current;
    console.log(`[Emo] Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current})`);
    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      if (!isConnectedRef.current && statusRef.current !== 'thinking') {
        startSession();
      }
    }, delay);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startSession = useCallback(async () => {
    if (isConnectedRef.current) return;

    // Ensure clean state
    endSession();
    setErrorMessage(null);

    // AI Studio key helper (may not exist outside AI Studio)
    try {
      if (typeof window.aistudio !== 'undefined') {
        const hasKey = await window.aistudio!.hasSelectedApiKey();
        if (!hasKey) {
          await window.aistudio!.openSelectKey();
        }
      }
    } catch (_) { console.warn('[Emo] Key helper unavailable'); }

    try {
      setStatus('thinking');
      startThinkingTimeout();

      // ── Resume AudioContexts (created synchronously in gesture handler) ──
      // AudioContexts are created in handleInteraction() during an active
      // user gesture to satisfy Chrome's autoplay policy.
      if (inputContextRef.current?.state === 'suspended') await inputContextRef.current.resume();
      if (outputContextRef.current?.state === 'suspended') await outputContextRef.current.resume();

      // Fallback: if somehow contexts don't exist yet (e.g. auto-reconnect),
      // create them here. May trigger autoplay warning but is a safety net.
      if (!inputContextRef.current || inputContextRef.current.state === 'closed') {
        inputContextRef.current = new (window.AudioContext || window.webkitAudioContext!)({
          latencyHint: 'interactive',
        });
      }
      if (!outputContextRef.current || outputContextRef.current.state === 'closed') {
        outputContextRef.current = new (window.AudioContext || window.webkitAudioContext!)({
          sampleRate: AUDIO_SAMPLE_RATE_OUTPUT,
          latencyHint: 'interactive',
        });
      }

      // ── Mic stream — no software noise cancellation ────────────────
      // The hardware mic has built-in noise cancellation.
      // Disabling browser processing removes latency and avoids interference.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: true,
          channelCount: 1,
        },
      });
      streamRef.current = stream;

      // ── Connect to Gemini Live API ────────────────────────────────────
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const currentSettings = settingsRef.current;

      const session = await ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: currentSettings.voiceName } },
          },
          systemInstruction: `You are ${currentSettings.deviceName}, an omni-directional robot by Atharv, Siddhant, Abhilesh (Professor. Vikramsinh Saste). Reply in 1-2 sentences, match user's language (Marathi/Hindi/English). Be concise and natural. You have google search capability, use it when asked about current events, facts, or anything you need to look up.`,
          tools: [{ googleSearch: {} }],
        },
        callbacks: {
          // ── onopen ──────────────────────────────────────────────────────
          onopen: () => {
            console.log('[Emo] Session opened');
            setIsConnected(true);
            reconnectAttemptsRef.current = 0;
            setStatus('listening');
            if (thinkingTimerRef.current) { clearTimeout(thinkingTimerRef.current); thinkingTimerRef.current = null; }

            // ── Wire up microphone via AudioWorklet (off main thread) ──
            const inputCtx = inputContextRef.current!;
            const nativeRate = inputCtx.sampleRate;

            const setupWorklet = async () => {
              try {
                await inputCtx.audioWorklet.addModule('./mic-processor.js');
              } catch (_) {
                // Module may already be registered from a previous session
              }

              const workletNode = new AudioWorkletNode(inputCtx, 'mic-processor');
              workletNodeRef.current = workletNode;

              workletNode.port.onmessage = (ev: MessageEvent<Float32Array>) => {
                const curStatus = statusRef.current;

                // ── SAFETY GATE ──────────────────────────────────────────
                // Don't send mic data while AI is speaking (prevents echo).
                // Allow during 'thinking' so Gemini receives audio faster.
                if (curStatus === 'speaking') return;
                if (!isConnectedRef.current) return;

                const inputData = ev.data;

                // ── Downsample from native rate to 16kHz ─────────────────
                const downsampledData = downsampleBuffer(inputData, nativeRate, AUDIO_SAMPLE_RATE_INPUT);

                // ── Send audio to Gemini ─────────────────────────────────
                const pcmBlob = createPCMBlob(downsampledData, AUDIO_SAMPLE_RATE_INPUT);
                try {
                  sessionRef.current?.sendRealtimeInput({ media: pcmBlob });
                } catch (err) {
                  console.warn('[Emo] Failed to send audio:', err);
                }
              };

              const source = inputCtx.createMediaStreamSource(stream);
              sourceNodeRef.current = source;
              source.connect(workletNode);
            };

            setupWorklet().catch(err => {
              console.error('[Emo] AudioWorklet setup failed:', err);
            });
          },

          // ── onmessage ───────────────────────────────────────────────────
          onmessage: (message: LiveServerMessage) => {
            // ── Transcriptions ───────────────────────────────────────────
            if (message.serverContent?.inputTranscription?.text) {
              currentInputTranscription.current += message.serverContent.inputTranscription.text;
            }
            if (message.serverContent?.outputTranscription?.text) {
              currentOutputTranscription.current += message.serverContent.outputTranscription.text;
            }

            // ── Turn complete ────────────────────────────────────────────
            // KEY FIX: turnComplete MUST always transition back to listening.
            // Previously, if the AI returned no audio (e.g. tool call only or
            // empty response), the status stayed in 'thinking' forever,
            // permanently blocking the microphone.
            if (message.serverContent?.turnComplete) {
              // Clear thinking timeout
              if (thinkingTimerRef.current) { clearTimeout(thinkingTimerRef.current); thinkingTimerRef.current = null; }

              // If no audio sources are playing, transition immediately.
              if (activeSourcesRef.current.size === 0) {
                transitionToListening();
              }
            }

            // ── Audio data ───────────────────────────────────────────────
            const audioData = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audioData) {
              if (thinkingTimerRef.current) { clearTimeout(thinkingTimerRef.current); thinkingTimerRef.current = null; }
              setStatus('speaking');

              const ctx = outputContextRef.current!;
              const now = ctx.currentTime;
              // Schedule immediately — no gap between chunks
              if (nextStartTimeRef.current < now) nextStartTimeRef.current = now;

              const audioBuffer = decodeAudioBuffer(
                base64Decode(audioData), ctx, AUDIO_SAMPLE_RATE_OUTPUT, 1
              );
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

            // ── Interrupted ──────────────────────────────────────────────
            if (message.serverContent?.interrupted) {
              stopActiveAudio();
              if (thinkingTimerRef.current) { clearTimeout(thinkingTimerRef.current); thinkingTimerRef.current = null; }
              if (postSpeechTimerRef.current) { clearTimeout(postSpeechTimerRef.current); postSpeechTimerRef.current = null; }
              setStatus('listening');
            }
          },

          // ── onerror ─────────────────────────────────────────────────────
          onerror: (e: any) => {
            console.error('[Emo] Session Error:', e);
            setErrorMessage('Connection Error');
            setStatus('error');
            setIsConnected(false);
            sessionRef.current = null;
            scheduleReconnect();
          },

          // ── onclose ─────────────────────────────────────────────────────
          onclose: (e: any) => {
            console.warn('[Emo] Session closed:', e);
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
      console.error('[Emo] Init Failed:', err);
      setErrorMessage(
        err?.message?.includes('microphone')
          ? 'Microphone access denied'
          : 'Init Failed – check API key & network'
      );
      setStatus('error');
      scheduleReconnect();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endSession, startThinkingTimeout, stopActiveAudio, transitionToListening]);

  // ─── Cleanup on unmount ─────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      clearTimers();
      endSession();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Auto-start: connect to Gemini immediately on launch ──────────────
  useEffect(() => {
    // Create AudioContexts immediately
    if (!inputContextRef.current || inputContextRef.current.state === 'closed') {
      inputContextRef.current = new (window.AudioContext || window.webkitAudioContext!)({
        latencyHint: 'interactive',
      });
    }
    if (!outputContextRef.current || outputContextRef.current.state === 'closed') {
      outputContextRef.current = new (window.AudioContext || window.webkitAudioContext!)({
        sampleRate: AUDIO_SAMPLE_RATE_OUTPUT,
        latencyHint: 'interactive',
      });
    }

    // Start session directly
    startSession();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Tap to resume / reconnect ─────────────────────────────────────────

  const handleInteraction = useCallback(() => {
    // Resume any suspended AudioContexts on user gesture
    if (inputContextRef.current?.state === 'suspended') {
      inputContextRef.current.resume().catch(() => {});
    }
    if (outputContextRef.current?.state === 'suspended') {
      outputContextRef.current.resume().catch(() => {});
    }

    // Reconnect if disconnected
    if (!isConnected && status !== 'thinking') {
      reconnectAttemptsRef.current = 0;
      setErrorMessage(null);
      startSession();
    }
  }, [isConnected, status, startSession]);

  // Double-tap detection for opening settings (touchscreen friendly)
  const handleScreenTap = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const now = Date.now();
    const timeSinceLastTap = now - lastTapRef.current;
    lastTapRef.current = now;

    // Double-tap detected (< 400ms between taps)
    if (timeSinceLastTap < 400 && timeSinceLastTap > 50) {
      e.preventDefault();
      e.stopPropagation();
      setIsSettingsOpen(true);
      return;
    }

    // Single tap — handle interaction (wake/reconnect)
    handleInteraction();
  }, [handleInteraction]);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsSettingsOpen(true);
  };

  // ─── Keyboard gesture listener ─────────────────────────────────────────

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        handleInteraction();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleInteraction]);

  // ─── Reboot handler — ends session and reconnects with new settings ────

  const handleReboot = useCallback((newSettings: Settings) => {
    setIsSettingsOpen(false);
    // Update the settings ref immediately with new settings
    settingsRef.current = newSettings;
    // Also update the state to keep UI in sync
    setSettings(newSettings);
    endSession();
    // Small delay to let endSession fully clean up before reconnecting
    setTimeout(() => {
      reconnectAttemptsRef.current = 0;
      setErrorMessage(null);
      startSession();
    }, 300);
  }, [endSession, startSession]);

  // ─── Render ─────────────────────────────────────────────────────────────

  const statusLabel = status === 'listening' ? 'LISTENING' : status === 'speaking' ? 'SPEAKING' : status === 'thinking' ? 'PROCESSING' : status === 'error' ? 'ERROR' : 'STARTING';
  const statusDotColor = status === 'listening' ? 'bg-emerald-400' : status === 'speaking' ? 'bg-cyan-400' : status === 'thinking' ? 'bg-amber-400' : status === 'error' ? 'bg-red-400' : 'bg-zinc-600';
  const statusGlow = status === 'listening' ? 'shadow-[0_0_6px_rgba(52,211,153,0.8)]' : status === 'speaking' ? 'shadow-[0_0_6px_rgba(34,211,238,0.8)]' : '';

  return (
    <div
      className="relative h-screen w-screen flex flex-col items-center justify-center bg-black overflow-hidden select-none"
      onClick={handleScreenTap}
      onContextMenu={handleContextMenu}
    >
      {/* ── Top bar: Desktop (minimize) + Settings + Close ─────────── */}
      <div
        className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between px-2 py-2"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        {/* Left: Minimize / Home button */}
        <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <button
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); lastTapRef.current = 0; (window as any).electronAPI?.minimize(); }}
            className="flex items-center gap-2 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-2xl transition-all active:scale-95 border-2 border-zinc-600 shadow-lg shadow-black/50"
            title="Minimize — go to desktop"
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" className="shrink-0">
              <rect x="3" y="4" width="14" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.8" fill="none" />
              <line x1="3" y1="15" x2="17" y2="15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <span className="text-[11px] font-bold uppercase tracking-wide">Desktop</span>
          </button>
        </div>

        {/* Right: Settings + Fullscreen + Close buttons */}
        <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          {/* Settings button */}
          <button
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); lastTapRef.current = 0; setIsSettingsOpen(true); }}
            className="w-10 h-10 flex items-center justify-center rounded-xl bg-zinc-800 hover:bg-zinc-700 transition-colors border-2 border-zinc-600 shadow-lg shadow-black/50 group"
            title="Settings"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-zinc-300 group-hover:text-white">
              <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" stroke="currentColor" strokeWidth="2" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" stroke="currentColor" strokeWidth="2" />
            </svg>
          </button>
          {/* Fullscreen toggle button */}
          <button
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); lastTapRef.current = 0; (window as any).electronAPI?.maximizeToggle(); }}
            className="w-10 h-10 flex items-center justify-center rounded-xl bg-zinc-800 hover:bg-zinc-700 transition-colors border-2 border-zinc-600 shadow-lg shadow-black/50 group"
            title="Toggle fullscreen"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-zinc-300 group-hover:text-white">
              <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {/* Close button */}
          <button
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); lastTapRef.current = 0; (window as any).electronAPI?.close(); }}
            className="w-10 h-10 flex items-center justify-center rounded-xl bg-zinc-800 hover:bg-red-600 transition-colors border-2 border-zinc-600 shadow-lg shadow-black/50 group"
            title="Close app"
          >
            <svg width="16" height="16" viewBox="0 0 18 18" className="text-zinc-300 group-hover:text-white">
              <line x1="4" y1="4" x2="14" y2="14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <line x1="14" y1="4" x2="4" y2="14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* Subtle radial gradient background */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse at 50% 40%, ${settings.eyeColor}06 0%, transparent 60%)`,
          transition: 'background 2s ease',
        }}
      />

      {/* Robot face — always visible */}
      <div className="flex-1 flex flex-col items-center justify-center w-full relative z-10">
        <EyeDisplay status={status} color={status === 'error' ? '#f59e0b' : settings.eyeColor} />

        {/* Error message */}
        {errorMessage && (
          <div className="mt-10 px-5 py-2 bg-red-500/8 border border-red-500/15 rounded-xl">
            <span className="text-red-400 text-[10px] uppercase font-mono tracking-[0.15em]">{errorMessage}</span>
          </div>
        )}
      </div>

      {/* Bottom status bar */}
      <div className="absolute bottom-6 left-0 right-0 flex flex-col items-center gap-3 z-10">
        {/* Status pill */}
        <div className="flex items-center gap-2.5 px-5 py-1.5 rounded-full bg-zinc-900/60 border border-zinc-800/50">
          <div className={`w-1.5 h-1.5 rounded-full ${statusDotColor} ${statusGlow} ${status === 'listening' || status === 'speaking' ? 'animate-pulse' : ''}`} />
          <span className="text-[9px] font-mono text-zinc-500 tracking-[0.2em] uppercase">{statusLabel}</span>
        </div>

        {/* Name */}
        <span className="text-[8px] font-mono text-zinc-700 tracking-[0.3em] uppercase">{settings.deviceName}</span>
      </div>

      {/* Settings overlay */}
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
