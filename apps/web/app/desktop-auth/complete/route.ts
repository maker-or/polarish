import {
  createDesktopHandoff,
  isAllowedDesktopCallbackUrl,
} from "@/lib/desktop-auth";
import { api } from "../../../../../convex/_generated/api";
import { fetchMutation } from "convex/nextjs";
import { unsealData } from "iron-session";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { createHash, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";

type WorkosSessionCookie = {
  accessToken: string;
  refreshToken: string;
  user: Record<string, unknown>;
};

function decodeAccessTokenClaims(token: string) {
  const payload = token.split(".")[1];
  if (!payload) {
    throw new Error("WorkOS access token is missing a payload.");
  }

  return JSON.parse(
    Buffer.from(payload, "base64url").toString("utf8"),
  ) as {
    exp?: number;
    org_id?: string;
  };
}

async function readWorkosSessionCookie() {
  const cookieName = process.env.WORKOS_COOKIE_NAME || "wos-session";
  const cookiePassword = process.env.WORKOS_COOKIE_PASSWORD;
  if (!cookiePassword) {
    throw new Error("WORKOS_COOKIE_PASSWORD is not configured.");
  }

  const cookie = (await cookies()).get(cookieName);
  if (!cookie) {
    return null;
  }

  return unsealData<WorkosSessionCookie>(cookie.value, {
    password: cookiePassword,
  });
}

function hashDesktopSecret(secret: string) {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

export async function GET(request: NextRequest) {
  const desktopCallbackUrl = request.nextUrl.searchParams.get("callback_url");
  const desktopState = request.nextUrl.searchParams.get("state");

  if (!desktopState || !desktopCallbackUrl) {
    return NextResponse.json(
      { error: "Missing desktop auth state" },
      { status: 400 },
    );
  }

  if (!isAllowedDesktopCallbackUrl(desktopCallbackUrl)) {
    return NextResponse.json(
      { error: "Invalid desktop callback URL" },
      { status: 400 },
    );
  }

  const session = await withAuth({ ensureSignedIn: true });
  const storedSession = await readWorkosSessionCookie();
  if (!storedSession?.refreshToken) {
    return NextResponse.json(
      { error: "WorkOS refresh token is unavailable for desktop auth" },
      { status: 500 },
    );
  }

  const desktopSessionId = randomUUID();
  const desktopSecret = randomUUID();
  const claims = decodeAccessTokenClaims(session.accessToken);

  await fetchMutation(api.users.createDesktopSession, {
    sessionId: desktopSessionId,
    userId: session.user.id,
    secretHash: hashDesktopSecret(desktopSecret),
    refreshToken: storedSession.refreshToken,
    organizationId: claims.org_id,
    lastAccessTokenExpiresAt: claims.exp ? claims.exp * 1000 : undefined,
    deviceName: "Hax Desktop",
    platform: request.headers.get("user-agent") ?? "desktop",
  });

  const code = createDesktopHandoff({
    accessToken: session.accessToken,
    desktopSecret,
    desktopSessionId,
    tokenExpiresAt: claims.exp ? claims.exp * 1000 : Date.now(),
    user: session.user as unknown as Record<string, unknown>,
  });

  const callbackUrl = new URL(desktopCallbackUrl);
  callbackUrl.searchParams.set("code", code);
  callbackUrl.searchParams.set("state", desktopState);

  return NextResponse.redirect(callbackUrl, { status: 302 });
}
