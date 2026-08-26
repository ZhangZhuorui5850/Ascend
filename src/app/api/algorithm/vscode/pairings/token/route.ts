import { readBoundedJson, vscodeApiError, vscodeJson } from "@/lib/algorithm-vscode-api";
import { getDb } from "@/lib/db";
import { exchangeAlgorithmDevicePairing } from "@/lib/repo/algorithm-device-pairings";
import { assertSameOrigin } from "@/lib/request-auth";

export async function POST(request: Request): Promise<Response> {
  try {
    await assertSameOrigin(request);
    const body = await readBoundedJson(request, 8 * 1024);
    const result = exchangeAlgorithmDevicePairing(getDb(), String(body.deviceCode || ""));
    return vscodeJson({ ok: true, ...result });
  } catch (error) {
    return vscodeApiError(error);
  }
}
