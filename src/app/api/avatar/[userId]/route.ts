import { createHash } from "node:crypto";
import { getDb } from "@/lib/db";
import { getAvatarImage } from "@/lib/repo/profile";
import { authErrorResponse, requireAccessContext } from "@/lib/request-auth";

/** If-None-Match 匹配：支持多值列表、弱校验前缀与通配符。 */
function etagMatches(header: string | null, etag: string): boolean {
  if (!header) return false;
  return header
    .split(",")
    .map((value) => value.trim())
    .some((value) => value === etag || value === `W/${etag}` || value === "*");
}

export async function GET(request: Request, context: { params: Promise<{ userId: string }> }) {
  try {
    // 任意已登录用户可取头像：账户菜单需要互相展示本设备各账号的头像
    await requireAccessContext(request);
    const { userId } = await context.params;
    const avatar = getAvatarImage(getDb(), userId);
    if (!avatar) return new Response("Not found", { status: 404 });

    const etag = `"${createHash("sha256").update(`${userId}:${avatar.updatedAt}`).digest("hex").slice(0, 32)}"`;
    const headers: Record<string, string> = {
      "content-type": avatar.mime || "application/octet-stream",
      "x-content-type-options": "nosniff",
      // 设备可保留多个账号会话；切换账号后不复用任何已鉴权头像响应。
      "cache-control": "private, no-store, max-age=0",
      etag,
    };
    if (etagMatches(request.headers.get("if-none-match"), etag)) {
      return new Response(null, { status: 304, headers });
    }
    return new Response(new Uint8Array(avatar.image), {
      headers: { ...headers, "content-length": String(avatar.image.byteLength) },
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
