import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { MarkdownBody } from '@/components/MarkdownBody';
import { formatRelativeTime } from '@/lib/format';
import {
  partLabel,
  type ParsedMessage,
  type TranscriptKind,
  type TranscriptPart,
  type TranscriptRow,
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

/** Renders a single API message (parts not yet grouped into tool boxes). */
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

/** Renders one flattened transcript row (part or tool group). */
export function TranscriptRowItem({ row }: { row: TranscriptRow }) {
  if (row.kind === 'tools') {
    return <ToolGroup parts={row.parts} receivedAt={row.receivedAt} />;
  }
  return <PartBubble part={row.part} receivedAt={row.receivedAt} />;
}

/**
 * Consecutive tool traffic collapses into one summary line, the way Conductor
 * / ez-rocket-ship render a turn — otherwise a single answer is buried under
 * dozens of bash calls and their output.
 */
function ToolGroup({
  parts,
  receivedAt,
}: {
  parts: TranscriptPart[];
  receivedAt?: string;
}) {
  const [open, setOpen] = useState(false);

  const callCount = parts.filter((p) => p.kind === 'tool').length;
  const resultCount = parts.length - callCount;
  const errored = parts.some((p) => p.icon === 'alert');

  const summary = [
    callCount > 0
      ? `${callCount} tool call${callCount === 1 ? '' : 's'}`
      : null,
    resultCount > 0
      ? `${resultCount} result${resultCount === 1 ? '' : 's'}`
      : null,
  ]
    .filter(Boolean)
    .join(', ');

  const previewNames = parts
    .filter((p) => p.kind === 'tool')
    .map((p) => p.text)
    .slice(0, 4)
    .join(', ');

  return (
    <View style={styles.toolGroupWrap}>
      <View
        style={[
          styles.toolGroup,
          errored && styles.toolGroupError,
        ]}
      >
        <Pressable
          onPress={() => setOpen((v) => !v)}
          style={({ pressed }) => [
            styles.toolGroupHeader,
            pressed && styles.toolGroupHeaderPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={
            open ? `Collapse ${summary}` : `Expand ${summary}`
          }
          accessibilityState={{ expanded: open }}
        >
          <Ionicons
            name={open ? 'chevron-down' : 'chevron-forward'}
            size={14}
            color={colors.textMuted}
          />
          <Text style={styles.toolGroupSummary} numberOfLines={1}>
            {summary}
          </Text>
          {errored ? (
            <Text style={styles.toolGroupErrorLabel}>· error</Text>
          ) : null}
          {!open && previewNames ? (
            <Text style={styles.toolGroupPreview} numberOfLines={1}>
              {previewNames}
            </Text>
          ) : null}
          {receivedAt && !open ? (
            <Text style={styles.toolGroupTime}>
              {formatRelativeTime(receivedAt)}
            </Text>
          ) : null}
        </Pressable>

        {open ? (
          <View style={styles.toolGroupBody}>
            {parts.map((part, index) => (
              <ToolPart key={index} part={part} />
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

function ToolPart({ part }: { part: TranscriptPart }) {
  const [open, setOpen] = useState(false);
  const isResult = part.kind === 'tool_result';
  const isError = part.icon === 'alert';
  const expandable = Boolean(part.detail);

  return (
    <View
      style={[
        styles.toolPart,
        isError && styles.toolPartError,
        isResult && !isError && styles.toolPartResult,
        !isResult && !isError && styles.toolPartCall,
      ]}
    >
      <Pressable
        onPress={() => expandable && setOpen((v) => !v)}
        disabled={!expandable}
        style={({ pressed }) => [
          styles.toolPartHeader,
          expandable && pressed && styles.toolGroupHeaderPressed,
        ]}
        accessibilityRole={expandable ? 'button' : undefined}
        accessibilityState={expandable ? { expanded: open } : undefined}
        accessibilityLabel={
          expandable
            ? open
              ? `Collapse ${part.text} detail`
              : `Expand ${part.text} detail`
            : part.text
        }
      >
        {expandable ? (
          <Ionicons
            name={open ? 'chevron-down' : 'chevron-forward'}
            size={12}
            color={colors.textMuted}
          />
        ) : (
          <View style={styles.toolPartChevronSpacer} />
        )}
        <View
          style={[
            styles.toolPartBadge,
            isError && styles.toolPartBadgeError,
            isResult && !isError && styles.toolPartBadgeResult,
            !isResult && !isError && styles.toolPartBadgeCall,
          ]}
        >
          <Text
            style={[
              styles.toolPartBadgeText,
              isError && { color: colors.danger },
              isResult && !isError && { color: colors.textMuted },
              !isResult && !isError && { color: colors.warning },
            ]}
          >
            {isResult ? 'Result' : 'Tool'}
          </Text>
        </View>
        <Text
          style={[styles.toolPartName, isError && { color: colors.danger }]}
          numberOfLines={1}
        >
          {part.text}
        </Text>
      </Pressable>

      {open && part.detail ? (
        <ScrollView
          style={styles.toolPartDetailScroll}
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.toolPartDetail} selectable>
            {part.detail}
          </Text>
        </ScrollView>
      ) : null}
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

  // Standalone tool parts (when not grouped via TranscriptRowItem)
  if (part.kind === 'tool' || part.kind === 'tool_result') {
    return (
      <View style={styles.toolGroupWrap}>
        <ToolPart part={part} />
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
          accessibilityRole="button"
          accessibilityLabel={
            expanded ? 'Collapse agent reasoning' : 'Expand agent reasoning'
          }
          accessibilityState={{ expanded }}
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
    marginBottom: spacing.sm,
  },
  wrapUser: {
    alignSelf: 'flex-end',
    maxWidth: '92%',
  },
  wrapAgent: {
    alignSelf: 'flex-start',
    maxWidth: '92%',
    marginBottom: spacing.sm,
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
    marginBottom: spacing.sm,
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
  // --- Tool group (collapsible box) ---
  toolGroupWrap: {
    alignSelf: 'flex-start',
    maxWidth: '96%',
    width: '100%',
    marginBottom: spacing.sm,
  },
  toolGroup: {
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  toolGroupError: {
    borderColor: 'rgba(251,113,133,0.44)',
    backgroundColor: colors.dangerSoft,
  },
  toolGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  toolGroupHeaderPressed: {
    backgroundColor: colors.surfaceHover,
  },
  toolGroupSummary: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    flexShrink: 0,
  },
  toolGroupErrorLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.danger,
  },
  toolGroupPreview: {
    flex: 1,
    fontSize: 11,
    fontFamily: 'SpaceMono',
    color: colors.textMuted,
    textAlign: 'right',
    marginLeft: spacing.sm,
  },
  toolGroupTime: {
    fontSize: 10,
    color: colors.textMuted,
    marginLeft: 4,
  },
  toolGroupBody: {
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  // --- Individual tool line inside a group ---
  toolPart: {
    borderWidth: 1,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  toolPartCall: {
    borderColor: 'rgba(251, 191, 36, 0.35)',
    backgroundColor: colors.warningSoft,
  },
  toolPartResult: {
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surface,
  },
  toolPartError: {
    borderColor: 'rgba(251,113,133,0.44)',
    backgroundColor: colors.dangerSoft,
  },
  toolPartHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  toolPartChevronSpacer: {
    width: 12,
  },
  toolPartBadge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  toolPartBadgeCall: {
    backgroundColor: 'rgba(251, 191, 36, 0.2)',
  },
  toolPartBadgeResult: {
    backgroundColor: colors.bgElevated,
  },
  toolPartBadgeError: {
    backgroundColor: 'rgba(251,113,133,0.2)',
  },
  toolPartBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  toolPartName: {
    flex: 1,
    fontSize: 12,
    fontFamily: 'SpaceMono',
    color: colors.text,
  },
  toolPartDetailScroll: {
    maxHeight: 200,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  toolPartDetail: {
    fontSize: 11,
    fontFamily: 'SpaceMono',
    color: colors.textSecondary,
    lineHeight: 16,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
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
