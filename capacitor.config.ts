import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.emo.ai',
  appName: 'EmoAI',
  webDir: 'dist',
  server: {
    url: 'https://aica-2.vercel.app',
    cleartext: true
  }
};

export default config;
