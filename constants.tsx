
import { Settings } from './types';

export const DEFAULT_SETTINGS: Settings = {
  deviceName: 'Aica',
  volume: 80,
  sensitivity: 50,
  eyeColor: '#00f2ff', // Neon Cyan
  voiceName: 'Kore', // Female-sounding voice
};

export const AUDIO_SAMPLE_RATE_INPUT = 16000;
export const AUDIO_SAMPLE_RATE_OUTPUT = 24000;

export const EYE_COLORS = [
  { name: 'Cyan', value: '#00f2ff' },
  { name: 'Yellow', value: '#facc15' },
  { name: 'Green', value: '#4ade80' },
  { name: 'Purple', value: '#a855f7' },
  { name: 'Red', value: '#ef4444' },
];
