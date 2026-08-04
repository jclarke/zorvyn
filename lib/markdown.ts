export const MAX_MARKDOWN_CHARS = 50_000;

export type MarkdownInlineToken =
  | { kind: 'text' | 'code' | 'strong' | 'em'; text: string }
  | { kind: 'link'; text: string; url: string };

export type MarkdownBlock =
  | { kind: 'blank'; key: number }
  | { kind: 'code'; key: number; text: string }
  | { kind: 'heading'; key: number; level: number; text: string }
  | { kind: 'quote'; key: number; text: string }
  | { kind: 'list'; key: number; ordered: boolean; marker: string; text: string }
  | { kind: 'paragraph'; key: number; text: string };

export function boundMarkdownInput(value: string): string {
  const content = (value ?? '').trim();
  if (content.length <= MAX_MARKDOWN_CHARS) return content;
  return `${content.slice(0, MAX_MARKDOWN_CHARS)}\n\n…content truncated for safe display`;
}

/**
 * Tokenize the small inline-markdown subset used by chat messages in one pass.
 * This deliberately avoids backtracking regular expressions because message
 * content is remote-controlled and can be large.
 */
export function parseMarkdownInline(input: string): MarkdownInlineToken[] {
  const tokens: MarkdownInlineToken[] = [];
  let textStart = 0;
  let index = 0;

  const pushText = (end: number) => {
    if (end > textStart) {
      tokens.push({ kind: 'text', text: input.slice(textStart, end) });
    }
  };

  const pushDelimited = (
    kind: 'code' | 'strong' | 'em',
    marker: string,
  ): boolean => {
    const contentStart = index + marker.length;
    const closing = input.indexOf(marker, contentStart);
    if (
      closing <= contentStart ||
      input.slice(contentStart, closing).includes('\n')
    ) {
      return false;
    }
    pushText(index);
    tokens.push({ kind, text: input.slice(contentStart, closing) });
    index = closing + marker.length;
    textStart = index;
    return true;
  };

  while (index < input.length) {
    const char = input[index];

    if (char === '[') {
      let cursor = index + 1;
      while (
        cursor < input.length &&
        input[cursor] !== '[' &&
        input[cursor] !== ']' &&
        input[cursor] !== '\n'
      ) {
        cursor += 1;
      }

      if (
        cursor > index + 1 &&
        input[cursor] === ']' &&
        input[cursor + 1] === '('
      ) {
        const urlStart = cursor + 2;
        let urlEnd = urlStart;
        while (
          urlEnd < input.length &&
          input[urlEnd] !== ')' &&
          !/\s/.test(input[urlEnd])
        ) {
          urlEnd += 1;
        }
        const url = input.slice(urlStart, urlEnd);
        if (
          input[urlEnd] === ')' &&
          (url.startsWith('https://') || url.startsWith('http://'))
        ) {
          pushText(index);
          tokens.push({
            kind: 'link',
            text: input.slice(index + 1, cursor),
            url,
          });
          index = urlEnd + 1;
          textStart = index;
          continue;
        }
      }
    } else if (char === '`' && pushDelimited('code', '`')) {
      continue;
    } else if (
      (input.startsWith('**', index) && pushDelimited('strong', '**')) ||
      (input.startsWith('__', index) && pushDelimited('strong', '__'))
    ) {
      continue;
    } else if (
      (char === '*' && pushDelimited('em', '*')) ||
      (char === '_' && pushDelimited('em', '_'))
    ) {
      continue;
    }

    index += 1;
  }

  pushText(input.length);
  return tokens;
}

export function parseMarkdownBlocks(input: string): MarkdownBlock[] {
  const lines = boundMarkdownInput(input).split('\n');
  const blocks: MarkdownBlock[] = [];
  let codeLines: string[] | null = null;
  let codeKey = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trimStart().startsWith('```')) {
      if (codeLines) {
        blocks.push({ kind: 'code', key: codeKey, text: codeLines.join('\n') });
        codeLines = null;
      } else {
        codeLines = [];
        codeKey = index;
      }
      continue;
    }
    if (codeLines) {
      codeLines.push(line);
      continue;
    }
    if (!line.trim()) {
      blocks.push({ kind: 'blank', key: index });
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      blocks.push({
        kind: 'heading',
        key: index,
        level: heading[1].length,
        text: heading[2],
      });
      continue;
    }
    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      blocks.push({ kind: 'quote', key: index, text: quote[1] });
      continue;
    }
    const unordered = line.match(/^\s*[-*+]\s+(.+)$/);
    if (unordered) {
      blocks.push({
        kind: 'list',
        key: index,
        ordered: false,
        marker: '•',
        text: unordered[1],
      });
      continue;
    }
    const ordered = line.match(/^\s*(\d+)[.)]\s+(.+)$/);
    if (ordered) {
      blocks.push({
        kind: 'list',
        key: index,
        ordered: true,
        marker: `${ordered[1]}.`,
        text: ordered[2],
      });
      continue;
    }
    blocks.push({ kind: 'paragraph', key: index, text: line });
  }

  if (codeLines) {
    blocks.push({ kind: 'code', key: codeKey, text: codeLines.join('\n') });
  }
  return blocks;
}
