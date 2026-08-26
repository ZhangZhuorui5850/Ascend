const { createHash } = require("node:crypto");

const CONNECTION_STATES = new Set(["connected", "offline", "auth-expired", "unpaired", "error"]);

class ConnectionError extends Error {
  constructor(kind, message, status = 0, details = null) {
    super(message);
    this.name = "ConnectionError";
    this.kind = CONNECTION_STATES.has(kind) ? kind : "error";
    this.status = status;
    this.details = details;
  }
}

function normalizeBaseUrl(value) {
  const input = String(value || "")
    .trim()
    .replace(/\/+$/, "");
  if (!input) throw new ConnectionError("unpaired", "请输入 Ascend 服务地址");
  let parsed;
  try {
    parsed = new URL(input);
  } catch {
    throw new ConnectionError("error", "Ascend 服务地址格式无效");
  }
  if (!new Set(["http:", "https:"]).has(parsed.protocol)) {
    throw new ConnectionError("error", "Ascend 服务地址需要使用 HTTP 或 HTTPS");
  }
  return parsed.origin + parsed.pathname.replace(/\/+$/, "");
}

function profileIdFor(baseUrl, environment) {
  return createHash("sha256")
    .update(`${normalizeBaseUrl(baseUrl)}\n${String(environment || "local")}`)
    .digest("hex")
    .slice(0, 20);
}

function profileNameFor(baseUrl) {
  const url = new URL(normalizeBaseUrl(baseUrl));
  if (new Set(["localhost", "127.0.0.1", "[::1]"]).has(url.hostname)) return `本地 Ascend · ${url.port || "80"}`;
  return url.hostname;
}

function classifyConnectionError(error) {
  if (error instanceof ConnectionError) return error.kind;
  const status = Number(error?.status || 0);
  if (status === 401 || status === 403) return "auth-expired";
  if (
    error instanceof TypeError ||
    /fetch|network|ECONN|ENOTFOUND|timed? ?out/i.test(String(error?.message || error))
  ) {
    return "offline";
  }
  return "error";
}

function statePresentation(kind, profileName = "Ascend") {
  if (kind === "connected") return { icon: "$(cloud)", label: profileName, tooltip: "Ascend 已连接" };
  if (kind === "offline") return { icon: "$(cloud-offline)", label: profileName, tooltip: "Ascend 服务器暂时不可用" };
  if (kind === "auth-expired") return { icon: "$(key)", label: "授权已失效", tooltip: "重新配对当前服务器" };
  if (kind === "error") return { icon: "$(warning)", label: "连接异常", tooltip: "查看 Ascend Practice 输出" };
  return { icon: "$(plug)", label: "连接 Ascend", tooltip: "连接 Ascend 服务器" };
}

module.exports = {
  ConnectionError,
  classifyConnectionError,
  normalizeBaseUrl,
  profileIdFor,
  profileNameFor,
  statePresentation,
};
