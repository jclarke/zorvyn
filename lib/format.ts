/**
 * Best-effort plain-text extraction from Conductor transcript content.
 * Prefer `parseTranscriptMessage` / MessageBubble for chat UI.
 */
export function formatMessageContent(content: unknown): string {
  if (content == null) return '';
  if (typeof content === 'string') return content;

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object') {
          const p = part as Record<string, unknown>;
          if (typeof p.text === 'string') return p.text;
          if (typeof p.thinking === 'string') return p.thinking;
          if (typeof p.content === 'string') return p.content;
          if (p.type === 'tool_use' && typeof p.name === 'string') {
            return `[tool] ${p.name}`;
          }
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }

  if (typeof content === 'object') {
    const obj = content as Record<string, unknown>;
    if (typeof obj.message === 'string') return obj.message;
    if (typeof obj.text === 'string') return obj.text;
    if (typeof obj.content === 'string') return obj.content;

    const raw = obj.rawPayload;
    if (raw && typeof raw === 'object') {
      const rp = raw as Record<string, unknown>;
      if (typeof rp.result === 'string') return rp.result;
      const msg = rp.message;
      if (msg && typeof msg === 'object') {
        const m = msg as Record<string, unknown>;
        if (Array.isArray(m.content)) {
          return formatMessageContent(m.content);
        }
        if (typeof m.content === 'string') return m.content;
      }
    }
    return '';
  }

  return String(content);
}

/** Parse Conductor timestamps like "2026-08-04 04:03:20.816+00". */
export function parseConductorDate(value?: string | null): Date | null {
  if (!value) return null;
  let d = new Date(value);
  if (!Number.isNaN(d.getTime())) return d;

  // "YYYY-MM-DD HH:mm:ss.sss+00" → ISO-ish
  const normalized = value
    .replace(' ', 'T')
    .replace(/\+00$/, '+00:00')
    .replace(/([+-]\d{2})$/, '$1:00');
  d = new Date(normalized);
  if (!Number.isNaN(d.getTime())) return d;
  return null;
}

export function formatRelativeTime(iso?: string | null): string {
  if (!iso) return '';
  const date = parseConductorDate(iso);
  if (!date) return iso;

  const now = Date.now();
  const diff = now - date.getTime();
  const sec = Math.round(diff / 1000);
  if (sec < 45) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 14) return `${day}d ago`;
  return date.toLocaleDateString();
}

export function formatDateTime(iso?: string | null): string {
  if (!iso) return '';
  const date = parseConductorDate(iso);
  if (!date) return iso;
  return date.toLocaleString();
}

export function shortId(id?: string | null, len = 8): string {
  if (!id) return '';
  return id.length <= len ? id : `${id.slice(0, len)}…`;
}

export function messageRoleLabel(type: string): string {
  const t = type.toLowerCase();
  if (t.includes('user') || t === 'human' || t === 'prompt') return 'You';
  if (t.includes('assistant') || t.includes('agent') || t === 'response') return 'Agent';
  if (t.includes('system')) return 'System';
  if (t.includes('tool')) return 'Tool';
  return type;
}

export function isUserMessage(type: string): boolean {
  const t = type.toLowerCase();
  return t.includes('user') || t === 'human' || t === 'prompt' || t === 'input';
}
