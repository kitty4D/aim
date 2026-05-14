import { randomBytes } from "node:crypto";

const ROOM_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/;

export function normalizeRoom(room: string): string {
  const lower = String(room).trim().toLowerCase();
  if (!ROOM_RE.test(lower)) {
    throw new Error(`Invalid room name: '${room}'. Must match ${ROOM_RE.source}`);
  }
  return lower;
}

export function messagePath(room: string, now: Date = new Date()): string {
  const safe = normalizeRoom(room);
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  const ts = now.getTime();
  const nonce = randomBytes(3).toString("hex");
  return `rooms/${safe}/${yyyy}/${mm}/${dd}/${ts}-${nonce}.json`;
}

export function roomFromPath(path: string): string | null {
  const m = path.match(/^rooms\/([^/]+)\//);
  return m ? m[1] : null;
}

export function isMessagePath(path: string): boolean {
  return /^rooms\/[^/]+\/\d{4}\/\d{2}\/\d{2}\/\d+-[0-9a-f]+\.json$/.test(path);
}

export function pinTagName(room: string, commitSha: string): string {
  return `pin/${normalizeRoom(room)}/${commitSha}`;
}

export function userEmail(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9._-]/g, "-").replace(/^-+|-+$/g, "");
  return `${slug || "user"}@aim.local`;
}

export function generateAimToken(): string {
  return `aim_${randomBytes(24).toString("base64url")}`;
}
