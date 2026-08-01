import type Database from "better-sqlite3";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";
import type { WorkspaceScope } from "./access-context";

const ALGORITHM_CODE_MAX_BYTES = 64 * 1024;
const CODE_CIPHER = "aes-256-gcm";
const IV_BYTES = 12;

export type JudgeCodeKey = {
  key: Buffer;
  version: number;
};

type JudgeCodeEnv = {
  ASCEND_JUDGE_CODE_KEY?: string;
  ASCEND_JUDGE_CODE_KEY_VERSION?: string;
  ASCEND_JUDGE_CODE_PREVIOUS_KEYS_JSON?: string;
  ASCEND_JUDGE_CODE_RETENTION_DAYS?: string;
};

type CodeBlobRow = {
  id: string;
  ciphertext: Buffer;
  iv: Buffer;
  auth_tag: Buffer;
  key_version: number;
  sha256: string;
  byte_size: number;
  expires_at: string | null;
  deleted_at: string | null;
};

export function loadJudgeCodeKey(
  env: JudgeCodeEnv = process.env as JudgeCodeEnv,
): JudgeCodeKey | null {
  const encoded = env.ASCEND_JUDGE_CODE_KEY?.trim();
  if (!encoded) return null;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
    throw new Error("ASCEND_JUDGE_CODE_KEY 必须是标准 Base64");
  }
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32 || key.toString("base64") !== encoded) {
    throw new Error("ASCEND_JUDGE_CODE_KEY 解码后必须恰好为 32 字节");
  }
  const version = Number(env.ASCEND_JUDGE_CODE_KEY_VERSION || "1");
  if (!Number.isSafeInteger(version) || version < 1 || version > 1_000_000) {
    throw new Error("ASCEND_JUDGE_CODE_KEY_VERSION 必须是正整数");
  }
  return { key, version };
}

export function loadJudgeCodeKeys(
  env: JudgeCodeEnv = process.env as JudgeCodeEnv,
): JudgeCodeKey[] {
  const current = loadJudgeCodeKey(env);
  const rawPrevious = env.ASCEND_JUDGE_CODE_PREVIOUS_KEYS_JSON?.trim();
  if (!rawPrevious) return current ? [current] : [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawPrevious);
  } catch {
    throw new Error("ASCEND_JUDGE_CODE_PREVIOUS_KEYS_JSON 必须是 JSON 对象");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("ASCEND_JUDGE_CODE_PREVIOUS_KEYS_JSON 必须是 JSON 对象");
  }
  const entries = Object.entries(parsed as Record<string, unknown>);
  if (!entries.length) return current ? [current] : [];
  if (!current) throw new Error("配置历史代码密钥时必须同时配置当前代码密钥");
  if (entries.length > 10) throw new Error("历史代码密钥最多保留 10 个版本");
  const previous = entries.map(([rawVersion, rawKey]) => {
    const version = Number(rawVersion);
    if (!Number.isSafeInteger(version) || version < 1 || version > 1_000_000) {
      throw new Error("历史代码密钥版本必须是正整数");
    }
    if (version === current.version) throw new Error("历史代码密钥不能重复当前版本");
    if (typeof rawKey !== "string") throw new Error("历史代码密钥必须是 Base64 字符串");
    const loaded = loadJudgeCodeKey({
      ASCEND_JUDGE_CODE_KEY: rawKey,
      ASCEND_JUDGE_CODE_KEY_VERSION: String(version),
    });
    return loaded!;
  });
  return [current, ...previous];
}

export function getJudgeCodeRetentionDays(
  env: JudgeCodeEnv = process.env as JudgeCodeEnv,
): number {
  const value = Number(env.ASCEND_JUDGE_CODE_RETENTION_DAYS || "0");
  if (!Number.isSafeInteger(value) || value < 0 || value > 365) {
    throw new Error("ASCEND_JUDGE_CODE_RETENTION_DAYS 需在 0-365 之间");
  }
  return value;
}

