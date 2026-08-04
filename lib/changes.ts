import type { Message } from './types';

export type FileAction =
  | 'write'
  | 'edit'
  | 'read'
  | 'delete'
  | 'rename'
  | 'other';

export type FileChange = {
  path: string;
  actions: FileAction[];
  /** Prefer write/edit over read for display priority */
  primaryAction: FileAction;
  count: number;
  lastTool?: string;
};

export type LinkedPull = {
  url: string;
  number?: number;
  owner?: string;
  repo?: string;
  label: string;
};

const WRITE_TOOLS = new Set([
  'write',
  'create',
  'create_file',
  'notebookedit',
  'notebook_edit',
]);
const EDIT_TOOLS = new Set([
  'edit',
  'strreplace',
  'str_replace',
  'search_replace',
  'apply_patch',
  'multiedit',
]);
const READ_TOOLS = new Set(['read', 'read_file', 'readfile']);
const DELETE_TOOLS = new Set(['delete', 'delete_file', 'remove']);

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function toolAction(name: string): FileAction {
  const n = name.toLowerCase().replace(/[\s-]+/g, '_');
  if (WRITE_TOOLS.has(n) || n.includes('write')) return 'write';
  if (EDIT_TOOLS.has(n) || n.includes('edit') || n.includes('replace'))
    return 'edit';
  if (READ_TOOLS.has(n) || n === 'read') return 'read';
  if (DELETE_TOOLS.has(n) || n.includes('delete')) return 'delete';
  if (n.includes('rename') || n.includes('move')) return 'rename';
  return 'other';
}

function pathFromInput(input: unknown): string | null {
  const rec = asRecord(input);
  if (!rec) return null;

  for (const key of [
    'file_path',
    'filePath',
    'path',
    'target_file',
    'targetFile',
    'filename',
    'file',
    'notebook_path',
    'notebookPath',
  ]) {
    const v = rec[key];
    if (typeof v === 'string' && v.trim() && !v.includes('\n') && v.length < 500) {
      return normalizePath(v.trim());
    }
  }

  // Multi-edit style
  if (Array.isArray(rec.edits)) {
    return null; // handled per-edit elsewhere if needed
  }

  return null;
}

function normalizePath(p: string): string {
  // Strip workspace absolute prefixes common in cloud sandboxes
  let s = p.replace(/\\/g, '/');
  const markers = [
    '/home/vercel-sandbox/',
    '/workspace/',
    '/workspaces/',
    '/tmp/work/',
  ];
  for (const m of markers) {
    const i = s.indexOf(m);
    if (i >= 0) {
      s = s.slice(i + m.length);
      // drop first path segment if it's a repo name only once
      break;
    }
  }
  // If still absolute and deep, take from first meaningful segment after home
  if (s.startsWith('/home/')) {
    const parts = s.split('/');
    // /home/user/repo/... → skip 3
    if (parts.length > 4) s = parts.slice(4).join('/');
  }
  return s.replace(/^\.\//, '');
}

function primaryAction(actions: FileAction[]): FileAction {
  const order: FileAction[] = ['delete', 'write', 'edit', 'rename', 'other', 'read'];
  for (const a of order) {
    if (actions.includes(a)) return a;
  }
  return 'other';
}

function collectToolUses(node: unknown, out: { name: string; input: unknown }[]) {
  const rec = asRecord(node);
  if (!rec) {
    if (Array.isArray(node)) {
      for (const item of node) collectToolUses(item, out);
    }
    return;
  }

  const type = String(rec.type || '');
  if (type === 'tool_use' || type === 'server_tool_use') {
    out.push({
      name: typeof rec.name === 'string' ? rec.name : 'tool',
      input: rec.input,
    });
  }

  // Assistant message content blocks
  const message = asRecord(rec.message);
  if (message && Array.isArray(message.content)) {
    collectToolUses(message.content, out);
  }
  if (Array.isArray(rec.content)) {
    collectToolUses(rec.content, out);
  }
  if (rec.rawPayload) {
    collectToolUses(rec.rawPayload, out);
  }

  // Walk other object values lightly
  for (const [k, v] of Object.entries(rec)) {
    if (k === 'rawPayload' || k === 'message' || k === 'content' || k === 'input')
      continue;
    if (v && typeof v === 'object') collectToolUses(v, out);
  }
}

const PR_URL_RE =
  /https?:\/\/(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)/gi;
const COMPARE_URL_RE =
  /https?:\/\/(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)\/compare\/[^\s)\]>`"']+/gi;

function textFromMessage(message: Message): string {
  const c = message.content;
  if (typeof c === 'string') return c;
  const rec = asRecord(c);
  if (!rec) return '';
  if (typeof rec.message === 'string') return rec.message;
  try {
    return JSON.stringify(c);
  } catch {
    return '';
  }
}

/** Extract GitHub PR / compare links from chat messages (not issues). */
export function extractLinkedResources(messages: Message[]): {
  pulls: LinkedPull[];
} {
  const pullMap = new Map<string, LinkedPull>();

  for (const m of messages) {
    const text = textFromMessage(m);

    for (const match of text.matchAll(PR_URL_RE)) {
      const url = match[0];
      const number = Number(match[3]);
      pullMap.set(url, {
        url,
        number,
        owner: match[1],
        repo: match[2],
        label: `PR #${number}`,
      });
    }

    for (const match of text.matchAll(COMPARE_URL_RE)) {
      const url = match[0];
      if (!pullMap.has(url)) {
        pullMap.set(url, { url, label: 'Compare on GitHub' });
      }
    }
  }

  return {
    pulls: Array.from(pullMap.values()),
  };
}

