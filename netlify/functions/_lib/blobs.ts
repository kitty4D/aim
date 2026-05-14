import { getStore } from "@netlify/blobs";

export type AimRole = "admin" | "moderator" | "member" | "read-only";

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
const PRESENCE_STORE = "aim-presence";
const REACTIONS_STORE = "aim-reactions";
const PULSE_KEY = "rooms";
const PRESENCE_KEY = "map";
const REACTIONS_KEY = "map";
export const PRESENCE_TTL_MS = 60_000;
export const PRESENCE_HEARTBEAT_MS = 30_000;

export const VALID_REACTIONS = ["👍", "👎", "😄", "🎉", "😕", "❤️", "🚀", "👀"] as const;
export type ReactionEmoji = typeof VALID_REACTIONS[number];

const tokens = () => getStore({ name: TOKEN_STORE, consistency: "strong" });
const etags = () => getStore({ name: ETAG_STORE });
const pulse = () => getStore({ name: PULSE_STORE, consistency: "strong" });
const presence = () => getStore({ name: PRESENCE_STORE, consistency: "strong" });
const reactions = () => getStore({ name: REACTIONS_STORE, consistency: "strong" });

export interface PulseMap {
  rooms: Record<string, { sha: string; at: string }>;
  updated_at: string;
}

export type PresenceStatus = "available" | "away" | "invisible";

export interface PresenceEntry {
  name: string;
  status: PresenceStatus;
  last_seen: string;
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

async function readPresenceMap(): Promise<Record<string, PresenceEntry>> {
  return ((await presence().get(PRESENCE_KEY, { type: "json" })) as Record<string, PresenceEntry> | null) ?? {};
}

export async function heartbeat(name: string, status: PresenceStatus): Promise<PresenceEntry> {
  const map = await readPresenceMap();
  const entry: PresenceEntry = { name, status, last_seen: new Date().toISOString() };
  map[name] = entry;
  await presence().setJSON(PRESENCE_KEY, map);
  return entry;
}

export async function clearPresence(name: string): Promise<void> {
  const map = await readPresenceMap();
  if (name in map) {
    delete map[name];
    await presence().setJSON(PRESENCE_KEY, map);
  }
}

export async function listOnline(includeInvisible = false): Promise<PresenceEntry[]> {
  const map = await readPresenceMap();
  const cutoff = Date.now() - PRESENCE_TTL_MS;
  return Object.values(map).filter((e) => {
    if (!includeInvisible && e.status === "invisible") return false;
    return Date.parse(e.last_seen) >= cutoff;
  });
}

// ---------- Reactions ----------
// Stored entirely in Netlify Blobs (not git). Single map keyed by commit SHA.
// Value shape: { "<sha>": { "👍": ["alice", "bob"], "🚀": ["claude"] } }

export type ReactionsForMessage = Partial<Record<ReactionEmoji, string[]>>;
export type ReactionsMap = Record<string, ReactionsForMessage>;

async function readReactionsMap(): Promise<ReactionsMap> {
  return ((await reactions().get(REACTIONS_KEY, { type: "json" })) as ReactionsMap | null) ?? {};
}

export async function getReactionsForSha(sha: string): Promise<ReactionsForMessage> {
  const map = await readReactionsMap();
  return map[sha] ?? {};
}

export async function getReactionsForShas(shas: string[]): Promise<Record<string, ReactionsForMessage>> {
  if (shas.length === 0) return {};
  const map = await readReactionsMap();
  const out: Record<string, ReactionsForMessage> = {};
  for (const sha of shas) {
    if (map[sha]) out[sha] = map[sha];
  }
  return out;
}

/**
 * Toggle a reaction. If the user is already in the list for that emoji, remove
 * them; otherwise add them. Returns the resulting reactions for that message.
 */
export async function toggleReaction(sha: string, emoji: ReactionEmoji, user: string): Promise<ReactionsForMessage> {
  const map = await readReactionsMap();
  const entry: ReactionsForMessage = { ...(map[sha] ?? {}) };
  const list = entry[emoji] ? [...entry[emoji]!] : [];
  const idx = list.indexOf(user);
  if (idx === -1) {
    list.push(user);
  } else {
    list.splice(idx, 1);
  }
  if (list.length === 0) {
    delete entry[emoji];
  } else {
    entry[emoji] = list;
  }
  if (Object.keys(entry).length === 0) {
    delete map[sha];
  } else {
    map[sha] = entry;
  }
  await reactions().setJSON(REACTIONS_KEY, map);
  return entry;
}
