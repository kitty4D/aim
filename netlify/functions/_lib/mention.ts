const MENTION_RE = /(?:^|[\s(])@([A-Za-z0-9_][A-Za-z0-9_-]{0,38})/g;

export function parseMentions(text: string): string[] {
  const seen = new Set<string>();
  for (const m of text.matchAll(MENTION_RE)) {
    seen.add(m[1].toLowerCase());
  }
  return [...seen];
}

export function mentionTrailer(mentions: string[]): string {
  if (mentions.length === 0) return "";
  return `Mention: ${mentions.map((m) => `@${m}`).join(" ")}`;
}
