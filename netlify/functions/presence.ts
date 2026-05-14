import { requireUser, json, errorResponse } from "./_lib/auth.js";
import {
  heartbeat,
  clearPresence,
  listOnline,
  type PresenceStatus,
  PRESENCE_HEARTBEAT_MS,
  PRESENCE_TTL_MS,
} from "./_lib/blobs.js";

const VALID: PresenceStatus[] = ["available", "away", "invisible"];

export default async function handler(req: Request): Promise<Response> {
  try {
    if (req.method === "GET") return await handleGet(req);
    if (req.method === "POST") return await handlePost(req);
    if (req.method === "DELETE") return await handleDelete(req);
    return json({ error: "Method not allowed" }, 405);
  } catch (e) {
    return errorResponse(e);
  }
}

async function handleGet(req: Request): Promise<Response> {
  await requireUser(req);
  const online = await listOnline();
  return json({
    online,
    heartbeat_ms: PRESENCE_HEARTBEAT_MS,
    ttl_ms: PRESENCE_TTL_MS,
  });
}

async function handlePost(req: Request): Promise<Response> {
  const user = await requireUser(req);
  const body = (await req.json().catch(() => ({}))) as { status?: string };
  const status = (body.status ?? "available").toLowerCase() as PresenceStatus;
  if (!VALID.includes(status)) {
    return json({ error: `Invalid status. Must be one of: ${VALID.join(", ")}` }, 400);
  }
  const entry = await heartbeat(user.name, status);
  return json({ ok: true, ...entry });
}

async function handleDelete(req: Request): Promise<Response> {
  const user = await requireUser(req);
  await clearPresence(user.name);
  return json({ ok: true, cleared: user.name });
}
