import { parse as shellParse } from 'shell-quote';

/**
 * Strip shell output redirections (e.g. `2>&1`, `>/dev/null`) from a command
 * so that `shell-quote` can parse the remaining operators cleanly.
 *
 * The target-file portion uses `[^\s;|&]+` instead of `\S+` so that shell
 * operators (`;`, `|`, `&&`, `||`) adjacent to the target are preserved.
 */
export function stripRedirections(command: string): string {
  // Match a redirection target: one or more chars that are NOT whitespace,
  // semicolons, pipes, or ampersands.  This ensures operators like `;` and
  // `&&` that follow a target (e.g. `>/dev/null; echo`) are not consumed.
  const T = '[^\\s;|&]+';

  return command
    .replace(/\d*>&\d+/g, '') // 2>&1, >&2
    .replace(new RegExp(`&>>\\s*${T}`, 'g'), '') // &>>/dev/null
    .replace(new RegExp(`&>\\s*${T}`, 'g'), '') // &>/dev/null
    .replace(new RegExp(`\\d*>>\\s*${T}`, 'g'), '') // 2>>/tmp/err, >>file
    .replace(new RegExp(`\\d*>\\s*${T}`, 'g'), '') // 2>/dev/null, >/dev/null
    .replace(new RegExp(`<<<\\s*${T}`, 'g'), '') // <<<string
    .replace(new RegExp(`<<\\s*${T}`, 'g'), '') // <<EOF
    .replace(new RegExp(`<\\s*${T}`, 'g'), '') // <input
    .replace(/\s+/g, ' ') // collapse whitespace
    .trim();
}

/**
 * Parse a compound shell command into individual sub-commands.
 *
 * Splits on `&&`, `||`, `;`, and `|` operators using `shell-quote`,
 * which correctly handles quoting (single, double), escape sequences,
 * command substitutions, and other shell syntax.
 *
 * Returns an array of trimmed, non-empty sub-command strings.
 * If the command has no compound operators, returns a single-element array.
 */
export function parseCompoundCommand(command: string): string[] {
  const cleaned = stripRedirections(command);
  const parsed = shellParse(cleaned);
  const commands: string[] = [];
  let currentTokens: string[] = [];

  for (const token of parsed) {
    if (typeof token === 'object' && token !== null && 'op' in token) {
      // Operator token — flush current command
      if (currentTokens.length > 0) {
        commands.push(currentTokens.join(' '));
        currentTokens = [];
      }
    } else if (typeof token === 'string') {
      currentTokens.push(token);
    }
    // Skip other token types (glob patterns, etc.)
  }

  // Push the last segment
  if (currentTokens.length > 0) {
    commands.push(currentTokens.join(' '));
  }

  const result = commands.length > 0 ? commands : [command.trim()];
  return [...new Set(result)];
}
