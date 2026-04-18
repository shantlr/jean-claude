import { Loader2, X } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/common/ui/button';
import { Checkbox } from '@/common/ui/checkbox';
import { IconButton } from '@/common/ui/icon-button';
import { useGetAzureDevOpsOrganizations } from '@/hooks/use-azure-devops';
import { useCreateProvider, useProviders } from '@/hooks/use-providers';
import { useTokensByProviderType } from '@/hooks/use-tokens';
import { AzureDevOpsOrganization } from '@/lib/api';

type PaneStep = 'selectToken' | 'selectOrgs';

export function AddOrganizationPane({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<PaneStep>('selectToken');
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);
  const [organizations, setOrganizations] = useState<AzureDevOpsOrganization[]>(
    [],
  );
  const [selectedOrgs, setSelectedOrgs] = useState<Set<string>>(new Set());

  const { data: tokens = [], isLoading: tokensLoading } =
    useTokensByProviderType('azure-devops');
  const { data: existingProviders = [] } = useProviders();
  const getOrganizations = useGetAzureDevOpsOrganizations();
  const createProvider = useCreateProvider();

  const existingOrgUrls = new Set(
    existingProviders
      .filter((p) => p.type === 'azure-devops')
      .map((p) => p.baseUrl),
  );

  const handleSelectToken = async (tokenId: string) => {
    setSelectedTokenId(tokenId);
    try {
      const orgs = await getOrganizations.mutateAsync(tokenId);
      const newOrgs = orgs.filter((org) => !existingOrgUrls.has(org.url));

      if (newOrgs.length === 0) {
        alert('All accessible organizations are already connected.');
        return;
      }

      setOrganizations(newOrgs);
      if (newOrgs.length === 1) {
        setSelectedOrgs(new Set([newOrgs[0].id]));
      }
      setStep('selectOrgs');
    } catch {
      // Error displayed via getOrganizations.error
    }
  };

  const handleToggleOrg = (orgId: string) => {
    setSelectedOrgs((prev) => {
      const next = new Set(prev);
      if (next.has(orgId)) {
        next.delete(orgId);
      } else {
        next.add(orgId);
      }
      return next;
    });
  };

  const handleAddSelected = async () => {
    if (!selectedTokenId) return;

    const selectedOrgsList = organizations.filter((org) =>
      selectedOrgs.has(org.id),
    );

    for (const org of selectedOrgsList) {
      await createProvider.mutateAsync({
        type: 'azure-devops',
        label: org.name,
        baseUrl: org.url,
        tokenId: selectedTokenId,
        updatedAt: new Date().toISOString(),
      });
    }

    onClose();
  };

  return (
    <div className="border-glass-border bg-bg-1/50 w-80 shrink-0 rounded-lg border p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-ink-1 font-medium">Add Organization</h3>
        <IconButton
          onClick={onClose}
          icon={<X />}
          tooltip="Close pane"
          size="sm"
        />
      </div>

      {step === 'selectToken' && (
        <div className="flex flex-col gap-4">
          <p className="text-ink-2 text-sm">
            Select a token to authenticate with Azure DevOps:
          </p>

          {tokensLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2
                className="text-ink-2 h-5 w-5 animate-spin"
                aria-hidden
              />
              <span className="sr-only">Loading…</span>
            </div>
          ) : tokens.length === 0 ? (
            <div className="border-glass-border bg-glass-medium/50 rounded-lg border p-4 text-center">
              <p className="text-ink-2 text-sm">No Azure DevOps tokens found</p>
              <p className="text-ink-3 mt-2 text-sm">
                Add a token in the Tokens tab first
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {tokens.map((token) => (
                <Button
                  key={token.id}
                  onClick={() => handleSelectToken(token.id)}
                  disabled={getOrganizations.isPending}
                  className="border-glass-border bg-glass-medium hover:border-glass-border-strong flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2 text-left disabled:opacity-50"
                >
                  <span className="text-ink-1 text-sm font-medium">
                    {token.label}
                  </span>
                  {getOrganizations.isPending &&
                    selectedTokenId === token.id && (
                      <Loader2
                        className="text-ink-2 h-4 w-4 animate-spin"
                        aria-hidden
                      />
                    )}
                </Button>
              ))}
            </div>
          )}

          {getOrganizations.error && (
            <div className="bg-status-fail/10 text-status-fail border-status-fail/50 rounded-lg border px-3 py-2 text-sm">
              {getOrganizations.error.message}
            </div>
          )}
        </div>
      )}

      {step === 'selectOrgs' && (
        <div className="flex flex-col gap-4">
          <p className="text-ink-2 text-sm">Select organizations to add:</p>

          <div className="flex flex-col gap-2">
            {organizations.map((org) => (
              <div
                key={org.id}
                className="border-glass-border bg-glass-medium hover:border-glass-border-strong rounded-lg border px-3 py-2"
              >
                <Checkbox
                  checked={selectedOrgs.has(org.id)}
                  onChange={() => handleToggleOrg(org.id)}
                  label={org.name}
                  description={org.url}
                />
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <Button onClick={() => setStep('selectToken')} className="flex-1">
              Back
            </Button>
            <Button
              onClick={handleAddSelected}
              disabled={selectedOrgs.size === 0 || createProvider.isPending}
              loading={createProvider.isPending}
              variant="primary"
              className="flex-1"
            >
              Add {selectedOrgs.size > 0 ? `(${selectedOrgs.size})` : ''}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
