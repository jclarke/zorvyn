import { Platform } from 'react-native';

import {
  ConductorApiError,
  type Channel,
  type CreateMessageBody,
  type CreateMessageResponse,
  type CreateSessionBody,
  type CreateWorkspaceBody,
  type Me,
  type Message,
  type Paginated,
  type Project,
  type Session,
  type SessionArchiveResponse,
  type SessionCancelResponse,
  type SessionStatus,
  type SqlQueryBody,
  type SqlQueryResponse,
  type StructuredError,
  type WorkspaceArchiveResponse,
  type WorkspaceCreateResponse,
  type WorkspaceStatus,
  type WorkspaceSummary,
} from './types';

export const API_BASE = 'https://api.conductor.build';
const USER_AGENT = 'Zorvyn/1.0 (Expo; React Native; Web)';

type Query = Record<string, string | number | boolean | undefined | null>;

function buildUrl(path: string, query?: Query): string {
  const url = new URL(path.startsWith('http') ? path : `${API_BASE}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

export class ConductorClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey.trim();
  }

  get key(): string {
    return this.apiKey;
  }

  private async request<T>(
    method: string,
    path: string,
    options?: { query?: Query; body?: unknown },
  ): Promise<T> {
    const url = buildUrl(path, options?.query);
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: 'application/json',
      // Browsers forbid setting User-Agent; use a custom header instead on web.
      'X-Conductor-Client': USER_AGENT,
    };
    if (Platform.OS !== 'web') {
      headers['User-Agent'] = USER_AGENT;
    }

    let body: string | undefined;
    if (options?.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(options.body);
    }

    let response: Response;
    try {
      response = await fetch(url, { method, headers, body });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Network request failed';
      const webHint =
        Platform.OS === 'web'
          ? ' (If this persists, the API may be blocking the browser origin.)'
          : '';
      throw new ConductorApiError(0, null, `${message}${webHint}`);
    }

    const text = await response.text();
    let parsed: unknown = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null;
      }
    }

    if (!response.ok) {
      const errBody =
        parsed && typeof parsed === 'object' ? (parsed as StructuredError) : null;
      throw new ConductorApiError(
        response.status,
        errBody,
        `Request failed (${response.status})`,
      );
    }

    return parsed as T;
  }

  // —— Identity ——
  getMe() {
    return this.request<Me>('GET', '/me');
  }

  // —— Projects ——
  listProjects(params?: { limit?: number; offset?: number }) {
    return this.request<Paginated<Project>>('GET', '/v0/projects', { query: params });
  }

  getProject(projectId: string) {
    return this.request<Project>('GET', `/v0/projects/${encodeURIComponent(projectId)}`);
  }

  listProjectWorkspaces(
    projectId: string,
    params?: { limit?: number; offset?: number; channel?: Channel },
  ) {
    return this.request<Paginated<WorkspaceSummary>>(
      'GET',
      `/v0/projects/${encodeURIComponent(projectId)}/workspaces`,
      { query: params },
    );
  }

  // —— Workspaces ——
  createWorkspace(body: CreateWorkspaceBody, params?: { channel?: Channel }) {
    return this.request<WorkspaceCreateResponse>('POST', '/v0/workspaces', {
      query: params,
      body,
    });
  }

  getWorkspace(workspaceId: string, params?: { channel?: Channel }) {
    return this.request<WorkspaceSummary>(
      'GET',
      `/v0/workspaces/${encodeURIComponent(workspaceId)}`,
      { query: params },
    );
  }

  renameWorkspace(
    workspaceId: string,
    name: string,
    params?: { channel?: Channel },
  ) {
    return this.request<WorkspaceSummary>(
      'POST',
      `/v0/workspaces/${encodeURIComponent(workspaceId)}/rename`,
      { query: params, body: { name } },
    );
  }

  archiveWorkspace(workspaceId: string) {
    return this.request<WorkspaceArchiveResponse>(
      'POST',
      `/v0/workspaces/${encodeURIComponent(workspaceId)}/archive`,
    );
  }

  getWorkspaceStatus(workspaceId: string) {
    return this.request<WorkspaceStatus>(
      'GET',
      `/v0/workspaces/${encodeURIComponent(workspaceId)}/status`,
    );
  }

  listWorkspaceSessions(
    workspaceId: string,
    params?: { limit?: number; offset?: number; channel?: Channel },
  ) {
    return this.request<Paginated<Session>>(
      'GET',
      `/v0/workspaces/${encodeURIComponent(workspaceId)}/sessions`,
      { query: params },
    );
  }

  // —— Sessions ——
  createSession(body: CreateSessionBody, params?: { channel?: Channel }) {
    return this.request<Session>('POST', '/v0/sessions', {
      query: params,
      body,
    });
  }

  getSession(sessionId: string, params?: { channel?: Channel }) {
    return this.request<Session>(
      'GET',
      `/v0/sessions/${encodeURIComponent(sessionId)}`,
      { query: params },
    );
  }

  renameSession(sessionId: string, name: string, params?: { channel?: Channel }) {
    return this.request<Session>(
      'POST',
      `/v0/sessions/${encodeURIComponent(sessionId)}/rename`,
      { query: params, body: { name } },
    );
  }

  archiveSession(sessionId: string) {
    return this.request<SessionArchiveResponse>(
      'POST',
      `/v0/sessions/${encodeURIComponent(sessionId)}/archive`,
    );
  }

  getSessionStatus(sessionId: string) {
    return this.request<SessionStatus>(
      'GET',
      `/v0/sessions/${encodeURIComponent(sessionId)}/status`,
    );
  }

  cancelSession(sessionId: string) {
    return this.request<SessionCancelResponse>(
      'POST',
      `/v0/sessions/${encodeURIComponent(sessionId)}/cancel`,
    );
  }

  listMessages(
    sessionId: string,
    params?: { limit?: number; offset?: number; after?: string },
  ) {
    return this.request<Paginated<Message>>(
      'GET',
      `/v0/sessions/${encodeURIComponent(sessionId)}/messages`,
      { query: params },
    );
  }

  sendMessage(sessionId: string, body: CreateMessageBody) {
    return this.request<CreateMessageResponse>(
      'POST',
      `/v0/sessions/${encodeURIComponent(sessionId)}/messages`,
      { body },
    );
  }

  getMessage(messageId: string) {
    return this.request<Message>(
      'GET',
      `/v0/messages/${encodeURIComponent(messageId)}`,
    );
  }

  // —— SQL ——
  runSql(body: SqlQueryBody) {
    return this.request<SqlQueryResponse>('POST', '/v0/sql', { body });
  }
}
