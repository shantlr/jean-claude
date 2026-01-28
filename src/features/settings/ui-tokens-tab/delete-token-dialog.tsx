import { AlertTriangle, Loader2 } from 'lucide-react';

export function DeleteTokenDialog({
  tokenLabel,
  onConfirm,
  onCancel,
  isDeleting,
}: {
  tokenLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  isDeleting: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg border border-neutral-700 bg-neutral-800 p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/10">
            <AlertTriangle className="h-5 w-5 text-red-400" />
          </div>
          <div>
            <h3 className="font-semibold text-neutral-200">Delete Token</h3>
            <p className="text-sm text-neutral-400">
              This action cannot be undone
            </p>
          </div>
        </div>

        <p className="mb-6 text-sm text-neutral-300">
          Are you sure you want to delete <strong>{tokenLabel}</strong>? Any
          providers using this token will be disconnected.
        </p>

        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={isDeleting}
            className="cursor-pointer rounded-lg border border-neutral-600 bg-neutral-700 px-4 py-2 text-sm font-medium text-neutral-300 hover:bg-neutral-600 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            className="flex cursor-pointer items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
          >
            {isDeleting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Deleting...
              </>
            ) : (
              'Delete'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
