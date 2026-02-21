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

const RootOverlayContext = createContext<{
  register: (
    id: string,
    refs: RefObject<HTMLElement | null>[],
    onClose: () => void,
  ) => () => void;
} | null>(null);

export function RootOverlay({ children }: { children: ReactNode }) {
  const handlersRef = useRef<
    {
      id: string;
      refs: RefObject<HTMLElement | null>[];
      onClose: () => void;
    }[]
  >([]);

  const register = useCallback(
    (
      id: string,
      refs: RefObject<HTMLElement | null>[],
      onClose: () => void,
    ) => {
      // Remove existing if re-registering
      handlersRef.current = handlersRef.current.filter((h) => h.id !== id);

      // Add to end (highest priority)
      handlersRef.current.push({ id, refs, onClose });

      // Return unsubscribe
      return () => {
        handlersRef.current = handlersRef.current.filter((h) => h.id !== id);
      };
    },
    [],
  );

  useEffect(() => {
    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;

      // Loop from end (most recently registered = highest priority)
      for (let i = handlersRef.current.length - 1; i >= 0; i--) {
        const handler = handlersRef.current[i];
        const isInside = handler.refs.some(
          (ref) => ref.current && ref.current.contains(target),
        );

        if (isInside) {
          // Click is inside this overlay — stop, don't close anything
          return;
        }

        // Click is outside this overlay — close it and stop
        handler.onClose();
        return;
      }
    };

    document.addEventListener('mousedown', handleMouseDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, []);

  const value = useMemo(() => ({ register }), [register]);

  return (
    <RootOverlayContext.Provider value={value}>
      {children}
    </RootOverlayContext.Provider>
  );
}

function useRootOverlay() {
  const context = useContext(RootOverlayContext);
  if (!context) {
    throw new Error('useRootOverlay must be used within RootOverlay');
  }
  return context;
}

// Register an overlay element for click-outside detection.
export function useRegisterOverlay({
  id,
  refs,
  onClose,
  enabled = true,
}: {
  // Unique identifier for this overlay
  id: string;
  // Refs considered "inside" this overlay (e.g., trigger + content)
  refs: RefObject<HTMLElement | null>[];
  // Called when a click outside is detected
  onClose: () => void;
  // When false, the handler is unregistered. Re-registers at end of LIFO stack when enabled.
  enabled?: boolean;
}): void {
  const root = useRootOverlay();
  const refsRef = useRef(refs);
  refsRef.current = refs;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!enabled) return;

    // Create stable wrappers that delegate to current values
    const refsProxy = refsRef.current.map(
      (_, index) =>
        ({
          get current() {
            return refsRef.current[index]?.current ?? null;
          },
        }) as RefObject<HTMLElement | null>,
    );

    return root.register(id, refsProxy, () => onCloseRef.current());
  }, [id, root, enabled]);
}
