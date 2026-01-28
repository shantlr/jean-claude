import { AlertTriangle } from 'lucide-react';

import type { PortsInUseErrorData } from '../../../../shared/run-command-types';

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 max-w-md rounded-lg border border-neutral-700 bg-neutral-800 p-6 shadow-xl">
        <div className="mb-4 flex items-center gap-3">
          <div className="rounded-full bg-yellow-500/20 p-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
          </div>
          <h3 className="text-lg font-semibold">Ports in Use</h3>
        </div>

        <p className="mb-4 text-sm text-neutral-300">
          The following ports are already in use. Do you want to kill these
          processes and start the commands?
        </p>

        <div className="mb-4 rounded-md border border-neutral-700 bg-neutral-900 p-3">
          {error.portsInUse.map((portInfo, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between py-1 text-sm"
            >
              <span className="font-mono text-neutral-200">
                :{portInfo.port}
              </span>
              <span className="text-neutral-400">
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
            className="rounded-md px-4 py-2 text-sm text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className="rounded-md bg-yellow-600 px-4 py-2 text-sm font-medium text-white hover:bg-yellow-700 disabled:opacity-50"
          >
            {isLoading ? 'Killing...' : 'Kill & Start'}
          </button>
        </div>
      </div>
    </div>
  );
}
