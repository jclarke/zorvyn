import type { Message } from './types';

/** Visual kinds for the chat UI */
export type TranscriptKind =
  | 'user'
  | 'assistant'
  | 'thinking'
  | 'tool'
  | 'tool_result'
  | 'status'
  | 'error'
  | 'meta'
  | 'hidden';

export type TranscriptPart = {
  kind: TranscriptKind;
  /** Primary display text */
  text: string;
  /** Secondary detail (tool args, paths, etc.) */
  detail?: string;
  /** Optional icon hint for the bubble */
  icon?: 'person' | 'sparkles' | 'construct' | 'terminal' | 'alert' | 'time' | 'checkmark';
  /** When true, bubble is visually de-emphasized */
  muted?: boolean;
  /** When true, content is collapsed by default (thinking) */
  collapsible?: boolean;
};

export type ParsedMessage = {
  id: string;
  receivedAt: string;
  sessionIndex: number;
  /** Raw API type */
  type: string;
  /** Whether this row should render in the chat list */
  visible: boolean;
  parts: TranscriptPart[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function stringifyDetail(value: unknown, max = 400): string | undefined {
  if (value == null) return undefined;
  if (typeof value === 'string') {
    return value.length > max ? `${value.slice(0, max)}…` : value;
  }
  try {
    const s = JSON.stringify(value, null, 2);
    return s.length > max ? `${s.slice(0, max)}…` : s;
  } catch {
    return String(value);
  }
}

function summarizeToolInput(name: string, input: unknown): { text: string; detail?: string } {
  const rec = asRecord(input) || {};
  const n = name || 'tool';

  // Common Claude Code / Conductor tool shapes
  if (typeof rec.file_path === 'string') {
    return { text: n, detail: rec.file_path };
  }
  if (typeof rec.path === 'string') {
    return { text: n, detail: rec.path };
  }
  if (typeof rec.command === 'string') {
    return { text: n, detail: rec.command };
  }
  if (typeof rec.pattern === 'string') {
    const scope =
      typeof rec.path === 'string'
        ? rec.path
        : typeof rec.glob === 'string'
          ? rec.glob
          : undefined;
    return {
      text: n,
      detail: scope ? `${rec.pattern}  ·  ${scope}` : rec.pattern,
    };
  }
  if (typeof rec.query === 'string') {
    return { text: n, detail: rec.query };
  }
  if (typeof rec.url === 'string') {
    return { text: n, detail: rec.url };
  }
  if (typeof rec.prompt === 'string') {
    return {
      text: n,
      detail:
        rec.prompt.length > 160 ? `${rec.prompt.slice(0, 160)}…` : rec.prompt,
    };
  }
  if (typeof rec.description === 'string') {
    return { text: n, detail: rec.description };
  }
  if (typeof rec.todos !== 'undefined') {
    return { text: n, detail: 'update todos' };
  }

  const detail = stringifyDetail(input, 280);
  return { text: n, detail: detail === '{}' || detail === 'null' ? undefined : detail };
}

function partsFromContentBlocks(blocks: unknown[]): TranscriptPart[] {
  const parts: TranscriptPart[] = [];

  for (const block of blocks) {
    const b = asRecord(block);
    if (!b) continue;
    const type = String(b.type || '');

    if (type === 'text' && typeof b.text === 'string' && b.text.trim()) {
      parts.push({
        kind: 'assistant',
        text: b.text.trim(),
        icon: 'sparkles',
      });
      continue;
    }

    if (type === 'thinking' && typeof b.thinking === 'string' && b.thinking.trim()) {
      parts.push({
        kind: 'thinking',
        text: b.thinking.trim(),
        muted: true,
        collapsible: true,
        icon: 'time',
      });
      continue;
    }

    if (type === 'tool_use' || type === 'server_tool_use') {
      const name = typeof b.name === 'string' ? b.name : 'Tool';
      const summary = summarizeToolInput(name, b.input);
      parts.push({
        kind: 'tool',
        text: summary.text,
        detail: summary.detail,
        muted: true,
        icon: name.toLowerCase() === 'bash' ? 'terminal' : 'construct',
      });
      continue;
    }

    if (type === 'tool_result') {
      const content = b.content;
      let text = 'Tool result';
      if (typeof content === 'string') text = content;
      else if (Array.isArray(content)) {
        text = content
          .map((c) => {
            const r = asRecord(c);
            if (r && typeof r.text === 'string') return r.text;
            return stringifyDetail(c, 200) || '';
          })
          .filter(Boolean)
          .join('\n');
      } else if (content != null) {
        text = stringifyDetail(content, 400) || 'Tool result';
      }
      const isError = b.is_error === true;
      parts.push({
        kind: isError ? 'error' : 'tool_result',
        text: text.trim() || (isError ? 'Tool failed' : 'Tool finished'),
        muted: !isError,
        icon: isError ? 'alert' : 'checkmark',
      });
      continue;
    }

    if (type === 'image') {
      parts.push({
        kind: 'meta',
        text: 'Image attachment',
        muted: true,
      });
      continue;
    }

    // Unknown block — show a short label, not raw JSON
    if (type) {
      parts.push({
        kind: 'meta',
        text: type.replace(/_/g, ' '),
        detail: stringifyDetail(b, 200),
        muted: true,
      });
    }
  }

  return parts;
}

/**
 * Codex / OpenAI Responses-style agent stream (gpt-5.x-sol, etc.):
 * rawPayload: { event: { type: 'item.completed', item: { type: 'agentMessage', text } }, thread_id }
 * Claude-style uses rawPayload.type === 'assistant' | 'user' | … instead.
 */
function textFromCodexContent(content: unknown): string {
  if (typeof content === 'string') return content.trim();
  if (!Array.isArray(content)) return '';
  return content
    .map((block) => {
      const b = asRecord(block);
      if (!b) return '';
      if (typeof b.text === 'string') return b.text;
      if (typeof b.output_text === 'string') return b.output_text;
      return '';
    })
    .filter(Boolean)
    .join('\n')
    .trim();
}

function truncateText(text: string, max = 2000): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

/** Unwrap `/bin/bash -lc '…'` so tool cards show the real command. */
function cleanBashCommand(command: string): string {
  let c = command.trim();
  const wrapped = c.match(/^\/bin\/bash\s+-lc\s+([\s\S]+)$/i);
  if (wrapped) {
    c = wrapped[1].trim();
    if (
      (c.startsWith("'") && c.endsWith("'")) ||
      (c.startsWith('"') && c.endsWith('"'))
    ) {
      c = c.slice(1, -1);
    }
    // Unescape common shell quoting
    c = c.replace(/\\'/g, "'").replace(/\\"/g, '"');
  }
  return c.trim();
}

function formatJsonish(value: unknown, max = 400): string | undefined {
  if (value == null) return undefined;
  if (typeof value === 'string') {
    const t = value.trim();
    return t ? truncateText(t, max) : undefined;
  }
  try {
    return truncateText(JSON.stringify(value, null, 0), max);
  } catch {
    return String(value).slice(0, max);
  }
}

function nicknameFromSubAgent(item: Record<string, unknown>): string | undefined {
  const receivers = item.receiverThreads;
  if (Array.isArray(receivers) && receivers.length) {
    const names = receivers
      .map((r) => {
        const rec = asRecord(r);
        return rec && typeof rec.agentNickname === 'string'
          ? rec.agentNickname
          : null;
      })
      .filter((n): n is string => !!n);
    if (names.length) return names.join(', ');
  }
  if (typeof item.agentNickname === 'string') return item.agentNickname;
  if (typeof item.agentPath === 'string') {
    const parts = item.agentPath.split('/').filter(Boolean);
    return parts[parts.length - 1] || item.agentPath;
  }
  return undefined;
}

function parseCodexItem(item: Record<string, unknown>): TranscriptPart[] {
  const itemType = String(item.type || '');

  if (itemType === 'agentMessage' || itemType === 'message' || itemType === 'assistantMessage') {
    const text =
      (typeof item.text === 'string' && item.text.trim()) ||
      textFromCodexContent(item.content);
    if (!text) return [{ kind: 'hidden', text: '' }];
    return [{ kind: 'assistant', text, icon: 'sparkles' }];
  }

  // Echo of the user prompt inside the agent stream — API already has userMessage
  if (itemType === 'userMessage') {
    return [{ kind: 'hidden', text: '' }];
  }

  if (itemType === 'reasoning' || itemType === 'thinking') {
    const summary = item.summary;
    let text = '';
    if (typeof summary === 'string') text = summary.trim();
    else if (Array.isArray(summary)) {
      text = summary
        .map((s) => {
          if (typeof s === 'string') return s;
          const r = asRecord(s);
          return (
            (r &&
              (typeof r.text === 'string'
                ? r.text
                : typeof r.summary === 'string'
                  ? r.summary
                  : '')) ||
            ''
          );
        })
        .filter(Boolean)
        .join('\n')
        .trim();
    }
    if (!text) text = textFromCodexContent(item.content);
    if (!text && typeof item.text === 'string') text = item.text.trim();
    if (!text) return [{ kind: 'hidden', text: '' }];
    return [
      {
        kind: 'thinking',
        text,
        muted: true,
        collapsible: true,
        icon: 'time',
      },
    ];
  }

  if (
    itemType === 'commandExecution' ||
    itemType === 'command' ||
    itemType === 'bash' ||
    itemType === 'shell'
  ) {
    const rawCommand =
      (typeof item.command === 'string' && item.command) ||
      (typeof item.cmd === 'string' && item.cmd) ||
      '';
    const command = rawCommand ? cleanBashCommand(rawCommand) : '';
    const output =
      (typeof item.aggregatedOutput === 'string' && item.aggregatedOutput) ||
      (typeof item.output === 'string' && item.output) ||
      (typeof item.stdout === 'string' && item.stdout) ||
      '';
    const status = typeof item.status === 'string' ? item.status : '';
    const failed = status === 'failed' || status === 'error';

    // Prefer a friendly label when the agent recorded a read/write action
    let toolLabel = 'bash';
    let toolDetail = command;
    if (Array.isArray(item.commandActions) && item.commandActions.length) {
      const action = asRecord(item.commandActions[0]);
      if (action) {
        const actionType =
          typeof action.type === 'string' ? action.type.toLowerCase() : '';
        const path =
          (typeof action.path === 'string' && action.path) ||
          (typeof action.name === 'string' && action.name) ||
          '';
        if (actionType === 'read' && path) {
          toolLabel = 'read';
          toolDetail = path;
        } else if (
          (actionType === 'write' ||
            actionType === 'create' ||
            actionType === 'edit') &&
          path
        ) {
          toolLabel = actionType;
          toolDetail = path;
        }
      }
    }

    const parts: TranscriptPart[] = [];
    if (toolDetail || command) {
      parts.push({
        kind: 'tool',
        text: toolLabel,
        detail: toolDetail || command,
        muted: true,
        icon: toolLabel === 'bash' ? 'terminal' : 'construct',
      });
    }
    // Put stdout in `detail` — `text` is the single-line header in the UI
    if (output.trim()) {
      parts.push({
        kind: failed ? 'error' : 'tool_result',
        text: failed ? 'failed' : 'output',
        detail: truncateText(output, 2500),
        muted: !failed,
        icon: failed ? 'alert' : 'checkmark',
      });
    }
    if (!parts.length && status) {
      parts.push({
        kind: 'tool',
        text: `command ${status}`,
        muted: true,
        icon: 'terminal',
      });
    }
    return parts.length ? parts : [{ kind: 'hidden', text: '' }];
  }

  // Conductor / MCP tools: GetWorkspaceDiff, etc.
  if (itemType === 'mcpToolCall' || itemType === 'mcp_tool_call') {
    const server = typeof item.server === 'string' ? item.server : '';
    const tool =
      (typeof item.tool === 'string' && item.tool) ||
      (typeof item.name === 'string' && item.name) ||
      'mcp';
    const status = typeof item.status === 'string' ? item.status : '';
    const failed =
      status === 'failed' || status === 'error' || item.error != null;
    const argsDetail = formatJsonish(item.arguments, 300);
    const label = server ? `${server} · ${tool}` : tool;

    const parts: TranscriptPart[] = [
      {
        kind: 'tool',
        text: label,
        detail: argsDetail,
        muted: true,
        icon: 'construct',
      },
    ];

    const result = asRecord(item.result);
    let resultText = '';
    if (result) {
      resultText = textFromCodexContent(result.content);
      if (!resultText && typeof result.text === 'string') {
        resultText = result.text;
      }
    } else if (typeof item.result === 'string') {
      resultText = item.result;
    }

    if (failed) {
      const err =
        (typeof item.error === 'string' && item.error) ||
        (item.error != null && formatJsonish(item.error, 400)) ||
        'MCP tool failed';
      parts.push({
        kind: 'error',
        text: 'error',
        detail: err,
        icon: 'alert',
      });
    } else if (resultText.trim()) {
      parts.push({
        kind: 'tool_result',
        text: 'result',
        detail: truncateText(resultText, 2500),
        muted: true,
        icon: 'checkmark',
      });
    }

    return parts;
  }

  // Multi-agent collab tools (wait, spawn, etc.)
  if (
    itemType === 'collabAgentToolCall' ||
    itemType === 'collab_agent_tool_call'
  ) {
    const tool =
      (typeof item.tool === 'string' && item.tool) ||
      (typeof item.name === 'string' && item.name) ||
      'collab';
    const status = typeof item.status === 'string' ? item.status : '';
    const prompt =
      (typeof item.prompt === 'string' && item.prompt.trim()) || '';
    const detailParts: string[] = [];
    if (status && status !== 'completed') detailParts.push(status);
    if (prompt) detailParts.push(truncateText(prompt, 400));
    if (typeof item.model === 'string' && item.model) {
      detailParts.push(item.model);
    }

    const label =
      tool === 'wait'
        ? 'wait for sub-agents'
        : tool.replace(/_/g, ' ');

    return [
      {
        kind: 'tool',
        text: label,
        detail: detailParts.length ? detailParts.join(' · ') : undefined,
        muted: true,
        icon: 'time',
      },
    ];
  }

  // Sub-agent lifecycle (started / interacted)
  if (itemType === 'subAgentActivity' || itemType === 'sub_agent_activity') {
    const kind = typeof item.kind === 'string' ? item.kind : 'activity';
    const nick = nicknameFromSubAgent(item);
    const path = typeof item.agentPath === 'string' ? item.agentPath : '';
    const verb =
      kind === 'started'
        ? 'Sub-agent started'
        : kind === 'interacted'
          ? 'Sub-agent active'
          : kind === 'completed' || kind === 'finished'
            ? 'Sub-agent finished'
            : `Sub-agent ${kind.replace(/_/g, ' ')}`;

    return [
      {
        kind: 'status',
        text: nick ? `${verb} · ${nick}` : verb,
        detail: path || undefined,
        muted: true,
        icon: 'sparkles',
      },
    ];
  }

  if (
    itemType === 'fileChange' ||
    itemType === 'file_change' ||
    itemType === 'applyPatch' ||
    itemType === 'edit'
  ) {
    const path =
      (typeof item.path === 'string' && item.path) ||
      (typeof item.file_path === 'string' && item.file_path) ||
      (typeof item.filename === 'string' && item.filename) ||
      '';
    return [
      {
        kind: 'tool',
        text: 'edit',
        detail: path || undefined,
        muted: true,
        icon: 'construct',
      },
    ];
  }

  if (itemType === 'webSearch' || itemType === 'web_search' || itemType === 'search') {
    const q =
      (typeof item.query === 'string' && item.query) ||
      (typeof item.q === 'string' && item.q) ||
      '';
    return [
      {
        kind: 'tool',
        text: 'search',
        detail: q || undefined,
        muted: true,
        icon: 'construct',
      },
    ];
  }

  if (itemType === 'error' || item.status === 'failed') {
    const msg =
      (typeof item.message === 'string' && item.message) ||
      (typeof item.error === 'string' && item.error) ||
      (typeof item.text === 'string' && item.text) ||
      'Agent item failed';
    return [{ kind: 'error', text: msg, icon: 'alert' }];
  }

  // Unknown item — short human label only (never dump full JSON into the chat)
  const label = (itemType || 'item').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ');
  return [
    {
      kind: 'status',
      text: label,
      muted: true,
    },
  ];
}

/** Item types that only render usefully on completed (avoid start+complete doubles). */
const CODEX_COMPLETED_ONLY = new Set([
  'commandExecution',
  'command',
  'bash',
  'shell',
  'mcpToolCall',
  'mcp_tool_call',
  'collabAgentToolCall',
  'collab_agent_tool_call',
  'subAgentActivity',
  'sub_agent_activity',
  'userMessage',
  'reasoning',
  'thinking',
  'fileChange',
  'file_change',
  'applyPatch',
  'edit',
  'webSearch',
  'web_search',
  'search',
]);

function parseCodexSdkEvent(event: Record<string, unknown>): TranscriptPart[] {
  const eventType = String(event.type || '');

  // Lifecycle noise
  if (
    eventType === 'thread.started' ||
    eventType === 'thread.completed' ||
    eventType === 'turn.started' ||
    eventType === 'turn.completed' ||
    eventType === 'codex.subAgentStatus'
  ) {
    // subAgentStatus is high-frequency working pings — UI already has a status bar
    return [{ kind: 'hidden', text: '' }];
  }

  // Prefer completed items (full text / output). Started often has empty agentMessage.text.
  // Still show started when it already carries content (live streaming).
  if (
    eventType === 'item.completed' ||
    eventType === 'item.started' ||
    eventType === 'item.updated' ||
    eventType === 'item.done'
  ) {
    const item = asRecord(event.item);
    if (!item) return [{ kind: 'hidden', text: '' }];
    const itemType = String(item.type || '');

    if (eventType === 'item.started') {
      if (CODEX_COMPLETED_ONLY.has(itemType)) {
        return [{ kind: 'hidden', text: '' }];
      }
      if (
        itemType === 'agentMessage' ||
        itemType === 'message' ||
        itemType === 'assistantMessage'
      ) {
        const text =
          (typeof item.text === 'string' && item.text.trim()) ||
          textFromCodexContent(item.content);
        if (!text) return [{ kind: 'hidden', text: '' }];
      }
    }

    return parseCodexItem(item);
  }

  if (eventType === 'error') {
    const msg =
      (typeof event.message === 'string' && event.message) ||
      (typeof event.error === 'string' && event.error) ||
      'Agent error';
    return [{ kind: 'error', text: msg, icon: 'alert' }];
  }

  // Unknown event type — hide pure noise
  return [{ kind: 'hidden', text: '' }];
}

function parseAgentPayload(raw: unknown): TranscriptPart[] {
  const payload = asRecord(raw);
  if (!payload) {
    return [
      {
        kind: 'meta',
        text: stringifyDetail(raw, 300) || 'Event',
        muted: true,
      },
    ];
  }

  // Codex / Responses SDK: { event: { type, item? }, thread_id }
  const codexEvent = asRecord(payload.event);
  if (codexEvent && typeof codexEvent.type === 'string') {
    return parseCodexSdkEvent(codexEvent);
  }

  // Some result events omit type but have result + is_error
  const type =
    typeof payload.type === 'string'
      ? payload.type
      : payload.result != null
        ? 'result'
        : '';

  // —— Lifecycle / system noise ——
  if (type === 'command_lifecycle') {
    return [{ kind: 'hidden', text: '' }];
  }

  if (type === 'system') {
    const subtype = String(payload.subtype || '');
    if (subtype === 'session_state_changed') {
      return [{ kind: 'hidden', text: '' }];
    }
    if (subtype === 'init') {
      const model = typeof payload.model === 'string' ? payload.model : undefined;
      const cwd = typeof payload.cwd === 'string' ? payload.cwd : undefined;
      return [
        {
          kind: 'status',
          text: model ? `Session ready · ${model}` : 'Session ready',
          detail: cwd,
          muted: true,
          icon: 'checkmark',
        },
      ];
    }
    return [
      {
        kind: 'status',
        text: subtype ? subtype.replace(/_/g, ' ') : 'System',
        muted: true,
      },
    ];
  }

  if (type === 'rate_limit_event') {
    const info = asRecord(payload.rate_limit_info);
    const status = info && typeof info.status === 'string' ? info.status : '';
    if (status === 'allowed') {
      return [{ kind: 'hidden', text: '' }];
    }
    return [
      {
        kind: 'status',
        text: status ? `Rate limit: ${status}` : 'Rate limit event',
        muted: true,
        icon: 'alert',
      },
    ];
  }

  if (type === 'assistant') {
    const message = asRecord(payload.message);
    const content = message?.content;
    if (Array.isArray(content)) {
      const parts = partsFromContentBlocks(content);
      if (parts.length) return parts;
    }
    if (message && typeof message.content === 'string') {
      return [{ kind: 'assistant', text: message.content, icon: 'sparkles' }];
    }
    return [{ kind: 'hidden', text: '' }];
  }

  if (type === 'user') {
    // Tool results sometimes arrive as user events in agent streams
    const message = asRecord(payload.message);
    const content = message?.content ?? payload.content;
    if (Array.isArray(content)) {
      return partsFromContentBlocks(content);
    }
    if (typeof content === 'string' && content.trim()) {
      return [{ kind: 'tool_result', text: content.trim(), muted: true }];
    }
    return [{ kind: 'hidden', text: '' }];
  }

  if (type === 'result') {
    // Final turn summary — prefer not to duplicate assistant text.
    // Show only errors or a compact cost line when useful.
    if (payload.is_error === true) {
      const result =
        typeof payload.result === 'string'
          ? payload.result
          : 'Agent finished with an error';
      return [
        {
          kind: 'error',
          text: result,
          icon: 'alert',
        },
      ];
    }
    // Successful result duplicates assistant text — hide.
    return [{ kind: 'hidden', text: '' }];
  }

  if (type === 'error' || payload.is_error === true) {
    const msg =
      (typeof payload.error === 'string' && payload.error) ||
      (typeof payload.result === 'string' && payload.result) ||
      (typeof payload.message === 'string' && payload.message) ||
      'Agent error';
    return [{ kind: 'error', text: msg, icon: 'alert' }];
  }

  // Stream deltas / high-frequency heartbeats — hide empty noise.
  // tool_progress fires repeatedly while a tool runs (bash, MCP wait, etc.)
  // and previously fell through to meta pills that dumped raw JSON into chat.
  if (
    type === 'stream_event' ||
    type === 'content_block_delta' ||
    type === 'tool_progress' ||
    type === 'tool_use_progress' ||
    type === 'progress'
  ) {
    return [{ kind: 'hidden', text: '' }];
  }

  if (typeof payload.message === 'string' && payload.message.trim()) {
    return [{ kind: 'assistant', text: payload.message.trim(), icon: 'sparkles' }];
  }

  if (type) {
    return [
      {
        kind: 'meta',
        text: type.replace(/_/g, ' '),
        detail: stringifyDetail(payload, 200),
        muted: true,
      },
    ];
  }

  return [{ kind: 'hidden', text: '' }];
}

/** Parse a single API transcript message into UI parts. */
export function parseTranscriptMessage(message: Message): ParsedMessage {
  const content = message.content;
  const base = {
    id: message.id,
    receivedAt: message.receivedAt,
    sessionIndex: message.sessionIndex,
    type: message.type,
  };

  // Plain string
  if (typeof content === 'string') {
    const text = content.trim();
    return {
      ...base,
      visible: !!text,
      parts: text
        ? [
            {
              kind: isUserType(message.type) ? 'user' : 'assistant',
              text,
              icon: isUserType(message.type) ? 'person' : 'sparkles',
            },
          ]
        : [],
    };
  }

  const obj = asRecord(content);
  if (!obj) {
    return { ...base, visible: false, parts: [] };
  }

  // User prompt events
  if (
    message.type === 'userMessage' ||
    obj.type === 'userMessage' ||
    isUserType(message.type)
  ) {
    const text =
      (typeof obj.message === 'string' && obj.message) ||
      (typeof obj.text === 'string' && obj.text) ||
      '';
    if (text.trim()) {
      return {
        ...base,
        visible: true,
        parts: [
          {
            kind: 'user',
            text: text.trim(),
            icon: 'person',
          },
        ],
      };
    }
  }

  // Agent envelope: { type: 'agent', rawPayload: {...} }
  if (obj.type === 'agent' || message.type === 'agent' || obj.rawPayload) {
    const parts = parseAgentPayload(obj.rawPayload ?? obj);
    const visibleParts = parts.filter((p) => p.kind !== 'hidden' && p.text);
    return {
      ...base,
      visible: visibleParts.length > 0,
      parts: visibleParts,
    };
  }

  // Direct nested shapes
  if (obj.rawPayload) {
    const parts = parseAgentPayload(obj.rawPayload);
    const visibleParts = parts.filter((p) => p.kind !== 'hidden' && p.text);
    return {
      ...base,
      visible: visibleParts.length > 0,
      parts: visibleParts,
    };
  }

  if (typeof obj.message === 'string' && obj.message.trim()) {
    return {
      ...base,
      visible: true,
      parts: [
        {
          kind: isUserType(message.type) ? 'user' : 'assistant',
          text: obj.message.trim(),
          icon: isUserType(message.type) ? 'person' : 'sparkles',
        },
      ],
    };
  }

  if (Array.isArray(obj.content)) {
    const parts = partsFromContentBlocks(obj.content).filter(
      (p) => p.kind !== 'hidden' && p.text,
    );
    return { ...base, visible: parts.length > 0, parts };
  }

  return { ...base, visible: false, parts: [] };
}

function isUserType(type: string): boolean {
  const t = type.toLowerCase();
  return t.includes('user') || t === 'human' || t === 'prompt' || t === 'input';
}

/** Filter + parse a list of API messages for the chat list. */
export function parseTranscript(messages: Message[]): ParsedMessage[] {
  return messages
    .map(parseTranscriptMessage)
    .filter((m) => m.visible && m.parts.length > 0);
}

/** Kinds that collapse into a single tool-traffic group in the chat UI. */
export const TOOL_KINDS: TranscriptKind[] = ['tool', 'tool_result'];

export function isToolKind(kind: TranscriptKind): boolean {
  return kind === 'tool' || kind === 'tool_result';
}

/**
 * Flattened display rows for the chat list.
 * Consecutive tool/tool_result parts (even across API messages) merge into one
 * collapsible group — matching Conductor / ez-rocket-ship behaviour.
 */
export type TranscriptRow =
  | {
      kind: 'part';
      key: string;
      part: TranscriptPart;
      receivedAt: string;
    }
  | {
      kind: 'tools';
      key: string;
      parts: TranscriptPart[];
      receivedAt: string;
    };

export function countToolParts(messages: ParsedMessage[]): number {
  return messages.reduce(
    (total, m) => total + m.parts.filter((p) => isToolKind(p.kind)).length,
    0,
  );
}

/**
 * Build display rows from parsed messages. Order matches API order
 * (ascending sessionIndex). Pass showTools=false to drop tool traffic.
 */
export function buildTranscriptRows(
  messages: ParsedMessage[],
  showTools = true,
): TranscriptRow[] {
  const rows: TranscriptRow[] = [];
  let pending: {
    parts: TranscriptPart[];
    receivedAt: string;
    key: string;
  } | null = null;

  const flushTools = () => {
    if (!pending) return;
    rows.push({
      kind: 'tools',
      key: pending.key,
      parts: pending.parts,
      receivedAt: pending.receivedAt,
    });
    pending = null;
  };

  for (const message of messages) {
    message.parts.forEach((part, index) => {
      const key = `${message.id}-${index}`;

      if (isToolKind(part.kind)) {
        if (!showTools) return;
        if (pending) {
          pending.parts.push(part);
          pending.receivedAt = message.receivedAt;
        } else {
          pending = {
            parts: [part],
            receivedAt: message.receivedAt,
            key,
          };
        }
        return;
      }

      flushTools();
      rows.push({
        kind: 'part',
        key,
        part,
        receivedAt: message.receivedAt,
      });
    });
  }

  flushTools();
  return rows;
}

/** Human label for a part kind */
export function partLabel(kind: TranscriptKind): string {
  switch (kind) {
    case 'user':
      return 'You';
    case 'assistant':
      return 'Agent';
    case 'thinking':
      return 'Thinking';
    case 'tool':
      return 'Tool';
    case 'tool_result':
      return 'Result';
    case 'status':
      return 'Status';
    case 'error':
      return 'Error';
    case 'meta':
      return 'Info';
    default:
      return '';
  }
}
