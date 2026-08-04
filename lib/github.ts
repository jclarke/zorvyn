import { deleteSecret, getSecret, setSecret } from './storage';

const GITHUB_TOKEN_KEY = 'github_pat';

export type GithubRepo = {
  owner: string;
  repo: string;
  host: string; // github.com
};

export type GithubPull = {
  number: number;
  title: string;
  state: string;
  htmlUrl: string;
  headRef: string;
  baseRef: string;
  draft?: boolean;
  user?: string;
  additions?: number;
  deletions?: number;
  changedFiles?: number;
};

export type GithubPullFile = {
  filename: string;
  status: string; // added | removed | modified | renamed | …
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
  previousFilename?: string;
  blobUrl?: string;
};

export async function loadGithubToken(): Promise<string | null> {
  return getSecret(GITHUB_TOKEN_KEY);
}

export async function saveGithubToken(token: string | null): Promise<void> {
  if (token?.trim()) {
    await setSecret(GITHUB_TOKEN_KEY, token.trim());
  } else {
    await deleteSecret(GITHUB_TOKEN_KEY);
  }
}

/** Parse https://github.com/org/repo(.git) or git@github.com:org/repo.git */
export function parseGithubRemote(remote?: string | null): GithubRepo | null {
  if (!remote) return null;
  const s = remote.trim();

  let m = s.match(
    /^(?:https?:\/\/|git@)([^/:]+)[/:]([^/]+)\/([^/]+?)(?:\.git)?\/?$/i,
  );
  if (!m) {
    m = s.match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?\/?$/i);
    if (!m) return null;
    return { host: 'github.com', owner: m[1], repo: m[2].replace(/\.git$/, '') };
  }

  const host = m[1].replace(/^git@/, '');
  if (!/github\.com$/i.test(host) && host !== 'github.com') {
    // still allow github enterprise later; for now require github.com
    if (!host.includes('github')) return null;
  }

  return {
    host: host.includes('github') ? 'github.com' : host,
    owner: m[2],
    repo: m[3].replace(/\.git$/, ''),
  };
}

export function githubCompareUrl(
  repo: GithubRepo,
  branch: string,
  base = 'main',
): string {
  return `https://${repo.host}/${repo.owner}/${repo.repo}/compare/${encodeURIComponent(base)}...${encodeURIComponent(branch)}`;
}

export function githubTreeUrl(repo: GithubRepo, branch: string): string {
  return `https://${repo.host}/${repo.owner}/${repo.repo}/tree/${encodeURIComponent(branch)}`;
}

export function githubPullsUrl(repo: GithubRepo, branch: string): string {
  return `https://${repo.host}/${repo.owner}/${repo.repo}/pulls?q=is%3Apr+head%3A${encodeURIComponent(branch)}`;
}

async function githubFetch<T>(
  path: string,
  token: string | null,
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'Zorvyn/1.0',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`https://api.github.com${path}`, { headers });
  if (!res.ok) {
    const text = await res.text();
    let message = `GitHub ${res.status}`;
    try {
      const j = JSON.parse(text);
      if (j.message) message = j.message;
    } catch {
      if (text) message = text.slice(0, 200);
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

type GhPullRaw = {
  number: number;
  title: string;
  state: string;
  html_url: string;
  draft?: boolean;
  additions?: number;
  deletions?: number;
  changed_files?: number;
  user?: { login?: string };
  head?: { ref?: string };
  base?: { ref?: string };
};

type GhFileRaw = {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
  previous_filename?: string;
  blob_url?: string;
};

/** Find open (then closed) PRs whose head branch matches. */
export async function findPullsForBranch(
  repo: GithubRepo,
  branch: string,
  token: string | null,
): Promise<GithubPull[]> {
  const head = `${repo.owner}:${branch}`;
  const q = encodeURIComponent(head);

  const open = await githubFetch<GhPullRaw[]>(
    `/repos/${repo.owner}/${repo.repo}/pulls?state=open&head=${q}&per_page=10`,
    token,
  );

  let list = open;
  if (!list.length) {
    list = await githubFetch<GhPullRaw[]>(
      `/repos/${repo.owner}/${repo.repo}/pulls?state=all&head=${q}&per_page=10`,
      token,
    );
  }

  return list.map((p) => ({
    number: p.number,
    title: p.title,
    state: p.state,
    htmlUrl: p.html_url,
    headRef: p.head?.ref || branch,
    baseRef: p.base?.ref || 'main',
    draft: p.draft,
    user: p.user?.login,
    additions: p.additions,
    deletions: p.deletions,
    changedFiles: p.changed_files,
  }));
}

export async function listPullFiles(
  repo: GithubRepo,
  pullNumber: number,
  token: string | null,
): Promise<GithubPullFile[]> {
  const files = await githubFetch<GhFileRaw[]>(
    `/repos/${repo.owner}/${repo.repo}/pulls/${pullNumber}/files?per_page=100`,
    token,
  );

  return files.map((f) => ({
    filename: f.filename,
    status: f.status,
    additions: f.additions,
    deletions: f.deletions,
    changes: f.changes,
    patch: f.patch,
    previousFilename: f.previous_filename,
    blobUrl: f.blob_url,
  }));
}
