import type { Agent, Effort, Model } from './types';

export const AGENTS: { value: Agent; label: string; description: string }[] = [
  { value: 'claude', label: 'Claude', description: 'Anthropic Claude Code' },
  { value: 'codex', label: 'Codex', description: 'OpenAI Codex' },
  { value: 'cursor', label: 'Cursor', description: 'Cursor agent' },
  { value: 'acp', label: 'ACP', description: 'Agent Client Protocol' },
];

export const MODELS_BY_AGENT: Record<Agent, Model[]> = {
  claude: [
    'fable-5',
    'opus-5-1m',
    'opus-4-8-1m',
    'opus-4-8',
    'opus-4-7-1m',
    'opus-4-7',
    'opus-1m',
    'opus',
    'opus-4-6-1m',
    'sonnet-5-1m',
    'sonnet-4-6-1m',
    'sonnet',
    'haiku',
  ],
  codex: [
    'gpt-5.5',
    'gpt-5.4',
    'gpt-5.6-sol',
    'gpt-5.6-terra',
    'gpt-5.6-luna',
    'gpt-5.3-codex-spark',
    'gpt-5.3-codex',
    'gpt-5.2-codex',
  ],
  cursor: ['auto', 'composer-2.5', 'grok-4.5'],
  acp: [],
};

export const DEFAULT_MODEL: Record<Agent, Model | undefined> = {
  claude: 'sonnet',
  codex: 'gpt-5.5',
  cursor: 'auto',
  acp: undefined,
};

export const EFFORTS_BY_AGENT: Record<Agent, Effort[]> = {
  claude: ['low', 'medium', 'high', 'xhigh', 'max'],
  codex: ['none', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'],
  cursor: [],
  acp: [],
};

export const DEFAULT_EFFORT: Record<Agent, Effort | undefined> = {
  claude: 'high',
  codex: 'high',
  cursor: undefined,
  acp: undefined,
};

export const FAST_MODE_MODELS: Model[] = [
  // Claude
  'opus-5-1m',
  'opus-4-8-1m',
  'opus-4-8',
  'opus-4-7-1m',
  'opus-4-7',
  'opus-1m',
  'opus',
  'opus-4-6-1m',
  // Codex
  'gpt-5.5',
  'gpt-5.4',
  'gpt-5.6-sol',
  'gpt-5.6-terra',
  'gpt-5.6-luna',
  'gpt-5.3-codex-spark',
  'gpt-5.3-codex',
  'gpt-5.2-codex',
  // Cursor
  'auto',
  'composer-2.5',
  'grok-4.5',
];

export function supportsFastMode(model?: Model): boolean {
  if (!model) return false;
  return FAST_MODE_MODELS.includes(model);
}

