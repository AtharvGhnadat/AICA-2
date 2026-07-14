import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, Type } from '@google/genai';
import { App as CapacitorApp } from '@capacitor/app';
import { DeviceStatus, Settings, VisualContext } from './types';
import { DEFAULT_SETTINGS } from './constants';
import SettingsMenu from './components/SettingsMenu';
import { SplitRobotLayout } from './components/SplitRobotLayout';
import { RobotFacePanel } from './components/RobotFacePanel';
import { VisualContextPanel } from './components/VisualContextPanel';
import { visualContextService } from './services/visualContextService';
import { clsx } from 'clsx';

// ─── Persistent Storage Helpers ──────────────────────────────────────────────

const STORAGE_KEY_NAME = 'emo_robot_name_swastik';
const STORAGE_KEY_GEMINI = 'emo_robot_gemini_api_key_swastik';
const STORAGE_KEY_SERPER = 'emo_robot_serper_api_key_swastik';

function loadSavedName(): string {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_NAME);
    if (saved && saved.trim().length > 0) return saved.trim();
  } catch (_) { }
  return DEFAULT_SETTINGS.deviceName;
}

function persistName(name: string) {
  try { localStorage.setItem(STORAGE_KEY_NAME, name.trim()); } catch (_) { }
}

function loadSavedGeminiKey(): string {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_GEMINI);
    if (saved && saved.trim().length > 0) return saved.trim();
  } catch (_) { }
  return '';
}

function persistGeminiKey(key: string) {
  try { localStorage.setItem(STORAGE_KEY_GEMINI, key.trim()); } catch (_) { }
}

function loadSavedSerperKey(): string {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_SERPER);
    if (saved && saved.trim().length > 0) return saved.trim();
  } catch (_) { }
  return '';
}

function persistSerperKey(key: string) {
  try { localStorage.setItem(STORAGE_KEY_SERPER, key.trim()); } catch (_) { }
}

// ─── Utils ──────────────────────────────────────────────────────────────

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64data = (reader.result as string).split(',')[1];
      resolve(base64data);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

