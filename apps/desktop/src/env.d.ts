interface RuntimeInfo {
  platform: NodeJS.Platform;
  arch: string;
  versions: {
    chrome: string;
    electron: string;
    node: string;
  };
}

interface StoredAuthSnapshot {
  filePath: string;
  storedAuth: Record<string, unknown> | null;
}

interface ChatGPTAuthResponse {
  ok: boolean;
  authUrl?: string;
  callback?: Record<string, string>;
  filePath: string;
  error?: string;
  storageError?: string;
  snapshot?: StoredAuthSnapshot;
}

interface HaxAuthResponse {
  ok: boolean;
  startUrl?: string;
  callbackUrl?: string;
  filePath: string;
  storedAuth: Record<string, unknown> | null;
  error?: string;
}

interface Window {
  electronAPI: {
    getRuntimeInfo: () => RuntimeInfo;
    signInWithChatGPT: () => Promise<ChatGPTAuthResponse>;
    getChatGPTAuth: () => Promise<StoredAuthSnapshot & { ok: boolean }>;
    signInWithHax: () => Promise<HaxAuthResponse>;
    getHaxAuth: () => Promise<StoredAuthSnapshot & { ok: boolean }>;
    signOutWithHax: () => Promise<StoredAuthSnapshot & { ok: boolean; error?: string }>;
  };
}
