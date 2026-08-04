import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { colors, radius, spacing, typography } from '@/lib/theme';

export function Screen({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  return <View style={[styles.screen, style]}>{children}</View>;
}

export function Card({
  children,
  style,
  onPress,
  accessibilityLabel,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={({ pressed }) => [
          styles.card,
          pressed && styles.cardPressed,
          style,
        ]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Title({ children }: { children: React.ReactNode }) {
  return <Text style={styles.title}>{children}</Text>;
}

export function Headline({ children }: { children: React.ReactNode }) {
  return <Text style={styles.headline}>{children}</Text>;
}

export function Body({
  children,
  muted,
  style,
}: {
  children: React.ReactNode;
  muted?: boolean;
  style?: object;
}) {
  return (
    <Text style={[styles.body, muted && styles.muted, style]}>{children}</Text>
  );
}

export function Caption({
  children,
  style,
  numberOfLines,
}: {
  children: React.ReactNode;
  style?: object;
  numberOfLines?: number;
}) {
  return (
    <Text style={[styles.caption, style]} numberOfLines={numberOfLines}>
      {children}
    </Text>
  );
}

export function Label({ children }: { children: React.ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  icon,
  style,
}: {
  title: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  disabled?: boolean;
  loading?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  style?: ViewStyle;
}) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: isDisabled, busy: Boolean(loading) }}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' && styles.buttonPrimary,
        variant === 'secondary' && styles.buttonSecondary,
        variant === 'danger' && styles.buttonDanger,
        variant === 'ghost' && styles.buttonGhost,
        isDisabled && styles.buttonDisabled,
        pressed && !isDisabled && styles.buttonPressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === 'primary' ? colors.textInverse : colors.text}
        />
      ) : (
        <View style={styles.buttonInner}>
          {icon ? (
            <Ionicons
              name={icon}
              size={18}
              color={
                variant === 'primary'
                  ? colors.textInverse
                  : variant === 'danger'
                    ? colors.danger
                    : colors.text
              }
            />
          ) : null}
          <Text
            style={[
              styles.buttonText,
              variant === 'primary' && styles.buttonTextPrimary,
              variant === 'danger' && styles.buttonTextDanger,
              variant === 'ghost' && styles.buttonTextGhost,
            ]}
          >
            {title}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

export function Input({
  label,
  error,
  containerStyle,
  ...props
}: TextInputProps & {
  label?: string;
  error?: string;
  containerStyle?: ViewStyle;
}) {
  return (
    <View style={[{ gap: spacing.sm }, containerStyle]}>
      {label ? <Label>{label}</Label> : null}
      <TextInput
        accessibilityLabel={props.accessibilityLabel || label}
        placeholderTextColor={colors.textMuted}
        style={[styles.input, props.multiline && styles.inputMultiline]}
        {...props}
      />
      {error ? <Caption style={{ color: colors.danger }}>{error}</Caption> : null}
    </View>
  );
}

export function Badge({
  label,
  color = colors.accent,
  soft,
}: {
  label: string;
  color?: string;
  soft?: boolean;
}) {
  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: soft ? `${color}22` : color,
          borderColor: soft ? `${color}55` : color,
        },
      ]}
    >
      <Text
        style={[
          styles.badgeText,
          { color: soft ? color : colors.textInverse },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

export function StatusDot({ status, label }: { status?: string; label?: string }) {
  const color =
    status === 'working'
      ? colors.working
      : status === 'idle' || status === 'ready'
        ? colors.idle
        : status === 'error'
          ? colors.error
          : status === 'initializing' || status === 'updating'
            ? colors.initializing
            : status === 'sleeping'
              ? colors.sleeping
              : status === 'archived' || status === 'deleted'
                ? colors.archived
                : colors.textMuted;

  return (
    <View style={styles.statusRow}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Caption style={{ color }}>{label || status || 'unknown'}</Caption>
    </View>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{title}</Text>
      {description ? (
        <Text style={styles.emptyDesc}>{description}</Text>
      ) : null}
      {action}
    </View>
  );
}

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <View style={styles.empty}>
      <ActivityIndicator color={colors.accent} size="large" />
      <Caption style={{ marginTop: spacing.md }}>{label}</Caption>
    </View>
  );
}

