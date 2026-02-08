import { Loader2, RefreshCw, Trash2, X } from 'lucide-react';
import { useState } from 'react';

import { useModal } from '@/common/context/modal';
import { useGetAzureDevOpsTokenExpiration } from '@/hooks/use-azure-devops';
import { useDeleteToken, useUpdateToken } from '@/hooks/use-tokens';
import type { Token } from '@shared/types';

export function EditTokenPane({
  token,
  onClose,
}: {
  token: Token;
  onClose: () => void;
}) {
  const [label, setLabel] = useState(token.label);
  const [newToken, setNewToken] = useState('');
  const [expiresAt, setExpiresAt] = useState(
    token.expiresAt ? token.expiresAt.split('T')[0] : '',
  );
  const [error, setError] = useState<string | null>(null);

  const modal = useModal();
  const updateToken = useUpdateToken();
  const deleteToken = useDeleteToken();
  const getExpiration = useGetAzureDevOpsTokenExpiration();

  const handleSave = async () => {
    setError(null);
    try {
      await updateToken.mutateAsync({
        id: token.id,
        data: {
          label,
          ...(newToken ? { token: newToken } : {}),
          expiresAt: expiresAt || null,
          updatedAt: new Date().toISOString(),
        },
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update token');
    }
  };

  const handleRefreshExpiration = async () => {
    try {
      const expiration = await getExpiration.mutateAsync(token.id);
      if (expiration) {
        setExpiresAt(expiration.split('T')[0]);
      }
    } catch {
      // Silently fail - user can set manually
    }
  };

  const handleDeleteClick = () => {
    modal.confirm({
      title: 'Delete Token',
      content: (
        <>
          Are you sure you want to delete <strong>{token.label}</strong>? Any
          providers using this token will be disconnected.
        </>
      ),
      confirmLabel: 'Delete',
      variant: 'danger',
      onConfirm: async () => {
        await deleteToken.mutateAsync(token.id);
        onClose();
      },
    });
  };

  const hasChanges =
    label !== token.label ||
    newToken !== '' ||
    expiresAt !== (token.expiresAt ? token.expiresAt.split('T')[0] : '');

  return (
    <>
      <div className="w-80 shrink-0 rounded-lg border border-neutral-700 bg-neutral-800/50 p-4">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-medium text-neutral-200">Edit Token</h3>
          <button
            onClick={onClose}
            className="cursor-pointer rounded-lg p-1 text-neutral-500 hover:bg-neutral-700 hover:text-neutral-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-neutral-400">
              Label
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="w-full rounded-lg border border-neutral-600 bg-neutral-700 px-3 py-2 text-sm text-neutral-200 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-neutral-400">
              New Token (leave empty to keep current)
            </label>
            <input
              type="password"
              value={newToken}
              onChange={(e) => setNewToken(e.target.value)}
              placeholder="Enter new PAT to update"
              className="w-full rounded-lg border border-neutral-600 bg-neutral-700 px-3 py-2 text-sm text-neutral-200 placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm font-medium text-neutral-400">
                Expiration Date
              </label>
              {token.providerType === 'azure-devops' && (
                <button
                  onClick={handleRefreshExpiration}
                  disabled={getExpiration.isPending}
                  className="flex cursor-pointer items-center gap-1 text-xs text-blue-400 hover:text-blue-300 disabled:opacity-50"
                >
                  {getExpiration.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3 w-3" />
                  )}
                  Fetch from API
                </button>
              )}
            </div>
            <input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="w-full rounded-lg border border-neutral-600 bg-neutral-700 px-3 py-2 text-sm text-neutral-200 focus:border-blue-500 focus:outline-none"
            />
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {error}
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleDeleteClick}
              className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-500/20"
            >
              <Trash2 className="h-4 w-4" />
            </button>
            <button
              onClick={handleSave}
              disabled={!hasChanges || updateToken.isPending}
              className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-blue-600"
            >
              {updateToken.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Save Changes'
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
