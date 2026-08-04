import React, { useMemo } from 'react';
import { StyleSheet, View, type TextStyle, type ViewStyle } from 'react-native';
import Markdown from 'react-native-markdown-display';

import { colors, radius, spacing } from '@/lib/theme';

export type MarkdownVariant = 'agent' | 'user' | 'error' | 'thinking';

type MdStyles = Record<string, TextStyle | ViewStyle>;

function buildStyles(variant: MarkdownVariant): MdStyles {
  const isUser = variant === 'user';
  const isError = variant === 'error';
  const isThinking = variant === 'thinking';

  const fg = isUser
    ? colors.userText
    : isError
      ? colors.danger
      : isThinking
        ? colors.textSecondary
        : colors.text;

  const secondary = isUser ? colors.userTextSecondary : colors.textSecondary;
  const codeBg = isUser ? 'rgba(6,18,31,0.28)' : colors.bgElevated;
  const codeFg = isUser ? colors.userText : colors.accent;
  const border = isUser ? 'rgba(186,230,253,0.32)' : colors.border;
  const link = isUser ? colors.userText : colors.accent;
  const quoteBorder = isUser ? colors.userTextSecondary : colors.accent;

  const fontSize = isThinking ? 13 : 15;
  const lineHeight = isThinking ? 18 : 21;

  return {
    body: {
      color: fg,
      fontSize,
      lineHeight,
      fontStyle: isThinking ? 'italic' : 'normal',
    },
    text: {
      color: fg,
      fontSize,
      lineHeight,
    },
    paragraph: {
      marginTop: 0,
      marginBottom: isThinking ? 4 : 6,
      flexWrap: 'wrap',
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'flex-start',
      width: '100%',
    },
    // Keep text nodes wrapping inside the bubble width
    textgroup: {
      flexShrink: 1,
    },
    strong: {
      fontWeight: '700',
      color: fg,
    },
    em: {
      fontStyle: 'italic',
      color: fg,
    },
    s: {
      textDecorationLine: 'line-through',
      color: secondary,
    },
    link: {
      color: link,
      textDecorationLine: 'underline',
    },
    heading1: {
      color: fg,
      fontSize: 17,
      fontWeight: '700',
      marginTop: 2,
      marginBottom: 6,
      lineHeight: 22,
    },
    heading2: {
      color: fg,
      fontSize: 16,
      fontWeight: '700',
      marginTop: 2,
      marginBottom: 5,
      lineHeight: 21,
    },
    heading3: {
      color: fg,
      fontSize: 15,
      fontWeight: '700',
      marginTop: 2,
      marginBottom: 4,
      lineHeight: 20,
    },
    heading4: {
      color: fg,
      fontSize: 14,
      fontWeight: '700',
      marginBottom: 4,
    },
    heading5: {
      color: fg,
      fontSize: 13,
      fontWeight: '700',
      marginBottom: 3,
    },
    heading6: {
      color: secondary,
      fontSize: 13,
      fontWeight: '700',
      marginBottom: 3,
    },
    bullet_list: {
      marginBottom: 6,
      marginTop: 0,
      width: '100%',
    },
    ordered_list: {
      marginBottom: 6,
      marginTop: 0,
      width: '100%',
    },
    list_item: {
      marginBottom: 3,
      flexDirection: 'row',
      alignItems: 'flex-start',
      width: '100%',
    },
    bullet_list_icon: {
      color: fg,
      fontSize: 14,
      lineHeight: 21,
      marginLeft: 0,
      marginRight: 6,
      marginTop: 0,
    },
    ordered_list_icon: {
      color: secondary,
      fontSize: 13,
      lineHeight: 21,
      marginLeft: 0,
      marginRight: 6,
    },
    bullet_list_content: {
      flex: 1,
      flexShrink: 1,
    },
    ordered_list_content: {
      flex: 1,
      flexShrink: 1,
    },
    code_inline: {
      fontFamily: 'SpaceMono',
      backgroundColor: codeBg,
      color: codeFg,
      fontSize: 12,
      paddingHorizontal: 4,
      paddingVertical: 1,
      borderRadius: 4,
    },
    fence: {
      fontFamily: 'SpaceMono',
      backgroundColor: codeBg,
      color: isUser ? colors.userText : colors.textSecondary,
      fontSize: 11,
      lineHeight: 16,
      padding: spacing.sm,
      borderRadius: radius.sm,
      marginVertical: spacing.sm,
      borderWidth: 1,
      borderColor: border,
      width: '100%',
    },
    code_block: {
      fontFamily: 'SpaceMono',
      backgroundColor: codeBg,
      color: isUser ? colors.userText : colors.textSecondary,
      fontSize: 11,
      lineHeight: 16,
      padding: spacing.sm,
      borderRadius: radius.sm,
      marginVertical: spacing.sm,
      width: '100%',
    },
    blockquote: {
      borderLeftWidth: 3,
      borderLeftColor: quoteBorder,
      paddingLeft: spacing.sm,
      marginVertical: spacing.sm,
      backgroundColor: isUser ? 'rgba(6,18,31,0.16)' : colors.bgElevated,
      paddingVertical: spacing.sm,
      paddingRight: spacing.sm,
      borderRadius: radius.sm,
      width: '100%',
    },
    hr: {
      backgroundColor: border,
      height: StyleSheet.hairlineWidth,
      marginVertical: spacing.md,
    },
    table: {
      borderWidth: 1,
      borderColor: border,
      borderRadius: radius.sm,
      marginVertical: spacing.sm,
      width: '100%',
    },
    thead: {
      backgroundColor: isUser ? 'rgba(6,18,31,0.18)' : colors.bgElevated,
    },
    th: {
      padding: 6,
      fontWeight: '700',
      color: fg,
      fontSize: 12,
      flex: 1,
      flexWrap: 'wrap',
    },
    td: {
      padding: 6,
      color: secondary,
      fontSize: 12,
      flex: 1,
      flexWrap: 'wrap',
    },
    tr: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: border,
      flexDirection: 'row',
      flexWrap: 'wrap',
    },
  };
}

/**
 * Renders markdown inside chat bubbles without nested ScrollViews
 * (those break FlatList row height and produce empty giant bubbles).
 */
export function MarkdownBody({
  children,
  variant = 'agent',
}: {
  children: string;
  variant?: MarkdownVariant;
}) {
  const mdStyles = useMemo(() => buildStyles(variant), [variant]);
  const content = (children ?? '').trim();

  if (!content) {
    return null;
  }

  return (
    <View style={styles.wrap}>
      <Markdown style={mdStyles} mergeStyle>
        {content}
      </Markdown>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    maxWidth: '100%',
    overflow: 'hidden',
    flexShrink: 1,
  },
});
