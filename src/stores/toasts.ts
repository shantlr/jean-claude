import { nanoid } from 'nanoid';
import { create } from 'zustand';

interface Toast {
  id: string;
  message: string;
  type: 'error' | 'success';
  createdAt: number;
}

interface ToastState {
  toasts: Toast[];
  addToast: (toast: { message: string; type: 'error' | 'success' }) => void;
  removeToast: (id: string) => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],

  addToast: ({ message, type }) => {
    const id = nanoid();
    set((state) => ({
      toasts: [...state.toasts, { id, message, type, createdAt: Date.now() }],
    }));

    // Auto-dismiss after 5 seconds
    setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.filter((t) => t.id !== id),
      }));
    }, 5000);
  },

  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },
}));
