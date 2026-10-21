import { config } from "./config.js";

export class ApiFail extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function call<T>(path: string, method: "GET" | "POST", body?: unknown): Promise<T> {
  const res = await fetch(config.serverUrl + path, {
    method,
    headers: { authorization: `Bearer ${config.token}`, ...(body !== undefined ? { "content-type": "application/json" } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const json = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) throw new ApiFail(res.status, json.error ?? `HTTP ${res.status}`);
  return json as T;
}

export type FileTask = {
  type: "file";
  fileId: string;
  kind: "pdf" | "docx" | "pptx" | "image";
  mime: string;
  name: string;
  sizeBytes: number;
  downloadUrl: string;
  uploadUrl: string;
};
export type PrintTask = {
  type: "print";
  jobId: string;
  code: string;
  attempt: number;
  files: { name: string; kind: string; pages: number; options: any; url: string }[];
};

export const api = {
  heartbeat: (b: unknown) => call("/api/agent/heartbeat", "POST", b),
  nextTask: () => call<{ task: FileTask | PrintTask | null }>("/api/agent/tasks", "GET"),
  fileResult: (id: string, b: { pages?: number; converted?: boolean; error?: string }) => call(`/api/agent/files/${id}/result`, "POST", b),
  jobReport: (id: string, b: unknown) => call(`/api/agent/jobs/${id}`, "POST", b),
};

export async function download(url: string): Promise<Buffer> {
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`Unduh gagal (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

/** Unggah ke URL bertanda tangan Supabase Storage (format sama dengan storage-js uploadToSignedUrl). */
export async function upload(url: string, data: Buffer | Uint8Array): Promise<void> {
  const form = new FormData();
  form.append("cacheControl", "3600");
  form.append("", new Blob([new Uint8Array(data)], { type: "application/pdf" }));
  const res = await fetch(url, { method: "PUT", body: form, headers: { "x-upsert": "true" }, signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`Unggah hasil konversi gagal (${res.status})`);
}
