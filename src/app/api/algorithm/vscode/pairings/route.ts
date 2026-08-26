import { createHash } from "node:crypto";
import { readBoundedJson, vscodeApiError, vscodeJson } from "@/lib/algorithm-vscode-api";
import { getDb } from "@/lib/db";
import { getPublicRequestOrigin } from "@/lib/public-origin";
import { createAlgorithmDevicePairing } from "@/lib/repo/algorithm-device-pairings";
import { assertSameOrigin } from "@/lib/request-auth";

export async function POST(request: Request): Promise<Response> {
  try {
    await assertSameOrigin(request);
    const body = await readBoundedJson(request, 8 * 1024);
    const created = createAlgorithmDevicePairing(getDb(), {
      deviceName: String(body.deviceName || "VS Code").slice(0, 60),
      platform: String(body.platform || "").slice(0, 60),
      environment: String(body.environment || "").slice(0, 120),
      requestFingerprint: requestFingerprint(request),
    });
    const origin = getPublicRequestOrigin(request);
    const verificationUri = `${origin}/practice/algorithms/connect`;
    return vscodeJson(
      {
        ok: true,
        deviceCode: created.deviceCode,
        userCode: created.pairing.userCode,
        verificationUri,
        verificationUriComplete: `${verificationUri}?code=${encodeURIComponent(created.pairing.userCode)}`,
        expiresAt: created.pairing.expiresAt,
        intervalSeconds: created.intervalSeconds,
      },
      201,
    );
  } catch (error) {
    return vscodeApiError(error);
  }
}

function requestFingerprint(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
  const address = forwarded || request.headers.get("x-real-ip") || "local";
  const agent = request.headers.get("user-agent") || "unknown";
  return createHash("sha256").update(`${address}\0${agent}`).digest("hex");
}
