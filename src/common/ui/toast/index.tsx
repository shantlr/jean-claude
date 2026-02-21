import clsx from 'clsx';
import { CheckCircle2, CircleAlert, X } from 'lucide-react';

import { useToastStore } from '@/stores/toasts';

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const removeToast = useToastStore((s) => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed right-4 bottom-4 z-[60] flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={clsx(
            'flex items-start gap-2 rounded-lg border px-4 py-3 shadow-lg backdrop-blur-sm',
            toast.type === 'error' &&
              'border-red-800 bg-red-950/90 text-red-100',
            toast.type === 'success' &&
              'border-emerald-800 bg-emerald-950/90 text-emerald-100',
          )}
        >
          {toast.type === 'error' ? (
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
          ) : (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
          )}
          <p className="text-sm">{toast.message}</p>
          <button
            onClick={() => removeToast(toast.id)}
            className="ml-2 shrink-0 rounded p-0.5 hover:bg-white/10"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
