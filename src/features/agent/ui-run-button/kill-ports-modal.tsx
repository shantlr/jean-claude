import { AlertTriangle, Loader2 } from 'lucide-react';

import { Modal } from '@/common/ui/modal';
import type { PortsInUseErrorData } from '@shared/run-command-types';

export function KillPortsModal({
  error,
  onConfirm,
  onCancel,
  isLoading,
}: {
  error: PortsInUseErrorData;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading: boolean;
}) {
  return (
    <Modal
      isOpen
      onClose={onCancel}
      title="Ports in Use"
      closeOnClickOutside={!isLoading}
      closeOnEscape={!isLoading}
    >
      <div className="-mt-2 mb-4 flex items-center gap-3">
        <div className="bg-status-run/20 rounded-full p-2">
          <AlertTriangle className="text-status-run h-5 w-5" />
        </div>
        <p className="text-ink-1 text-sm">
          The following ports are already in use. Do you want to kill these
          processes and start the commands?
        </p>
      </div>

      <div className="border-glass-border bg-bg-0 mb-4 max-h-48 overflow-y-auto rounded-md border p-3">
        {error.portsInUse.map((portInfo, idx) => (
          <div
            key={idx}
            className="flex items-center justify-between py-1 text-sm"
          >
            <span className="text-ink-1 font-mono">:{portInfo.port}</span>
            <span className="text-ink-2">
              {portInfo.processInfo ?? 'Unknown process'}
            </span>
          </div>
        ))}
      </div>

      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={isLoading}
          className="text-ink-2 hover:bg-glass-medium hover:text-ink-1 rounded-md px-4 py-2 text-sm disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={isLoading}
          className="flex items-center gap-2 rounded-md bg-yellow-600 px-4 py-2 text-sm font-medium text-white hover:bg-yellow-700 disabled:opacity-50"
        >
          {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
          Kill & Start
        </button>
      </div>
    </Modal>
  );
}
