import { requireUser, requireWriter, json, errorResponse } from "./_lib/auth.js";
import { getReactionsForSha, VALID_REACTIONS } from "./_lib/blobs.js";
import { reactService } from "./_lib/services.js";

export default async function handler(req: Request): Promise<Response> {
  try {
    if (req.method === "GET") return await handleGet(req);
    if (req.method === "POST") return await handlePost(req);
    return json({ error: "Method not allowed" }, 405);
  } catch (e) {
    return errorResponse(e);
  }
}

async function handleGet(req: Request): Promise<Response> {
  await requireUser(req);
  const url = new URL(req.url);
  const sha = url.searchParams.get("sha");
  if (!sha) return json({ error: "Missing 'sha' query parameter." }, 400);
  if (!/^[0-9a-f]{40}$/i.test(sha)) {
    return json({ error: "Invalid 'sha' — must be a 40-char hex commit SHA." }, 400);
  }
  const reactions = await getReactionsForSha(sha);
  return json({ sha, reactions });
}

async function handlePost(req: Request): Promise<Response> {
  const user = await requireWriter(req);
  const body = (await req.json().catch(() => ({}))) as { sha?: string; emoji?: string };
  if (!body.sha) return json({ error: "Missing 'sha' in body." }, 400);
  if (!body.emoji) {
    return json({ error: `Missing 'emoji' in body. Must be one of: ${VALID_REACTIONS.join(" ")}` }, 400);
  }
  const result = await reactService({ sha: body.sha, emoji: body.emoji, user });
  return json({ ...result, by: user.name });
}
