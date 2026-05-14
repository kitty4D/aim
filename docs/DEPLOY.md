# Deploying your own AIM instance

This is the long-form version of the Quick Start in the [README](../README.md).

## Step 1 — Create the private chat repo on GitHub

1. Go to <https://github.com/new>.
2. Pick a name (e.g. `my-aim-data`).
3. Set visibility to **Private**. This is important — your chat will live here.
4. **Do not** initialize with a README, .gitignore, or license. Leave it empty.
5. Create the repo.

You should land on a page that says "Quick setup — if you've done this kind of thing before." That means it's empty. Good.

## Step 2 — Generate a fine-grained PAT

1. Go to <https://github.com/settings/tokens?type=beta>.
2. Click **Generate new token**.
3. Token name: something like `aim-server-pat`.
4. Expiration: pick whatever you're comfortable with. AIM will keep working until it expires; then you regenerate.
5. Repository access: **Only select repositories** → choose the chat repo you just made.
6. Repository permissions:
   - **Contents**: Read and write
   - **Metadata**: Read-only
7. Click **Generate token**.
8. **Copy the token.** You won't see it again.

## Step 3 — Click Deploy to Netlify

From the README, click the Deploy to Netlify button. Netlify will:

1. Ask you to log in / sign up (free tier is fine).
2. Ask which Git provider to use (GitHub).
3. Clone this template into a new repo under your account.
4. Prompt you for environment variables:

| Variable | Value |
|---|---|
| `GITHUB_PAT` | The PAT from Step 2 |
| `GITHUB_REPO` | `owner/repo` of the empty private repo from Step 1 |
| `ADMIN_SECRET` | A passphrase you pick — keep it secret |

Save and deploy.

## Step 4 — Wait for build, then visit your site

Netlify will run the build (~1 minute), then give you a URL like `https://aim-randomwords.netlify.app`. Visit it. You should see the AIM sign-on screen.

You don't have a token yet, so you can't sign on. That's the next step.

## Step 5 — Mint your first AIM token

From a terminal:

```bash
curl -X POST \
  -H "X-Admin-Secret: $ADMIN_SECRET" \
  -H "content-type: application/json" \
  -d '{"name":"YourName","role":"admin"}' \
  https://<YOUR_SITE>.netlify.app/api/admin/tokens
```

You'll get back JSON containing a `token` field like `aim_AbCdEf...`. **Save this immediately.** It cannot be retrieved later — only revoked.

## Step 6 — Sign on

Open your site, paste the token into the Screen Name field, click Sign On. The door creaks. The buddy list shows the default `lobby` room.

Double-click `lobby` and type a message. It will appear in your private chat repo as a new commit. Check the repo on GitHub — you'll see a new file under `rooms/lobby/<YYYY>/<MM>/<DD>/...json`.

That's it. You have your own AIM server.

## Step 7 — (Optional) Hook up real-time updates

AIM is real-time by default — messages sent through the API show up across all browser tabs within ~5 seconds. That's because every send updates a "pulse" record in Netlify Blobs that browsers poll cheaply.

But there's a corner case: if someone commits **directly to your chat repo via git** (bypassing AIM's API), AIM won't notice unless you set up a webhook. To handle that:

1. Generate a webhook secret. Any random string works:
   ```bash
   openssl rand -hex 32
   ```
2. Set it as the `WEBHOOK_SECRET` env var in Netlify: Site settings → Environment variables → Add. Redeploy.
3. On your chat repo, go to **Settings → Webhooks → Add webhook**:
   - **Payload URL:** `https://<YOUR_SITE>.netlify.app/api/webhook`
   - **Content type:** `application/json`
   - **Secret:** the value of `WEBHOOK_SECRET`
   - **Which events:** "Just the push event."
   - **Active:** ✅
4. Save. GitHub will fire a `ping` event — check Recent Deliveries for a green check.

Now every commit (from anywhere) updates the pulse, and all connected browsers refresh within a few seconds.

## Step 8 — Invite others

For each person or AI agent you want to give access to:

```bash
curl -X POST \
  -H "X-Admin-Secret: $ADMIN_SECRET" \
  -H "content-type: application/json" \
  -d '{"name":"Dave","role":"member"}' \
  https://<YOUR_SITE>.netlify.app/api/admin/tokens
```

Roles:
- `admin` — full access, can edit/delete anyone's messages
- `member` — full read/write on their own messages, can pin
- `read-only` — read only; cannot send

Hand the returned token to them. They paste it into the Sign On screen. Done.

See [ADMIN.md](ADMIN.md) for ongoing token management.

## Troubleshooting

**Build fails on Netlify.** Check the build log. Most likely: the `GITHUB_REPO` doesn't match the actual repo you created, or the PAT permissions are wrong.

**Sign-on says "Invalid or revoked token."** Either the token is wrong, was never minted, or has been deleted. Mint a fresh one with the admin endpoint.

**`POST /api/admin/tokens` returns 401.** Check that `X-Admin-Secret` exactly matches the `ADMIN_SECRET` you set in Netlify env vars.

**Messages aren't appearing in the GitHub repo.** Look at the Netlify function logs (Site → Functions → messages). The most common cause is PAT permissions: it needs Contents read/write on that specific repo.

**Rate-limited (429).** GitHub limits a single PAT to 5000 req/hr. For ≤25 active users this should never be an issue thanks to ETag caching. If you hit it, slow down or upgrade to per-user OAuth (v2 feature).
