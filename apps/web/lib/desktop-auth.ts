type DesktopStatePayload = {
  callbackUrl: string;
  flow: "desktop";
  state: string;
};

type DesktopHandoffRecord = {
  accessToken: string;
  createdAt: number;
  desktopSecret: string;
  desktopSessionId: string;
  expiresAt: number;
  tokenExpiresAt: number;
  user: Record<string, unknown>;
};

const handoffStore = new Map<string, DesktopHandoffRecord>();
const desktopHandoffTtlMs = 60 * 1000;

function cleanupExpiredHandoffs() {
  const now = Date.now();

  for (const [code, record] of handoffStore.entries()) {
    if (record.expiresAt <= now) {
      handoffStore.delete(code);
    }
  }
}

export function encodeDesktopState({
  callbackUrl,
  state,
}: {
  callbackUrl: string;
  state: string;
}) {
  const payload: DesktopStatePayload = {
    callbackUrl,
    flow: "desktop",
    state,
  };

  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

export function decodeDesktopState(encodedState?: string | null) {
  if (!encodedState) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(encodedState, "base64url").toString("utf8"),
    ) as DesktopStatePayload;

    if (parsed.flow !== "desktop" || !parsed.state || !parsed.callbackUrl) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function isAllowedDesktopCallbackUrl(callbackUrl: string) {
  try {
    const url = new URL(callbackUrl);
    return (
      url.protocol === "http:" &&
      (url.hostname === "127.0.0.1" || url.hostname === "localhost")
    );
  } catch {
    return false;
  }
}

export function createDesktopHandoff(input: {
  accessToken: string;
  desktopSecret: string;
  desktopSessionId: string;
  tokenExpiresAt: number;
  user: Record<string, unknown>;
}) {
  cleanupExpiredHandoffs();

  const code = crypto.randomUUID();
  const createdAt = Date.now();

  handoffStore.set(code, {
    ...input,
    createdAt,
    expiresAt: createdAt + desktopHandoffTtlMs,
  });

  return code;
}

export function consumeDesktopHandoff(code: string) {
  cleanupExpiredHandoffs();

  const record = handoffStore.get(code);
  if (!record) {
    return null;
  }

  handoffStore.delete(code);
  return record;
}
