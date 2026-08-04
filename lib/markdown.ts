export const MAX_MARKDOWN_CHARS = 50_000;

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
