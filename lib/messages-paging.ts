import type { ConductorClient } from './api';
import type { Message } from './types';

export const MESSAGE_PAGE_SIZE = 40;

/**
 * Messages list is ascending by sessionIndex (oldest first).
 * There is no reverse cursor — use offset/limit and probe for the end.
 */

/** Find total message count via exponential + binary search (few small requests). */
export async function findMessageCount(
  client: ConductorClient,
  sessionId: string,
): Promise<number> {
  // Empty or short?
  const first = await client.listMessages(sessionId, {
    limit: MESSAGE_PAGE_SIZE,
    offset: 0,
  });
  if (first.data.length === 0) return 0;
  if (!first.hasMore) return first.data.length;

  // Exponential search for an empty offset
  let lo = 0; // known non-empty region starts at 0
  let hi = MESSAGE_PAGE_SIZE;
  // lo is a valid index that has a message (or start)
  // find hi such that offset=hi returns empty OR hasMore false at high enough offset

  while (true) {
    const probe = await client.listMessages(sessionId, {
      limit: 1,
      offset: hi,
    });
    if (probe.data.length === 0) {
      break; // hi is past the end
    }
    if (!probe.hasMore) {
      // Message at hi is the last one
      return hi + 1;
    }
    lo = hi;
    hi = hi * 2;
    // Safety cap
    if (hi > 1_000_000) {
      return hi;
    }
  }

  // Binary search: last valid offset is in [lo, hi)
  let left = lo;
  let right = hi;
  while (left + 1 < right) {
    const mid = Math.floor((left + right) / 2);
    const probe = await client.listMessages(sessionId, {
      limit: 1,
      offset: mid,
    });
    if (probe.data.length === 0) {
      right = mid;
    } else {
      left = mid;
    }
  }
  // left is last index with a message
  return left + 1;
}

export type LatestPage = {
  messages: Message[];
  /** API offset of the first message in `messages` */
  oldestOffset: number;
  /** Total messages in the session (approx) */
  total: number;
  hasOlder: boolean;
};

/** Load the newest page of messages. */
export async function loadLatestMessagePage(
  client: ConductorClient,
  sessionId: string,
  pageSize = MESSAGE_PAGE_SIZE,
): Promise<LatestPage> {
  const total = await findMessageCount(client, sessionId);
  if (total === 0) {
    return { messages: [], oldestOffset: 0, total: 0, hasOlder: false };
  }

  const oldestOffset = Math.max(0, total - pageSize);
  const page = await client.listMessages(sessionId, {
    limit: pageSize,
    offset: oldestOffset,
  });

  const messages = [...page.data].sort(
    (a, b) => a.sessionIndex - b.sessionIndex,
  );

  return {
    messages,
    oldestOffset,
    total,
    hasOlder: oldestOffset > 0,
  };
}

export type OlderPage = {
  messages: Message[];
  oldestOffset: number;
  hasOlder: boolean;
};

/** Load the page of messages immediately before the currently loaded window. */
export async function loadOlderMessagePage(
  client: ConductorClient,
  sessionId: string,
  currentOldestOffset: number,
  pageSize = MESSAGE_PAGE_SIZE,
): Promise<OlderPage> {
  if (currentOldestOffset <= 0) {
    return { messages: [], oldestOffset: 0, hasOlder: false };
  }

  const oldestOffset = Math.max(0, currentOldestOffset - pageSize);
  const limit = currentOldestOffset - oldestOffset;
  const page = await client.listMessages(sessionId, {
    limit,
    offset: oldestOffset,
  });

  const messages = [...page.data].sort(
    (a, b) => a.sessionIndex - b.sessionIndex,
  );

  return {
    messages,
    oldestOffset,
    hasOlder: oldestOffset > 0,
  };
}
