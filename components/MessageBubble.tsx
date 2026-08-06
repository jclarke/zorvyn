import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { MarkdownBody } from '@/components/MarkdownBody';
import { formatRelativeTime } from '@/lib/format';
import {
  formatQuestionAnswerMessage,
  partLabel,
  type ParsedMessage,
  type QuestionOption,
  type TranscriptKind,
  type TranscriptPart,
  type TranscriptRow,
  type UserQuestion,
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
export function MessageBubble({
  message,
  onAnswerQuestion,
  answering,
}: {
  message: ParsedMessage;
  onAnswerQuestion?: (message: string) => void;
  answering?: boolean;
}) {
  return (
    <View style={styles.group}>
      {message.parts.map((part, index) => (
        <PartBubble
          key={`${message.id}-${index}`}
          part={part}
          receivedAt={index === 0 ? message.receivedAt : undefined}
          onAnswerQuestion={onAnswerQuestion}
          answering={answering}
        />
      ))}
    </View>
  );
}

/** Renders one flattened transcript row (part or tool group). */
export function TranscriptRowItem({
  row,
  onAnswerQuestion,
  answering,
}: {
  row: TranscriptRow;
  onAnswerQuestion?: (message: string) => void;
  answering?: boolean;
}) {
  if (row.kind === 'tools') {
    return <ToolGroup parts={row.parts} receivedAt={row.receivedAt} />;
  }
  return (
    <PartBubble
      part={row.part}
      receivedAt={row.receivedAt}
      onAnswerQuestion={onAnswerQuestion}
      answering={answering}
    />
  );
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

/**
 * Conductor / Claude-style AskUserQuestion card:
 * one question at a time → next → … → submit all answers.
 * Back/forward lets the user revise earlier choices before send.
 */
function UserQuestionCard({
  part,
  receivedAt,
  onAnswer,
  answering,
}: {
  part: TranscriptPart;
  receivedAt?: string;
  onAnswer?: (message: string) => void;
  answering?: boolean;
}) {
  const questions: UserQuestion[] =
    part.questions && part.questions.length
      ? part.questions
      : [{ question: part.text, options: [] }];
  const total = questions.length;
  const awaiting = part.awaitingResponse !== false;
  // Keep the wizard mounted while sending so the UI doesn't flash to summary
  const interactive = awaiting && !!onAnswer;

  // questionIndex -> selected option labels
  const [selected, setSelected] = useState<Record<number, string[]>>({});
  // Free-text answer per question (Claude: skip options and type your own)
  const [freeText, setFreeText] = useState<Record<number, string>>({});
  const [step, setStep] = useState(0);

  const safeStep = Math.min(Math.max(step, 0), Math.max(total - 1, 0));
  const q = questions[safeStep] || questions[0];
  const multi = !!q?.multiSelect;
  const isFirst = safeStep === 0;
  const isLast = safeStep >= total - 1;
  const currentSelection = selected[safeStep] || [];
  const currentFreeText = freeText[safeStep] || '';
  const usingFreeText = currentFreeText.trim().length > 0;
  // Free text wins when present; otherwise any selected option counts
  const hasAnswer =
    usingFreeText || currentSelection.length > 0;
  const canInteract = interactive && !answering;

  function setOption(qi: number, option: QuestionOption, isMulti: boolean) {
    // Choosing a preset clears free text for that question
    setFreeText((prev) => ({ ...prev, [qi]: '' }));
    setSelected((prev) => {
      const current = prev[qi] || [];
      if (isMulti) {
        const exists = current.includes(option.label);
        return {
          ...prev,
          [qi]: exists
            ? current.filter((l) => l !== option.label)
            : [...current, option.label],
        };
      }
      return { ...prev, [qi]: [option.label] };
    });
  }

  function onFreeTextChange(text: string) {
    if (!canInteract) return;
    setFreeText((prev) => ({ ...prev, [safeStep]: text }));
    // Typing a custom answer deselects preset options
    if (text.trim()) {
      setSelected((prev) => ({ ...prev, [safeStep]: [] }));
    }
  }

  /** Prefer free-text when non-empty; otherwise option labels. */
  function resolveAnswers(
    base: Record<number, string[]>,
  ): Record<number, string[]> {
    const out: Record<number, string[]> = { ...base };
    for (let i = 0; i < total; i++) {
      const custom = freeText[i]?.trim();
      if (custom) {
        out[i] = [custom];
      }
    }
    return out;
  }

  function submitAll(answers: Record<number, string[]>) {
    if (!onAnswer) return;
    const message = formatQuestionAnswerMessage(questions, answers);
    if (!message.trim()) return;
    onAnswer(message);
  }

  function goNext(fromAnswers?: Record<number, string[]>) {
    const answers = resolveAnswers(fromAnswers ?? selected);
    if (isLast) {
      submitAll(answers);
      return;
    }
    setStep((s) => Math.min(s + 1, total - 1));
  }

  function goBack() {
    if (isFirst || answering) return;
    setStep((s) => Math.max(s - 1, 0));
  }

  function onPickOption(option: QuestionOption) {
    if (!canInteract || !q) return;
    if (multi) {
      setOption(safeStep, option, true);
      return;
    }
    // Single-select: store answer, auto-advance (or submit when alone)
    const nextSelected = { ...selected, [safeStep]: [option.label] };
    setFreeText((prev) => ({ ...prev, [safeStep]: '' }));
    setSelected(nextSelected);
    if (isLast && total === 1) {
      submitAll(nextSelected);
      return;
    }
    if (isLast) {
      // Stay on last so user can Back to revise or Submit
      return;
    }
    setStep((s) => Math.min(s + 1, total - 1));
  }

  function onPrimaryAction() {
    if (!canInteract || !hasAnswer) return;
    const answers = resolveAnswers(selected);
    goNext(answers);
  }

  function stepAnswered(i: number): boolean {
    return (
      (!!freeText[i] && freeText[i].trim().length > 0) ||
      (!!selected[i] && selected[i].length > 0)
    );
  }

  // Answered history: compact summary of every question
  if (!awaiting) {
    return (
      <View style={styles.questionWrap}>
        <View
          style={[
            styles.questionCard,
            awaiting && styles.questionCardAwaiting,
            !awaiting && styles.questionCardDone,
          ]}
        >
          <View style={styles.questionHeader}>
            <View style={styles.roleRow}>
              <Ionicons
                name="help-circle-outline"
                size={14}
                color={awaiting ? colors.warning : colors.textMuted}
              />
              <Text style={styles.questionRole}>User input</Text>
            </View>
            <View
              style={[
                styles.questionBadge,
                awaiting
                  ? styles.questionBadgeAwaiting
                  : styles.questionBadgeDone,
              ]}
            >
              <Text
                style={[
                  styles.questionBadgeText,
                  awaiting
                    ? { color: colors.warning }
                    : { color: colors.textMuted },
                ]}
              >
                {awaiting ? 'Awaiting response' : 'Answered'}
              </Text>
            </View>
            {receivedAt ? (
              <Text style={styles.time}>{formatRelativeTime(receivedAt)}</Text>
            ) : null}
          </View>
          {questions.map((item, qi) => (
            <View key={qi} style={styles.questionBlock}>
              {total > 1 ? (
                <Text style={styles.questionStepLabel}>
                  {qi + 1} of {total}
                  {item.header ? ` · ${item.header}` : ''}
                </Text>
              ) : item.header ? (
                <Text style={styles.questionHeaderLabel}>{item.header}</Text>
              ) : null}
              <Text style={styles.questionText} selectable>
                {item.question}
              </Text>
            </View>
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.questionWrap}>
      <View style={[styles.questionCard, styles.questionCardAwaiting]}>
        <View style={styles.questionHeader}>
          <View style={styles.roleRow}>
            <Ionicons
              name="help-circle-outline"
              size={14}
              color={colors.warning}
            />
            <Text style={styles.questionRole}>User input</Text>
          </View>
          <View style={[styles.questionBadge, styles.questionBadgeAwaiting]}>
            <Text style={[styles.questionBadgeText, { color: colors.warning }]}>
              Awaiting response
            </Text>
          </View>
          {total > 1 ? (
            <Text style={styles.questionStepLabel}>
              {safeStep + 1} of {total}
            </Text>
          ) : null}
          {receivedAt ? (
            <Text style={styles.time}>{formatRelativeTime(receivedAt)}</Text>
          ) : null}
        </View>

        {total > 1 ? (
          <View style={styles.stepDots}>
            {questions.map((_, i) => {
              const answered = stepAnswered(i);
              return (
                <Pressable
                  key={i}
                  onPress={() => {
                    // Only allow jumping to answered steps or current
                    if (i <= safeStep || answered) setStep(i);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Question ${i + 1}${
                    answered ? ', answered' : ''
                  }`}
                  style={[
                    styles.stepDot,
                    i === safeStep && styles.stepDotActive,
                    answered && i !== safeStep && styles.stepDotDone,
                  ]}
                />
              );
            })}
          </View>
        ) : null}

        <View style={styles.questionBlock}>
          {q?.header ? (
            <Text style={styles.questionHeaderLabel}>{q.header}</Text>
          ) : null}
          <Text style={styles.questionText} selectable>
            {q?.question || part.text}
          </Text>
          {multi ? (
            <Text style={styles.questionHint}>Select all that apply</Text>
          ) : (q?.options || []).length > 0 ? (
            <Text style={styles.questionHint}>
              Pick an option, or type your own answer below
            </Text>
          ) : null}

          {(q?.options || []).map((opt, oi) => {
            const isSelected =
              currentSelection.includes(opt.label) && !usingFreeText;
            return (
              <Pressable
                key={`${safeStep}-${oi}`}
                onPress={() => onPickOption(opt)}
                disabled={!canInteract}
                accessibilityRole="button"
                accessibilityState={{
                  selected: isSelected,
                  disabled: !canInteract,
                }}
                accessibilityLabel={`Option ${oi + 1}: ${opt.label}`}
                style={({ pressed }) => [
                  styles.optionRow,
                  isSelected && styles.optionRowSelected,
                  canInteract && pressed && styles.optionRowPressed,
                  !canInteract && styles.optionRowDisabled,
                ]}
              >
                <View
                  style={[
                    styles.optionIndex,
                    isSelected && styles.optionIndexSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.optionIndexText,
                      isSelected && { color: colors.textInverse },
                    ]}
                  >
                    {oi + 1}
                  </Text>
                </View>
                <View style={styles.optionBody}>
                  <Text
                    style={[
                      styles.optionLabel,
                      isSelected && styles.optionLabelSelected,
                    ]}
                  >
                    {opt.label}
                  </Text>
                  {opt.description ? (
                    <Text style={styles.optionDescription}>
                      {opt.description}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            );
          })}

          {/* Always-visible free text — skip options entirely if you want */}
          <View
            style={[
              styles.freeTextWrap,
              usingFreeText && styles.freeTextWrapActive,
            ]}
          >
            <Text style={styles.freeTextLabel}>
              {(q?.options || []).length
                ? 'Or type your own answer'
                : 'Your answer'}
            </Text>
            <TextInput
              style={styles.otherInput}
              value={currentFreeText}
              onChangeText={onFreeTextChange}
              placeholder="Type a response instead of choosing an option…"
              placeholderTextColor={colors.textMuted}
              multiline
              editable={canInteract}
              accessibilityLabel="Custom answer for this question"
            />
          </View>
        </View>

        <View style={styles.stepNav}>
          <Pressable
            onPress={goBack}
            disabled={isFirst || answering}
            accessibilityRole="button"
            accessibilityLabel="Previous question"
            style={({ pressed }) => [
              styles.navBtn,
              styles.navBtnSecondary,
              (isFirst || answering) && styles.navBtnDisabled,
              pressed && !isFirst && styles.navBtnPressed,
            ]}
          >
            <Ionicons
              name="chevron-back"
              size={16}
              color={isFirst ? colors.textMuted : colors.text}
            />
            <Text
              style={[
                styles.navBtnText,
                isFirst && { color: colors.textMuted },
              ]}
            >
              Back
            </Text>
          </Pressable>

          {/*
            Primary action when the user must confirm:
            - multi-select / Other free-text → Next or Submit
            - last single-select after a pick → Submit
            Mid-flow single-select auto-advances on tap (no button).
          */}
          {hasAnswer ? (
            <Pressable
              onPress={onPrimaryAction}
              disabled={answering}
              accessibilityRole="button"
              accessibilityLabel={
                isLast
                  ? total > 1
                    ? 'Submit answers'
                    : 'Submit answer'
                  : 'Next question'
              }
              style={({ pressed }) => [
                styles.navBtn,
                styles.navBtnPrimary,
                answering && styles.navBtnDisabled,
                pressed && !answering && styles.navBtnPressed,
              ]}
            >
              <Text style={styles.navBtnPrimaryText}>
                {answering
                  ? 'Sending…'
                  : isLast
                    ? total > 1
                      ? 'Submit answers'
                      : 'Submit'
                    : 'Next'}
              </Text>
              {!answering && !isLast ? (
                <Ionicons
                  name="chevron-forward"
                  size={16}
                  color={colors.textInverse}
                />
              ) : null}
            </Pressable>
          ) : (
            <View style={styles.navBtnSpacer}>
              <Text style={styles.questionHint}>
                {multi
                  ? 'Select options or type an answer'
                  : 'Pick an option or type an answer'}
              </Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

function PartBubble({
  part,
  receivedAt,
  onAnswerQuestion,
  answering,
}: {
  part: TranscriptPart;
  receivedAt?: string;
  onAnswerQuestion?: (message: string) => void;
  answering?: boolean;
}) {
  const [expanded, setExpanded] = useState(!part.collapsible);
  const isUser = part.kind === 'user';
  const isStatus = part.kind === 'status' || part.kind === 'meta';
  const isError = part.kind === 'error';
  const isThinking = part.kind === 'thinking';

  if (part.kind === 'user_question') {
    return (
      <UserQuestionCard
        part={part}
        receivedAt={receivedAt}
        onAnswer={onAnswerQuestion}
        answering={answering}
      />
    );
  }

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
  // --- AskUserQuestion card ---
  questionWrap: {
    alignSelf: 'stretch',
    maxWidth: '100%',
    marginBottom: spacing.sm,
  },
  questionCard: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    backgroundColor: colors.bgElevated,
    borderColor: colors.border,
  },
  questionCardAwaiting: {
    borderColor: 'rgba(251, 191, 36, 0.55)',
    backgroundColor: colors.warningSoft,
  },
  questionCardDone: {
    borderColor: colors.borderSubtle,
    opacity: 0.88,
  },
  questionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: spacing.sm,
    flexWrap: 'wrap',
  },
  questionRole: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    color: colors.textSecondary,
    textTransform: 'uppercase',
  },
  questionBadge: {
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  questionBadgeAwaiting: {
    backgroundColor: 'rgba(251, 191, 36, 0.22)',
  },
  questionBadgeDone: {
    backgroundColor: colors.bgElevated,
  },
  questionBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  questionBlock: {
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  questionHeaderLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.warning,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  questionText: {
    fontSize: 15,
    color: colors.text,
    lineHeight: 21,
    fontWeight: '500',
  },
  questionHint: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.sm + 2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  optionRowSelected: {
    borderColor: colors.accentBorder,
    backgroundColor: colors.accentSoft,
  },
  optionRowPressed: {
    backgroundColor: colors.surfaceHover,
  },
  optionRowDisabled: {
    opacity: 0.75,
  },
  optionIndex: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 1,
  },
  optionIndexSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  optionIndexText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  optionBody: {
    flex: 1,
    gap: 2,
  },
  optionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    lineHeight: 19,
  },
  optionLabelSelected: {
    color: colors.text,
  },
  optionDescription: {
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 17,
  },
  submitBtn: {
    marginTop: spacing.sm,
    alignSelf: 'stretch',
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
  },
  submitBtnPressed: {
    opacity: 0.9,
  },
  submitBtnDisabled: {
    opacity: 0.45,
  },
  submitBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textInverse,
  },
  questionStepLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.warning,
    letterSpacing: 0.3,
  },
  stepDots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: spacing.sm,
  },
  stepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
  },
  stepDotActive: {
    backgroundColor: colors.warning,
    width: 18,
  },
  stepDotDone: {
    backgroundColor: colors.accent,
  },
  freeTextWrap: {
    marginTop: spacing.xs,
    gap: 6,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surface,
  },
  freeTextWrapActive: {
    borderColor: colors.accentBorder,
    backgroundColor: colors.accentSoft,
  },
  freeTextLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  otherInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.bgElevated,
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.sm,
    minHeight: 44,
    maxHeight: 120,
  },
  stepNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  navBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    minHeight: 40,
  },
  navBtnSecondary: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  navBtnPrimary: {
    backgroundColor: colors.accent,
    marginLeft: 'auto',
  },
  navBtnPressed: {
    opacity: 0.88,
  },
  navBtnDisabled: {
    opacity: 0.4,
  },
  navBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  navBtnPrimaryText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textInverse,
  },
  navBtnSpacer: {
    flex: 1,
    alignItems: 'flex-end',
    justifyContent: 'center',
    minHeight: 40,
  },
});
