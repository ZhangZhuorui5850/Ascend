import { todayKey } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { AlgorithmLibraryPackageError, buildAlgorithmLibraryPackage } from "@/lib/repo/algorithm-library-package";
import { assertSameOrigin, authErrorResponse, requireWorkspace } from "@/lib/request-auth";

const MAX_REQUEST_BYTES = 64 * 1024;

export async function POST(request: Request): Promise<Response> {
  try {
    const access = await requireWorkspace(request);
    await assertSameOrigin(request);
    const requestLength = Number(request.headers.get("content-length") || 0);
    if (requestLength > MAX_REQUEST_BYTES) {
      throw new AlgorithmLibraryPackageError("导出请求过大");
    }
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > MAX_REQUEST_BYTES) {
      throw new AlgorithmLibraryPackageError("导出请求过大");
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new AlgorithmLibraryPackageError("导出请求格式无效");
    }
    const body =
      parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
    const database = getDb();
    const pkg = database.transaction(() =>
      buildAlgorithmLibraryPackage(database, access, {
        problemIds: Array.isArray(body.problemIds) ? body.problemIds.map(Number) : [],
        name: typeof body.name === "string" ? body.name : "",
        description: typeof body.description === "string" ? body.description : "",
      }),
    )();
    const json = `${JSON.stringify(pkg, null, 2)}\n`;
    return new Response(json, {
      headers: {
        "content-type": "application/vnd.ascend.algorithm-library+json; charset=utf-8",
        "content-disposition": `attachment; filename="ascend-algorithm-library-${todayKey()}.ascend-algorithms.json"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
