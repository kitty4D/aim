import { getStore } from "@netlify/blobs";

export type AimRole = "admin" | "member" | "read-only";

export interface AimToken {
  name: string;
  role: AimRole;
  created_at: string;
}

export interface ETagEntry {
  etag: string;
  body: unknown;
  cached_at: string;
}

const TOKEN_STORE = "aim-tokens";
const ETAG_STORE = "aim-etag-cache";
const PULSE_STORE = "aim-pulse";
const PULSE_KEY = "rooms";

const tokens = () => getStore({ name: TOKEN_STORE, consistency: "strong" });
const etags = () => getStore({ name: ETAG_STORE });
const pulse = () => getStore({ name: PULSE_STORE, consistency: "strong" });

export interface PulseMap {
  rooms: Record<string, { sha: string; at: string }>;
  updated_at: string;
}

export async function getToken(token: string): Promise<AimToken | null> {
  const data = (await tokens().get(token, { type: "json" })) as AimToken | null;
  return data ?? null;
}

export async function setToken(token: string, meta: AimToken): Promise<void> {
  await tokens().setJSON(token, meta);
}

export async function deleteToken(token: string): Promise<void> {
  await tokens().delete(token);
}

export async function listTokens(): Promise<Array<{ token: string; meta: AimToken }>> {
  const result: Array<{ token: string; meta: AimToken }> = [];
  const list = await tokens().list();
  for (const blob of list.blobs) {
    const meta = (await tokens().get(blob.key, { type: "json" })) as AimToken | null;
    if (meta) result.push({ token: blob.key, meta });
  }
  return result;
}

export async function getEtag(key: string): Promise<ETagEntry | null> {
  return ((await etags().get(key, { type: "json" })) as ETagEntry | null) ?? null;
}

export async function setEtag(key: string, etag: string, body: unknown): Promise<void> {
  const entry: ETagEntry = {
    etag,
    body,
    cached_at: new Date().toISOString(),
  };
  await etags().setJSON(key, entry);
}

export async function readPulse(): Promise<PulseMap> {
  const data = (await pulse().get(PULSE_KEY, { type: "json" })) as PulseMap | null;
  return data ?? { rooms: {}, updated_at: new Date(0).toISOString() };
}

export async function bumpPulse(room: string, sha: string): Promise<PulseMap> {
  const cur = await readPulse();
  const at = new Date().toISOString();
  const next: PulseMap = {
    rooms: { ...cur.rooms, [room]: { sha, at } },
    updated_at: at,
  };
  await pulse().setJSON(PULSE_KEY, next);
  return next;
}
