# Admin guide

All admin operations are protected by the `ADMIN_SECRET` environment variable you set during deploy. Pass it via the `X-Admin-Secret` header.

Replace `$ADMIN_SECRET` and `$SITE` in the examples below with your values.

## Tokens

### Mint a new token

```bash
curl -X POST \
  -H "X-Admin-Secret: $ADMIN_SECRET" \
  -H "content-type: application/json" \
  -d '{"name":"Dave","role":"member"}' \
  $SITE/api/admin/tokens
```

Response:

```json
{
  "token": "aim_AbCdEf123...",
  "name": "Dave",
  "role": "member",
  "message": "Save this token now — it cannot be retrieved later."
}
```

Hand `aim_AbCdEf123...` to Dave. He pastes it into the Sign On screen on your site.

**Roles:**

| Role | Read | Send / pin | Edit/delete others' messages | Manage tokens |
|---|---|---|---|---|
| `admin` | ✅ | ✅ | ✅ | requires `ADMIN_SECRET` |
| `member` | ✅ | ✅ | own only | no |
| `read-only` | ✅ | ❌ | ❌ | no |

Note: the `admin` role on an AIM token grants extra in-chat powers but **does not** grant access to the admin endpoints. Token management always requires `ADMIN_SECRET`.

### List all tokens

```bash
curl -H "X-Admin-Secret: $ADMIN_SECRET" $SITE/api/admin/tokens
```

You'll see token previews (e.g. `aim_AbCdEf123...`) plus name, role, and creation timestamp. The full secret values are never returned after creation.

### Revoke a token

```bash
curl -X DELETE \
  -H "X-Admin-Secret: $ADMIN_SECRET" \
  $SITE/api/admin/tokens/aim_AbCdEf123FullToken
```

Whoever was using that token is now locked out. They'll see a 401 on their next request.

## Rooms

Rooms are stored in `.aim/config.json` in your chat repo. Bootstrap happens on first request; the default room is `lobby`.

### Add a room

```bash
curl -X POST \
  -H "X-Admin-Secret: $ADMIN_SECRET" \
  -H "content-type: application/json" \
  -d '{"name":"general"}' \
  $SITE/api/rooms
```

Room names must match `^[a-z0-9][a-z0-9_-]{0,31}$` — lowercase, no spaces, max 32 chars.

The change is committed to the repo as an edit to `.aim/config.json`.

### Edit `.aim/config.json` directly

You can also edit `.aim/config.json` in your chat repo via the GitHub UI. Fields:

- `server_name` — shown in the Buddy List title bar
- `motd` — optional one-line "message of the day"
- `rooms` — array of room names
- `version` — schema version (leave at 1)

Commit. The next page-load picks up the change.

## Pins

Pinned messages are stored as git tags named `pin/<room>/<commitSha>`. You can list them in the UI by clicking the 📌 bar, or via:

```bash
curl -H "Authorization: Bearer $AIM_TOKEN" \
  "$SITE/api/pins?room=lobby"
```

To unpin programmatically:

```bash
curl -X DELETE \
  -H "Authorization: Bearer $AIM_TOKEN" \
  "$SITE/api/pins?room=lobby&sha=<commitSha>"
```

## Cleaning up

Because all chat data lives in a private GitHub repo, you have several options to clean up:

- **Delete a message:** use the UI or `DELETE /api/messages?path=...`. Leaves the deletion commit in history.
- **Hard delete (GDPR / oops):** rewrite history with `git filter-repo` or BFG locally, then force-push to the repo. This is rare and not built into AIM.
- **Wipe everything:** delete the chat repo and start over. Re-deploy AIM with a fresh empty repo.

## Rotating secrets

- **`ADMIN_SECRET`:** change it in Netlify → Site settings → Environment variables, then trigger a new deploy. Old admin requests start failing immediately.
- **`GITHUB_PAT`:** generate a new fine-grained PAT, paste it into Netlify env vars, redeploy. Then revoke the old PAT on GitHub.
- **`WEBHOOK_SECRET`:** change in Netlify env vars and redeploy. Then update the secret on the GitHub webhook (repo → Settings → Webhooks → edit). Until both sides match, push events will be rejected with 401 (visible in Recent Deliveries).

## Real-time updates

AIM uses a "pulse" model: every message send updates a record in Netlify Blobs, and connected browsers poll that record every ~5 seconds. This is cheap on GitHub's API budget — no commit listing per poll.

For commits that happen outside AIM's API (someone pushing directly to the repo), configure the GitHub webhook (see [DEPLOY.md Step 7](DEPLOY.md)).

To tune the pulse cadence, set `PULSE_INTERVAL_MS` in Netlify env vars (default 5000). Lower = more responsive but more Netlify function invocations.

If/when SSE mode ships, set `REALTIME_MODE=sse` to switch. The frontend will fall back to pulse automatically if SSE fails.

## Audit log

You already have one — it's git. Every action is a commit. Run `git log` on the chat repo to see who said what when. Token mints don't show up here (they live in Netlify Blobs), but message writes / edits / deletes / pin changes all do.
