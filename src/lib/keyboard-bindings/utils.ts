// src/lib/keyboard-bindings/utils.ts
import type { BindingKey } from './types';

const KEY_MAP: Record<string, string> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  Enter: 'enter',
  Escape: 'escape',
  Tab: 'tab',
  ' ': 'space',
  Backspace: 'backspace',
  Delete: 'delete',
};

// Map physical key codes to normalized keys (for keyboard-layout-independent bindings)
const CODE_MAP: Record<string, string> = {
  Digit1: '1',
  Digit2: '2',
  Digit3: '3',
  Digit4: '4',
  Digit5: '5',
  Digit6: '6',
  Digit7: '7',
  Digit8: '8',
  Digit9: '9',
  Digit0: '0',
};

function normalizeKey(event: KeyboardEvent): string {
  // For digit keys, use the physical key code to support AZERTY and other layouts
  const codeKey = CODE_MAP[event.code];
  if (codeKey) return codeKey;

  return KEY_MAP[event.key] ?? event.key.toLowerCase();
}

export function formatKeyboardEvent(event: KeyboardEvent): BindingKey {
  const parts: string[] = [];

  // Order: cmd > ctrl > alt > shift > base
  if (event.metaKey) parts.push('cmd');
  if (event.ctrlKey) parts.push('ctrl');
  if (event.altKey) parts.push('alt');
  // Don't include shift for digit keys since AZERTY requires shift for numbers
  const isDigitKey = event.code.startsWith('Digit');
  if (event.shiftKey && !isDigitKey) parts.push('shift');

  const key = normalizeKey(event);
  parts.push(key);

  return parts.join('+') as BindingKey;
}

export function isTypingInInput(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement;
  const tagName = target.tagName.toLowerCase();
  const isEditable = target.isContentEditable;
  const isInput =
    tagName === 'input' || tagName === 'textarea' || tagName === 'select';
  return isEditable || isInput;
}

// Format for display (e.g., "cmd+shift+p" -> "⌘⇧P")
export function formatKeyForDisplay(key: BindingKey): string {
  return key
    .replace('cmd+', '⌘')
    .replace('ctrl+', '⌃')
    .replace('alt+', '⌥')
    .replace('shift+', '⇧')
    .replace('enter', '↵')
    .replace('escape', 'Esc')
    .replace('tab', 'Tab')
    .replace('up', '↑')
    .replace('down', '↓')
    .replace('left', '←')
    .replace('right', '→')
    .toUpperCase();
}
