import React from 'react';
import EyeDisplay from './EyeDisplay';
import { DeviceStatus, Settings } from '../types';

// Using React.memo to prevent unnecessary re-renders when visual panel updates
interface RobotFacePanelProps {
  status: DeviceStatus;
  settings: Settings;
  errorMessage: string | null;
  statusLabel: string;
  statusDotColor: string;
  statusGlow: string;
}

export const RobotFacePanel: React.FC<RobotFacePanelProps> = React.memo(({
  status,
  settings,
  errorMessage,
  statusLabel,
  statusDotColor,
  statusGlow
}) => {
  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center bg-slate-950">
      {/* Rich ambient radial gradient background */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(circle at 50% 50%, ${settings.eyeColor}12 0%, transparent 70%)`,
          transition: 'background 2s ease',
        }}
      />

      {/* Robot face — always visible */}
      <div className="flex-1 flex flex-col items-center justify-center w-full relative z-10">
        <EyeDisplay status={status} color={status === 'error' ? '#f59e0b' : settings.eyeColor} />

        {/* Error message */}
        {errorMessage && (
          <div className="mt-12 px-6 py-3 bg-slate-900 border border-red-500/20 rounded-2xl">
            <span className="text-red-400 text-xs font-semibold uppercase tracking-[0.2em]">{errorMessage}</span>
          </div>
        )}
      </div>

      {/* Bottom status bar (Glassmorphic) */}
      <div className="absolute bottom-8 left-0 right-0 flex flex-col items-center gap-4 z-10 pointer-events-none">
        {/* Status capsule */}
        <div className="flex items-center gap-3 px-6 py-2.5 rounded-full bg-slate-900/95 border border-white/10 shadow-lg">
          <div className={`w-2 h-2 rounded-full ${statusDotColor} ${statusGlow} ${status === 'listening' || status === 'speaking' ? 'animate-pulse' : ''}`} />
          <span className="text-[11px] font-semibold text-slate-300 tracking-[0.25em] uppercase">{statusLabel}</span>
        </div>

        {/* Device Name */}
        <span className="text-[9px] font-bold text-slate-600 tracking-[0.4em] uppercase">{settings.deviceName}</span>
      </div>
    </div>
  );
});

RobotFacePanel.displayName = 'RobotFacePanel';
