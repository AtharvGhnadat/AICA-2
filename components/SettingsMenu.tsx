
import React, { useState } from 'react';
import { Settings } from '../types';
import { EYE_COLORS as PRESETS } from '../constants';

interface SettingsMenuProps {
  settings: Settings;
  onClose: () => void;
  onUpdate: (updates: Partial<Settings>) => void;
  onReboot: (settings: Settings) => void;
}

const SettingsMenu: React.FC<SettingsMenuProps> = ({ settings, onClose, onUpdate, onReboot }) => {
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [showSerperKey, setShowSerperKey] = useState(false);
  // Key selection removed in favor of direct input field

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/95 p-3 sm:p-6 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
      <div className="w-full max-w-[95vw] sm:max-w-md space-y-4 sm:space-y-8 bg-zinc-900/50 p-4 sm:p-8 rounded-2xl sm:rounded-[2.5rem] border border-zinc-800 shadow-2xl my-auto">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-0.5 sm:space-y-1 min-w-0">
            <h2 className="text-base sm:text-2xl font-bold text-zinc-100 truncate">Config: {settings.deviceName}</h2>
            <p className="text-[8px] sm:text-xs text-zinc-500 font-medium uppercase tracking-widest">Raspberry Pi Interface v1.0</p>
          </div>
          <button 
            onClick={onClose}
            className="shrink-0 p-2 sm:p-3 bg-zinc-800 text-zinc-400 hover:text-white rounded-xl sm:rounded-2xl transition-all active:scale-90"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 sm:h-5 sm:w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.6} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4 sm:space-y-6">
          {/* API Key Management */}
          <div className="space-y-3 sm:space-y-4 p-3 sm:p-5 bg-blue-500/5 border border-blue-500/10 rounded-2xl sm:rounded-3xl">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-blue-500 animate-pulse" />
              <label className="text-[8px] sm:text-[10px] font-bold text-blue-500 uppercase tracking-widest">API Services</label>
            </div>
            
            <div className="space-y-3">
              <div className="relative">
                <input 
                  type={showGeminiKey ? "text" : "password"}
                  value={settings.geminiApiKey || ''}
                  onChange={(e) => onUpdate({ geminiApiKey: e.target.value })}
                  className="w-full bg-blue-600/10 border border-blue-500/30 text-blue-100 rounded-lg sm:rounded-xl p-2.5 sm:p-3 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 font-mono"
                  placeholder="Gemini API Key..."
                />
                <button 
                  type="button"
                  onClick={() => setShowGeminiKey(!showGeminiKey)}
                  className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 text-blue-400 hover:text-blue-300"
                  aria-label="Toggle Gemini Key visibility"
                >
                  {showGeminiKey ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                  )}
                </button>
              </div>

              <div className="relative">
                <input 
                  type={showSerperKey ? "text" : "password"}
                  value={settings.serperApiKey || ''}
                  onChange={(e) => onUpdate({ serperApiKey: e.target.value })}
                  className="w-full bg-blue-600/10 border border-blue-500/30 text-blue-100 rounded-lg sm:rounded-xl p-2.5 sm:p-3 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 font-mono"
                  placeholder="Serper API Key (Image Search)..."
                />
                <button 
                  type="button"
                  onClick={() => setShowSerperKey(!showSerperKey)}
                  className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 text-blue-400 hover:text-blue-300"
                  aria-label="Toggle Serper Key visibility"
                >
                  {showSerperKey ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Device Name */}
          <div className="space-y-2 sm:space-y-3">
             <label className="text-[8px] sm:text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Device Identity</label>
             <input 
              type="text"
              value={settings.deviceName}
              onChange={(e) => onUpdate({ deviceName: e.target.value })}
              className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg sm:rounded-xl p-2.5 sm:p-3 text-sm focus:outline-none focus:ring-2 focus:ring-white/20 font-bold"
              placeholder="Enter name..."
             />
          </div>

          {/* Eye Color */}
          <div className="space-y-3 sm:space-y-4">
            <label className="text-[8px] sm:text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Eye Frequency</label>
            <div className="flex justify-between items-center gap-1.5 sm:gap-2">
              {PRESETS.map((color) => (
                <button
                  key={color.value}
                  onClick={() => onUpdate({ eyeColor: color.value })}
                  className={`flex-1 h-10 sm:h-12 rounded-xl sm:rounded-2xl border-2 transition-all flex items-center justify-center ${settings.eyeColor === color.value ? 'border-white scale-105 shadow-lg' : 'border-transparent opacity-40'}`}
                  style={{ backgroundColor: `${color.value}22` }}
                >
                  <div className="w-3 h-3 sm:w-4 sm:h-4 rounded-full" style={{ backgroundColor: color.value }} />
                </button>
              ))}
            </div>
          </div>

          {/* Voice Character */}
          <div className="space-y-3 sm:space-y-4">
            <label className="text-[8px] sm:text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Neural Voice</label>
            <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
              {['Zephyr', 'Puck', 'Charon', 'Kore'].map((v) => (
                <button
                  key={v}
                  onClick={() => onUpdate({ voiceName: v as any })}
                  className={`py-2.5 sm:py-3 px-3 sm:px-4 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-bold transition-all border ${settings.voiceName === v ? 'bg-zinc-100 text-black border-zinc-100' : 'bg-zinc-800/50 text-zinc-500 border-zinc-800 hover:border-zinc-700'}`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        </div>

        <button
          onClick={() => onReboot(settings)}
          className="w-full py-3 sm:py-4 bg-blue-600 text-white font-black text-xs sm:text-sm uppercase tracking-widest rounded-2xl sm:rounded-3xl hover:bg-blue-500 transition-all active:scale-95 shadow-lg shadow-blue-500/20"
        >
          Save & Reboot System
        </button>

        {/* Minimize button — lets user access WiFi / Bluetooth on the Pi */}
        <button
          onClick={() => { onClose(); (window as any).electronAPI?.minimize(); }}
          className="w-full py-3 sm:py-4 bg-zinc-800 text-zinc-300 hover:text-white font-bold text-xs sm:text-sm uppercase tracking-widest rounded-2xl sm:rounded-3xl hover:bg-zinc-700 transition-all active:scale-95 border border-zinc-700"
        >
          <span className="flex items-center justify-center gap-2">
            <svg width="16" height="16" viewBox="0 0 16 16" className="shrink-0">
              <line x1="2" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            Minimize — Access WiFi / Bluetooth
          </span>
        </button>
      </div>
    </div>
  );
};

export default SettingsMenu;
