import type { ConductorClient } from './api';
import type { WorkspaceLifecycleStatus, WorkspaceStatus } from './types';
import { ConductorApiError } from './types';

const DEFAULT_TIMEOUT_MS = 120_000;
const POLL_MS = 2_000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isTerminalWorkspaceStatus(
  status: WorkspaceLifecycleStatus | string | undefined,
): boolean {
  return status === 'archived' || status === 'deleted';
}

export function needsWake(
  status: WorkspaceLifecycleStatus | string | undefined,
): boolean {
  return (
    status === 'sleeping' ||
    status === 'initializing' ||
    status === 'updating'
  );
}

/**
 * There is no public wake endpoint. POST /sessions/{id}/messages on a sleeping
 * workspace queues the prompt and starts the sandbox. We still wait until
 * status is `ready` so the agent can actually run the turn.
 */
export async function waitForWorkspaceReady(
  client: ConductorClient,
  workspaceId: string,
  options?: {
    timeoutMs?: number;
    onStatus?: (status: WorkspaceStatus) => void;
  },
): Promise<WorkspaceStatus> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const deadline = Date.now() + timeoutMs;
  let last: WorkspaceStatus | null = null;

  while (Date.now() < deadline) {
    last = await client.getWorkspaceStatus(workspaceId);
    options?.onStatus?.(last);

    if (last.status === 'ready') {
      return last;
    }
    if (isTerminalWorkspaceStatus(last.status)) {
      throw new ConductorApiError(
        400,
        {
          userMessage: `Workspace is ${last.status} and cannot accept messages.`,
        },
        `Workspace is ${last.status}`,
      );
    }

    await sleep(POLL_MS);
  }

  const label = last?.status || 'unknown';
  throw new ConductorApiError(
    0,
    {
      userMessage: `Timed out waiting for workspace to become ready (last status: ${label}).`,
    },
    'Workspace wake timeout',
  );
}

export type EnsureAwakeResult = {
  workspaceId: string;
  status: WorkspaceStatus;
  /** True when the sandbox was not ready and we should surface a waking UI */
  wasAsleep: boolean;
};

/**
 * Read workspace lifecycle before send. Does not wake by itself — caller should
 * POST the user message (which wakes sleeping workspaces), then waitForWorkspaceReady.
 */
export async function getWorkspaceLifecycle(
  client: ConductorClient,
  workspaceId: string,
): Promise<EnsureAwakeResult> {
  const status = await client.getWorkspaceStatus(workspaceId);

  if (isTerminalWorkspaceStatus(status.status)) {
    throw new ConductorApiError(
      400,
      {
        userMessage: `This workspace is ${status.status}. Restore it in Conductor desktop before chatting.`,
      },
      `Workspace ${status.status}`,
    );
  }

  return {
    workspaceId,
    status,
    wasAsleep: needsWake(status.status),
  };
}
