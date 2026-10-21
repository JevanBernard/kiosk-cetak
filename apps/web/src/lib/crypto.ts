import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { CODE_ALPHABET } from "@kioskcetak/shared";

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const randomToken = (bytes = 24) => randomBytes(bytes).toString("base64url");
export const hmacHex = (secret: string, data: string) => createHmac("sha256", secret).update(data).digest("hex");

export function randomCode(len = 10): string {
  let out = "";
  for (let i = 0; i < len; i++) out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return out;
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
