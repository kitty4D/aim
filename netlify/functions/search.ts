import { requireUser, json, errorResponse } from "./_lib/auth.js";
import { searchCommits, getCommit } from "./_lib/github.js";
import { isMessagePath, normalizeRoom, roomFromPath } from "./_lib/paths.js";

export default async function handler(req: Request): Promise<Response> {
  try {
    if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);
    await requireUser(req);

    const url = new URL(req.url);
    const q = url.searchParams.get("q");
    const room = url.searchParams.get("room");
    if (!q) return json({ error: "Missing 'q' query parameter." }, 400);

    const safeRoom = room ? normalizeRoom(room) : null;
    const commits = await searchCommits(q);

    const results: Array<{
      sha: string;
      room: string;
      path: string;
      author: string;
      text: string;
      sent_at: string;
    }> = [];

    for (const c of commits) {
      const detail = await getCommit(c.sha).catch(() => null);
      if (!detail) continue;
      for (const file of detail.fileContents) {
        if (!isMessagePath(file.path)) continue;
        const fileRoom = roomFromPath(file.path);
        if (!fileRoom) continue;
        if (safeRoom && fileRoom !== safeRoom) continue;
        try {
          const payload = JSON.parse(file.content);
          results.push({
            sha: c.sha,
            room: fileRoom,
            path: file.path,
            author: payload.author,
            text: payload.text,
            sent_at: payload.sent_at,
          });
        } catch {
          // skip
        }
      }
    }

    return json({ query: q, room: safeRoom, results });
  } catch (e) {
    return errorResponse(e);
  }
}
