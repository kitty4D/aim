import { createHmac, timingSafeEqual } from "node:crypto";
import { json, errorResponse } from "./_lib/auth.js";
import { bumpPulse } from "./_lib/blobs.js";
import { roomFromPath, isMessagePath } from "./_lib/paths.js";

interface PushCommit {
  id: string;
  message: string;
  timestamp: string;
  added?: string[];
  modified?: string[];
  removed?: string[];
}

interface PushPayload {
  ref?: string;
  after?: string;
  commits?: PushCommit[];
}

export default async function handler(req: Request): Promise<Response> {
  try {
    if (req.method === "GET") {
      return json({
        ok: true,
        usage: "POST GitHub push webhooks here. Set X-Hub-Signature-256 with HMAC-sha256(body, WEBHOOK_SECRET).",
      });
    }
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const secret = process.env.WEBHOOK_SECRET;
    if (!secret) {
      return json(
        {
          error: "Webhook not enabled. Set WEBHOOK_SECRET in your Netlify env vars and configure the GitHub webhook.",
        },
        503,
      );
    }

    const event = req.headers.get("x-github-event") ?? "";
    if (event === "ping") {
      return json({ pong: true });
    }
    if (event !== "push") {
      return json({ ignored: true, event });
    }

    const rawBody = await req.text();
    const signature = req.headers.get("x-hub-signature-256") ?? "";
    if (!verifySignature(rawBody, signature, secret)) {
      return json({ error: "Invalid signature." }, 401);
    }

    const payload = JSON.parse(rawBody) as PushPayload;
    const commits = payload.commits ?? [];
    const updates: Record<string, string> = {};

    for (const c of commits) {
      const touched = [...(c.added ?? []), ...(c.modified ?? [])];
      for (const path of touched) {
        if (!isMessagePath(path)) continue;
        const room = roomFromPath(path);
        if (!room) continue;
        updates[room] = c.id;
      }
    }

    for (const [room, sha] of Object.entries(updates)) {
      await bumpPulse(room, sha).catch((e) =>
        console.error(`[aim/webhook] bumpPulse(${room}) failed:`, e),
      );
    }

    return json({ ok: true, rooms_updated: Object.keys(updates) });
  } catch (e) {
    return errorResponse(e);
  }
}

function verifySignature(rawBody: string, header: string, secret: string): boolean {
  if (!header.startsWith("sha256=")) return false;
  const expected = "sha256=" + createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(header);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
