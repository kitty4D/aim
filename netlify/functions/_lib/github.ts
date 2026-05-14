import { Octokit } from "@octokit/rest";
import { getEtag, setEtag } from "./blobs.js";

const PAT = process.env.GITHUB_PAT;
const REPO = process.env.GITHUB_REPO;

if (!PAT) throw new Error("GITHUB_PAT env var is required");
if (!REPO || !REPO.includes("/")) {
  throw new Error("GITHUB_REPO env var must be set to 'owner/name'");
}

const [REPO_OWNER, REPO_NAME] = REPO.split("/") as [string, string];

let _gh: Octokit | null = null;
function gh(): Octokit {
  if (!_gh) {
    _gh = new Octokit({ auth: PAT, userAgent: "aim-chat/0.1.0" });
  }
  return _gh;
}

export interface Author {
  name: string;
  email: string;
}

export interface CommitInfo {
  sha: string;
  author: { name: string; email: string; date: string };
  committer: { name: string; email: string; date: string };
  message: string;
  url: string;
  files?: Array<{ filename: string; status: string }>;
}

export interface FileContent {
  path: string;
  content: string;
  sha: string;
}

export async function getFile(path: string): Promise<FileContent | null> {
  try {
    const res = await gh().repos.getContent({ owner: REPO_OWNER, repo: REPO_NAME, path });
    if (Array.isArray(res.data)) return null;
    const data = res.data as { path: string; content: string; sha: string; type: string };
    if (data.type !== "file") return null;
    return {
      path: data.path,
      content: Buffer.from(data.content, "base64").toString("utf-8"),
      sha: data.sha,
    };
  } catch (e: unknown) {
    if (isNotFound(e)) return null;
    throw e;
  }
}

export async function putFile(
  path: string,
  content: string,
  commitMessage: string,
  author: Author,
): Promise<{ commitSha: string; fileSha: string; path: string }> {
  const existing = await getFile(path);
  const res = await gh().repos.createOrUpdateFileContents({
    owner: REPO_OWNER,
    repo: REPO_NAME,
    path,
    message: commitMessage,
    content: Buffer.from(content, "utf-8").toString("base64"),
    sha: existing?.sha,
    author,
    committer: author,
  });
  return {
    commitSha: res.data.commit.sha ?? "",
    fileSha: res.data.content?.sha ?? "",
    path,
  };
}

export async function deleteFile(
  path: string,
  commitMessage: string,
  author: Author,
): Promise<string> {
  const existing = await getFile(path);
  if (!existing) throw new Error(`File not found: ${path}`);
  const res = await gh().repos.deleteFile({
    owner: REPO_OWNER,
    repo: REPO_NAME,
    path,
    message: commitMessage,
    sha: existing.sha,
    author,
    committer: author,
  });
  return res.data.commit.sha ?? "";
}

export async function listCommits(opts: {
  path?: string;
  since?: string;
  until?: string;
  per_page?: number;
}): Promise<CommitInfo[]> {
  const cacheKey = `commits:${opts.path ?? ""}:${opts.since ?? ""}:${opts.until ?? ""}:${opts.per_page ?? 50}`;
  const cached = await getEtag(cacheKey);

  try {
    const res = await gh().request("GET /repos/{owner}/{repo}/commits", {
      owner: REPO_OWNER,
      repo: REPO_NAME,
      path: opts.path,
      since: opts.since,
      until: opts.until,
      per_page: opts.per_page ?? 50,
      headers: cached ? { "if-none-match": cached.etag } : {},
    });
    const commits = (res.data as unknown[]).map(mapCommit);
    const newEtag = res.headers.etag;
    if (newEtag) await setEtag(cacheKey, newEtag, commits);
    return commits;
  } catch (e: unknown) {
    if (isNotModified(e) && cached) {
      return cached.body as CommitInfo[];
    }
    throw e;
  }
}

export async function getCommit(sha: string): Promise<CommitInfo & { fileContents: FileContent[] }> {
  const res = await gh().repos.getCommit({ owner: REPO_OWNER, repo: REPO_NAME, ref: sha });
  const info = mapCommit(res.data);
  info.files = (res.data.files ?? []).map((f) => ({ filename: f.filename, status: f.status }));

  const fileContents: FileContent[] = [];
  for (const file of res.data.files ?? []) {
    if (file.status === "removed") continue;
    const fc = await getFile(file.filename);
    if (fc) fileContents.push(fc);
  }

  return { ...info, fileContents };
}

export async function searchCommits(query: string): Promise<CommitInfo[]> {
  const q = `${query} repo:${REPO_OWNER}/${REPO_NAME}`;
  const res = await gh().search.commits({ q, per_page: 50 });
  return res.data.items.map(mapCommit);
}

export async function createLightweightTag(tagName: string, sha: string): Promise<void> {
  await gh().git.createRef({
    owner: REPO_OWNER,
    repo: REPO_NAME,
    ref: `refs/tags/${tagName}`,
    sha,
  });
}

export async function deleteTag(tagName: string): Promise<void> {
  await gh().git.deleteRef({
    owner: REPO_OWNER,
    repo: REPO_NAME,
    ref: `tags/${tagName}`,
  });
}

export async function listMatchingTags(
  prefix: string,
): Promise<Array<{ ref: string; tag: string; sha: string }>> {
  try {
    const res = await gh().git.listMatchingRefs({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      ref: `tags/${prefix}`,
    });
    return res.data.map((r) => ({
      ref: r.ref,
      tag: r.ref.replace(/^refs\/tags\//, ""),
      sha: r.object.sha,
    }));
  } catch (e: unknown) {
    if (isNotFound(e)) return [];
    throw e;
  }
}

function mapCommit(c: any): CommitInfo {
  return {
    sha: c.sha,
    author: {
      name: c.commit?.author?.name ?? "unknown",
      email: c.commit?.author?.email ?? "",
      date: c.commit?.author?.date ?? "",
    },
    committer: {
      name: c.commit?.committer?.name ?? "unknown",
      email: c.commit?.committer?.email ?? "",
      date: c.commit?.committer?.date ?? "",
    },
    message: c.commit?.message ?? "",
    url: c.html_url ?? "",
  };
}

function isNotFound(e: unknown): boolean {
  return typeof e === "object" && e !== null && "status" in e && (e as { status: number }).status === 404;
}

function isNotModified(e: unknown): boolean {
  return typeof e === "object" && e !== null && "status" in e && (e as { status: number }).status === 304;
}

export { REPO_OWNER, REPO_NAME };
