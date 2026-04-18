import { RefreshCw, Trash2, X } from 'lucide-react';
import { useState } from 'react';

import { useModal } from '@/common/context/modal';
import { Button } from '@/common/ui/button';
import { IconButton } from '@/common/ui/icon-button';
import { Input } from '@/common/ui/input';
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
      <div className="border-glass-border bg-bg-1/50 w-80 shrink-0 rounded-lg border p-4">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-ink-1 font-medium">Edit Token</h3>
          <IconButton
            onClick={onClose}
            icon={<X />}
            tooltip="Close"
            size="sm"
          />
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <label className="text-ink-2 mb-2 block text-sm font-medium">
              Label
            </label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>

          <div>
            <label className="text-ink-2 mb-2 block text-sm font-medium">
              New Token (leave empty to keep current)
            </label>
            <Input
              type="password"
              value={newToken}
              onChange={(e) => setNewToken(e.target.value)}
              placeholder="Enter new PAT to update"
            />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-ink-2 text-sm font-medium">
                Expiration Date
              </label>
              {token.providerType === 'azure-devops' && (
                <Button
                  onClick={handleRefreshExpiration}
                  disabled={getExpiration.isPending}
                  loading={getExpiration.isPending}
                  variant="ghost"
                  size="sm"
                  icon={<RefreshCw />}
                >
                  Fetch from API
                </Button>
              )}
            </div>
            <Input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </div>

          {error && (
            <div className="bg-status-fail/10 text-status-fail border-status-fail/50 rounded-lg border px-3 py-2 text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-2">
            <IconButton
              onClick={handleDeleteClick}
              icon={<Trash2 />}
              variant="danger"
              tooltip="Delete token"
            />
            <Button
              onClick={handleSave}
              disabled={!hasChanges || updateToken.isPending}
              loading={updateToken.isPending}
              variant="primary"
              className="flex-1"
            >
              Save Changes
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
