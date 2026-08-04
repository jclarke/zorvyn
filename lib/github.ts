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

export class GithubApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'GithubApiError';
    this.status = status;
  }
}

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
    return {
      host: 'github.com',
      owner: m[1],
      repo: m[2].replace(/\.git$/, ''),
    };
  }

  const host = m[1].replace(/^git@/, '');
  if (!/github\.com$/i.test(host) && host !== 'github.com') {
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

export function githubPullsUrl(repo: GithubRepo, branch?: string): string {
  if (branch) {
    return `https://${repo.host}/${repo.owner}/${repo.repo}/pulls?q=is%3Apr+${encodeURIComponent(branch)}`;
  }
  return `https://${repo.host}/${repo.owner}/${repo.repo}/pulls`;
}

export function githubRepoUrl(repo: GithubRepo): string {
  return `https://${repo.host}/${repo.owner}/${repo.repo}`;
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
    throw new GithubApiError(res.status, message);
  }
  return res.json() as T;
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
  head?: { ref?: string; label?: string; repo?: { full_name?: string } };
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

type GhSearchItem = {
  number: number;
  title: string;
  state: string;
  html_url: string;
  pull_request?: { html_url?: string };
  user?: { login?: string };
};

function mapPull(p: GhPullRaw, fallbackBranch?: string): GithubPull {
  return {
    number: p.number,
    title: p.title,
    state: p.state,
    htmlUrl: p.html_url,
    headRef: p.head?.ref || fallbackBranch || '',
    baseRef: p.base?.ref || 'main',
    draft: p.draft,
    user: p.user?.login,
    additions: p.additions,
    deletions: p.deletions,
    changedFiles: p.changed_files,
  };
}

/** Confirm the token can see this repo (private repos 404 without access). */
export async function assertRepoAccess(
  repo: GithubRepo,
  token: string | null,
): Promise<{ fullName: string; private: boolean }> {
  if (!token) {
    throw new GithubApiError(
      401,
      'No GitHub token saved. Add a PAT in Settings that can access this repository.',
    );
  }

  try {
    const data = await githubFetch<{
      full_name: string;
      private: boolean;
    }>(`/repos/${repo.owner}/${repo.repo}`, token);
    return { fullName: data.full_name, private: data.private };
  } catch (e) {
    if (e instanceof GithubApiError && e.status === 404) {
      throw new GithubApiError(
        404,
        `Cannot access ${repo.owner}/${repo.repo}. Fine-grained PATs must explicitly include this repository; classic PATs need the "repo" scope and org access (SSO authorize if required).`,
      );
    }
    throw e;
  }
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function titleLikelyMatch(workspaceHint: string, prTitle: string): boolean {
  const a = normalize(workspaceHint);
  const b = normalize(prTitle);
  if (!a || !b) return false;
  if (a === b) return true;
  if (b.includes(a) || a.includes(b)) return true;
  // token overlap (ignore short words)
  const at = new Set(a.split(' ').filter((w) => w.length > 2));
  const bt = new Set(b.split(' ').filter((w) => w.length > 2));
  if (!at.size) return false;
  let hit = 0;
  for (const t of at) if (bt.has(t)) hit += 1;
  return hit / at.size >= 0.6;
}

/**
 * Find PRs for a workspace:
 * 1) explicit head branch match (if branch looks like a git ref)
 * 2) open PRs whose title matches the workspace name
 * 3) search API on title/body
 * 4) recently updated PRs (fallback list)
 */
export async function findPullsForWorkspace(
  repo: GithubRepo,
  options: {
    branch?: string | null;
    workspaceName?: string | null;
    linkedPullNumbers?: number[];
    token: string | null;
  },
): Promise<GithubPull[]> {
  await assertRepoAccess(repo, options.token);
  const token = options.token!;
  const found = new Map<number, GithubPull>();

  const remember = (p: GithubPull) => {
    if (!found.has(p.number)) found.set(p.number, p);
  };

  // 0) Linked PR numbers from transcripts
  for (const n of options.linkedPullNumbers || []) {
    try {
      const p = await githubFetch<GhPullRaw>(
        `/repos/${repo.owner}/${repo.repo}/pulls/${n}`,
        token,
      );
      remember(mapPull(p));
    } catch {
      // ignore missing
    }
  }
  if (found.size) return Array.from(found.values());

  const branch = (options.branch || '').trim();
  const workspaceName = (options.workspaceName || '').trim();
  // Only use as git head ref if it looks like a branch (no spaces preferred; allow slash/underscore)
  const branchLooksValid =
    !!branch &&
    !/\s/.test(branch) &&
    branch.length < 200 &&
    !branch.includes('://');

  // 1) Exact head branch
  if (branchLooksValid) {
    const head = encodeURIComponent(`${repo.owner}:${branch}`);
    for (const state of ['open', 'all'] as const) {
      try {
        const list = await githubFetch<GhPullRaw[]>(
          `/repos/${repo.owner}/${repo.repo}/pulls?state=${state}&head=${head}&per_page=10`,
          token,
        );
        for (const p of list) remember(mapPull(p, branch));
        if (found.size) return Array.from(found.values());
      } catch {
        // continue
      }
    }
  }

  // 2) Scan open PRs for title / head match
  const hint = workspaceName || branch;
  try {
    const open = await githubFetch<GhPullRaw[]>(
      `/repos/${repo.owner}/${repo.repo}/pulls?state=open&sort=updated&per_page=30`,
      token,
    );
    for (const p of open) {
      if (
        (hint && titleLikelyMatch(hint, p.title)) ||
        (branch && p.head?.ref === branch) ||
        (workspaceName && p.head?.ref && titleLikelyMatch(workspaceName, p.head.ref))
      ) {
        remember(mapPull(p));
      }
    }
    if (found.size) return Array.from(found.values());
  } catch {
    // continue
  }

  // 3) Search issues/PRs by title keywords
  if (hint) {
    const q = encodeURIComponent(
      `repo:${repo.owner}/${repo.repo} is:pr ${hint.slice(0, 80)}`,
    );
    try {
      const search = await githubFetch<{ items: GhSearchItem[] }>(
        `/search/issues?q=${q}&per_page=10`,
        token,
      );
      for (const item of search.items || []) {
        if (!item.pull_request) continue;
        try {
          const p = await githubFetch<GhPullRaw>(
            `/repos/${repo.owner}/${repo.repo}/pulls/${item.number}`,
            token,
          );
          remember(mapPull(p));
        } catch {
          // ignore
        }
      }
      if (found.size) return Array.from(found.values());
    } catch {
      // continue
    }
  }

  // 4) Fallback: show recent open PRs so the user can pick one
  try {
    const open = await githubFetch<GhPullRaw[]>(
      `/repos/${repo.owner}/${repo.repo}/pulls?state=open&sort=updated&per_page=10`,
      token,
    );
    for (const p of open) remember(mapPull(p));
  } catch {
    // ignore
  }

  return Array.from(found.values());
}

/** @deprecated use findPullsForWorkspace */
export async function findPullsForBranch(
  repo: GithubRepo,
  branch: string,
  token: string | null,
): Promise<GithubPull[]> {
  return findPullsForWorkspace(repo, { branch, workspaceName: branch, token });
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
