// src/lib/keyboard-bindings/use-keyboard-bindings.ts
import { useEffect, useRef } from 'react';

import { useRootKeyboardBindings } from './root-keyboard-bindings';
import type { Bindings } from './types';

export function useKeyboardBindings(id: string, bindings: Bindings): void {
  const root = useRootKeyboardBindings();
  const bindingsRef = useRef(bindings);
  bindingsRef.current = bindings;

  useEffect(() => {
    console.log('REGISTERING KEYBOARD BINDINGS', id);
    return root.register(id, bindingsRef);
  }, [id, root]);
}
