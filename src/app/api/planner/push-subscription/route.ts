import { getDb } from "@/lib/db";
import { upsertPushSubscription } from "@/lib/repo/push-subscriptions";
import {
  assertSameOrigin,
  authErrorResponse,
  requireWorkspace,
} from "@/lib/request-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    await requireWorkspace(request);
    const publicKey = process.env.ASCEND_VAPID_PUBLIC_KEY?.trim();
    if (!publicKey) {
      return Response.json({ available: false }, {
        headers: { "cache-control": "private, no-store" },
      });
    }
    return Response.json({ available: true, publicKey }, {
      headers: { "cache-control": "private, no-store" },
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const access = await requireWorkspace(request);
    await assertSameOrigin(request);
    const body = await request.json() as {
      endpoint?: unknown;
      keys?: { p256dh?: unknown; auth?: unknown };
      deviceName?: unknown;
    };
    const entity = upsertPushSubscription(getDb(), access, {
      endpoint: String(body.endpoint ?? ""),
      keys: {
        p256dh: String(body.keys?.p256dh ?? ""),
        auth: String(body.keys?.auth ?? ""),
      },
      deviceName: String(body.deviceName ?? ""),
    });
    return Response.json({ ok: true, id: entity.id });
  } catch (error) {
    return authErrorResponse(error);
  }
}
