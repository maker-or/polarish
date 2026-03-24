import { consumeDesktopHandoff } from "@/lib/desktop-auth";
import { type NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    code?: string;
    state?: string;
  } | null;

  if (!body?.code || !body.state) {
    return NextResponse.json(
      { error: "Missing desktop auth code or state" },
      { status: 400 },
    );
  }

  const record = consumeDesktopHandoff(body.code);
  if (!record) {
    return NextResponse.json(
      { error: "Desktop handoff has expired or was already used" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    ok: true,
    accessToken: record.accessToken,
    desktopSecret: record.desktopSecret,
    desktopSessionId: record.desktopSessionId,
    state: body.state,
    tokenExpiresAt: record.tokenExpiresAt,
    user: record.user,
  });
}
