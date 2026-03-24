import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";
import { config as loadEnvFile } from "dotenv";
import { BrowserWindow, app, ipcMain, shell } from "electron";
import keytar from "keytar";
import { api } from "../../../convex/_generated/api";
import {
  setHaxAuthCallbackHandler,
  startAuthServer,
  stopAuthServer,
} from "../server";
import {

  startChatGPTAuth,
} from "../server/oauth/chatgpt";

type HaxAuthRecord = {
  accessToken?: string;
  accessTokenExpiresAt?: number;
  desktopSecret: string;
  desktopSessionId: string;
  receivedAt: number;
  state: string;
  user: Record<string, unknown>;
};

type HaxAuthMetadata = {
  accessToken?: string;
  accessTokenExpiresAt?: number;
  receivedAt: number;
  state: string;
  user: Record<string, unknown>;
};

type HaxAuthSecrets = {
  desktopSecret: string;
  desktopSessionId: string;
};

type openAI = {
  chatgpt_account_id: string
  chatgpt_plan_type: string
  chatgpt_subscription_active_start: string
  chatgpt_subscription_active_until: string
  chatgpt_subscription_last_checked: string
  chatgpt_user_id: string
}

type PendingHaxAuth = {
  reject: (reason?: unknown) => void;
  resolve: (value: {
    auth: HaxAuthRecord;
    callbackUrl: string;
  }) => void;
  state: string;
  timeoutId: ReturnType<typeof setTimeout>;
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.join(__dirname, "..");
const repoRoot = path.resolve(appRoot, "../..");
const rendererDist = path.join(appRoot, "dist");
const haxCallbackPath = "/hax-auth/callback";
const haxAuthTimeoutMs = 5 * 60 * 1000;
const haxAuthKeytarService = "dev.opencodetools.hax.desktop";
const haxAuthKeytarAccount = "hax-auth";

loadEnvFile({ path: path.join(repoRoot, ".env") });
loadEnvFile({ path: path.join(repoRoot, ".env.local"), override: true });

const devServerUrl = process.env.VITE_DEV_SERVER_URL;

let mainWindow: BrowserWindow | null = null;
let pendingHaxAuth: PendingHaxAuth | null = null;

function getWebBaseUrl() {
  const configuredCallbackUrl = process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI;
  if (!configuredCallbackUrl) {
    throw new Error("NEXT_PUBLIC_WORKOS_REDIRECT_URI is not configured.");
  }

  return new URL(configuredCallbackUrl);
}

function getHaxDesktopCallbackUrl() {
  return new URL(
    haxCallbackPath,
    `http://127.0.0.1:${process.env.HAX_DESKTOP_CALLBACK_PORT || "1455"}`,
  );
}

function getHaxAuthFilePath() {
  return path.join(app.getPath("userData"), "hax-auth.json");
}

async function readHaxAuthMetadata() {
  try {
    return JSON.parse(
      await readFile(getHaxAuthFilePath(), "utf8"),
    ) as Partial<HaxAuthRecord>;
  } catch {
    return null;
  }
}

async function readHaxAuth() {
  try {
    const metadata = (await readHaxAuthMetadata()) ?? {};
    const secrets = await readHaxAuthSecrets();

    if (!secrets && metadata.desktopSecret && metadata.desktopSessionId) {
      const legacySecrets = {
        desktopSecret: metadata.desktopSecret,
        desktopSessionId: metadata.desktopSessionId,
      };
      await writeHaxAuthSecrets(legacySecrets);
      await writeHaxAuthMetadata({
        accessToken: metadata.accessToken,
        accessTokenExpiresAt: metadata.accessTokenExpiresAt,
        receivedAt: metadata.receivedAt ?? Date.now(),
        state: metadata.state ?? "",
        user: metadata.user ?? {},
      });
      return {
        accessToken: metadata.accessToken,
        accessTokenExpiresAt: metadata.accessTokenExpiresAt,
        receivedAt: metadata.receivedAt ?? Date.now(),
        state: metadata.state ?? "",
        user: metadata.user ?? {},
        ...legacySecrets,
      };
    }

    if (!secrets) {
      return null;
    }

    return {
      accessToken: metadata.accessToken,
      accessTokenExpiresAt: metadata.accessTokenExpiresAt,
      receivedAt:
        typeof metadata.receivedAt === "number" ? metadata.receivedAt : Date.now(),
      state: typeof metadata.state === "string" ? metadata.state : "",
      user:
        metadata.user && typeof metadata.user === "object" ? metadata.user : {},
      ...secrets,
    } satisfies HaxAuthRecord;
  } catch {
    const secrets = await readHaxAuthSecrets();
    if (!secrets) {
      return null;
    }

    return {
      accessToken: undefined,
      accessTokenExpiresAt: undefined,
      receivedAt: Date.now(),
      state: "",
      user: {},
      ...secrets,
    } satisfies HaxAuthRecord;
  }
}

async function writeHaxAuth(record: HaxAuthRecord) {
  await Promise.all([
    writeHaxAuthSecrets({
      desktopSecret: record.desktopSecret,
      desktopSessionId: record.desktopSessionId,
    }),
    writeHaxAuthMetadata({
      accessToken: record.accessToken,
      accessTokenExpiresAt: record.accessTokenExpiresAt,
      receivedAt: record.receivedAt,
      state: record.state,
      user: record.user,
    }),
  ]);
}

async function clearHaxAuth() {
  try {
    await Promise.all([
      rm(getHaxAuthFilePath(), { force: true }),
      keytar.deletePassword(haxAuthKeytarService, haxAuthKeytarAccount),
    ]);
  } catch (error) {
    throw new Error(
      `Failed to clear the local Hax session: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

async function readHaxAuthSecrets() {
  const raw = await keytar.getPassword(
    haxAuthKeytarService,
    haxAuthKeytarAccount,
  );
  if (!raw) {
    return null;
  }

  const parsed = JSON.parse(raw) as Partial<HaxAuthSecrets>;
  if (!parsed.desktopSecret || !parsed.desktopSessionId) {
    return null;
  }

  return {
    desktopSecret: parsed.desktopSecret,
    desktopSessionId: parsed.desktopSessionId,
  } satisfies HaxAuthSecrets;
}

async function writeHaxAuthSecrets(secrets: HaxAuthSecrets) {
  await keytar.setPassword(
    haxAuthKeytarService,
    haxAuthKeytarAccount,
    JSON.stringify(secrets),
  );
}

async function writeHaxAuthMetadata(metadata: HaxAuthMetadata) {
  const filePath = getHaxAuthFilePath();
  await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  await writeFile(filePath, JSON.stringify(metadata, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  });
}

function sanitizeHaxAuthRecord(record: HaxAuthRecord | null) {
  if (!record) {
    return null;
  }

  return {
    accessTokenExpiresAt: record.accessTokenExpiresAt,
    receivedAt: record.receivedAt,
    state: record.state,
    user: record.user,
  };
}

function decodeJwtExpiry(token: string) {
  const payload = token.split(".")[1];
  if (!payload) {
    return null;
  }

  try {
    const claims = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as {
      exp?: number;
    };
    return claims.exp ? claims.exp * 1000 : null;
  } catch {
    return null;
  }
}

function hasUsableAccessToken(record: HaxAuthRecord) {
  if (!record.accessToken || !record.accessTokenExpiresAt) {
    return false;
  }

  return Date.now() + 5 * 60 * 1000 < record.accessTokenExpiresAt;
}

async function refreshDesktopAccessToken(record: HaxAuthRecord) {
  const refreshUrl = new URL("/desktop-auth/token", getWebBaseUrl());
  const response = await fetch(refreshUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      desktopSessionId: record.desktopSessionId,
      desktopSecret: record.desktopSecret,
    }),
  });

  const result = (await response.json().catch(() => null)) as {
    accessToken?: string;
    error?: string;
    expiresAt?: number | null;
  } | null;

  if (!response.ok || !result?.accessToken) {
    throw new Error(
      result?.error ?? "Failed to refresh the desktop access token.",
    );
  }

  const accessTokenExpiresAt =
    result.expiresAt ?? decodeJwtExpiry(result.accessToken) ?? undefined;
  const nextRecord: HaxAuthRecord = {
    ...record,
    accessToken: result.accessToken,
    accessTokenExpiresAt,
    receivedAt: Date.now(),
  };

  await writeHaxAuth(nextRecord);
  return nextRecord;
}

async function getValidAccessToken(forceRefresh = false) {
  const [metadata, secrets] = await Promise.all([
    readHaxAuthMetadata(),
    readHaxAuthSecrets(),
  ]);

  if (!secrets?.desktopSessionId || !secrets.desktopSecret) {
    throw new Error("Sign in with Hax before connecting ChatGPT.");
  }

  const record: HaxAuthRecord = {
    accessToken: metadata?.accessToken,
    accessTokenExpiresAt: metadata?.accessTokenExpiresAt,
    receivedAt:
      typeof metadata?.receivedAt === "number" ? metadata.receivedAt : Date.now(),
    state: typeof metadata?.state === "string" ? metadata.state : "",
    user:
      metadata?.user && typeof metadata.user === "object" ? metadata.user : {},
    ...secrets,
  };

  if (!forceRefresh && hasUsableAccessToken(record)) {
    return record.accessToken!;
  }

  return (await refreshDesktopAccessToken(record)).accessToken!;
}

function isExpiredAuthError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("InvalidAuthHeader") || message.includes("Token expired")
  );
}

function generateAuthState() {
  return crypto.randomUUID();
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#f4efe7",
    titleBarStyle: "customButtonsOnHover",
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (devServerUrl) {
    void mainWindow.loadURL(devServerUrl);
    return;
  }

  void mainWindow.loadFile(path.join(rendererDist, "index.html"));
}

async function getHaxAuthSnapshot() {
  return {
    filePath: getHaxAuthFilePath(),
    storedAuth: sanitizeHaxAuthRecord(await readHaxAuth()),
  };
}

function getConvexUrl() {
  const convexUrl = process.env.VITE_CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    throw new Error("Convex URL is not configured.");
  }

  return convexUrl;
}

async function storeChatGPTCredentialInConvex(input: {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  token_id: string | undefined;
  account: Record<string, unknown> | null;
  provider_subscriptionType: string ;
  provider_user_id: string;
  provider_account_id: string;
  provider_sub_active_start: string;
  provider_sub_active_until: string;
}) {
  const convex = new ConvexHttpClient(getConvexUrl());
  const runMutation = async (authToken: string) => {
    convex.setAuth(authToken);
    return convex.mutation(api.aicrendital.createCredential, {
      provider: "openai-codex",
      provider_subscriptionType: input.provider_subscriptionType,
      provider_user_id: input.provider_user_id,
      provider_account_id: input.provider_account_id,
      provider_sub_active_start: input.provider_sub_active_start,
      provider_sub_active_until: input.provider_sub_active_until,
      accessToken: input.accessToken,
      token_id: input.token_id,
      refresh_token: input.refreshToken,
      expiresAt: input.expiresAt,
    });
  };

  try {
    return await runMutation(await getValidAccessToken());
  } catch (error) {
    if (!isExpiredAuthError(error)) {
      throw error;
    }

    return await runMutation(await getValidAccessToken(true));
  }
}

function sanitizeChatGPTResult(result: Awaited<ReturnType<typeof startChatGPTAuth>>) {
  return {
    ok: result.ok,
    authUrl: result.authUrl,
    callback: result.callback,
    // filePath: result.filePath,
    error: result.error,
  };
}

function focusMainWindow() {
  if (!mainWindow) {
    createMainWindow();
  }

  if (!mainWindow) {
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  if (!mainWindow.isVisible()) {
    mainWindow.show();
  }

  mainWindow.show();
  mainWindow.moveTop();
  mainWindow.focus();

  if (process.platform === "darwin") {
    app.focus({ steal: true });
  } else {
    app.focus();
  }
}

function settlePendingHaxAuth() {
  if (!pendingHaxAuth) {
    return null;
  }

  const current = pendingHaxAuth;
  clearTimeout(current.timeoutId);
  pendingHaxAuth = null;
  return current;
}

async function exchangeDesktopAuthCode(code: string, state: string) {
  const exchangeUrl = new URL("/desktop-auth/exchange", getWebBaseUrl());
  const response = await fetch(exchangeUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ code, state }),
  });

  const result = (await response.json().catch(() => null)) as {
    accessToken?: string;
    desktopSecret?: string;
    desktopSessionId?: string;
    error?: string;
    tokenExpiresAt?: number;
    user?: Record<string, unknown>;
  } | null;

  if (
    !response.ok ||
    !result?.desktopSecret ||
    !result.desktopSessionId ||
    !result.user
  ) {
    throw new Error(result?.error ?? "Desktop auth exchange failed.");
  }

  const record: HaxAuthRecord = {
    accessToken: result.accessToken,
    accessTokenExpiresAt:
      result.tokenExpiresAt ??
      (result.accessToken ? decodeJwtExpiry(result.accessToken) ?? undefined : undefined),
    desktopSecret: result.desktopSecret,
    desktopSessionId: result.desktopSessionId,
    receivedAt: Date.now(),
    state,
    user: result.user,
  };

  await writeHaxAuth(record);
  return record;
}

async function completeHaxDesktopAuth(code: string, state: string) {
  if (!pendingHaxAuth) {
    throw new Error("No Hax auth request is waiting for a callback.");
  }

  if (state !== pendingHaxAuth.state) {
    throw new Error("Desktop auth state mismatch.");
  }

  const auth = await exchangeDesktopAuthCode(code, state);
  settlePendingHaxAuth()?.resolve({
    auth,
    callbackUrl: getHaxDesktopCallbackUrl().toString(),
  });
  focusMainWindow();
}

async function startHaxDesktopAuth() {
  if (pendingHaxAuth) {
    throw new Error("Hax auth is already in progress.");
  }

  const state = generateAuthState();
  const startUrl = new URL("/desktop-auth/start", getWebBaseUrl());
  startUrl.searchParams.set(
    "callback_url",
    getHaxDesktopCallbackUrl().toString(),
  );
  startUrl.searchParams.set("state", state);

  const resultPromise = new Promise<{
    auth: HaxAuthRecord;
    callbackUrl: string;
  }>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      pendingHaxAuth = null;
      reject(new Error("Hax auth timed out."));
    }, haxAuthTimeoutMs);

    pendingHaxAuth = {
      resolve,
      reject,
      state,
      timeoutId,
    };
  });

  await shell.openExternal(startUrl.toString());

  return resultPromise.then(async (result) => ({
    callbackUrl: result.callbackUrl,
    ok: true,
    startUrl: startUrl.toString(),
    ...(await getHaxAuthSnapshot()),
  }));
}

app.whenReady().then(() => {
  void startAuthServer();
  setHaxAuthCallbackHandler(async (query) => {
    try {
      const code = query.code;
      const state = query.state;

      if (!code || !state) {
        throw new Error("Desktop auth callback is missing code or state.");
      }

      await completeHaxDesktopAuth(code, state);

      return {
        detail: "You can go back to the desktop app now.",
        ok: true,
        payload: query,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      settlePendingHaxAuth()?.reject(new Error(message));
      focusMainWindow();

      return {
        detail: message,
        ok: false,
        payload: query,
      };
    }
  });

  ipcMain.handle("chatgpt:sign-in", async () => {
    try {
      const result = await startChatGPTAuth();
      let storageError: string | undefined;

      if (result.ok && result.credentials) {
        try {
          const pro = result.credentials.account?.["https://api.openai.com/auth"] as openAI
          await storeChatGPTCredentialInConvex({
            accessToken: result.credentials.accessToken,
            refreshToken: result.credentials.refreshToken,
            expiresAt: result.credentials.expiresAt,
            account: result.credentials.account,
            token_id:result.credentials.raw?.id_token,
            provider_subscriptionType:pro.chatgpt_plan_type,
            provider_user_id: pro.chatgpt_user_id,
            provider_account_id: pro.chatgpt_account_id,
            provider_sub_active_start: pro.chatgpt_subscription_active_start,
            provider_sub_active_until: pro.chatgpt_subscription_active_until,

          });
        } catch (error) {
          storageError = error instanceof Error ? error.message : String(error);
          console.error("Failed to store ChatGPT credential in Convex:", error);
        }
      }

      return {
        ...sanitizeChatGPTResult(result),
        storageError,
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  ipcMain.handle("hax:sign-in", async () => {
    try {
      return await startHaxDesktopAuth();
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        ...(await getHaxAuthSnapshot()),
      };
    }
  });

  ipcMain.handle("hax:get-auth", async () => ({
    ok: true,
    ...(await getHaxAuthSnapshot()),
  }));

  ipcMain.handle("hax:sign-out", async () => {
    try {
      await clearHaxAuth();
      return {
        ok: true,
        ...(await getHaxAuthSnapshot()),
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        ...(await getHaxAuthSnapshot()),
      };
    }
  });

  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }

  mainWindow = null;
});

app.on("before-quit", () => {
  ipcMain.removeHandler("chatgpt:sign-in");
  ipcMain.removeHandler("chatgpt:get-auth");
  ipcMain.removeHandler("hax:sign-in");
  ipcMain.removeHandler("hax:get-auth");
  ipcMain.removeHandler("hax:sign-out");
  setHaxAuthCallbackHandler(null);
  void stopAuthServer();
});
