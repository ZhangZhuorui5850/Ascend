import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, deleteSession } from "@/lib/auth";
import { assertSameOrigin } from "@/lib/request-auth";

export async function POST(request: Request) {
  await assertSameOrigin(request);

  const cookieStore = await cookies();
  deleteSession(cookieStore.get(SESSION_COOKIE)?.value);
  cookieStore.delete(SESSION_COOKIE);

  return NextResponse.json({ ok: true });
}
