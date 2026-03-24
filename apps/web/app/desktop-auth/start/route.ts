import {
  encodeDesktopState,
  isAllowedDesktopCallbackUrl,
} from "@/lib/desktop-auth";
import { getSignInUrl, withAuth } from "@workos-inc/authkit-nextjs";
import { type NextRequest, NextResponse } from "next/server";

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

  const session = await withAuth({ ensureSignedIn: false });

  if (session.user) {
    const completeUrl = new URL("/desktop-auth/complete", request.url);
    completeUrl.searchParams.set("callback_url", desktopCallbackUrl);
    completeUrl.searchParams.set("state", desktopState);
    return NextResponse.redirect(completeUrl, { status: 302 });
  }

  const callbackUrl = new URL("/callback", request.url);
  const authorizationUrl = await getSignInUrl({
    redirectUri: callbackUrl.toString(),
    state: encodeDesktopState({
      callbackUrl: desktopCallbackUrl,
      state: desktopState,
    }),
  });

  return NextResponse.redirect(authorizationUrl, { status: 302 });
}
