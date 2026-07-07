import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, authenticateUser, createSession } from "@/lib/auth";
import { assertSameOrigin } from "@/lib/request-auth";

export async function POST(request: Request) {
  await assertSameOrigin(request);

  const body = await request.json();
  const user = authenticateUser(String(body.email || ""), String(body.password || ""));
  if (!user) {
    return Response.json({ error: "邮箱或密码不正确" }, { status: 401 });
  }

  const session = createSession({
    userId: user.id,
    userAgent: request.headers.get("user-agent") || "",
    ipHint: request.headers.get("x-forwarded-for") || "",
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, session.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: session.expiresAt,
  });

  return NextResponse.json({ user });
}
