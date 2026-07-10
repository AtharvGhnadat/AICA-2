
export type DeviceStatus = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';

export interface Settings {
  deviceName: string;
  volume: number;
  sensitivity: number;
  eyeColor: string;
  voiceName: 'Zephyr' | 'Puck' | 'Charon' | 'Kore' | 'Fenrir';
  geminiApiKey?: string;
  serperApiKey?: string;
}

export interface TranscriptionItem {
  text: string;
  sender: 'user' | 'bot';
}

export interface VisualContext {
  title: string;
  explanation: string;
  imageUrl: string;
  thumbnailUrl?: string;
  searchQuery: string;
  imageSource: "serpapi" | "fallback" | "none";
  active: boolean;
}
