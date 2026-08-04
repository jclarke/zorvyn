/** Dark-first design tokens for the Zorvyn field console. */

export const colors = {
  bg: '#0B0F14',
  bgElevated: '#111821',
  surface: '#17202B',
  surfaceHover: '#202C3A',
  border: '#344354',
  borderSubtle: '#263341',

  text: '#F8FAFC',
  textSecondary: '#CBD5E1',
  textMuted: '#94A3B8',
  textInverse: '#06121F',

  accent: '#38BDF8',
  accentSoft: 'rgba(56, 189, 248, 0.14)',
  accentBorder: 'rgba(56, 189, 248, 0.48)',

  success: '#34D399',
  successSoft: 'rgba(52, 211, 153, 0.14)',
  warning: '#FBBF24',
  warningSoft: 'rgba(251, 191, 36, 0.14)',
  danger: '#FB7185',
  dangerSoft: 'rgba(251, 113, 133, 0.14)',

  userBubble: '#075985',
  userText: '#F8FAFC',
  userTextSecondary: '#BAE6FD',
  agentBubble: '#17202B',
  systemBubble: '#111821',

  working: '#FBBF24',
  idle: '#34D399',
  error: '#FB7185',
  initializing: '#38BDF8',
  sleeping: '#94A3B8',
  archived: '#64748B',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
};

export const radius = {
  sm: 7,
  md: 11,
  lg: 15,
  xl: 20,
  full: 999,
};

export const typography = {
  title: { fontSize: 30, fontWeight: '600' as const, letterSpacing: -0.8 },
  headline: { fontSize: 20, fontWeight: '600' as const, letterSpacing: -0.4 },
  body: { fontSize: 16, fontWeight: '400' as const },
  bodyMedium: { fontSize: 16, fontWeight: '500' as const },
  caption: { fontSize: 13, fontWeight: '400' as const },
  label: { fontSize: 12, fontWeight: '600' as const, letterSpacing: 0.4 },
  mono: { fontSize: 13, fontFamily: 'SpaceMono' as const },
};

export function statusColor(
  status?: string,
): string {
  switch (status) {
    case 'working':
      return colors.working;
    case 'idle':
    case 'ready':
      return colors.idle;
    case 'error':
    case 'deleted':
      return colors.error;
    case 'initializing':
    case 'updating':
      return colors.initializing;
    case 'sleeping':
      return colors.sleeping;
    case 'archived':
      return colors.archived;
    default:
      return colors.textMuted;
  }
}
