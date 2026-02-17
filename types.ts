
export type DeviceStatus = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';

export interface Settings {
  deviceName: string;
  volume: number;
  sensitivity: number;
  eyeColor: string;
  voiceName: 'Zephyr' | 'Puck' | 'Charon' | 'Kore' | 'Fenrir';
}

export interface TranscriptionItem {
  text: string;
  sender: 'user' | 'bot';
}
