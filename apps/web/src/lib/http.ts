import { NextResponse } from "next/server";

export class HttpError extends Error {
  constructor(public status: number, message: string, public extra?: Record<string, unknown>) {
    super(message);
  }
}

export const ok = (data: unknown = { ok: true }, init?: ResponseInit) => NextResponse.json(data, init);
export const fail = (status: number, message: string, extra?: Record<string, unknown>) =>
  NextResponse.json({ error: message, ...extra }, { status });

/** Membungkus handler: HttpError menjadi respons JSON, error lain menjadi 500 tanpa membocorkan detail. */
export function handler<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof HttpError) return fail(e.status, e.message, e.extra);
      console.error("[api]", e);
      return fail(500, "Terjadi kesalahan di server. Coba lagi sebentar.");
    }
  };
}

export async function readJson<T = Record<string, any>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, "Permintaan tidak valid.");
  }
}

export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}
