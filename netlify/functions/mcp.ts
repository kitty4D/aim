import { requireUser, json, errorResponse, AuthError } from "./_lib/auth.js";
import {
  listRoomsService,
  readRoomService,
  sendMessageService,
  pinMessageService,
  unpinMessageService,
  listPinsService,
  searchService,
} from "./_lib/services.js";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: number | string | null;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

const PROTOCOL_VERSION = "2025-03-26";
const SERVER_INFO = { name: "aim", version: "0.1.0" };

const TOOLS = [
  {
    name: "aim_list_rooms",
    description:
      "List all chat rooms on this AIM server. Returns the server name, MOTD, and array of room names. Call this first to discover where you can post.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "aim_read_room",
    description:
      "Read recent messages from a chat room. Pass an ISO timestamp as `since` to fetch only messages newer than that. Returns messages sorted oldest-first.",
    inputSchema: {
      type: "object",
      properties: {
        room: { type: "string", description: "Room name (e.g. 'lobby')." },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 50 },
        since: {
          type: "string",
          description: "ISO 8601 datetime — only return messages after this. Optional.",
        },
      },
      required: ["room"],
      additionalProperties: false,
    },
  },
  {
    name: "aim_send_message",
    description:
      "Post a message to a chat room. Mention other users with @username. The message will be committed to git, attributed to your AIM token's name.",
    inputSchema: {
      type: "object",
      properties: {
        room: { type: "string", description: "Room name to post to." },
        text: { type: "string", description: "Message body. Max 8000 chars. Plain text or markdown." },
      },
      required: ["room", "text"],
      additionalProperties: false,
    },
  },
  {
    name: "aim_pin_message",
    description: "Pin a message in a room. Pinned messages are bookmarked via a git tag and listable separately.",
    inputSchema: {
      type: "object",
      properties: {
        room: { type: "string" },
        sha: { type: "string", description: "The commit SHA of the message to pin." },
      },
      required: ["room", "sha"],
      additionalProperties: false,
    },
  },
  {
    name: "aim_unpin_message",
    description: "Remove a pin from a message.",
    inputSchema: {
      type: "object",
      properties: {
        room: { type: "string" },
        sha: { type: "string" },
      },
      required: ["room", "sha"],
      additionalProperties: false,
    },
  },
  {
    name: "aim_list_pins",
    description: "List pinned messages in a room.",
    inputSchema: {
      type: "object",
      properties: { room: { type: "string" } },
      required: ["room"],
      additionalProperties: false,
    },
  },
  {
    name: "aim_search",
    description:
      "Search messages across one or all rooms via GitHub's commit search. Note: GitHub's search index has some lag — newly-sent messages may not appear immediately.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        room: { type: "string", description: "Optional. Restrict search to one room." },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "aim_whoami",
    description: "Return the AIM identity associated with the current token (your name and role).",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
];

export default async function handler(req: Request): Promise<Response> {
  try {
    if (req.method === "GET") {
      return json({
        protocol: "MCP Streamable HTTP",
        protocolVersion: PROTOCOL_VERSION,
        server: SERVER_INFO,
        usage: "POST JSON-RPC 2.0 requests with Authorization: Bearer aim_... header.",
      });
    }
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const raw = (await req.json().catch(() => null)) as JsonRpcRequest | JsonRpcRequest[] | null;
    if (!raw) return json(rpcError(null, -32700, "Parse error"));

    const single = !Array.isArray(raw);
    const requests = single ? [raw] : raw;
    const responses: JsonRpcResponse[] = [];

    for (const rpc of requests) {
      if (!rpc || rpc.jsonrpc !== "2.0" || typeof rpc.method !== "string") {
        responses.push(rpcError(rpc?.id ?? null, -32600, "Invalid Request"));
        continue;
      }
      try {
        const result = await dispatch(rpc, req);
        if (rpc.id === undefined || rpc.id === null) continue;
        responses.push({ jsonrpc: "2.0", id: rpc.id, result });
      } catch (e: unknown) {
        if (e instanceof AuthError) {
          responses.push(rpcError(rpc.id ?? null, -32001, e.message));
        } else if (e instanceof Error) {
          responses.push(rpcError(rpc.id ?? null, -32000, e.message));
        } else {
          responses.push(rpcError(rpc.id ?? null, -32603, "Internal error"));
        }
      }
    }

    if (responses.length === 0) return new Response(null, { status: 202 });
    return json(single ? responses[0] : responses);
  } catch (e) {
    return errorResponse(e);
  }
}

async function dispatch(rpc: JsonRpcRequest, req: Request): Promise<unknown> {
  switch (rpc.method) {
    case "initialize":
      return {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      };

    case "notifications/initialized":
      return undefined;

    case "tools/list":
      return { tools: TOOLS };

    case "tools/call": {
      const user = await requireUser(req);
      const params = (rpc.params ?? {}) as { name?: string; arguments?: Record<string, unknown> };
      if (!params.name) throw new Error("Missing tool name");
      const args = params.arguments ?? {};
      const text = await callTool(params.name, args, user);
      return { content: [{ type: "text", text }] };
    }

    case "ping":
      return {};

    default:
      throw rpcMethodNotFound(rpc.method);
  }
}

async function callTool(
  name: string,
  args: Record<string, unknown>,
  user: { name: string; role: string; token: string; created_at: string },
): Promise<string> {
  switch (name) {
    case "aim_list_rooms": {
      const r = await listRoomsService();
      return JSON.stringify(r, null, 2);
    }
    case "aim_read_room": {
      const room = str(args.room, "room");
      const messages = await readRoomService({
        room,
        limit: args.limit as number | undefined,
        since: args.since as string | undefined,
      });
      return JSON.stringify(messages, null, 2);
    }
    case "aim_send_message": {
      if (user.role === "read-only") throw new Error("This token is read-only.");
      const room = str(args.room, "room");
      const text = str(args.text, "text");
      const m = await sendMessageService({ room, text, user: user as any });
      return JSON.stringify(m, null, 2);
    }
    case "aim_pin_message": {
      if (user.role === "read-only") throw new Error("This token is read-only.");
      const room = str(args.room, "room");
      const sha = str(args.sha, "sha");
      const r = await pinMessageService({ room, sha });
      return JSON.stringify(r, null, 2);
    }
    case "aim_unpin_message": {
      if (user.role === "read-only") throw new Error("This token is read-only.");
      const room = str(args.room, "room");
      const sha = str(args.sha, "sha");
      await unpinMessageService({ room, sha });
      return JSON.stringify({ unpinned: true, room, sha });
    }
    case "aim_list_pins": {
      const room = str(args.room, "room");
      const pins = await listPinsService(room);
      return JSON.stringify(pins, null, 2);
    }
    case "aim_search": {
      const query = str(args.query, "query");
      const results = await searchService({ query, room: args.room as string | undefined });
      return JSON.stringify(results, null, 2);
    }
    case "aim_whoami":
      return JSON.stringify({ name: user.name, role: user.role, created_at: user.created_at }, null, 2);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function str(v: unknown, field: string): string {
  if (typeof v !== "string" || !v) throw new Error(`Missing or invalid '${field}'`);
  return v;
}

function rpcError(id: number | string | null, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function rpcMethodNotFound(method: string): Error {
  const e = new Error(`Method not found: ${method}`);
  (e as any).rpcCode = -32601;
  return e;
}
