// Type declaration for AI Studio helper injected into the browser context
interface AiStudio {
  hasSelectedApiKey(): Promise<boolean>;
  openSelectKey(): Promise<void>;
}

interface Window {
  aistudio?: AiStudio;
  webkitAudioContext?: typeof AudioContext;
  electronAPI?: {
    minimize: () => void;
    close: () => void;
    maximizeToggle: () => void;
  };
}
