import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  calculateCodeExpiry,
  getJudgeCodeRetentionDays,
  loadJudgeCodeKey,
  loadJudgeCodeKeys,
  readAlgorithmCodeBlob,
  redactAlgorithmCodeBlob,
  redactExpiredAlgorithmCodeBlobs,
  saveAlgorithmCodeBlob,
} from "./algorithm-code-crypto";
import { createTestDb, createTestWorkspace } from "./repo/testing";

function testKey(version = 1) {
  return { key: randomBytes(32), version };
}

describe("algorithm code encryption", () => {
  it("encrypts source at rest and binds it to the workspace and key version", () => {
    const db = createTestDb();
    const mine = createTestWorkspace(db, { email: "code-mine@example.com" });
    const theirs = createTestWorkspace(db, { email: "code-theirs@example.com" });
    const key = testKey(3);
    const source = "#include <iostream>\nint main(){std::cout << 42;}";
    const saved = saveAlgorithmCodeBlob(db, mine, source, key);
    const raw = db.prepare(`
      SELECT ciphertext, sha256, byte_size FROM algorithm_code_blobs
      WHERE workspace_id = ? AND id = ?
    `).get(mine.workspaceId, saved.id) as {
      ciphertext: Buffer;
      sha256: string;
      byte_size: number;
    };

    expect(raw.ciphertext.toString("utf8")).not.toContain("iostream");
    expect(raw.sha256).toBe(saved.sha256);
    expect(raw.byte_size).toBe(Buffer.byteLength(source));
    expect(readAlgorithmCodeBlob(db, mine, saved.id, [key])).toBe(source);
    expect(() => readAlgorithmCodeBlob(db, theirs, saved.id, [key])).toThrow("不存在");
    expect(() => readAlgorithmCodeBlob(db, mine, saved.id, [testKey(4)])).toThrow("密钥版本 3");
  });

  it("rejects tampering and makes redaction irreversible through the repo", () => {
    const db = createTestDb();
    const scope = createTestWorkspace(db);
    const key = testKey();
    const saved = saveAlgorithmCodeBlob(db, scope, "print('safe')", key);
    db.prepare(`
      UPDATE algorithm_code_blobs SET ciphertext = X'00'
      WHERE workspace_id = ? AND id = ?
    `).run(scope.workspaceId, saved.id);
    expect(() => readAlgorithmCodeBlob(db, scope, saved.id, [key])).toThrow("密文认证失败");

    const redacted = saveAlgorithmCodeBlob(db, scope, "print('delete me')", key);
    redactAlgorithmCodeBlob(db, scope, redacted.id);
    expect(() => readAlgorithmCodeBlob(db, scope, redacted.id, [key])).toThrow("已删除");
  });

  it("validates environment key and conservative retention", () => {
    const encoded = Buffer.alloc(32, 7).toString("base64");
    expect(loadJudgeCodeKey({
      ASCEND_JUDGE_CODE_KEY: encoded,
      ASCEND_JUDGE_CODE_KEY_VERSION: "2",
    })).toMatchObject({ version: 2 });
    expect(loadJudgeCodeKey({})).toBeNull();
    expect(() => loadJudgeCodeKey({ ASCEND_JUDGE_CODE_KEY: "not base64" })).toThrow("Base64");
    expect(getJudgeCodeRetentionDays({})).toBe(0);
    expect(getJudgeCodeRetentionDays({ ASCEND_JUDGE_CODE_RETENTION_DAYS: "30" })).toBe(30);
    expect(() => getJudgeCodeRetentionDays({ ASCEND_JUDGE_CODE_RETENTION_DAYS: "366" })).toThrow("0-365");
    expect(calculateCodeExpiry(0, new Date("2026-07-26T00:00:00Z"))).toBeNull();
    expect(calculateCodeExpiry(7, new Date("2026-07-26T00:00:00Z"))).toBe("2026-08-02T00:00:00.000Z");
  });

  it("supports bounded explicit previous keys during key rotation", () => {
    const current = Buffer.alloc(32, 8).toString("base64");
    const previous = Buffer.alloc(32, 7).toString("base64");
    expect(loadJudgeCodeKeys({
      ASCEND_JUDGE_CODE_KEY: current,
      ASCEND_JUDGE_CODE_KEY_VERSION: "2",
      ASCEND_JUDGE_CODE_PREVIOUS_KEYS_JSON: JSON.stringify({ 1: previous }),
    }).map((key) => key.version)).toEqual([2, 1]);
    expect(() => loadJudgeCodeKeys({
      ASCEND_JUDGE_CODE_PREVIOUS_KEYS_JSON: JSON.stringify({ 1: previous }),
    })).toThrow("当前代码密钥");
    expect(() => loadJudgeCodeKeys({
      ASCEND_JUDGE_CODE_KEY: current,
      ASCEND_JUDGE_CODE_KEY_VERSION: "2",
      ASCEND_JUDGE_CODE_PREVIOUS_KEYS_JSON: JSON.stringify({ 2: previous }),
    })).toThrow("不能重复");
  });

  it("rejects empty or oversized source", () => {
    const db = createTestDb();
    const scope = createTestWorkspace(db);
    const key = testKey();
    expect(() => saveAlgorithmCodeBlob(db, scope, "", key)).toThrow("不能为空");
    expect(() => saveAlgorithmCodeBlob(db, scope, "x".repeat(65 * 1024), key)).toThrow("64 KiB");
  });

  it("redacts expired retained submissions during maintenance", () => {
    const db = createTestDb();
    const scope = createTestWorkspace(db);
    const key = testKey();
    const expired = saveAlgorithmCodeBlob(db, scope, "print('expired')", key, {
      expiresAt: "2026-07-25T00:00:00.000Z",
    });
    const future = saveAlgorithmCodeBlob(db, scope, "print('future')", key, {
      expiresAt: "2026-08-25T00:00:00.000Z",
    });
    expect(redactExpiredAlgorithmCodeBlobs(db, new Date("2026-07-26T00:00:00.000Z"))).toBe(1);
    expect(() => readAlgorithmCodeBlob(db, scope, expired.id, [key])).toThrow("已删除");
    expect(readAlgorithmCodeBlob(db, scope, future.id, [key])).toBe("print('future')");
  });
});
