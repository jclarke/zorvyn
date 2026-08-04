import React, { useMemo, type ReactNode } from 'react';
import {
  Linking,
  StyleSheet,
  Text,
  View,
  type TextStyle,
} from 'react-native';

import { colors, radius, spacing } from '@/lib/theme';
import { parseMarkdownBlocks } from '@/lib/markdown';

export type MarkdownVariant = 'agent' | 'user' | 'error' | 'thinking';

const INLINE_TOKEN = /(\[[^\]\n]+\]\(https?:\/\/[^)\s]+\)|`[^`\n]+`|\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|_[^_\n]+_)/g;

function inlineNodes(text: string, palette: Palette): ReactNode[] {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let key = 0;

  for (const match of text.matchAll(INLINE_TOKEN)) {
    const index = match.index ?? 0;
    if (index > cursor) nodes.push(text.slice(cursor, index));
    const token = match[0];
    const link = token.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);

    if (link) {
      const url = link[2];
      nodes.push(
        <Text
          key={`link-${key}`}
          style={[{ color: palette.link }, styles.link]}
          onPress={() => void Linking.openURL(url)}
          accessibilityRole="link"
        >
          {link[1]}
        </Text>,
      );
    } else if (token.startsWith('`')) {
      nodes.push(
        <Text
          key={`code-${key}`}
          style={[
            styles.inlineCode,
            { color: palette.codeFg, backgroundColor: palette.codeBg },
          ]}
        >
          {token.slice(1, -1)}
        </Text>,
      );
    } else if (token.startsWith('**') || token.startsWith('__')) {
      nodes.push(
        <Text key={`strong-${key}`} style={styles.strong}>
          {token.slice(2, -2)}
        </Text>,
      );
    } else {
      nodes.push(
        <Text key={`em-${key}`} style={styles.em}>
          {token.slice(1, -1)}
        </Text>,
      );
    }
    cursor = index + token.length;
    key += 1;
  }

  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

type Palette = {
  fg: string;
  secondary: string;
  link: string;
  codeFg: string;
  codeBg: string;
  border: string;
  quoteBg: string;
  fontSize: number;
  lineHeight: number;
  italic: boolean;
};

function paletteFor(variant: MarkdownVariant): Palette {
  const user = variant === 'user';
  const error = variant === 'error';
  const thinking = variant === 'thinking';
  return {
    fg: user
      ? colors.userText
      : error
        ? colors.danger
        : thinking
          ? colors.textSecondary
          : colors.text,
    secondary: user ? colors.userTextSecondary : colors.textSecondary,
    link: user ? colors.userText : colors.accent,
    codeFg: user ? colors.userText : colors.accent,
    codeBg: user ? 'rgba(6,18,31,0.28)' : colors.bgElevated,
    border: user ? 'rgba(186,230,253,0.32)' : colors.border,
    quoteBg: user ? 'rgba(6,18,31,0.16)' : colors.bgElevated,
    fontSize: thinking ? 13 : 15,
    lineHeight: thinking ? 18 : 21,
    italic: thinking,
  };
}

export function MarkdownBody({
  children,
  variant = 'agent',
}: {
  children: string;
  variant?: MarkdownVariant;
}) {
  const palette = useMemo(() => paletteFor(variant), [variant]);
  const blocks = useMemo(() => parseMarkdownBlocks(children), [children]);

  if (!blocks.length) return null;

  const baseText: TextStyle = {
    color: palette.fg,
    fontSize: palette.fontSize,
    lineHeight: palette.lineHeight,
    fontStyle: palette.italic ? 'italic' : 'normal',
  };

  return (
    <View style={styles.wrap}>
      {blocks.map((block) => {
        if (block.kind === 'blank') return <View key={block.key} style={styles.blank} />;
        if (block.kind === 'code') {
          return (
            <Text
              key={block.key}
              selectable
              style={[
                styles.codeBlock,
                { color: palette.secondary, backgroundColor: palette.codeBg, borderColor: palette.border },
              ]}
            >
              {block.text}
            </Text>
          );
        }
        if (block.kind === 'quote') {
          return (
            <View
              key={block.key}
              style={[
                styles.quote,
                { backgroundColor: palette.quoteBg, borderLeftColor: palette.link },
              ]}
            >
              <Text selectable style={baseText}>{inlineNodes(block.text, palette)}</Text>
            </View>
          );
        }
        if (block.kind === 'list') {
          return (
            <View key={block.key} style={styles.listRow}>
              <Text style={[baseText, styles.marker]}>{block.marker}</Text>
              <Text selectable style={[baseText, styles.listText]}>
                {inlineNodes(block.text, palette)}
              </Text>
            </View>
          );
        }
        if (block.kind === 'heading') {
          const size = Math.max(palette.fontSize, 19 - block.level);
          return (
            <Text
              key={block.key}
              selectable
              style={[baseText, styles.heading, { fontSize: size, lineHeight: size + 5 }]}
            >
              {inlineNodes(block.text, palette)}
            </Text>
          );
        }
        return (
          <Text key={block.key} selectable style={[baseText, styles.paragraph]}>
            {inlineNodes(block.text, palette)}
          </Text>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', maxWidth: '100%', flexShrink: 1 },
  blank: { height: 6 },
  paragraph: { flexShrink: 1 },
  heading: { fontWeight: '700', marginBottom: 3 },
  listRow: { flexDirection: 'row', alignItems: 'flex-start', width: '100%' },
  marker: { width: 24 },
  listText: { flex: 1, flexShrink: 1 },
  quote: {
    borderLeftWidth: 3,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    marginVertical: 3,
  },
  codeBlock: {
    width: '100%',
    fontFamily: 'SpaceMono',
    fontSize: 11,
    lineHeight: 16,
    padding: spacing.sm,
    marginVertical: 3,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  strong: { fontWeight: '700' },
  em: { fontStyle: 'italic' },
  link: { textDecorationLine: 'underline' },
  inlineCode: {
    fontFamily: 'SpaceMono',
    fontSize: 12,
    paddingHorizontal: 3,
    borderRadius: 3,
  },
});
