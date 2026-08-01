import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";

export function encryptPlannerSecret(value: string): string {
  const key = encryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptPlannerSecret(value: string): string {
  const [version, ivValue, tagValue, ciphertextValue] = value.split(".");
  if (version !== "v1" || !ivValue || !tagValue || ciphertextValue === undefined) {
    throw new Error("Push 凭据密文格式无效");
  }
  const decipher = createDecipheriv(ALGORITHM, encryptionKey(), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function plannerSecretHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function encryptionKey(): Buffer {
  const encoded = process.env.ASCEND_PUSH_ENCRYPTION_KEY?.trim();
  if (!encoded) throw new Error("ASCEND_PUSH_ENCRYPTION_KEY 未配置");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) throw new Error("ASCEND_PUSH_ENCRYPTION_KEY 需为 32 字节 Base64");
  return key;
}
