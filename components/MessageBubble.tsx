import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { MarkdownBody } from '@/components/MarkdownBody';
import { formatRelativeTime } from '@/lib/format';
import {
  partLabel,
  type ParsedMessage,
  type TranscriptKind,
  type TranscriptPart,
} from '@/lib/transcript';
import { colors, radius, spacing } from '@/lib/theme';

const ICON_MAP: Record<
  NonNullable<TranscriptPart['icon']>,
  keyof typeof Ionicons.glyphMap
> = {
  person: 'person',
  sparkles: 'sparkles',
  construct: 'construct-outline',
  terminal: 'terminal-outline',
  alert: 'alert-circle-outline',
  time: 'time-outline',
  checkmark: 'checkmark-circle-outline',
};

export function MessageBubble({ message }: { message: ParsedMessage }) {
  return (
    <View style={styles.group}>
      {message.parts.map((part, index) => (
        <PartBubble
          key={`${message.id}-${index}`}
          part={part}
          receivedAt={index === 0 ? message.receivedAt : undefined}
        />
      ))}
    </View>
  );
}

function PartBubble({
  part,
  receivedAt,
}: {
  part: TranscriptPart;
  receivedAt?: string;
}) {
  const [expanded, setExpanded] = useState(!part.collapsible);
  const isUser = part.kind === 'user';
  const isTool = part.kind === 'tool' || part.kind === 'tool_result';
  const isStatus = part.kind === 'status' || part.kind === 'meta';
  const isError = part.kind === 'error';
  const isThinking = part.kind === 'thinking';

  if (isStatus) {
    return (
      <View style={styles.statusWrap}>
        <View style={styles.statusPill}>
          {part.icon ? (
            <Ionicons
              name={ICON_MAP[part.icon]}
              size={12}
              color={colors.textMuted}
            />
          ) : null}
          <Text style={styles.statusText} numberOfLines={2}>
            {part.text}
            {part.detail ? ` · ${part.detail}` : ''}
          </Text>
        </View>
      </View>
    );
  }

  if (isTool) {
    return (
      <View style={styles.toolWrap}>
        <View style={[styles.toolCard, isError && styles.toolError]}>
          <View style={styles.toolHeader}>
            <Ionicons
              name={
                part.icon
                  ? ICON_MAP[part.icon]
                  : part.kind === 'tool_result'
                    ? 'return-down-forward-outline'
                    : 'construct-outline'
              }
              size={14}
              color={isError ? colors.danger : colors.accent}
            />
            <Text
              style={[styles.toolName, isError && { color: colors.danger }]}
              numberOfLines={1}
            >
              {part.text}
            </Text>
            {receivedAt ? (
              <Text style={styles.toolTime}>
                {formatRelativeTime(receivedAt)}
              </Text>
            ) : null}
          </View>
          {part.detail ? (
            <Text style={styles.toolDetail} selectable>
              {part.detail}
            </Text>
          ) : null}
        </View>
      </View>
    );
  }

  if (isThinking) {
    const preview =
      part.text.length > 120 ? `${part.text.slice(0, 120).trim()}…` : part.text;
    return (
      <View style={styles.wrapAgent}>
        <Pressable
          onPress={() => setExpanded((v) => !v)}
          style={styles.thinkingCard}
        >
          <View style={styles.meta}>
            <View style={styles.roleRow}>
              <Ionicons name="time-outline" size={12} color={colors.textMuted} />
              <Text style={styles.roleThinking}>Thinking</Text>
            </View>
            <Text style={styles.time}>
              {expanded ? 'Hide' : 'Show'}
              {receivedAt ? ` · ${formatRelativeTime(receivedAt)}` : ''}
            </Text>
          </View>
          {expanded ? (
            <MarkdownBody variant="thinking">{part.text}</MarkdownBody>
          ) : (
            <Text style={styles.thinkingText} selectable>
              {preview}
            </Text>
          )}
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.wrap, isUser ? styles.wrapUser : styles.wrapAgent]}>
      <View
        style={[
          styles.bubble,
          isUser && styles.user,
          !isUser && !isError && styles.agent,
          isError && styles.errorBubble,
        ]}
      >
        <View style={styles.meta}>
          <View style={styles.roleRow}>
            {part.icon ? (
              <Ionicons
                name={ICON_MAP[part.icon]}
                size={12}
                color={
                  isUser
                    ? colors.userTextSecondary
                    : isError
                      ? colors.danger
                      : colors.textSecondary
                }
              />
            ) : null}
            <Text
              style={[
                styles.role,
                isUser && styles.roleUser,
                isError && styles.roleError,
              ]}
            >
              {partLabel(part.kind as TranscriptKind)}
            </Text>
          </View>
          {receivedAt ? (
            <Text style={[styles.time, isUser && styles.timeUser]}>
              {formatRelativeTime(receivedAt)}
            </Text>
          ) : null}
        </View>
        <MarkdownBody
          variant={isUser ? 'user' : isError ? 'error' : 'agent'}
        >
          {part.text}
        </MarkdownBody>
        {part.detail ? (
          <Text
            style={[styles.detail, isUser && styles.detailUser]}
            selectable
          >
            {part.detail}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  wrap: {
    maxWidth: '92%',
    alignSelf: 'stretch',
  },
  wrapUser: {
    alignSelf: 'flex-end',
    maxWidth: '92%',
  },
  wrapAgent: {
    alignSelf: 'flex-start',
    maxWidth: '92%',
  },
  bubble: {
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    maxWidth: '100%',
    overflow: 'hidden',
  },
  user: {
    backgroundColor: colors.userBubble,
    borderColor: colors.accentBorder,
    borderBottomRightRadius: 4,
  },
  agent: {
    backgroundColor: colors.agentBubble,
    borderColor: colors.border,
    borderBottomLeftRadius: 4,
  },
  errorBubble: {
    backgroundColor: colors.dangerSoft,
    borderColor: 'rgba(251,113,133,0.44)',
    borderBottomLeftRadius: 4,
  },
  meta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: 6,
  },
  roleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  role: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    color: colors.textSecondary,
    textTransform: 'uppercase',
  },
  roleUser: {
    color: colors.userTextSecondary,
  },
  roleError: {
    color: colors.danger,
  },
  roleThinking: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  time: {
    fontSize: 11,
    color: colors.textMuted,
  },
  timeUser: {
    color: colors.userTextSecondary,
  },
  detail: {
    marginTop: 8,
    fontSize: 12,
    fontFamily: 'SpaceMono',
    color: colors.textMuted,
    lineHeight: 17,
  },
  detailUser: {
    color: colors.userTextSecondary,
  },
  statusWrap: {
    alignItems: 'center',
    marginVertical: 2,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.full,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    maxWidth: '90%',
  },
  statusText: {
    fontSize: 11,
    color: colors.textSecondary,
    flexShrink: 1,
  },
  toolWrap: {
    alignSelf: 'flex-start',
    maxWidth: '92%',
  },
  toolCard: {
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    gap: 4,
  },
  toolError: {
    borderColor: 'rgba(251,113,133,0.44)',
    backgroundColor: colors.dangerSoft,
  },
  toolHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  toolName: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: colors.accent,
  },
  toolTime: {
    fontSize: 10,
    color: colors.textMuted,
  },
  toolDetail: {
    fontSize: 12,
    fontFamily: 'SpaceMono',
    color: colors.textSecondary,
    lineHeight: 17,
  },
  thinkingCard: {
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.md,
    padding: spacing.md,
    borderStyle: 'dashed',
  },
  thinkingText: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 19,
    fontStyle: 'italic',
  },
});
