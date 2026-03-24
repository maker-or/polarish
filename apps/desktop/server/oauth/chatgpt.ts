import { spawn } from "node:child_process";


const ChatGPTAuthEndpoint = "https://auth.openai.com/oauth/authorize";
const ChatGPTTokenEndpoint = "https://auth.openai.com/oauth/token";
const ChatGPTClientID = "app_EMoamEEZ73f0CkXaXp7hrann";
const ChatGPTRedirectURI = "http://localhost:1455/auth/callback";
const ChatGPTScopes = "openid profile email offline_access";
export const ChatGPTCallbackPort = 1455;

type ChatGPTTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
  id_token?: string;
};

export type ChatGPTCredentials = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scope: string;
  tokenType: string;
  account: Record<string, unknown> | null;
  raw: ChatGPTTokenResponse;
};

type PkceCodes = {
  codeVerifier: string;
  challenge: string;
};

type PendingAuthSession = {
  codeVerifier: string;
  state: string;
  resolve: (value: ChatGPTAuthResult) => void;
  reject: (reason?: unknown) => void;
  timeoutId: ReturnType<typeof setTimeout>;
};

export type ChatGPTAuthResult = {
  ok: boolean;
  authUrl?: string;
  callback?: Record<string, string>;
  credentials?: ChatGPTCredentials;
  storedAuth?: Record<string, unknown>;
  error?: string;
};

// const ChatGPTProviderID = "chatgpt";
const AuthTimeoutMs = 5 * 60 * 1000;

let pendingAuthSession: PendingAuthSession | null = null;

const generateRandomString = (length: number): string => {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes)
    .map((b) => chars[b % chars.length])
    .join("");
};
const base64UrlEncode = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  const binary = String.fromCharCode(...bytes);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
};

const generateState = (): string =>
  base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)).buffer);

const generatePKCE = async () => {
  const codeVerifier = generateRandomString(43);
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(codeVerifier),
  );
  const challenge = base64UrlEncode(hash);
  return { codeVerifier, challenge };
};

const openBrowser = async (url: string): Promise<void> => {
  const platform = process.platform;
  if (platform === "darwin") {
    await new Promise<void>((resolve, reject) => {
      const proc = spawn("open", [url], { stdio: "ignore" });
      proc.once("error", reject);
      proc.once("close", () => resolve());
    });
    return;
  }
  if (platform === "win32") {
    await new Promise<void>((resolve, reject) => {
      const proc = spawn("cmd", ["/c", "start", "", url], {
        stdio: "ignore",
        windowsHide: true,
      });
      proc.once("error", reject);
      proc.once("close", () => resolve());
    });
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const proc = spawn("xdg-open", [url], { stdio: "ignore" });
    proc.once("error", reject);
    proc.once("close", () => resolve());
  });
};

const buildAuthorizeUrl = (pkce: PkceCodes, state: string): string => {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: ChatGPTClientID,
    redirect_uri: ChatGPTRedirectURI,
    scope: ChatGPTScopes,
    code_challenge: pkce.challenge,
    code_challenge_method: "S256",
    id_token_add_organizations: "true",
    codex_cli_simplified_flow: "true",
    state,
    originator: "opencode",
  });
  return `${ChatGPTAuthEndpoint}?${params.toString()}`;
};

const normalizeQueryValue = (value: string | string[] | undefined): string => {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
};

