import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { AgentBackendType } from '@shared/agent-backend-types';

export interface CreateSkillDraft {
  prompt: string;
  agentBackend: AgentBackendType;
  mode: 'create' | 'improve';
  sourceSkillPath?: string;
  sourceSkillName?: string;
}

interface CreateSkillDraftState {
  /** Whether the dialog is currently visible */
  isOpen: boolean;
  /** The persisted draft (survives close for "create" mode) */
  draft: CreateSkillDraft | null;

  /** Open the dialog, restoring existing draft or starting a new one */
  open: (params: {
    mode: 'create' | 'improve';
    sourceSkillPath?: string;
    sourceSkillName?: string;
  }) => void;

  /** Update the current draft (partial merge) */
  update: (
    patch: Partial<Pick<CreateSkillDraft, 'prompt' | 'agentBackend'>>,
  ) => void;

  /** Close the dialog but keep the draft for "create" mode */
  close: () => void;

  /** Discard the draft entirely (after successful submit) */
  discard: () => void;
}

const useStore = create<CreateSkillDraftState>()(
  persist(
    (set, get) => ({
      isOpen: false,
      draft: null,

      open: ({ mode, sourceSkillPath, sourceSkillName }) => {
        const existing = get().draft;
        // Restore existing draft only for "create" mode with no source context change
        if (mode === 'create' && existing?.mode === 'create') {
          // Re-open with existing draft
          set({ isOpen: true });
          return;
        }
        set({
          isOpen: true,
          draft: {
            prompt: '',
            agentBackend: 'claude-code',
            mode,
            sourceSkillPath,
            sourceSkillName,
          },
        });
      },

      update: (patch) => {
        const current = get().draft;
        if (!current) return;
        set({ draft: { ...current, ...patch } });
      },

      close: () => {
        const current = get().draft;
        if (!current) {
          set({ isOpen: false });
          return;
        }
        // For "improve" mode, discard on close since the context is specific
        if (current.mode === 'improve') {
          set({ isOpen: false, draft: null });
        } else {
          // For "create" mode, keep the draft so user can resume
          set({ isOpen: false });
        }
      },

      discard: () => set({ isOpen: false, draft: null }),
    }),
    {
      name: 'create-skill-draft',
      partialize: (state) => ({
        // Only persist the draft, not the open state — dialog should not
        // auto-reopen on app restart
        draft: state.draft,
      }),
    },
  ),
);

export const useCreateSkillDraftStore = useStore;
