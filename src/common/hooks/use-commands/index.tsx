import { RefObject, useEffect, useRef } from 'react';
import { create } from 'zustand/react';

import { useRegisterKeyboardBindings } from '@/common/context/keyboard-bindings';
import { BindingKey } from '@/common/context/keyboard-bindings/types';

type Command = {
  label: string;
  handler: () => void | boolean;
  shortcut?: BindingKey | BindingKey[];
  hideInCommandPalette?: boolean;
  keywords?: string[];
  section?: string;
};

const useStore = create<{
  sources: {
    id: string;
    commands: RefObject<Command[]>;
  }[];
}>(() => ({
  sources: [],
}));

const useCommandPalette = (id: string, commands: Command[]) => {
  const ref = useRef(commands);

  useEffect(() => {
    ref.current = commands;
  }, [commands]);

  useEffect(() => {
    if (useStore.getState().sources.find((s) => s.id === id)) {
      console.warn(`Commands with id "${id}" are already registered.`);
    }

    useStore.getState().sources.unshift({
      id,
      commands: ref,
    });

    return () => {
      useStore.setState((prev) => ({
        sources: prev.sources.filter((s) => s.id !== id),
      }));
    };
  }, [id]);
};

export const useCommands = (
  id: string,
  commands: (Command | false | null | undefined)[],
) => {
  const filtered = commands.filter((v) => !!v);
  useCommandPalette(id, filtered);
  useRegisterKeyboardBindings(
    id,
    filtered.reduce(
      (acc, command) => {
        if (Array.isArray(command.shortcut)) {
          command.shortcut.forEach((key) => {
            acc[key] = () => command.handler();
          });
        } else if (command.shortcut) {
          acc[command.shortcut] = () => command.handler();
        }
        return acc;
      },
      {} as Parameters<typeof useRegisterKeyboardBindings>[1],
    ),
  );
};

export const useCommandSources = () => {
  return useStore((s) => s.sources);
};
