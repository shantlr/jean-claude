import Anser from 'anser';
import { memo, useMemo } from 'react';

/**
 * ANSI color class → CSS color value.
 * Uses standard terminal colors that work on both light and dark backgrounds.
 */
const ANSI_COLOR_MAP: Record<string, string> = {
  'ansi-black': '#545454',
  'ansi-red': '#ff5f56',
  'ansi-green': '#2dd4a8',
  'ansi-yellow': '#e5c07b',
  'ansi-blue': '#61afef',
  'ansi-magenta': '#c678dd',
  'ansi-cyan': '#56b6c2',
  'ansi-white': '#d4d4d4',
  'ansi-bright-black': '#808080',
  'ansi-bright-red': '#ff6e6a',
  'ansi-bright-green': '#69f0ae',
  'ansi-bright-yellow': '#ffd740',
  'ansi-bright-blue': '#82b1ff',
  'ansi-bright-magenta': '#ea80fc',
  'ansi-bright-cyan': '#84ffff',
  'ansi-bright-white': '#ffffff',
};

/**
 * Strip all non-printable characters that the PTY may emit:
 * - ESC sequences: CSI (\x1b[…), OSC (\x1b]…\x07), and any other \x1b+char
 * - C0 control characters (0x00–0x1F) except tab (\x09)
 * - DEL (\x7F)
 */
function stripNonPrintable(text: string): string {
  return (
    text
      // ESC sequences: CSI (\x1b[…letter), OSC (\x1b]…BEL),
      // two-char charset switches (\x1b(B, \x1b(0, etc.), and other single-char ESC sequences
      // eslint-disable-next-line no-control-regex
      .replace(/\x1b(?:\[[0-9;?]*[a-zA-Z@]|\][^\x07]*\x07|\(.|.)/g, '')
      // Remaining C0 control chars (except \t) and DEL
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '')
      // Symbols for Legacy Computing (U+1FB00–U+1FB9F): sextant block characters
      // used by CLIs for pixel-art logos. No common font includes these glyphs,
      // so they render as empty boxes. Strip them to keep output clean.
      .replace(/[\u{1FB00}-\u{1FB9F}]/gu, '')
  );
}

export const AnsiLine = memo(function AnsiLine({ line }: { line: string }) {
  const segments = useMemo(() => {
    if (!line) return null;
    const parsed = Anser.ansiToJson(line, { use_classes: true });
    return parsed
      .map((segment) => ({
        ...segment,
        content: stripNonPrintable(segment.content),
      }))
      .filter((segment) => segment.content.length > 0);
  }, [line]);

  if (!segments || segments.length === 0) return <> </>;

  return (
    <>
      {segments.map((segment, i) => {
        const { content } = segment;
        if (!content) return null;

        const style: Record<string, string> = {};

        // Foreground color
        if (segment.fg) {
          if (segment.fg_truecolor) {
            style.color = `rgb(${segment.fg_truecolor})`;
          } else if (ANSI_COLOR_MAP[segment.fg]) {
            style.color = ANSI_COLOR_MAP[segment.fg];
          }
        }

        // Background color
        if (segment.bg) {
          if (segment.bg_truecolor) {
            style.backgroundColor = `rgb(${segment.bg_truecolor})`;
          } else if (ANSI_COLOR_MAP[segment.bg]) {
            style.backgroundColor = ANSI_COLOR_MAP[segment.bg];
          }
        }

        // Decorations (bold, italic, underline, dim, strikethrough)
        const decorations = segment.decorations || [];
        if (decorations.includes('bold')) {
          style.fontWeight = 'bold';
        }
        if (decorations.includes('italic')) {
          style.fontStyle = 'italic';
        }
        if (decorations.includes('dim')) {
          style.opacity = '0.6';
        }

        const textDecoration: string[] = [];
        if (decorations.includes('underline')) {
          textDecoration.push('underline');
        }
        if (decorations.includes('strikethrough')) {
          textDecoration.push('line-through');
        }
        if (textDecoration.length > 0) {
          style.textDecoration = textDecoration.join(' ');
        }

        // If no styling, render plain text (avoids extra DOM nodes)
        if (Object.keys(style).length === 0) {
          return <span key={i}>{content}</span>;
        }

        return (
          <span key={i} style={style}>
            {content}
          </span>
        );
      })}
    </>
  );
});