const App: React.FC = () => {
  const [status, _setStatus] = useState<DeviceStatus>('idle');
  const statusRef = useRef<DeviceStatus>('idle');
  const setStatus = useCallback((s: DeviceStatus) => {
    statusRef.current = s;
    _setStatus(s);
  }, []);
  
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<Settings>(() => ({
    ...DEFAULT_SETTINGS,
    deviceName: loadSavedName() || 'Swastik',
    voiceName: 'Puck', // Now used for TTS engine selection
    geminiApiKey: loadSavedGeminiKey(),
    serperApiKey: loadSavedSerperKey(),
  }));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);

  // Visual Context State
  const [visualContext, setVisualContext] = useState<Partial<VisualContext> | null>(null);
  const [visualStatus, setVisualStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  // Audio / Recording Refs
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  
  // Logic Refs
  const isRecordingRef = useRef(false);
  const silenceStartRef = useRef(Date.now());
  const rafIdRef = useRef<number | null>(null);
  const settingsRef = useRef<Settings>(settings);
  const chatHistoryRef = useRef<any[]>([]);
  const visualContextRef = useRef<Partial<VisualContext> | null>(null);

  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => { visualContextRef.current = visualContext; }, [visualContext]);

  const activeUtterancesRef = useRef(0);
  const isStreamCompleteRef = useRef(false);

  // TTS Engine Setup
  const speakText = useCallback((text: string) => {
    if (!('speechSynthesis' in window)) return;
    
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(v => v.name.includes('Google UK English Male') || v.name.includes('Male')) || voices[0];
    if (preferredVoice) utterance.voice = preferredVoice;
    
    utterance.volume = settingsRef.current.volume / 100;
    utterance.rate = 1.1; // Slightly faster for conversational pace
    
    activeUtterancesRef.current++;
    
    const checkEnd = () => {
      activeUtterancesRef.current--;
      if (activeUtterancesRef.current <= 0) {
        activeUtterancesRef.current = 0;
        if (isStreamCompleteRef.current) {
          setStatus('listening');
        }
      }
    };
    
    utterance.onend = checkEnd;
    utterance.onerror = checkEnd;
    
    window.speechSynthesis.speak(utterance);
  }, []);

  const triggerImageSearch = async (text: string): Promise<Partial<VisualContext> | null> => {
    setVisualStatus('loading');
    setVisualContext({ active: true, searchQuery: text, imageSource: 'none', title: '', explanation: '', imageUrl: '' });
    const result = await visualContextService.searchImage(text, settingsRef.current.serperApiKey);
    if (result) {
      setVisualContext({ ...result, active: true });
      setVisualStatus('success');
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

  const processAIResponse = async (audioBase64: string, mimeType: string) => {
    setStatus('thinking');
    const currentSettings = settingsRef.current;
    const apiKey = currentSettings.geminiApiKey || import.meta.env.VITE_GEMINI_API_KEY || process.env.API_KEY || import.meta.env.VITE_API_KEY;
    
    if (!apiKey) {
      setErrorMessage("API key missing. Enter it in Settings.");
      setStatus('error');
      return;
    }

    const ai = new GoogleGenAI({ apiKey });
    
    const userMessage = {
      role: 'user',
      parts: [
        { inlineData: { mimeType, data: audioBase64 } }
      ]
    };

    const history = [...chatHistoryRef.current, userMessage];

    try {
      const responseStream = await ai.models.generateContentStream({
        model: 'gemini-3.5-flash',
        contents: history,
        config: {
          systemInstruction: { parts: [{ text: `You are ${currentSettings.deviceName}, a world-class, friendly AI teacher assistant built by Atharv, Pruthviraj, Abhilesh (Professor. Vikramsinh Saste). You speak in a warm, friendly male voice.
CRITICAL IDENTITY & LANGUAGE:
- Your primary languages are Marathi and English. You must effortlessly understand both. Explain complex topics using a natural mix of simple Marathi and English (Hinglish/Maringlish style).
- Your name is ${currentSettings.deviceName}.
- OUTPUT RULES: You MUST ONLY output the exact words you are going to speak out loud. DO NOT generate any text representing your internal thoughts, actions, or formatting. Speak directly to the user as a natural human teacher.
- Be extremely brief and fast. Maximum 2 sentences.
- If asked about an image on screen, respond confidently. If asked to show something, you must call the show_visual tool.` }] },
          tools: [
            {
              functionDeclarations: [
                {
                  name: "show_visual",
                  description: "Displays a relevant image on the user's screen.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: { topic: { type: Type.STRING, description: "Google Images search query" } },
                    required: ["topic"]
                  }
                },
                {
                  name: "close_visual",
                  description: "Closes the image panel on the screen.",
                  parameters: { type: Type.OBJECT, properties: {} }
                }
              ]
            }
          ]
        }
      });

      setStatus('speaking');
      let fullResponseText = "";
      let sentenceBuffer = "";
      isStreamCompleteRef.current = false;
      
      for await (const chunk of responseStream) {
        if (chunk.functionCalls && chunk.functionCalls.length > 0) {
          for (const call of chunk.functionCalls) {
            if (call.name === 'show_visual') {
              const args = call.args as any;
              if (args.topic) {
                triggerImageSearch(args.topic);
                fullResponseText += " [Showing image] ";
              }
            } else if (call.name === 'close_visual') {
              setVisualContext(prev => prev ? { ...prev, active: false } : null);
            }
          }
        }
        
        if (chunk.text) {
          fullResponseText += chunk.text;
          sentenceBuffer += chunk.text;
          
          // Match sentence boundaries: . ? ! or Hindi/Marathi Purna Viram (।) or newline
          const boundaryRegex = /([.?!।\n]+)(\s*)/;
          const match = sentenceBuffer.match(boundaryRegex);
          if (match) {
            const splitIndex = match.index! + match[1].length;
            const sentenceToSpeak = sentenceBuffer.substring(0, splitIndex).trim();
            sentenceBuffer = sentenceBuffer.substring(splitIndex + match[2].length);
            
            if (sentenceToSpeak.length > 0) {
               speakText(sentenceToSpeak.replace(/\[Showing image\]/g, ''));
            }
          }
        }
      }
      
      // Speak any remaining text that didn't end with punctuation
      if (sentenceBuffer.trim().length > 0) {
        speakText(sentenceBuffer.trim().replace(/\[Showing image\]/g, ''));
      }

      isStreamCompleteRef.current = true;

      if (fullResponseText.trim().length > 0) {
        chatHistoryRef.current = [...history, { role: 'model', parts: [{ text: fullResponseText }] }];
        // Keep history short to save tokens
        if (chatHistoryRef.current.length > 10) chatHistoryRef.current = chatHistoryRef.current.slice(chatHistoryRef.current.length - 10);
        
        // If it finished streaming but nothing is currently speaking, revert to listening
        if (activeUtterancesRef.current === 0) {
          setStatus('listening');
        }
      } else {
        setStatus('listening');
      }

    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || "Failed to generate content");
      setStatus('error');
      setTimeout(() => setStatus('listening'), 3000);
    }
  };

  const startSilenceDetection = useCallback((stream: MediaStream) => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext!)();
    }
    const audioCtx = audioCtxRef.current;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    analyserRef.current = analyser;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    
    const checkAudio = () => {
      if (statusRef.current === 'speaking' || statusRef.current === 'thinking' || isMuted) {
        rafIdRef.current = requestAnimationFrame(checkAudio);
        return; // Don't record or detect silence while AI is busy
      }

      analyser.getByteTimeDomainData(dataArray);
      let isSilent = true;
      let maxAmplitude = 0;
      
      for(let i=0; i<dataArray.length; i++) {
        const amplitude = Math.abs(dataArray[i] - 128);
        if (amplitude > maxAmplitude) maxAmplitude = amplitude;
      }
      
      // Threshold based on sensitivity (1-100). Higher sensitivity = lower threshold.
      const threshold = Math.max(2, 20 - (settingsRef.current.sensitivity / 5));
      
      if (maxAmplitude > threshold) {
        isSilent = false;
      }

      if (!isSilent) {
        silenceStartRef.current = Date.now();
        if (!isRecordingRef.current) {
          isRecordingRef.current = true;
          audioChunksRef.current = [];
          if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'inactive') {
            mediaRecorderRef.current.start(100);
          }
        }
      } else {
        // If silent for 1.5 seconds and we were recording, stop and send.
        if (isRecordingRef.current && Date.now() - silenceStartRef.current > 1500) {
          isRecordingRef.current = false;
          if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop();
          }
        }
      }

      rafIdRef.current = requestAnimationFrame(checkAudio);
    };

    checkAudio();
  }, [isMuted]);

  const initMicrophone = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        if (audioChunksRef.current.length === 0) return;
        
        const blob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType });
        audioChunksRef.current = [];
        
        try {
          const base64 = await blobToBase64(blob);
          processAIResponse(base64, mediaRecorder.mimeType);
        } catch (e) {
          console.error("Failed to convert blob to base64");
          setStatus('listening');
        }
      };

      setStatus('listening');
      startSilenceDetection(stream);

    } catch (err) {
      setErrorMessage("Microphone access denied");
      setStatus('error');
    }
  }, [startSilenceDetection]);

  const handleInteraction = useCallback(() => {
    if (status === 'idle' || status === 'error') {
      setErrorMessage(null);
      initMicrophone();
      // Initialize TTS engine early to avoid delay
      if ('speechSynthesis' in window) {
        window.speechSynthesis.getVoices();
      }
    }
  }, [status, initMicrophone]);

  useEffect(() => {
    return () => {
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      if (audioCtxRef.current) audioCtxRef.current.close();
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    };
  }, []);

  // UI Event Handlers
  const handleScreenTap = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button')) return;
    handleInteraction();
  }, [handleInteraction]);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsSettingsOpen(true);
  };

  const handleSettingsSave = (newSettings: Settings) => {
    handleUpdateSettings(newSettings);
    setIsSettingsOpen(false);
  };

  const handleUpdateSettings = (updates: Partial<Settings>) => {
    if (updates.deviceName !== undefined) persistName(updates.deviceName);
    if (updates.geminiApiKey !== undefined) persistGeminiKey(updates.geminiApiKey);
    if (updates.serperApiKey !== undefined) persistSerperKey(updates.serperApiKey);
    setSettings(prev => ({ ...prev, ...updates }));
  };

  const handleReboot = useCallback((newSettings: Settings) => {
    handleSettingsSave(newSettings);
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    setStatus('idle');
    setTimeout(handleInteraction, 300);
  }, [handleInteraction]);

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
                  if ((navigator as any).app) (navigator as any).app.exitApp();
                  else window.close();
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