const parseJwtPayload = (token?: string): Record<string, unknown> | null => {
  if (!token) {
    return null;
  }

  const parts = token.split(".");
  if (parts.length < 2) {
    return null;
  }

  try {
    const payload = Buffer.from(parts[1], "base64url").toString("utf8");
    const parsed = JSON.parse(payload);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
};

// const getAuthFilePath = (): string => {
//   const platform = os.platform();
//   if (platform === "win32") {
//     const appdata =
//       process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
//     return path.join(appdata, "opencode", "auth.json");
//   }
//   if (platform === "darwin") {
//     return path.join(
//       os.homedir(),
//       "Library",
//       "Application Support",
//       "opencode",
//       "auth.json",
//     );
//   }
//   const xdgData =
//     process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share");
//   return path.join(xdgData, "opencode", "auth.json");
// };

// export const getChatGPTAuthFilePath = (): string => getAuthFilePath();

// const readAuthFile = async (): Promise<Record<string, unknown>> => {
//   const filepath = getAuthFilePath();
//   try {
//     const content = JSON.parse(await readFile(filepath, "utf8")) as unknown;
//     return content && typeof content === "object"
//       ? (content as Record<string, unknown>)
//       : {};
//   } catch {
//     return {};
//   }
// };

// const writeAuthFile = async (data: Record<string, unknown>): Promise<void> => {
//   const filepath = getAuthFilePath();
//   await writeFile(filepath, JSON.stringify(data, null, 2), {
//     encoding: "utf8",
//     mode: 0o600,
//   });
// };

// const ensureAuthDirectory = async (): Promise<void> => {
//   const filepath = getAuthFilePath();
//   await mkdir(path.dirname(filepath), { recursive: true, mode: 0o700 });
// };

// const persistProviderAuth = async (
//   providerId: string,
//   data: Record<string, unknown>,
// ): Promise<Record<string, unknown>> => {
//   const auth = await readAuthFile();
//   auth[providerId] = data;
//   await ensureAuthDirectory();
//   await writeAuthFile(auth);
//   return auth;
// };

const exchangeCodeForToken = async (
  code: string,
  codeVerifier: string,
): Promise<ChatGPTTokenResponse> => {
  const response = await fetch(ChatGPTTokenEndpoint, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: ChatGPTClientID,
      code,
      redirect_uri: ChatGPTRedirectURI,
      code_verifier: codeVerifier,
    }).toString(),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Token exchange failed (${response.status}): ${body}`);
  }

  return (await response.json()) as ChatGPTTokenResponse;
};

const buildCredentials = (
  tokenResponse: ChatGPTTokenResponse,
): ChatGPTCredentials => ({
  accessToken: tokenResponse.access_token,
  refreshToken: tokenResponse.refresh_token,
  expiresAt: Date.now() + tokenResponse.expires_in * 1000,
  scope: tokenResponse.scope,
  tokenType: tokenResponse.token_type,
  account: parseJwtPayload(tokenResponse.id_token),
  raw: tokenResponse,
});

const settlePendingAuthSession = () => {
  if (!pendingAuthSession) {
    return null;
  }

  const session = pendingAuthSession;
  clearTimeout(session.timeoutId);
  pendingAuthSession = null;
  return session;
};

// export const getChatGPTAuth = async (): Promise<Record<
//   string,
//   unknown
// > | null> => {
//   const auth = await readAuthFile();
//   const saved = auth[ChatGPTProviderID];
//   return saved && typeof saved === "object"
//     ? (saved as Record<string, unknown>)
//     : null;
// };

// export const saveProviderApiKey = async (
//   providerId: string,
//   apiKey: string,
// ): Promise<void> => {
//   await persistProviderAuth(providerId, {
//     type: "api",
//     key: apiKey,
//   });
// };

// export const removeProviderAuth = async (
//   providerId: string,
// ): Promise<boolean> => {
//   const auth = await readAuthFile();
//   if (!(providerId in auth)) {
//     return false;
//   }
//   delete auth[providerId];
//   await ensureAuthDirectory();
//   await writeAuthFile(auth);
//   return true;
// };

export const startChatGPTAuth = async (): Promise<ChatGPTAuthResult> => {
  if (pendingAuthSession) {
    throw new Error("ChatGPT auth is already in progress.");
  }

  const pkce = await generatePKCE();
  const state = generateState();
  const authUrl = buildAuthorizeUrl(pkce, state);
  // const filePath = getAuthFilePath();

  const resultPromise = new Promise<ChatGPTAuthResult>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      pendingAuthSession = null;
      reject(new Error("ChatGPT authentication timed out."));
    }, AuthTimeoutMs);

    pendingAuthSession = {
      codeVerifier: pkce.codeVerifier,
      state,
      resolve,
      reject,
      timeoutId,
    };
  });

  console.log(`\nGo to: ${authUrl}\n`);
  await openBrowser(authUrl);

  return resultPromise.then((result) => ({
    ...result,
    authUrl,
    // filePath,
  }));
};

export const handleChatGPTCallback = async (
  query: Record<string, string | string[] | undefined>,
): Promise<ChatGPTAuthResult> => {
  const session = pendingAuthSession;
  const callback = {
    code: normalizeQueryValue(query.code),
    error: normalizeQueryValue(query.error),
    errorDescription: normalizeQueryValue(query.error_description),
    state: normalizeQueryValue(query.state),
  };
  // const filePath = getAuthFilePath();

  if (!session) {
    const result = {
      ok: false,
      callback,
      // filePath,
      error: "No ChatGPT auth session is waiting for a callback.",
    } satisfies ChatGPTAuthResult;
    return result;
  }

  try {
    if (callback.error) {
      throw new Error(callback.errorDescription || callback.error);
    }

    if (!callback.code) {
      throw new Error("Missing authorization code in callback.");
    }

    if (!callback.state || callback.state !== session.state) {
      throw new Error("State mismatch while completing ChatGPT auth.");
    }

    const tokenResponse = await exchangeCodeForToken(
      callback.code,
      session.codeVerifier,
    );
    const credentials = buildCredentials(tokenResponse);

    const result = {
      ok: true,
      callback,
      credentials,
      // filePath,
    } satisfies ChatGPTAuthResult;

    settlePendingAuthSession()?.resolve(result);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const result = {
      ok: false,
      callback,
      // filePath,
      error: message,
    } satisfies ChatGPTAuthResult;

    settlePendingAuthSession()?.reject(new Error(message));
    return result;
  }
};
