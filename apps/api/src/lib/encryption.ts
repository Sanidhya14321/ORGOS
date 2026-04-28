import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const PREFIX = "enc:v1:";

function deriveKey(material: string): Buffer {
  return crypto.createHash("sha256").update(material).digest();
}

function getKeyMaterial(): string | null {
  const key = process.env.FIELD_ENCRYPTION_KEY?.trim();
  return key && key.length > 0 ? key : null;
}

export function encryptText(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const keyMaterial = getKeyMaterial();
  if (!keyMaterial) {
    return value;
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, deriveKey(keyMaterial), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptText(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  if (!value.startsWith(PREFIX)) {
    return value;
  }

  const keyMaterial = getKeyMaterial();
  if (!keyMaterial) {
    return null;
  }

  const encoded = value.slice(PREFIX.length).split(".");
  if (encoded.length !== 3) {
    return null;
  }

  const [ivPart, tagPart, payloadPart] = encoded;
  const decipher = crypto.createDecipheriv(ALGORITHM, deriveKey(keyMaterial), Buffer.from(ivPart, "base64url"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payloadPart, "base64url")),
    decipher.final()
  ]);

  return decrypted.toString("utf8");
}