export function saveAlgorithmCodeBlob(
  db: Database.Database,
  scope: WorkspaceScope,
  sourceCode: string,
  key: JudgeCodeKey,
  input: { expiresAt?: string | null } = {},
): { id: string; sha256: string; byteSize: number } {
  const bytes = Buffer.from(sourceCode, "utf8");
  if (!bytes.length) throw new Error("代码不能为空");
  if (bytes.length > ALGORITHM_CODE_MAX_BYTES) {
    throw new Error(`代码不能超过 ${ALGORITHM_CODE_MAX_BYTES / 1024} KiB`);
  }
  const id = randomUUID();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(CODE_CIPHER, key.key, iv);
  cipher.setAAD(codeAad(scope.workspaceId, id, key.version));
  const ciphertext = Buffer.concat([cipher.update(bytes), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  db.prepare(`
    INSERT INTO algorithm_code_blobs
      (id, workspace_id, ciphertext, iv, auth_tag, key_version, sha256, byte_size, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    scope.workspaceId,
    ciphertext,
    iv,
    authTag,
    key.version,
    sha256,
    bytes.length,
    input.expiresAt ?? null,
  );
  return { id, sha256, byteSize: bytes.length };
}

export function readAlgorithmCodeBlob(
  db: Database.Database,
  scope: WorkspaceScope,
  id: string,
  keys: JudgeCodeKey[],
): string {
  const row = db.prepare(`
    SELECT id, ciphertext, iv, auth_tag, key_version, sha256, byte_size, expires_at, deleted_at
    FROM algorithm_code_blobs
    WHERE workspace_id = ? AND id = ?
  `).get(scope.workspaceId, id) as CodeBlobRow | undefined;
  if (!row || row.deleted_at) throw new Error("代码不存在或已删除");
  const key = keys.find((candidate) => candidate.version === row.key_version);
  if (!key) throw new Error(`缺少代码加密密钥版本 ${row.key_version}`);
  const decipher = createDecipheriv(CODE_CIPHER, key.key, row.iv);
  decipher.setAAD(codeAad(scope.workspaceId, row.id, row.key_version));
  decipher.setAuthTag(row.auth_tag);
  let plaintext: Buffer;
  try {
    plaintext = Buffer.concat([decipher.update(row.ciphertext), decipher.final()]);
  } catch {
    throw new Error("代码密文认证失败");
  }
  if (
    plaintext.length !== row.byte_size
    || createHash("sha256").update(plaintext).digest("hex") !== row.sha256
  ) {
    throw new Error("代码完整性校验失败");
  }
  return plaintext.toString("utf8");
}

export function redactAlgorithmCodeBlob(
  db: Database.Database,
  scope: WorkspaceScope,
  id: string,
): void {
  db.prepare(`
    UPDATE algorithm_code_blobs
    SET ciphertext = X'', iv = X'', auth_tag = X'', deleted_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE workspace_id = ? AND id = ? AND deleted_at IS NULL
  `).run(scope.workspaceId, id);
}

export function calculateCodeExpiry(
  retentionDays: number,
  now: Date = new Date(),
): string | null {
  if (!retentionDays) return null;
  const expiresAt = new Date(now);
  expiresAt.setUTCDate(expiresAt.getUTCDate() + retentionDays);
  return expiresAt.toISOString();
}

export function redactExpiredAlgorithmCodeBlobs(
  db: Database.Database,
  now: Date = new Date(),
): number {
  const result = db.prepare(`
    UPDATE algorithm_code_blobs
    SET ciphertext = X'', iv = X'', auth_tag = X'',
        deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE deleted_at IS NULL AND expires_at IS NOT NULL AND expires_at <= ?
  `).run(now.toISOString());
  return result.changes;
}

function codeAad(workspaceId: string, id: string, version: number): Buffer {
  return Buffer.from(`ascend:algorithm-code:${workspaceId}:${id}:v${version}`, "utf8");
}
