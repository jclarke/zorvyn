/** Build safe read-only SQL for session_transcripts_view from UI filters. */

export type TimeRange = '24h' | '7d' | '30d' | 'all';
export type WorkspaceFilter = 'any' | 'ready';

export type SearchFilters = {
  /** Free-text match against transcript + titles + workspace name */
  text: string;
  range: TimeRange;
  workspace: WorkspaceFilter;
};

export const TIME_RANGE_OPTIONS: {
  value: TimeRange;
  label: string;
  short: string;
}[] = [
  { value: '24h', label: 'Last 24 hours', short: '24h' },
  { value: '7d', label: 'Last 7 days', short: '7d' },
  { value: '30d', label: 'Last 30 days', short: '30d' },
  { value: 'all', label: 'All time', short: 'All' },
];

export const WORKSPACE_FILTER_OPTIONS: {
  value: WorkspaceFilter;
  label: string;
}[] = [
  { value: 'any', label: 'Any state' },
  { value: 'ready', label: 'Live only' },
];

export type QuickLook = {
  id: string;
  title: string;
  subtitle: string;
  icon: 'time-outline' | 'flash-outline' | 'git-branch-outline' | 'search-outline';
  filters: SearchFilters;
};

export const QUICK_LOOKS: QuickLook[] = [
  {
    id: 'today',
    title: 'Today’s work',
    subtitle: 'Sessions updated in the last day',
    icon: 'time-outline',
    filters: { text: '', range: '24h', workspace: 'any' },
  },
  {
    id: 'live',
    title: 'Live workspaces',
    subtitle: 'Activity in ready sandboxes',
    icon: 'flash-outline',
    filters: { text: '', range: '7d', workspace: 'ready' },
  },
  {
    id: 'week',
    title: 'This week',
    subtitle: 'Everything from the past 7 days',
    icon: 'git-branch-outline',
    filters: { text: '', range: '7d', workspace: 'any' },
  },
];

/** Escape a string for use inside a single-quoted SQL literal. */
export function escapeSqlLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

/**
 * Reject inputs that could break out of our ILIKE patterns or confuse the
 * API's single-statement guard (semicolons, set_config, etc.).
 */
export function sanitizeSearchText(raw: string): string {
  return raw
    .replace(/[;\n\r]/g, ' ')
    .replace(/set_config/gi, '')
    .trim()
    .slice(0, 200);
}

export function buildTranscriptSearchSql(filters: SearchFilters): string {
  const clauses: string[] = [];
  const text = sanitizeSearchText(filters.text);

  if (text) {
    const lit = escapeSqlLiteral(text);
    clauses.push(
      `(transcript ILIKE '%${lit}%' OR session_title ILIKE '%${lit}%' OR workspace_name ILIKE '%${lit}%')`,
    );
  }

  switch (filters.range) {
    case '24h':
      clauses.push(`transcript_updated_at >= now() - interval '24 hours'`);
      break;
    case '7d':
      clauses.push(`transcript_updated_at >= now() - interval '7 days'`);
      break;
    case '30d':
      clauses.push(`transcript_updated_at >= now() - interval '30 days'`);
      break;
    case 'all':
    default:
      break;
  }

  if (filters.workspace === 'ready') {
    clauses.push(`workspace_state = 'ready'`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  return `SELECT session_id, workspace_id, session_title, workspace_name, workspace_state, agent_type, model, transcript, transcript_updated_at, session_created_at, repo_url
FROM session_transcripts_view
${where}
ORDER BY transcript_updated_at DESC
LIMIT 40`;
}

export type SearchHit = {
  sessionId?: string;
  workspaceId?: string;
  sessionTitle?: string;
  workspaceName?: string;
  workspaceState?: string;
  agentType?: string;
  model?: string;
  transcript?: string;
  updatedAt?: string;
  createdAt?: string;
  repoUrl?: string;
};

export function rowToHit(row: Record<string, unknown>): SearchHit {
  const str = (k: string) =>
    typeof row[k] === 'string' ? (row[k] as string) : undefined;

  return {
    sessionId: str('session_id'),
    workspaceId: str('workspace_id'),
    sessionTitle: str('session_title'),
    workspaceName: str('workspace_name'),
    workspaceState: str('workspace_state'),
    agentType: str('agent_type'),
    model: str('model'),
    transcript: str('transcript'),
    updatedAt: str('transcript_updated_at'),
    createdAt: str('session_created_at'),
    repoUrl: str('repo_url'),
  };
}

/** Pull a short snippet around the first match of `needle` in `text`. */
export function snippetAround(
  text: string | undefined,
  needle: string,
  radius = 70,
): string {
  if (!text) return '';
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!needle.trim()) {
    return clean.length > radius * 2
      ? `${clean.slice(0, radius * 2)}…`
      : clean;
  }

  const lower = clean.toLowerCase();
  const q = needle.toLowerCase().trim();
  const idx = lower.indexOf(q);
  if (idx < 0) {
    return clean.length > radius * 2
      ? `${clean.slice(0, radius * 2)}…`
      : clean;
  }

  const start = Math.max(0, idx - radius);
  const end = Math.min(clean.length, idx + q.length + radius);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < clean.length ? '…' : '';
  return `${prefix}${clean.slice(start, end)}${suffix}`;
}

export function displayTitle(hit: SearchHit): string {
  return (
    hit.sessionTitle?.trim() ||
    hit.workspaceName?.trim() ||
    (hit.sessionId ? `Session ${hit.sessionId.slice(0, 8)}` : 'Session')
  );
}
