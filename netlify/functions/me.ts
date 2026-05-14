import { requireUser, json, errorResponse } from "./_lib/auth.js";
import { readConfig } from "./_lib/config.js";

export default async function handler(req: Request): Promise<Response> {
  try {
    if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

    const user = await requireUser(req);
    const config = await readConfig();

    return json({
      name: user.name,
      role: user.role,
      created_at: user.created_at,
      server_name: config.server_name,
      motd: config.motd ?? null,
      rooms: config.rooms,
      realtime: realtimeConfig(),
    });
  } catch (e) {
    return errorResponse(e);
  }
}

function realtimeConfig() {
  const mode = (process.env.REALTIME_MODE ?? "pulse").toLowerCase();
  if (mode === "sse") {
    return {
      mode: "sse" as const,
      endpoint: "/api/events",
      reconnect_delay_ms: 1000,
      fallback: { mode: "pulse" as const, endpoint: "/api/pulse", poll_interval_ms: 10000 },
    };
  }
  return {
    mode: "pulse" as const,
    endpoint: "/api/pulse",
    poll_interval_ms: Number(process.env.PULSE_INTERVAL_MS) || 5000,
    webhook_configured: Boolean(process.env.WEBHOOK_SECRET),
  };
}
