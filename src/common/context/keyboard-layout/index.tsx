import { useEffect } from 'react';
import { create } from 'zustand';

// Keyboard API types (not fully typed in standard DOM types)
interface KeyboardLayoutMap {
  get(key: string): string | undefined;
}

interface Keyboard {
  getLayoutMap(): Promise<KeyboardLayoutMap>;
}

declare global {
  interface Navigator {
    keyboard?: Keyboard;
  }
}

// Map from physical key codes to their display characters per layout
type LayoutMap = Map<string, string>;

// Physical key codes for digits
const DIGIT_CODES = [
  'Digit1',
  'Digit2',
  'Digit3',
  'Digit4',
  'Digit5',
  'Digit6',
  'Digit7',
  'Digit8',
  'Digit9',
  'Digit0',
];

const useStore = create<{
  layoutMap: LayoutMap | null;
}>(() => ({
  layoutMap: null,
}));

export function DetectKeyboardLayout() {
  useEffect(() => {
    // Check if Keyboard API is available
    const keyboard = navigator.keyboard;
    if (!keyboard) {
      useStore.setState({ layoutMap: null });
      return;
    }

    async function detectLayout() {
      const map = await keyboard?.getLayoutMap();
      if (!map) {
        console.debug('Keyboard layout detection not available');
        useStore.setState({ layoutMap: null });
        return;
      }
      const extracted = new Map<string, string>();

      // Extract digit key mappings
      for (const code of DIGIT_CODES) {
        const char = map.get(code);
        if (char) {
          extracted.set(code, char);
        }
      }

      useStore.setState({ layoutMap: extracted });
    }

    void detectLayout();
  }, []);

  return null;
}

export function useKeyboardLayout() {
  return useStore((v) => v.layoutMap);
}

// Get the display character for a digit key based on detected layout
export function getLayoutAwareDigit(
  layoutMap: LayoutMap | null,
  digit: string,
): string {
  if (!layoutMap) return digit;

  const code = `Digit${digit}`;
  return layoutMap.get(code) ?? digit;
}
