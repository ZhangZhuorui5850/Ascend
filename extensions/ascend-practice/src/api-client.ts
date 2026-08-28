type ConnectionProfile = { baseUrl: string };

type ConnectionManagerLike = {
  environment: string;
  active(): ConnectionProfile | null;
  token(profile: ConnectionProfile): Promise<string | undefined>;
};

type ApiEnvelope<T> = {
  ok?: boolean;
  apiVersion?: number;
  data?: T;
  error?: string | { message?: string };
};

type JsonResponse<T> = {
  ok: boolean;
  status: number;
  payload: ApiEnvelope<T> & Record<string, unknown>;
};

type ConnectionErrorConstructor = new (
  kind: string,
  message: string,
  status?: number,
  details?: unknown,
) => Error;

export class AscendApi {
  constructor(
    private readonly connections: ConnectionManagerLike,
    private readonly ConnectionError: ConnectionErrorConstructor,
    private readonly fallbackBaseUrl: () => string,
  ) {}

  get baseUrl(): string {
    return this.connections.active()?.baseUrl || this.fallbackBaseUrl();
  }

  async request<T = Record<string, unknown>>(route: string, init: RequestInit = {}): Promise<T> {
    const profile = this.connections.active();
    if (!profile) throw new this.ConnectionError("unpaired", "请先连接 Ascend");
    const token = await this.connections.token(profile);
    if (!token) throw new this.ConnectionError("auth-expired", "当前连接缺少设备授权");
    const response = await this.fetchJson<T>(`${profile.baseUrl}${route}`, {
      ...init,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(init.headers || {}) },
    });
    if (response.status === 401 || response.status === 403) {
      throw new this.ConnectionError(
        "auth-expired",
        apiErrorMessage(response.payload, "设备授权已经失效"),
        response.status,
        response.payload,
      );
    }
    if (!response.ok || response.payload.ok !== true) {
      throw new this.ConnectionError(
        "error",
        apiErrorMessage(response.payload, `Ascend API ${response.status}`),
        response.status,
        response.payload,
      );
    }
    return (response.payload.apiVersion === 1 ? response.payload.data : response.payload) as T;
  }

  async startPairing(baseUrl: string, deviceName: string): Promise<Record<string, unknown>> {
    const response = await this.fetchJson<Record<string, unknown>>(`${baseUrl}/api/algorithm/vscode/pairings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deviceName, platform: process.platform, environment: this.connections.environment }),
    });
    return this.readPublicResponse(response);
  }

  async pollPairing(baseUrl: string, deviceCode: string): Promise<Record<string, unknown>> {
    const response = await this.fetchJson<Record<string, unknown>>(`${baseUrl}/api/algorithm/vscode/pairings/token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deviceCode }),
    });
    return this.readPublicResponse(response);
  }

  queue() { return this.request("/api/algorithm/v1/queue"); }
  problem(id: number) { return this.request(`/api/algorithm/v1/problems/${id}`); }
  saveDraft(input: unknown) { return this.put("/api/algorithm/v1/drafts", input); }
  capabilities() { return this.request("/api/algorithm/v1/capabilities"); }
  startSession(input: unknown) { return this.post("/api/algorithm/v1/sessions", input); }
  recordActivity(input: unknown) { return this.patch("/api/algorithm/v1/sessions", input); }
  abandonSession(input: unknown) {
    return this.request("/api/algorithm/v1/sessions", { method: "DELETE", body: JSON.stringify(input) });
  }
  finishSession(input: unknown) { return this.post("/api/algorithm/v1/sessions/finish", input); }
  revealHint(input: unknown) { return this.post("/api/algorithm/v1/hints", input); }
  submit(input: unknown) { return this.post("/api/algorithm/v1/submissions", input); }
  submission(id: number) { return this.request(`/api/algorithm/v1/submissions/${id}`); }
  createLibraryFolder(input: unknown) { return this.post("/api/algorithm/vscode/library/folders", input); }
  renameLibraryFolder(folderId: string, name: string) {
    return this.patch(`/api/algorithm/vscode/library/folders/${encodeURIComponent(folderId)}`, { name });
  }
  deleteLibraryFolder(folderId: string, promoteContents = false) {
    const suffix = promoteContents ? "?promote=1" : "";
    return this.request(`/api/algorithm/vscode/library/folders/${encodeURIComponent(folderId)}${suffix}`, { method: "DELETE" });
  }
  moveLibraryItem(input: unknown) { return this.put("/api/algorithm/vscode/library/move", input); }
  moveLibraryItems(entries: unknown[]) { return this.put("/api/algorithm/vscode/library/move", { entries }); }
  updateProblem(problemId: number, input: unknown) {
    return this.patch(`/api/algorithm/vscode/problems/${problemId}`, input);
  }
  importCpp(input: unknown) { return this.post("/api/algorithm/vscode/import/cpp", input); }

  private post<T = Record<string, unknown>>(route: string, input: unknown): Promise<T> {
    return this.request<T>(route, { method: "POST", body: JSON.stringify(input) });
  }

  private put<T = Record<string, unknown>>(route: string, input: unknown): Promise<T> {
    return this.request<T>(route, { method: "PUT", body: JSON.stringify(input) });
  }

  private patch<T = Record<string, unknown>>(route: string, input: unknown): Promise<T> {
    return this.request<T>(route, { method: "PATCH", body: JSON.stringify(input) });
  }

  private readPublicResponse<T>(response: JsonResponse<T>): Record<string, unknown> {
    if (!response.ok || response.payload.ok !== true) {
      throw new this.ConnectionError(
        "error",
        apiErrorMessage(response.payload, `Ascend API ${response.status}`),
        response.status,
        response.payload,
      );
    }
    return response.payload;
  }

  private async fetchJson<T>(url: string, init: RequestInit): Promise<JsonResponse<T>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      const payload = await response.json().catch(() => ({})) as JsonResponse<T>["payload"];
      return { ok: response.ok, status: response.status, payload };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new this.ConnectionError("offline", `无法连接 Ascend 服务器：${message}`);
    } finally {
      clearTimeout(timer);
    }
  }
}

function apiErrorMessage(payload: ApiEnvelope<unknown>, fallback: string): string {
  if (typeof payload.error === "string" && payload.error) return payload.error;
  if (typeof payload.error === "object" && typeof payload.error?.message === "string") return payload.error.message;
  return fallback;
}