export function ErrorBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <View style={styles.errorBanner}>
      <Ionicons name="alert-circle" size={18} color={colors.danger} />
      <Text style={styles.errorText}>{message}</Text>
      {onRetry ? (
        <Pressable
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel="Retry"
        >
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Row({
  title,
  subtitle,
  meta,
  onPress,
  right,
  icon,
}: {
  title: string;
  subtitle?: string;
  meta?: string;
  onPress?: () => void;
  right?: React.ReactNode;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <Card onPress={onPress} accessibilityLabel={onPress ? title : undefined}>
      <View style={styles.row}>
        {icon ? (
          <View style={styles.rowIcon}>
            <Ionicons name={icon} size={16} color={colors.accent} />
          </View>
        ) : null}
        <View style={styles.rowBody}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.rowSubtitle} numberOfLines={2}>
              {subtitle}
            </Text>
          ) : null}
          {meta ? (
            <Text style={styles.rowMeta} numberOfLines={1}>
              {meta}
            </Text>
          ) : null}
        </View>
        {right}
        {onPress ? (
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        ) : null}
      </View>
    </Card>
  );
}

export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: Boolean(selected) }}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function SectionHeader({
  title,
  actionLabel,
  onAction,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
        >
          <Text style={styles.sectionAction}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing.lg,
  },
  cardPressed: {
    backgroundColor: colors.surfaceHover,
  },
  title: {
    ...typography.title,
    color: colors.text,
  },
  headline: {
    fontSize: 20,
    fontWeight: '600',
    letterSpacing: -0.3,
    color: colors.text,
  },
  body: {
    fontSize: 16,
    fontWeight: '400',
    color: colors.text,
  },
  muted: {
    color: colors.textSecondary,
  },
  caption: {
    fontSize: 13,
    fontWeight: '400',
    color: colors.textSecondary,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: 'SpaceMono',
    letterSpacing: 0.7,
    color: colors.textSecondary,
    textTransform: 'uppercase',
  },
  button: {
    minHeight: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  buttonPrimary: {
    backgroundColor: colors.accent,
  },
  buttonSecondary: {
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  buttonDanger: {
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: 'rgba(251,113,133,0.44)',
  },
  buttonGhost: {
    backgroundColor: 'transparent',
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  buttonPressed: {
    opacity: 0.88,
  },
  buttonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.text,
  },
  buttonTextPrimary: {
    color: colors.textInverse,
    fontWeight: '600',
  },
  buttonTextDanger: {
    color: colors.danger,
    fontWeight: '600',
  },
  buttonTextGhost: {
    color: colors.accent,
    fontWeight: '600',
  },
  input: {
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    color: colors.text,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 16,
    minHeight: 48,
  },
  inputMultiline: {
    minHeight: 100,
    textAlignVertical: 'top',
    paddingTop: spacing.md,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 10,
    fontFamily: 'SpaceMono',
    fontWeight: '400',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
    gap: spacing.sm,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    letterSpacing: -0.3,
    color: colors.text,
    textAlign: 'center',
  },
  emptyDesc: {
    fontSize: 16,
    fontWeight: '400',
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.dangerSoft,
    borderColor: 'rgba(251,113,133,0.44)',
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  errorText: {
    flex: 1,
    color: colors.danger,
    fontSize: 14,
  },
  retryText: {
    color: colors.danger,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  rowIcon: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  rowSubtitle: {
    fontSize: 13,
    fontWeight: '400',
    color: colors.textSecondary,
  },
  rowMeta: {
    fontSize: 13,
    fontWeight: '400',
    color: colors.textMuted,
    marginTop: 2,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipSelected: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accentBorder,
  },
  chipText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '500',
  },
  chipTextSelected: {
    color: colors.accent,
    fontWeight: '600',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: 'SpaceMono',
    letterSpacing: 0.7,
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  sectionAction: {
    color: colors.accent,
    fontWeight: '600',
    fontSize: 13,
  },
});
