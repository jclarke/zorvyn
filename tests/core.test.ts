import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import test from 'node:test';

import {
  extractGitHintsFromText,
  extractLinkedResources,
} from '../lib/changes';
import { linkedPullNumbersForRepo } from '../lib/github-refs';
import { effortsForAgentModel } from '../lib/models';
import {
  boundMarkdownInput,
  MAX_MARKDOWN_CHARS,
  parseMarkdownBlocks,
  parseMarkdownInline,
} from '../lib/markdown';
import {
  collectNumberedPages,
  collectPaginated,
  mapWithConcurrency,
} from '../lib/pagination';
import {
  buildTranscriptRows,
  countToolParts,
  type ParsedMessage,
} from '../lib/transcript';
import type { Message } from '../lib/types';

test('Codex efforts follow the Conductor model constraints', () => {
  assert.deepEqual(effortsForAgentModel('codex', 'gpt-5.5'), [
    'none',
    'low',
    'medium',
    'high',
    'xhigh',
  ]);
  assert.deepEqual(effortsForAgentModel('codex', 'gpt-5.6-luna'), [
    'none',
    'low',
    'medium',
    'high',
    'xhigh',
    'max',
  ]);
  assert.deepEqual(effortsForAgentModel('codex', 'gpt-5.6-sol'), [
    'none',
    'low',
    'medium',
    'high',
    'xhigh',
    'max',
    'ultra',
  ]);
});

test('PR hints retain repository identity', () => {
  const hints = extractGitHintsFromText(
    'See https://github.com/Acme/widget/pull/42 and https://github.com/other/repo/pull/42',
  );
  assert.deepEqual(
    hints.pulls.map(({ owner, repo, number }) => ({ owner, repo, number })),
    [
      { owner: 'Acme', repo: 'widget', number: 42 },
      { owner: 'other', repo: 'repo', number: 42 },
    ],
  );
});

test('only PRs from the workspace repository can drive matching', () => {
  const repo = { host: 'github.com', owner: 'acme', repo: 'widget' };
  const numbers = linkedPullNumbersForRepo(repo, [
    {
      url: 'https://github.com/other/repo/pull/42',
      owner: 'other',
      repo: 'repo',
      number: 42,
      label: 'PR #42',
    },
    {
      url: 'https://github.com/ACME/widget/pull/7',
      owner: 'ACME',
      repo: 'widget',
      number: 7,
      label: 'PR #7',
    },
  ]);
  assert.deepEqual(numbers, [7]);
});

test('message link extraction preserves owner and repository', () => {
  const messages: Message[] = [
    {
      id: 'm1',
      sessionId: 's1',
      sessionIndex: 1,
      type: 'assistant',
      receivedAt: new Date(0).toISOString(),
      content: 'Opened https://github.com/acme/widget/pull/9',
    },
  ];
  assert.deepEqual(extractLinkedResources(messages).pulls[0], {
    url: 'https://github.com/acme/widget/pull/9',
    owner: 'acme',
    repo: 'widget',
    number: 9,
    label: 'PR #9',
  });
});

test('consecutive tool traffic collapses into one transcript row', () => {
  const messages: ParsedMessage[] = [
    {
      id: 'm1',
      receivedAt: '2026-01-01T00:00:00.000Z',
      sessionIndex: 1,
      type: 'agent',
      visible: true,
      parts: [
        { kind: 'tool', text: 'Bash', detail: 'ls' },
        { kind: 'tool', text: 'Edit', detail: 'foo.ts' },
      ],
    },
    {
      id: 'm2',
      receivedAt: '2026-01-01T00:00:01.000Z',
      sessionIndex: 2,
      type: 'agent',
      visible: true,
      parts: [{ kind: 'tool_result', text: 'ok' }],
    },
    {
      id: 'm3',
      receivedAt: '2026-01-01T00:00:02.000Z',
      sessionIndex: 3,
      type: 'agent',
      visible: true,
      parts: [{ kind: 'assistant', text: 'Done', icon: 'sparkles' }],
    },
  ];

  assert.equal(countToolParts(messages), 3);

  const rows = buildTranscriptRows(messages);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].kind, 'tools');
  if (rows[0].kind === 'tools') {
    assert.equal(rows[0].parts.length, 3);
    assert.deepEqual(
      rows[0].parts.map((p) => p.text),
      ['Bash', 'Edit', 'ok'],
    );
  }
  assert.equal(rows[1].kind, 'part');
  if (rows[1].kind === 'part') {
    assert.equal(rows[1].part.kind, 'assistant');
  }

  const hidden = buildTranscriptRows(messages, false);
  assert.equal(hidden.length, 1);
  assert.equal(hidden[0].kind, 'part');
});

test('markdown is bounded and parsed without automatic linkification', () => {
  const oversized = `# Heading\n${'x'.repeat(MAX_MARKDOWN_CHARS + 500)}`;
  const bounded = boundMarkdownInput(oversized);
  assert.ok(bounded.length < oversized.length);
  assert.match(bounded, /content truncated for safe display$/);

  const blocks = parseMarkdownBlocks(
    '# Heading\n- item\n```ts\nconst ok = true;\n```',
  );
  assert.deepEqual(
    blocks.map((block) => block.kind),
    ['heading', 'list', 'code'],
  );
});

test('inline markdown parsing is bounded-time and preserves supported tokens', () => {
  assert.deepEqual(
    parseMarkdownInline(
      'See [docs](https://example.com) with **bold**, _care_, and `code`.',
    ),
    [
      { kind: 'text', text: 'See ' },
      { kind: 'link', text: 'docs', url: 'https://example.com' },
      { kind: 'text', text: ' with ' },
      { kind: 'strong', text: 'bold' },
      { kind: 'text', text: ', ' },
      { kind: 'em', text: 'care' },
      { kind: 'text', text: ', and ' },
      { kind: 'code', text: 'code' },
      { kind: 'text', text: '.' },
    ],
  );

  const adversarial = '['.repeat(MAX_MARKDOWN_CHARS);
  const started = performance.now();
  assert.deepEqual(parseMarkdownInline(adversarial), [
    { kind: 'text', text: adversarial },
  ]);
  assert.ok(performance.now() - started < 250);
});

test('pagination drains every page and rejects a stalled cursor', async () => {
  const values = await collectPaginated(async (offset, limit) => ({
    data: [0, 1, 2, 3, 4].slice(offset, offset + limit),
    offset,
    hasMore: offset + limit < 5,
  }), 2);
  assert.deepEqual(values, [0, 1, 2, 3, 4]);

  await assert.rejects(
    () =>
      collectPaginated(async (offset) => ({
        data: [],
        offset,
        hasMore: true,
      })),
    /did not advance/,
  );

  await assert.rejects(
    () =>
      collectPaginated(async () => ({
        data: [1],
        offset: 99,
        hasMore: false,
      })),
    /expected 0/,
  );
});

test('numbered pagination and bounded mapping preserve item order', async () => {
  const values = await collectNumberedPages(async (page, perPage) => {
    const all = [1, 2, 3, 4, 5];
    const start = (page - 1) * perPage;
    return all.slice(start, start + perPage);
  }, 2);
  assert.deepEqual(values, [1, 2, 3, 4, 5]);

  const mapped = await mapWithConcurrency([3, 1, 2], 2, async (value) => {
    await new Promise((resolve) => setTimeout(resolve, value));
    return value * 2;
  });
  assert.deepEqual(mapped, [6, 2, 4]);
});
