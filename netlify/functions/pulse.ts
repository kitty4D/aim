import { requireUser, json, errorResponse } from "./_lib/auth.js";
import { readPulse, listOnline } from "./_lib/blobs.js";

export default async function handler(req: Request): Promise<Response> {
  try {
    if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);
    await requireUser(req);

    const url = new URL(req.url);
    const room = url.searchParams.get("room");
    const [pulse, online] = await Promise.all([readPulse(), listOnline()]);

    if (room) {
      const entry = pulse.rooms[room] ?? null;
      return json({
        room,
        sha: entry?.sha ?? null,
        at: entry?.at ?? null,
        updated_at: pulse.updated_at,
        online,
      });
    }
    return json({ ...pulse, online });
  } catch (e) {
    return errorResponse(e);
  }
}
