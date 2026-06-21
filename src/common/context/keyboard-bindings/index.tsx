import {
  createContext,
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
} from 'react';

import { formatKeyboardEvent, isTypingInInput } from './utils';
import type { BindingKey } from './types';
import type { LayerName } from './layers';



import { useLatestRef } from '@/hooks/use-latest-ref';
export type { LayerName } from './layers';

// --- Types ---

export type KeyboardLayer = {
  readonly id: string;
  readonly name: LayerName;
};

type BindingHandler = (event: KeyboardEvent) => boolean | void;

interface BindingConfig {
  handler: BindingHandler;
  ignoreIfInput?: boolean;
}

type Bindings = {
  [key in BindingKey]?: BindingHandler | BindingConfig;
};

// --- Root Context ---

interface RootContextValue {
  register: (
    id: string,
    bindings: RefObject<Bindings>,
    options?: { layerId?: string },
  ) => () => void;
  registerLayer: (layer: {
    id: string;
    name: LayerName;
    exclusive?: boolean;
    passthrough?: LayerName[];
  }) => () => void;
}

const RootKeyboardBindingsContext = createContext<RootContextValue | null>(
  null,
);

// --- Layer Context (for wrapper sugar) ---

const KeyboardLayerContext = createContext<KeyboardLayer | null>(null);

// --- Root Provider ---

export function RootKeyboardBindings({ children }: { children: ReactNode }) {
  const bindingsRef = useRef<
    { id: string; bindings: RefObject<Bindings>; layerId?: string }[]
  >([]);

  const layersRef = useRef<
    {
      id: string;
      name: LayerName;
      exclusive?: boolean;
      passthrough?: LayerName[];
    }[]
  >([]);

  const register = useCallback(
    (
      id: string,
      bindings: RefObject<Bindings>,
      options?: { layerId?: string },
    ) => {
      bindingsRef.current = bindingsRef.current.filter((c) => c.id !== id);
      bindingsRef.current.push({ id, bindings, layerId: options?.layerId });
      return () => {
        bindingsRef.current = bindingsRef.current.filter((c) => c.id !== id);
      };
    },
    [],
  );

  const registerLayer = useCallback(
    (layer: {
      id: string;
      name: LayerName;
      exclusive?: boolean;
      passthrough?: LayerName[];
    }) => {
      layersRef.current = layersRef.current.filter((l) => l.id !== layer.id);
      layersRef.current.push(layer);
      return () => {
        layersRef.current = layersRef.current.filter((l) => l.id !== layer.id);
      };
    },
    [],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const key = formatKeyboardEvent(event);
      const inInput = isTypingInInput(event);

      const tryHandleBinding = (entry: {
        id: string;
        bindings: RefObject<Bindings>;
        layerId?: string;
      }) => {
        const binding = entry.bindings.current?.[key];
        if (!binding) return false;

        const config: BindingConfig =
          typeof binding === 'function' ? { handler: binding } : binding;

        if (config.ignoreIfInput && inInput) return false;

        const handled = config.handler(event);
        if (handled === true || handled === undefined) {
          event.preventDefault();
          event.stopPropagation();
          return true;
        }

        return false;
      };

      // Find topmost exclusive layer (last in array = most recent mount)
      let topmostExclusive: (typeof layersRef.current)[number] | null = null;
      for (let i = layersRef.current.length - 1; i >= 0; i--) {
        if (layersRef.current[i].exclusive) {
          topmostExclusive = layersRef.current[i];
          break;
        }
      }

      if (topmostExclusive) {
        const allowedLayerIds = new Set<string>([topmostExclusive.id]);
        if (topmostExclusive.passthrough) {
          // Passthrough matches by layer NAME
          for (const layer of layersRef.current) {
            if (topmostExclusive.passthrough.includes(layer.name)) {
              allowedLayerIds.add(layer.id);
            }
          }
        }

        const prioritizedLayerIds = [topmostExclusive.id];
        for (let i = layersRef.current.length - 1; i >= 0; i--) {
          const layer = layersRef.current[i];
          if (
            layer.id !== topmostExclusive.id &&
            allowedLayerIds.has(layer.id) &&
            !prioritizedLayerIds.includes(layer.id)
          ) {
            prioritizedLayerIds.push(layer.id);
          }
        }

        for (const layerId of prioritizedLayerIds) {
          for (let i = bindingsRef.current.length - 1; i >= 0; i--) {
            const entry = bindingsRef.current[i];
            if (entry.layerId !== layerId) continue;
            if (tryHandleBinding(entry)) {
              return;
            }
          }
        }

        return;
      }

      // Loop LIFO (most recently registered first)
      for (let i = bindingsRef.current.length - 1; i >= 0; i--) {
        if (tryHandleBinding(bindingsRef.current[i])) {
          return;
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, []);

  const value = useMemo(
    () => ({ register, registerLayer }),
    [register, registerLayer],
  );

  return (
    <RootKeyboardBindingsContext.Provider value={value}>
      {children}
    </RootKeyboardBindingsContext.Provider>
  );
}

// --- useKeyboardLayer ---

export function useKeyboardLayer(
  name: LayerName,
  options?: { exclusive?: boolean; passthrough?: LayerName[] },
): KeyboardLayer {
  const id = useId();
  const root = useRootKeyboardBindings();

  const exclusive = options?.exclusive;
  const passthroughKey = options?.passthrough?.join(',') ?? '';
  const passthroughRef = useLatestRef(options?.passthrough);

  useEffect(() => {
    return root.registerLayer({
      id,
      name,
      exclusive,
      passthrough: passthroughRef.current,
    });
  }, [id, name, exclusive, passthroughKey, root, passthroughRef]);

  return useMemo(() => ({ id, name }), [id, name]);
}

// --- KeyboardLayerProvider (wrapper sugar) ---

export function KeyboardLayerProvider({
  layer,
  children,
}: {
  layer: KeyboardLayer;
  children: ReactNode;
}) {
  return (
    <KeyboardLayerContext.Provider value={layer}>
      {children}
    </KeyboardLayerContext.Provider>
  );
}

// --- useRegisterKeyboardBindings ---

export function useRegisterKeyboardBindings(
  id: string,
  bindings: Bindings,
  options?: { enabled?: boolean; layer?: KeyboardLayer },
): void {
  const root = useRootKeyboardBindings();
  const contextLayer = useContext(KeyboardLayerContext);
  const bindingsRef = useLatestRef(bindings);

  const enabled = options?.enabled ?? true;
  const layer = options?.layer ?? contextLayer;
  const layerId = layer?.id;

  useEffect(() => {
    if (!enabled) return;
    return root.register(id, bindingsRef, { layerId });
  }, [id, root, enabled, layerId, bindingsRef]);
}

// --- Internal ---

function useRootKeyboardBindings() {
  const context = useContext(RootKeyboardBindingsContext);
  if (!context) {
    throw new Error(
      'useRootKeyboardBindings must be used within RootKeyboardBindings',
    );
  }
  return context;
}
