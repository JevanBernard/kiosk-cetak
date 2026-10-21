"use client";

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

export async function api<T = any>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { ...(init?.json !== undefined ? { "content-type": "application/json" } : {}), ...init?.headers },
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? "Terjadi kesalahan.", data.code);
  return data as T;
}

export function fmtTime(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export const STATUS_LABEL: Record<string, string> = {
  DIBUAT: "Order dibuat",
  DIUPLOAD: "Memproses file",
  DIATUR: "Siap dibayar",
  MENUNGGU_BAYAR: "Menunggu pembayaran",
  LUNAS: "Lunas, menyiapkan cetak",
  MENCETAK: "Sedang mencetak",
  SELESAI: "Selesai, ambil di nampan",
  KEDALUWARSA: "Kedaluwarsa",
  DIBATALKAN: "Dibatalkan",
  GAGAL_CETAK: "Gagal cetak",
  CETAK_ULANG: "Mencoba cetak ulang",
  MENUNGGU_REFUND: "Menunggu pengembalian dana",
  DIREFUND: "Dana dikembalikan",
};
