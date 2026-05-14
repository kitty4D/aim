import { requireUser, requireAdmin, json, errorResponse } from "./_lib/auth.js";
import { readConfig, writeConfig } from "./_lib/config.js";
import { normalizeRoom, userEmail } from "./_lib/paths.js";

export default async function handler(req: Request): Promise<Response> {
  try {
    if (req.method === "GET") {
      await requireUser(req);
      const config = await readConfig();
      return json({
        server_name: config.server_name,
        motd: config.motd ?? null,
        rooms: config.rooms,
      });
    }

    if (req.method === "POST") {
      requireAdmin(req);
      const body = (await req.json().catch(() => ({}))) as { name?: string };
      if (!body.name) return json({ error: "Missing 'name' in body." }, 400);
      const safe = normalizeRoom(body.name);
      const config = await readConfig();
      if (config.rooms.includes(safe)) return json({ rooms: config.rooms, created: false });
      const next = { ...config, rooms: [...config.rooms, safe] };
      await writeConfig(next, { name: "admin", email: userEmail("admin") });
      return json({ rooms: next.rooms, created: true }, 201);
    }

    return json({ error: "Method not allowed" }, 405);
  } catch (e) {
    return errorResponse(e);
  }
}
