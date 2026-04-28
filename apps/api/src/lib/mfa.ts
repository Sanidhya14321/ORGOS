import crypto from "node:crypto";
import { toDataURL } from "qrcode";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(bytes: Uint8Array): string {
  let value = 0;
  let bits = 0;
  let output = "";

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  while (output.length % 8 !== 0) {
    output += "=";
  }

  return output;
}

function base32Decode(secret: string): Uint8Array {
  const clean = secret.replace(/=+$/g, "").toUpperCase();
  let value = 0;
  let bits = 0;
  const output: number[] = [];

  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) {
      continue;
    }

    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Uint8Array.from(output);
}

function hotp(secret: string, counter: number): number {
  const key = base32Decode(secret);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));

  const hmac = crypto.createHmac("sha1", key).update(buffer).digest();
  const offset = (hmac[hmac.length - 1] ?? 0) & 0x0f;
  const byte0 = hmac[offset] ?? 0;
  const byte1 = hmac[offset + 1] ?? 0;
  const byte2 = hmac[offset + 2] ?? 0;
  const byte3 = hmac[offset + 3] ?? 0;
  const binary =
    ((byte0 & 0x7f) << 24) |
    ((byte1 & 0xff) << 16) |
    ((byte2 & 0xff) << 8) |
    (byte3 & 0xff);

  return binary % 1_000_000;
}

export function generateMfaSecret(): string {
  return base32Encode(crypto.randomBytes(20));
}

export function buildOtpauthUri(params: { secret: string; issuer: string; accountName: string }): string {
  const label = encodeURIComponent(`${params.issuer}:${params.accountName}`);
  const issuer = encodeURIComponent(params.issuer);
  return `otpauth://totp/${label}?secret=${params.secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
}

export async function buildMfaQrCodeDataUrl(otpauthUri: string): Promise<string> {
  return toDataURL(otpauthUri, { margin: 1, scale: 6 });
}

export function verifyTotp(secret: string, code: string, window = 1): boolean {
  const normalized = code.replace(/\s+/g, "").trim();
  if (!/^\d{6}$/.test(normalized)) {
    return false;
  }

  const target = Number.parseInt(normalized, 10);
  const counter = Math.floor(Date.now() / 30_000);

  for (let offset = -window; offset <= window; offset += 1) {
    const candidate = hotp(secret, counter + offset);
    if (candidate === target) {
      return true;
    }
  }

  return false;
}