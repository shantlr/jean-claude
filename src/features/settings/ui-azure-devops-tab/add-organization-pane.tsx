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
    <div className="w-80 shrink-0 rounded-lg border border-neutral-700 bg-neutral-800/50 p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-medium text-neutral-200">Add Organization</h3>
        <IconButton
          onClick={onClose}
          icon={<X />}
          tooltip="Close pane"
          size="sm"
        />
      </div>

      {step === 'selectToken' && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-neutral-400">
            Select a token to authenticate with Azure DevOps:
          </p>

          {tokensLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2
                className="h-5 w-5 animate-spin text-neutral-400"
                aria-hidden
              />
              <span className="sr-only">Loading…</span>
            </div>
          ) : tokens.length === 0 ? (
            <div className="rounded-lg border border-neutral-600 bg-neutral-700/50 p-4 text-center">
              <p className="text-sm text-neutral-400">
                No Azure DevOps tokens found
              </p>
              <p className="mt-2 text-sm text-neutral-500">
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
                  className="flex cursor-pointer items-center justify-between rounded-lg border border-neutral-600 bg-neutral-700 px-3 py-2 text-left hover:border-neutral-500 disabled:opacity-50"
                >
                  <span className="text-sm font-medium text-neutral-200">
                    {token.label}
                  </span>
                  {getOrganizations.isPending &&
                    selectedTokenId === token.id && (
                      <Loader2
                        className="h-4 w-4 animate-spin text-neutral-400"
                        aria-hidden
                      />
                    )}
                </Button>
              ))}
            </div>
          )}

          {getOrganizations.error && (
            <div className="rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {getOrganizations.error.message}
            </div>
          )}
        </div>
      )}

      {step === 'selectOrgs' && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-neutral-400">
            Select organizations to add:
          </p>

          <div className="flex flex-col gap-2">
            {organizations.map((org) => (
              <div
                key={org.id}
                className="rounded-lg border border-neutral-600 bg-neutral-700 px-3 py-2 hover:border-neutral-500"
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
