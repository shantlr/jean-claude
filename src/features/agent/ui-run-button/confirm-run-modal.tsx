import { AlertTriangle } from 'lucide-react';

import { Modal } from '@/common/ui/modal';

export function ConfirmRunModal({
  commandName,
  message,
  onConfirm,
  onCancel,
}: {
  commandName: string;
  message: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal isOpen onClose={onCancel} title="Confirm Run">
      <div className="-mt-2 mb-4 flex items-center gap-3">
        <div className="rounded-full bg-yellow-500/20 p-2">
          <AlertTriangle className="h-5 w-5 text-yellow-500" />
        </div>
        <div className="text-sm text-neutral-300">
          {message ? (
            <>
              <div className="mb-1">{message}</div>
              <div className="text-xs text-neutral-500">
                Command:{' '}
                <span className="font-mono text-neutral-400">
                  {commandName}
                </span>
              </div>
            </>
          ) : (
            <>
              Are you sure you want to run{' '}
              <span className="font-mono text-neutral-100">{commandName}</span>?
            </>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-4 py-2 text-sm text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
        >
          Run
        </button>
      </div>
    </Modal>
  );
}
