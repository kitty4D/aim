import { requireUser, requireWriter, json, errorResponse } from "./_lib/auth.js";
import { normalizeRoom, pinTagName, isMessagePath } from "./_lib/paths.js";
import {
  createLightweightTag,
  deleteTag,
  listMatchingTags,
  getCommit,
  type FileContent,
} from "./_lib/github.js";

interface PinnedMessage {
  sha: string;
  room: string;
  pinned_tag: string;
  path?: string;
  author?: string;
  text?: string;
  sent_at?: string;
}

export default async function handler(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    if (req.method === "GET") return await handleList(req, url);
    if (req.method === "POST") return await handleCreate(req);
    if (req.method === "DELETE") return await handleDelete(req, url);
    return json({ error: "Method not allowed" }, 405);
  } catch (e) {
    return errorResponse(e);
  }
}

async function handleList(req: Request, url: URL): Promise<Response> {
  await requireUser(req);
  const room = url.searchParams.get("room");
  if (!room) return json({ error: "Missing 'room' query parameter." }, 400);
  const safe = normalizeRoom(room);

  const tags = await listMatchingTags(`pin/${safe}/`);
  const pins: PinnedMessage[] = [];

  for (const t of tags) {
    const pinnedSha = t.tag.split("/").pop() ?? "";
    const pin: PinnedMessage = { sha: pinnedSha, room: safe, pinned_tag: t.tag };

    const detail = await getCommit(pinnedSha).catch(() => null);
    if (detail) {
      const msgFile = (detail.fileContents as FileContent[]).find((f) =>
        isMessagePath(f.path) && f.path.startsWith(`rooms/${safe}/`),
      );
      if (msgFile) {
        try {
          const payload = JSON.parse(msgFile.content);
          pin.path = msgFile.path;
          pin.author = payload.author;
          pin.text = payload.text;
          pin.sent_at = payload.sent_at;
        } catch {
          // ignore
        }
      }
    }
    pins.push(pin);
  }

  return json({ room: safe, pins });
}

async function handleCreate(req: Request): Promise<Response> {
  await requireWriter(req);
  const body = (await req.json().catch(() => ({}))) as { sha?: string; room?: string };
  if (!body.sha) return json({ error: "Missing 'sha'." }, 400);
  if (!body.room) return json({ error: "Missing 'room'." }, 400);
  const safe = normalizeRoom(body.room);
  const tag = pinTagName(safe, body.sha);

  try {
    await createLightweightTag(tag, body.sha);
    return json({ pinned: true, tag, sha: body.sha, room: safe }, 201);
  } catch (e: unknown) {
    if (typeof e === "object" && e !== null && "status" in e && (e as { status: number }).status === 422) {
      return json({ pinned: true, tag, sha: body.sha, room: safe, already_existed: true });
    }
    throw e;
  }
}

async function handleDelete(req: Request, url: URL): Promise<Response> {
  await requireWriter(req);
  const sha = url.searchParams.get("sha");
  const room = url.searchParams.get("room");
  if (!sha || !room) return json({ error: "Missing 'sha' or 'room'." }, 400);
  const tag = pinTagName(normalizeRoom(room), sha);
  await deleteTag(tag).catch((e: any) => {
    if (e?.status !== 422 && e?.status !== 404) throw e;
  });
  return json({ unpinned: true, tag });
}