/** Hints scraped from chat/SQL transcript text for PR matching. */
export type GitHints = {
  pullNumbers: number[];
  pulls: LinkedPull[];
  /** Likely git head refs (city names, feature branches, etc.) */
  branches: string[];
  repoUrls: string[];
};

const BRANCH_CONTEXT_RES: RegExp[] = [
  // On branch foo / Current branch: foo / Switched to branch 'foo'
  /(?:on branch|current branch|switched to (?:a )?branch|checked out branch)\s+[`'"]?([A-Za-z0-9][A-Za-z0-9._/-]{1,120})/gi,
  // git checkout -b foo / git switch -c foo / git push -u origin foo
  /git\s+(?:checkout|switch)(?:\s+-b|\s+-c)?\s+[`'"]?([A-Za-z0-9][A-Za-z0-9._/-]{1,120})/gi,
  /git\s+push(?:\s+-[uU])?\s+origin\s+[`'"]?([A-Za-z0-9][A-Za-z0-9._/-]{1,120})/gi,
  // gh pr create --head foo / --base main
  /--head\s+[`'"]?([A-Za-z0-9][A-Za-z0-9._/-]{1,120})/gi,
  // github.com/org/repo/tree/branch
  /github\.com\/[\w.-]+\/[\w.-]+\/tree\/([A-Za-z0-9][A-Za-z0-9._/-]{1,120})/gi,
  // compare/base...head or compare/base...owner:head
  /github\.com\/[\w.-]+\/[\w.-]+\/compare\/[^\s)\]>`"']*?\.\.\.(?:[\w.-]+:)?([A-Za-z0-9][A-Za-z0-9._/-]{1,120})/gi,
  // branch `foo` / branch "foo"
  /\bbranch\s+[`'"]([A-Za-z0-9][A-Za-z0-9._/-]{1,120})[`'"]/gi,
];

const REPO_URL_RE =
  /(?:https?:\/\/github\.com\/[\w.-]+\/[\w.-]+(?:\.git)?|git@github\.com:[\w.-]+\/[\w.-]+(?:\.git)?)/gi;

const NOISE_BRANCHES = new Set([
  'main',
  'master',
  'develop',
  'development',
  'staging',
  'production',
  'prod',
  'release',
  'trunk',
  'head',
  'origin',
  'upstream',
  'refs',
  'heads',
  'remotes',
  'true',
  'false',
  'null',
  'undefined',
  'branch',
  'feature',
  'fix',
  'hotfix',
  'chore',
  'docs',
  'test',
  'tests',
  'dev',
  'latest',
  'stable',
]);

function isPlausibleBranch(ref: string): boolean {
  const b = ref.trim().replace(/^origin\//, '').replace(/^heads\//, '');
  if (!b || b.length < 2 || b.length > 120) return false;
  if (/\s/.test(b) || b.includes('://')) return false;
  if (NOISE_BRANCHES.has(b.toLowerCase())) return false;
  // Avoid common path-ish noise
  if (b.includes('.') && (b.endsWith('.ts') || b.endsWith('.js') || b.endsWith('.md') || b.endsWith('.json'))) {
    return false;
  }
  // Prefer refs that look like Conductor city names or feature branches
  return /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(b);
}

/**
 * Extract PR numbers, likely branch names, and repo URLs from plain transcript text.
 * Conductor workspace GET does not expose branch — only SQL/transcripts do.
 */
export function extractGitHintsFromText(...texts: (string | null | undefined)[]): GitHints {
  const pullNumbers = new Set<number>();
  const pulls = new Map<string, LinkedPull>();
  const branches: string[] = [];
  const seenBranch = new Set<string>();
  const repoUrls = new Set<string>();

  const rememberBranch = (raw: string) => {
    const b = raw.trim().replace(/^origin\//, '').replace(/^heads\//, '');
    if (!isPlausibleBranch(b)) return;
    const key = b.toLowerCase();
    if (seenBranch.has(key)) return;
    seenBranch.add(key);
    branches.push(b);
  };

  for (const text of texts) {
    if (!text || typeof text !== 'string') continue;

    for (const match of text.matchAll(PR_URL_RE)) {
      const n = Number(match[3]);
      if (Number.isFinite(n) && n > 0) {
        pullNumbers.add(n);
        pulls.set(match[0], {
          url: match[0],
          number: n,
          owner: match[1],
          repo: match[2],
          label: `PR #${n}`,
        });
      }
    }

    for (const re of BRANCH_CONTEXT_RES) {
      re.lastIndex = 0;
      for (const match of text.matchAll(re)) {
        if (match[1]) rememberBranch(match[1]);
      }
    }

    for (const match of text.matchAll(REPO_URL_RE)) {
      repoUrls.add(match[0].replace(/[.,;:]+$/, ''));
    }
  }

  return {
    pullNumbers: Array.from(pullNumbers),
    pulls: Array.from(pulls.values()),
    branches,
    repoUrls: Array.from(repoUrls),
  };
}

/** Merge hints from messages + free-text transcripts. */
export function extractGitHintsFromMessages(messages: Message[]): GitHints {
  const texts = messages.map(textFromMessage);
  const fromText = extractGitHintsFromText(...texts);
  const links = extractLinkedResources(messages);
  const pullNumbers = new Set(fromText.pullNumbers);
  const pulls = new Map(fromText.pulls.map((pull) => [pull.url, pull]));
  for (const p of links.pulls) {
    if (typeof p.number === 'number') pullNumbers.add(p.number);
    pulls.set(p.url, p);
  }
  return {
    pullNumbers: Array.from(pullNumbers),
    pulls: Array.from(pulls.values()),
    branches: fromText.branches,
    repoUrls: fromText.repoUrls,
  };
}

export function extractFileChanges(messages: Message[]): FileChange[] {
  const map = new Map<string, FileChange>();

  for (const message of messages) {
    const tools: { name: string; input: unknown }[] = [];
    collectToolUses(message.content, tools);

    for (const t of tools) {
      const action = toolAction(t.name);
      // Skip pure bash unless it looks like a file touch we can parse
      const nameLower = t.name.toLowerCase();
      if (nameLower === 'bash' || nameLower === 'shell' || nameLower === 'run') {
        continue;
      }

      const path = pathFromInput(t.input);
      if (!path) continue;
      // Skip huge non-path noise
      if (path.includes(' ') && !path.includes('/')) continue;

      const existing = map.get(path);
      if (existing) {
        if (!existing.actions.includes(action)) existing.actions.push(action);
        existing.count += 1;
        existing.primaryAction = primaryAction(existing.actions);
        existing.lastTool = t.name;
      } else {
        map.set(path, {
          path,
          actions: [action],
          primaryAction: action,
          count: 1,
          lastTool: t.name,
        });
      }
    }
  }

  const list = Array.from(map.values());
  // Sort: writes/edits first, then path
  const rank: Record<FileAction, number> = {
    delete: 0,
    write: 1,
    edit: 2,
    rename: 3,
    other: 4,
    read: 5,
  };
  list.sort((a, b) => {
    const r = rank[a.primaryAction] - rank[b.primaryAction];
    if (r !== 0) return r;
    return a.path.localeCompare(b.path);
  });
  return list;
}

export function fileActionLabel(action: FileAction): string {
  switch (action) {
    case 'write':
      return 'added';
    case 'edit':
      return 'modified';
    case 'read':
      return 'read';
    case 'delete':
      return 'deleted';
    case 'rename':
      return 'renamed';
    default:
      return 'touched';
  }
}

export function fileActionColor(action: FileAction): string {
  switch (action) {
    case 'write':
      return '#3DDC97';
    case 'edit':
      return '#6C8CFF';
    case 'delete':
      return '#FF6B6B';
    case 'rename':
      return '#F5A524';
    case 'read':
      return '#6B7385';
    default:
      return '#9AA3B5';
  }
}

export function basename(path: string): string {
  const parts = path.split('/');
  return parts[parts.length - 1] || path;
}

export function dirname(path: string): string {
  const i = path.lastIndexOf('/');
  return i > 0 ? path.slice(0, i) : '';
}
