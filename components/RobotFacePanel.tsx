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
    <div className="relative w-full h-full flex flex-col items-center justify-center">
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
      <div className="absolute bottom-6 left-0 right-0 flex flex-col items-center gap-3 z-10 pointer-events-none">
        {/* Status pill */}
        <div className="flex items-center gap-2.5 px-5 py-1.5 rounded-full bg-zinc-900/60 border border-zinc-800/50">
          <div className={`w-1.5 h-1.5 rounded-full ${statusDotColor} ${statusGlow} ${status === 'listening' || status === 'speaking' ? 'animate-pulse' : ''}`} />
          <span className="text-[9px] font-mono text-zinc-500 tracking-[0.2em] uppercase">{statusLabel}</span>
        </div>

        {/* Name */}
        <span className="text-[8px] font-mono text-zinc-700 tracking-[0.3em] uppercase">{settings.deviceName}</span>
      </div>
    </div>
  );
});

RobotFacePanel.displayName = 'RobotFacePanel';
