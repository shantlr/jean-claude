import { RefreshCw, Trash2, X } from 'lucide-react';
import { startTransition, useEffect, useMemo, useRef, useState } from 'react';

import { useDeleteToken, useUpdateToken } from '@/hooks/use-tokens';
import { Button } from '@/common/ui/button';
import { IconButton } from '@/common/ui/icon-button';
import { Input } from '@/common/ui/input';
import type { Token } from '@shared/types';
import { useGetAzureDevOpsTokenExpiration } from '@/hooks/use-azure-devops';
import { useModal } from '@/common/context/modal';



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
  const currentDraftRef = useRef({ label, newToken, expiresAt });
  const savingTokenRef = useRef(false);
  const pendingTokenSaveRef = useRef<{
    label: string;
    newToken: string;
    expiresAt: string;
  } | null>(null);

  const modal = useModal();
  const updateToken = useUpdateToken();
  const deleteToken = useDeleteToken();
  const getExpiration = useGetAzureDevOpsTokenExpiration();

  useEffect(() => {
    currentDraftRef.current = { label, newToken, expiresAt };
  }, [expiresAt, label, newToken]);

  useEffect(() => {
    startTransition(() => setLabel(token.label));
    startTransition(() => setNewToken(''));
    startTransition(() => setExpiresAt(token.expiresAt ? token.expiresAt.split('T')[0] : ''));
    startTransition(() => setError(null));
  }, [token]);

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

  const hasChanges = useMemo(
    () =>
      label !== token.label ||
      newToken !== '' ||
      expiresAt !== (token.expiresAt ? token.expiresAt.split('T')[0] : ''),
    [expiresAt, label, newToken, token.expiresAt, token.label],
  );

  useEffect(() => {
    if (!hasChanges) return;

    const saveTimeout = window.setTimeout(async () => {
      pendingTokenSaveRef.current = { label, newToken, expiresAt };
      if (savingTokenRef.current) return;

      savingTokenRef.current = true;
      setError(null);
      try {
        while (pendingTokenSaveRef.current) {
          const draftToSave = pendingTokenSaveRef.current;
          pendingTokenSaveRef.current = null;
          await updateToken.mutateAsync({
            id: token.id,
            data: {
              label: draftToSave.label,
              ...(draftToSave.newToken ? { token: draftToSave.newToken } : {}),
              expiresAt: draftToSave.expiresAt || null,
              updatedAt: new Date().toISOString(),
            },
          });

          if (
            draftToSave.newToken &&
            JSON.stringify(currentDraftRef.current) ===
              JSON.stringify(draftToSave)
          ) {
            setNewToken('');
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update token');
      } finally {
        savingTokenRef.current = false;
      }
    }, 500);

    return () => window.clearTimeout(saveTimeout);
  }, [expiresAt, hasChanges, label, newToken, token.id, updateToken]);

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
            {(hasChanges || updateToken.isPending) && (
              <span className="text-ink-3 flex flex-1 items-center text-xs">
                {updateToken.isPending
                  ? 'Saving...'
                  : 'Changes save automatically'}
              </span>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
