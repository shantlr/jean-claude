type TerminalKeyboardEvent = Pick<
  KeyboardEvent,
  'altKey' | 'ctrlKey' | 'key' | 'metaKey'
>;

/**
 * Convert a keyboard event to the terminal escape sequence the PTY expects.
 * Returns null for keys that should not be forwarded (e.g. modifier-only,
 * browser shortcuts like Cmd+C for copy, Cmd+V for paste).
 */
export function keyEventToTerminalInput(
  e: TerminalKeyboardEvent,
): string | null {
  const { key, ctrlKey, metaKey, altKey } = e;

  // Let browser handle Cmd+key shortcuts (copy, paste, etc.)
  if (metaKey) return null;

  // Ctrl+<letter> → control character (0x01–0x1A)
  if (ctrlKey && key.length === 1 && /[a-zA-Z]/.test(key)) {
    const code = key.toLowerCase().charCodeAt(0) - 96; // a=1, b=2, c=3...
    return String.fromCharCode(code);
  }

  // Special keys → terminal escape sequences
  switch (key) {
    case 'Enter':
      return '\r';
    case 'Backspace':
      return '\x7f';
    case 'Tab':
      return '\t';
    case 'Escape':
      return '\x1b';
    case 'ArrowUp':
      return '\x1b[A';
    case 'ArrowDown':
      return '\x1b[B';
    case 'ArrowRight':
      return '\x1b[C';
    case 'ArrowLeft':
      return '\x1b[D';
    case 'Home':
      return '\x1b[H';
    case 'End':
      return '\x1b[F';
    case 'Delete':
      return '\x1b[3~';
    case 'PageUp':
      return '\x1b[5~';
    case 'PageDown':
      return '\x1b[6~';

    // Modifier-only or unhandled special keys — don't send
    case 'Shift':
    case 'Control':
    case 'Alt':
    case 'Meta':
    case 'CapsLock':
    case 'NumLock':
    case 'ScrollLock':
      return null;

    // Function keys
    case 'F1':
      return '\x1bOP';
    case 'F2':
      return '\x1bOQ';
    case 'F3':
      return '\x1bOR';
    case 'F4':
      return '\x1bOS';
    case 'F5':
      return '\x1b[15~';
    case 'F6':
      return '\x1b[17~';
    case 'F7':
      return '\x1b[18~';
    case 'F8':
      return '\x1b[19~';
    case 'F9':
      return '\x1b[20~';
    case 'F10':
      return '\x1b[21~';
    case 'F11':
      return '\x1b[23~';
    case 'F12':
      return '\x1b[24~';

    default:
      break;
  }

  // Alt+<char> → ESC prefix
  if (altKey && key.length === 1) {
    return `\x1b${key}`;
  }

  // Printable character (single char keys like "i", "a", "1", " ", etc.)
  if (key.length === 1) {
    return key;
  }

  // Unhandled special key — don't send
  return null;
}
