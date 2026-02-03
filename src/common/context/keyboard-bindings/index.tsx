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

import type { BindingKey } from './types';
import { formatKeyboardEvent, isTypingInInput } from './utils';

const RootKeyboardBindingsContext = createContext<{
  register: (id: string, bindings: RefObject<Bindings>) => () => void;
} | null>(null);

type BindingHandler = (event: KeyboardEvent) => boolean | void;
interface BindingConfig {
  handler: BindingHandler;
  /** If true, skip this binding when focus is on an input/textarea */
  ignoreIfInput?: boolean;
}
type Bindings = {
  [key in BindingKey]?: BindingHandler | BindingConfig;
};

export function RootKeyboardBindings({ children }: { children: ReactNode }) {
  const contextsRef = useRef<
    {
      id: string;
      bindings: RefObject<Bindings>;
    }[]
  >([]);

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
        if (handled === true || handled === undefined) {
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

function useRootKeyboardBindings() {
  const context = useContext(RootKeyboardBindingsContext);
  if (!context) {
    throw new Error(
      'useRootKeyboardBindings must be used within RootKeyboardBindings',
    );
  }
  return context;
}

/**
 * @example
 * ```
 * useRegisterKeyboardBindings('my-component', {
 *   'cmd+k': () => {
 *     // Do something
 *    return true; // Indicate handled
 *   },
 * })
 */
export function useRegisterKeyboardBindings(
  id: string,
  bindings: Bindings,
): void {
  const root = useRootKeyboardBindings();
  const bindingsRef = useRef(bindings);
  bindingsRef.current = bindings;

  useEffect(() => {
    return root.register(id, bindingsRef);
  }, [id, root]);
}
