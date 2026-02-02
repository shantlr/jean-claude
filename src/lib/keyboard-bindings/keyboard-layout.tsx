// src/lib/keyboard-bindings/keyboard-layout.tsx
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

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

interface KeyboardLayoutContextValue {
  layoutMap: LayoutMap | null;
  isLoading: boolean;
}

const KeyboardLayoutContext = createContext<KeyboardLayoutContextValue>({
  layoutMap: null,
  isLoading: true,
});

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

export function KeyboardLayoutProvider({ children }: { children: ReactNode }) {
  const [layoutMap, setLayoutMap] = useState<LayoutMap | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check if Keyboard API is available
    const keyboard = navigator.keyboard;
    if (!keyboard) {
      setIsLoading(false);
      return;
    }

    async function detectLayout() {
      try {
        const map = await keyboard!.getLayoutMap();
        const extracted = new Map<string, string>();

        // Extract digit key mappings
        for (const code of DIGIT_CODES) {
          const char = map.get(code);
          if (char) {
            extracted.set(code, char);
          }
        }

        setLayoutMap(extracted);
      } catch {
        // API not available or permission denied
        console.debug('Keyboard layout detection not available');
      } finally {
        setIsLoading(false);
      }
    }

    detectLayout();
  }, []);

  return (
    <KeyboardLayoutContext.Provider value={{ layoutMap, isLoading }}>
      {children}
    </KeyboardLayoutContext.Provider>
  );
}

export function useKeyboardLayout(): KeyboardLayoutContextValue {
  return useContext(KeyboardLayoutContext);
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
