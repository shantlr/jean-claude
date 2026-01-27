import { X } from 'lucide-react';

import { Provider } from '../../../../shared/types';

export function OrganizationCard({
  provider,
  onDelete,
}: {
  provider: Provider;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-neutral-700 bg-neutral-800/50 px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/20 text-blue-400">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M0 8.877L2.247 5.91l8.405-3.416V.022l7.37 5.393L2.966 8.338v8.225L0 15.707zm24-4.45v14.651l-5.753 4.9-9.303-3.057v3.056l-5.978-7.416 15.057 1.798V5.415z" />
          </svg>
        </div>
        <div>
          <div className="font-medium text-neutral-200">{provider.label}</div>
          <div className="text-sm text-neutral-500">{provider.baseUrl}</div>
        </div>
      </div>
      <button
        onClick={onDelete}
        className="cursor-pointer rounded-lg p-2 text-neutral-500 hover:bg-neutral-700 hover:text-neutral-300"
        title="Remove organization"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
