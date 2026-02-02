// src/lib/command-palette/index.ts
export {
  RootCommandPaletteContext as RootCommandPalette,
  useCommandPalette,
} from './context';
export { useCommands } from './use-commands';
export type {
  Command,
  CommandPaletteContextValue,
  CommandSection,
} from './types';
