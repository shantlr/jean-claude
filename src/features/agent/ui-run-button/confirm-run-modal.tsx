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
        <div className="bg-status-run/20 rounded-full p-2">
          <AlertTriangle className="text-status-run h-5 w-5" />
        </div>
        <div className="text-ink-1 text-sm">
          {message ? (
            <>
              <div className="mb-1">{message}</div>
              <div className="text-ink-3 text-xs">
                Command:{' '}
                <span className="text-ink-2 font-mono">{commandName}</span>
              </div>
            </>
          ) : (
            <>
              Are you sure you want to run{' '}
              <span className="text-ink-0 font-mono">{commandName}</span>?
            </>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="text-ink-2 hover:bg-glass-medium hover:text-ink-1 rounded-md px-4 py-2 text-sm"
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
