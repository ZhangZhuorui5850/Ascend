const test = require("node:test");
const assert = require("node:assert/strict");
const {
  ConnectionError,
  classifyConnectionError,
  normalizeBaseUrl,
  profileIdFor,
  profileNameFor,
  statePresentation,
} = require("./connections");

test("normalizes server URLs and creates stable environment-scoped profile IDs", () => {
  assert.equal(normalizeBaseUrl(" https://ascend.example.com/// "), "https://ascend.example.com");
  assert.equal(
    profileIdFor("https://ascend.example.com/", "wsl:Ubuntu"),
    profileIdFor("https://ascend.example.com", "wsl:Ubuntu"),
  );
  assert.notEqual(
    profileIdFor("https://ascend.example.com", "wsl:Ubuntu"),
    profileIdFor("https://ascend.example.com", "win32"),
  );
  assert.equal(profileNameFor("http://127.0.0.1:3100"), "本地 Ascend · 3100");
});

test("classifies stored credential, network, and service errors", () => {
  assert.equal(classifyConnectionError(new ConnectionError("unpaired", "missing")), "unpaired");
  assert.equal(classifyConnectionError(new ConnectionError("auth-expired", "expired", 401)), "auth-expired");
  assert.equal(classifyConnectionError(new TypeError("fetch failed")), "offline");
  assert.equal(classifyConnectionError(new Error("bad response")), "error");
  assert.match(statePresentation("offline", "本地 Ascend").tooltip, /暂时不可用/);
});

test("rejects unsupported connection URLs", () => {
  assert.throws(() => normalizeBaseUrl("file:///tmp/ascend"), /HTTP/);
  assert.throws(() => normalizeBaseUrl(""), /服务地址/);
});
