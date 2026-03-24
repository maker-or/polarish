import { decodeDesktopState } from "@/lib/desktop-auth";
import { getWorkOS, saveSession } from "@workos-inc/authkit-nextjs";
import { fetchQuery } from "convex/nextjs";
import { type NextRequest, NextResponse } from "next/server";
import { api } from "../../../../convex/_generated/api";

// biome-ignore lint/style/noNonNullAssertion: WORKOS_CLIENT_ID must be set at build time
const CLIENT_ID = process.env.WORKOS_CLIENT_ID!;

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const desktopState = decodeDesktopState(
    request.nextUrl.searchParams.get("state"),
  );

  if (!code) {
    return NextResponse.json(
      { error: "Missing authorization code" },
      { status: 400 },
    );
  }

  let user: Awaited<
    ReturnType<
      ReturnType<typeof getWorkOS>["userManagement"]["authenticateWithCode"]
    >
  >["user"];
  let accessToken: string;
  let refreshToken: string;
  let impersonator:
    | Awaited<
        ReturnType<
          ReturnType<typeof getWorkOS>["userManagement"]["authenticateWithCode"]
        >
      >["impersonator"]
    | undefined;

  try {
    const result = await getWorkOS().userManagement.authenticateWithCode({
      clientId: CLIENT_ID,
      code,
    });

    user = result.user;
    accessToken = result.accessToken;
    refreshToken = result.refreshToken;
    impersonator = result.impersonator;

    if (!accessToken || !refreshToken) {
      throw new Error("Authentication response is missing tokens");
    }
  } catch (err) {
    console.error("[callback] authenticateWithCode failed:", err);
    return NextResponse.json(
      {
        error: "Authentication failed",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }

  // Save the WorkOS session cookie — must happen before any redirect so the
  // browser receives the Set-Cookie header on the redirect response.
  await saveSession({ accessToken, refreshToken, user, impersonator }, request);

  if (desktopState) {
    const redirectUrl = new URL("/desktop-auth/complete", request.url);
    redirectUrl.searchParams.set("callback_url", desktopState.callbackUrl);
    redirectUrl.searchParams.set("state", desktopState.state);

    const response = NextResponse.redirect(redirectUrl, { status: 302 });
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Vary", "Cookie");
    return response;
  }

  // Determine where to send the user based on org membership.
  let destination = "/onboarding";
  try {
    const hasMembership = await fetchQuery(api.org.hasMembership, {
      userId: user.id,
    });
    if (hasMembership) {
      destination = "/";
    }
  } catch (err) {
    // If the membership check fails for any reason, send them to onboarding —
    // they can always be redirected away from there once membership is confirmed.
    console.error("[callback] membership check failed:", err);
  }

  const redirectUrl = new URL(destination, request.url);

  const response = NextResponse.redirect(redirectUrl, { status: 302 });

  // Prevent caching of the callback response.
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Vary", "Cookie");

  return response;
}
