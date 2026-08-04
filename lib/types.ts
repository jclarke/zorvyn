/** Conductor API types — mirrors https://api.conductor.build/v0/openapi.json */

export type Agent = 'claude' | 'codex' | 'cursor' | 'acp';

export type ClaudeModel =
  | 'fable-5'
  | 'opus-5-1m'
  | 'opus-4-8-1m'
  | 'opus-4-8'
  | 'opus-4-7-1m'
  | 'opus-4-7'
  | 'opus-1m'
  | 'opus'
  | 'opus-4-6-1m'
  | 'sonnet-5-1m'
  | 'sonnet-4-6-1m'
  | 'sonnet'
  | 'haiku';

export type CodexModel =
  | 'gpt-5.5'
  | 'gpt-5.4'
  | 'gpt-5.6-sol'
  | 'gpt-5.6-terra'
  | 'gpt-5.6-luna'
  | 'gpt-5.3-codex-spark'
  | 'gpt-5.3-codex'
  | 'gpt-5.2-codex';

export type CursorModel = 'auto' | 'composer-2.5' | 'grok-4.5';

export type Model = ClaudeModel | CodexModel | CursorModel | string;

export type Effort = 'none' | 'low' | 'medium' | 'high' | 'xhigh' | 'max' | 'ultra';

export type Channel = 'prod' | 'alpha' | 'alpha-chromium' | 'beta' | 'patch' | 'dev';

export type WorkspaceLifecycleStatus =
  | 'initializing'
  | 'ready'
  | 'sleeping'
  | 'archived'
  | 'deleted'
  | 'updating';

export type WorkspaceLifecycleStep =
  | 'building_snapshot'
  | 'preparing'
  | 'setting_up'
  | 'updating';

export type SessionAgentStatus = 'idle' | 'working' | 'error';

export type MessageDeliveryState = 'queued' | 'sent';

export interface Paginated<T> {
  data: T[];
  offset: number;
  hasMore: boolean;
}

export interface StructuredError {
  code?: string;
  userMessage: string;
  debugMessage?: string;
  retryable?: boolean;
  source?: 'ui' | 'sidecar' | 'git' | 'agent' | 'network' | 'db';
  details?: Record<string, string | number | boolean | null>;
  stack?: string;
  underlying?: StructuredError[];
}

export interface Me {
  userId: string;
  email?: string;
  organizationId?: string;
  workspaceId?: string;
  authMethod: 'api-key' | 'access-jwt' | 'legacy-api-token';
  apiKey?: { id: string };
}

export interface Project {
  id: string;
  name: string;
  gitRemote: string;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  createdAt: string;
  deepLink: string;
  creatorId?: string;
  lastActivityAt?: string;
}

export interface WorkspaceCreateResponse {
  workspaceId: string;
  sessionId: string;
  deepLink: string;
}

export interface WorkspaceStatus {
  workspaceId: string;
  status: WorkspaceLifecycleStatus;
  lifecycleStep?: WorkspaceLifecycleStep;
  updatedAt: string;
  errorMessage?: string;
}

export interface WorkspaceArchiveResponse {
  workspaceId: string;
  status: 'archived';
}

export interface CreateWorkspaceBody {
  projectId?: string;
  repositoryUrl?: string;
  branch?: string;
  name?: string;
  sessionName?: string;
  agent?: Agent;
  model?: Model;
  effort?: Effort;
  env?: Record<string, string>;
}

export interface Session {
  id: string;
  deepLink: string;
  name?: string;
  model?: string;
  resolvedModel?: string;
  effort?: string;
  fastMode?: boolean;
  archivedAt?: string;
}

export interface CreateSessionBody {
  workspaceId: string;
  sessionId?: string;
  name?: string;
  agent: Agent;
  model?: Model;
  effort?: Effort;
  fastMode?: boolean;
}

export interface SessionStatus {
  workspaceId: string;
  sessionId: string;
  status: SessionAgentStatus;
  updatedAt: string;
  errorMessage?: string;
  lastError?: string;
  lastErrorAt?: string;
}

export interface SessionCancelResponse {
  workspaceId: string;
  sessionId: string;
  status: SessionAgentStatus;
  canceledQueuedMessages: number;
}

export interface SessionArchiveResponse {
  workspaceId: string;
  sessionId: string;
  status: 'archived';
  canceledQueuedMessages: number;
}

export interface Message {
  id: string;
  sessionId: string;
  sessionIndex: number;
  type: string;
  content: unknown;
  receivedAt: string;
}

export interface CreateMessageBody {
  message: string;
  messageId?: string;
}

export interface CreateMessageResponse {
  messageId: string;
  state: MessageDeliveryState;
}

export interface SqlQueryBody {
  query: string;
}

export interface SqlQueryResponse {
  rows: Record<string, unknown>[];
  rowCount: number;
  truncated: boolean;
}

export class ConductorApiError extends Error {
  status: number;
  body: StructuredError | null;

  constructor(status: number, body: StructuredError | null, fallbackMessage: string) {
    super(body?.userMessage || fallbackMessage);
    this.name = 'ConductorApiError';
    this.status = status;
    this.body = body;
  }
}
