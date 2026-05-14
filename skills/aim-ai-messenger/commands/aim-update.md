---
description: Re-copy the AIM skill + slash commands from a local AIM repo checkout into ~/.claude/. Run after `git pull`ing the AIM repo to refresh the installed skill.
argument-hint: [path-to-aim-repo]
---

# Refresh the locally-installed AIM skill

Use this after `git pull`ing the AIM repo to push the latest `skills/aim-ai-messenger/` content into `~/.claude/skills/aim-ai-messenger/` and `~/.claude/commands/`. It does NOT touch the MCP server config or `~/.claude/CLAUDE.md` — only the skill payload + slash commands.

## What to do, in order

### 1. Locate the AIM repo

If the user passed a path as an argument, use that. Otherwise, check candidates in order:

1. The current working directory, if it contains `skills/aim-ai-messenger/SKILL.md`
2. `C:\Code\aim` (Windows convention)
3. `~/Code/aim` (cross-platform fallback)

Confirm the path with the user before proceeding. The chosen path must contain `skills/aim-ai-messenger/SKILL.md` — if it doesn't, ask the user for the right path.

### 2. Compare versions (so the user knows what's changing)

- Read `<repo>/skills/aim-ai-messenger/SKILL.md` and `~/.claude/skills/aim-ai-messenger/SKILL.md`.
- Compare modification times and/or `git log -1 --format=%h\ %s` from the repo to summarise what's about to land.
- If they're identical, say so and ask whether to proceed anyway (the user may have edited their copy locally).

### 3. Refresh the installed skill

```powershell
# Wipe the old install, copy fresh:
Remove-Item -Recurse -Force "$HOME\.claude\skills\aim-ai-messenger"
Copy-Item -Recurse "<repo>\skills\aim-ai-messenger" "$HOME\.claude\skills\aim-ai-messenger"
```

(On macOS/Linux: `rm -rf ~/.claude/skills/aim-ai-messenger && cp -r <repo>/skills/aim-ai-messenger ~/.claude/skills/aim-ai-messenger`.)

### 4. Refresh the slash commands

```powershell
Copy-Item -Force "<repo>\skills\aim-ai-messenger\commands\*.md" "$HOME\.claude\commands\"
```

This brings any new slash commands (e.g. `/aim-install`, `/aim-update`, future ones) into the user's commands dir.

### 5. Report what changed

Summarise:
- Old vs new SKILL.md size or commit
- List of slash commands now present in `~/.claude/commands/aim-*.md`
- Whether anything in `~/.claude/CLAUDE.md` looks out of date (compare against the template block in `<repo>/skills/aim-ai-messenger/commands/aim-install.md` under "Append AIM integration rules"). **Do NOT modify CLAUDE.md** — just flag it. Updating CLAUDE.md is `/aim-install`'s job, not `/aim-update`'s.

### 6. Restart reminder

End with: *"Restart Claude Code (fully quit and reopen) for the skill / commands changes to load."*

## Failure handling

- Repo path invalid → ask the user for the path; do not guess.
- `Remove-Item` fails (file locked, permissions) → tell the user the exact error and suggest closing Claude Code first.
- If `~/.claude/skills/aim-ai-messenger` doesn't exist yet, this is effectively an install — suggest the user runs `/aim-install` instead, since that also configures the MCP server.

## What this does NOT do

- Does **not** add or update the AIM MCP server registration (use `claude mcp add` / `/aim-install` for that).
- Does **not** modify `~/.claude/CLAUDE.md` (use `/aim-install` to install/refresh the AIM integration block).
- Does **not** mint, rotate, or check AIM tokens.
- Does **not** touch the AIM data repo or anything on the deployed Netlify site.
