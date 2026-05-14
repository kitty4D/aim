import { requireAdmin, json, errorResponse } from "./_lib/auth.js";
import { setToken, listTokens, deleteToken, type AimRole } from "./_lib/blobs.js";
import { generateAimToken } from "./_lib/paths.js";

const VALID_ROLES: AimRole[] = ["admin", "member", "read-only"];

export default async function handler(req: Request): Promise<Response> {
  try {
    requireAdmin(req);
    const url = new URL(req.url);

    if (req.method === "GET") return await handleList();
    if (req.method === "POST") return await handleCreate(req);
    if (req.method === "DELETE") return await handleDelete(url);

    return json({ error: "Method not allowed" }, 405);
  } catch (e) {
    return errorResponse(e);
  }
}

async function handleList(): Promise<Response> {
  const all = await listTokens();
  const sanitized = all.map(({ token, meta }) => ({
    token_preview: token.slice(0, 12) + "…",
    name: meta.name,
    role: meta.role,
    created_at: meta.created_at,
  }));
  return json({ tokens: sanitized });
}

async function handleCreate(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as { name?: string; role?: string };
  const name = (body.name ?? "").trim();
  if (!name) return json({ error: "Missing 'name'." }, 400);
  const role = (body.role ?? "member") as AimRole;
  if (!VALID_ROLES.includes(role)) {
    return json({ error: `Invalid role. Must be one of: ${VALID_ROLES.join(", ")}` }, 400);
  }

  const token = generateAimToken();
  await setToken(token, {
    name,
    role,
    created_at: new Date().toISOString(),
  });

  return json(
    {
      token,
      name,
      role,
      message: "Save this token now — it cannot be retrieved later.",
    },
    201,
  );
}

async function handleDelete(url: URL): Promise<Response> {
  const fromQuery = url.searchParams.get("token");
  const fromPath = url.pathname.split("/").filter(Boolean).pop() ?? "";
  const token = fromQuery && fromQuery.startsWith("aim_") ? fromQuery : fromPath;
  if (!token || !token.startsWith("aim_")) {
    return json(
      {
        error:
          "Missing token. Use DELETE /api/admin/tokens/<token> or DELETE /api/admin/tokens?token=<token>",
      },
      400,
    );
  }
  await deleteToken(token);
  return json({ revoked: true, token_preview: token.slice(0, 12) + "…" });
}
