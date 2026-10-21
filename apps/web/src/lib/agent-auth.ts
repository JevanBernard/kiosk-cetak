import { db } from "./db";
import { sha256 } from "./crypto";
import { HttpError } from "./http";

/** Token agent berformat "<machineId>.<rahasia>"; hanya hash-nya yang tersimpan (NFR-SEC-03). */
export async function requireAgent(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const dot = token.indexOf(".");
  if (dot < 1) throw new HttpError(401, "Token agent tidak valid.");
  const machineId = token.slice(0, dot);
  if (!/^[0-9a-f-]{36}$/.test(machineId)) throw new HttpError(401, "Token agent tidak valid.");
  const { data: m } = await db().from("machines").select("*").eq("id", machineId).maybeSingle();
  if (!m || !m.agent_token_hash || m.agent_token_hash !== sha256(token)) {
    throw new HttpError(401, "Token agent tidak valid atau dicabut.");
  }
  return m as Record<string, any>;
}
