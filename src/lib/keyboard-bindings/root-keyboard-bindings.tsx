// src/lib/keyboard-bindings/root-keyboard-bindings.tsx
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
  type RefObject,
} from 'react';

import type { BindingConfig, BindingContext, Bindings } from './types';
import { formatKeyboardEvent, isTypingInInput } from './utils';

interface RootKeyboardBindingsContextValue {
  register: (id: string, bindings: RefObject<Bindings>) => () => void;
}

const RootKeyboardBindingsContext =
  createContext<RootKeyboardBindingsContextValue | null>(null);

export function RootKeyboardBindings({ children }: { children: ReactNode }) {
  const contextsRef = useRef<BindingContext[]>([]);

  const register = useCallback((id: string, bindings: RefObject<Bindings>) => {
    // Remove existing if re-registering
    contextsRef.current = contextsRef.current.filter((c) => c.id !== id);

    // Add to end of list
    contextsRef.current.push({ id, bindings });

    // Return unsubscribe
    return () => {
      contextsRef.current = contextsRef.current.filter((c) => c.id !== id);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const key = formatKeyboardEvent(event);
      const inInput = isTypingInInput(event);

      // Loop from end (most recently registered first)
      for (let i = contextsRef.current.length - 1; i >= 0; i--) {
        const context = contextsRef.current[i];
        const binding = context.bindings.current?.[key];
        if (!binding) continue;

        // Normalize to config object
        const config: BindingConfig =
          typeof binding === 'function' ? { handler: binding } : binding;

        // Skip if ignoreIfInput is set and we're in an input
        if (config.ignoreIfInput && inInput) continue;

        const handled = config.handler(event);
        if (handled) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
      }
    };

    // Use capture phase so we handle events before input elements
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, []);

  const value = useMemo(() => ({ register }), [register]);

  return (
    <RootKeyboardBindingsContext.Provider value={value}>
      {children}
    </RootKeyboardBindingsContext.Provider>
  );
}

export function useRootKeyboardBindings(): RootKeyboardBindingsContextValue {
  const context = useContext(RootKeyboardBindingsContext);
  if (!context) {
    throw new Error(
      'useRootKeyboardBindings must be used within RootKeyboardBindings',
    );
  }
  return context;
}
