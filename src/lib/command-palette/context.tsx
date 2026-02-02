// src/lib/command-palette/root-command-palette.tsx
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  type ReactNode,
  type RefObject,
} from 'react';

import type {
  Command,
  CommandPaletteContextValue,
  CommandSource,
} from './types';

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(
  null,
);

/**
 * Context to register and retrieve commands for the command palette.
 */
export function RootCommandPaletteContext({
  children,
}: {
  children: ReactNode;
}) {
  const sourcesRef = useRef<CommandSource[]>([]);

  const registerCommands = useCallback(
    (id: string, commands: RefObject<Command[]>) => {
      sourcesRef.current = sourcesRef.current.filter((s) => s.id !== id);
      sourcesRef.current.push({ id, commands });

      return () => {
        sourcesRef.current = sourcesRef.current.filter((s) => s.id !== id);
      };
    },
    [],
  );

  const getCommands = useCallback(() => {
    return sourcesRef.current.flatMap(
      (source) => source.commands.current ?? [],
    );
  }, []);

  const value = useMemo(
    () => ({
      registerCommands,
      getCommands,
    }),
    [registerCommands, getCommands],
  );

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
    </CommandPaletteContext.Provider>
  );
}

export function useCommandPalette(): CommandPaletteContextValue {
  const context = useContext(CommandPaletteContext);
  if (!context) {
    throw new Error('useCommandPalette must be used within RootCommandPalette');
  }
  return context;
}
