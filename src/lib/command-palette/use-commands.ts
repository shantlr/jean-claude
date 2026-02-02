// src/lib/command-palette/use-commands.ts
import { useEffect, useRef } from 'react';

import { useCommandPalette } from './context';
import type { Command } from './types';

export function useCommands(id: string, commands: Command[]): void {
  const palette = useCommandPalette();
  const commandsRef = useRef(commands);
  commandsRef.current = commands;

  useEffect(() => {
    return palette.registerCommands(id, commandsRef);
  }, [id, palette]);
}
