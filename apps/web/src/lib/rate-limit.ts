import { HttpError } from "./http";

// Pembatas sederhana dalam memori (per instance). Cukup untuk pilot 1 mesin;
// pindah ke tabel/Redis bila berjalan di banyak instance serverless.
const hits = new Map<string, number[]>();

export function rateLimit(key: string, max: number, windowMs: number, message = "Terlalu banyak percobaan. Tunggu sebentar.") {
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= max) throw new HttpError(429, message);
  arr.push(now);
  hits.set(key, arr);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
}
