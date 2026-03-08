import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  type ReactNode,
  type RefObject,
} from 'react';

import type { BindingKey } from './types';
import { formatKeyboardEvent, isTypingInInput } from './utils';

// --- Layer Context ---
const KeyboardBindingLayerContext = createContext<{ layerId: string } | null>(
  null,
);

const RootKeyboardBindingsContext = createContext<{
  register: (
    id: string,
    bindings: RefObject<Bindings>,
    options?: { layerId?: string },
  ) => () => void;
  addExclusiveLayer: (layerId: string) => void;
  removeExclusiveLayer: (layerId: string) => void;
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
      layerId?: string;
    }[]
  >([]);

  const exclusiveLayerIdsRef = useRef(new Set<string>());

  const register = useCallback(
    (
      id: string,
      bindings: RefObject<Bindings>,
      options?: { layerId?: string },
    ) => {
      // Remove existing if re-registering
      contextsRef.current = contextsRef.current.filter((c) => c.id !== id);

      // Add to end of list
      contextsRef.current.push({
        id,
        bindings,
        layerId: options?.layerId,
      });

      // Return unsubscribe
      return () => {
        contextsRef.current = contextsRef.current.filter((c) => c.id !== id);
      };
    },
    [],
  );

  const addExclusiveLayer = useCallback((layerId: string) => {
    exclusiveLayerIdsRef.current.add(layerId);
  }, []);

  const removeExclusiveLayer = useCallback((layerId: string) => {
    exclusiveLayerIdsRef.current.delete(layerId);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const key = formatKeyboardEvent(event);
      const inInput = isTypingInInput(event);

      const exclusiveIds = exclusiveLayerIdsRef.current;
      const hasExclusive = exclusiveIds.size > 0;

      // Loop from end (most recently registered first)
      for (let i = contextsRef.current.length - 1; i >= 0; i--) {
        const context = contextsRef.current[i];

        // If exclusive layers active, skip non-exclusive bindings
        if (
          hasExclusive &&
          (!context.layerId || !exclusiveIds.has(context.layerId))
        ) {
          continue;
        }

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

  const value = useMemo(
    () => ({ register, addExclusiveLayer, removeExclusiveLayer }),
    [register, addExclusiveLayer, removeExclusiveLayer],
  );

  return (
    <RootKeyboardBindingsContext.Provider value={value}>
      {children}
    </RootKeyboardBindingsContext.Provider>
  );
}

// --- KeyboardBindingLayer ---

/**
 * Creates a keyboard binding layer. When `exclusive` is true, only bindings
 * registered within this layer's subtree will fire — all other bindings are blocked.
 *
 * Useful for modal dialogs that must prevent background keybindings from firing.
 *
 * @example
 * ```tsx
 * <KeyboardBindingLayer exclusive>
 *   <ConfirmDialog />
 * </KeyboardBindingLayer>
 * ```
 */
export function KeyboardBindingLayer({
  exclusive,
  children,
}: {
  exclusive?: boolean;
  children: ReactNode;
}) {
  const layerId = useId();
  const root = useRootKeyboardBindings();

  useEffect(() => {
    if (!exclusive) return;
    root.addExclusiveLayer(layerId);
    return () => {
      root.removeExclusiveLayer(layerId);
    };
  }, [exclusive, layerId, root]);

  const value = useMemo(() => ({ layerId }), [layerId]);

  return (
    <KeyboardBindingLayerContext.Provider value={value}>
      {children}
    </KeyboardBindingLayerContext.Provider>
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
 *
 * // Conditionally enable bindings (re-registers at end of LIFO stack when enabled)
 * useRegisterKeyboardBindings('my-component', { ... }, { enabled: isOpen })
 */
export function useRegisterKeyboardBindings(
  id: string,
  bindings: Bindings,
  options?: { enabled?: boolean },
): void {
  const root = useRootKeyboardBindings();
  const layer = useContext(KeyboardBindingLayerContext);
  const bindingsRef = useRef(bindings);
  bindingsRef.current = bindings;

  const enabled = options?.enabled ?? true;
  const layerId = layer?.layerId;

  useEffect(() => {
    if (!enabled) return;
    return root.register(id, bindingsRef, { layerId });
  }, [id, root, enabled, layerId]);
}
