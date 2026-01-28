// src/features/settings/ui-azure-devops-tab/add-organization-pane.tsx
import { Loader2, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from '@tanstack/react-router';

import { useGetAzureDevOpsOrganizations } from '@/hooks/use-azure-devops';
import { useCreateProvider, useProviders } from '@/hooks/use-providers';
import { useTokensByProviderType } from '@/hooks/use-tokens';
import { AzureDevOpsOrganization } from '@/lib/api';

type PaneStep = 'selectToken' | 'selectOrgs';

export function AddOrganizationPane({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<PaneStep>('selectToken');
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);
  const [organizations, setOrganizations] = useState<AzureDevOpsOrganization[]>([]);
  const [selectedOrgs, setSelectedOrgs] = useState<Set<string>>(new Set());

  const { data: tokens = [], isLoading: tokensLoading } = useTokensByProviderType('azure-devops');
  const { data: existingProviders = [] } = useProviders();
  const getOrganizations = useGetAzureDevOpsOrganizations();
  const createProvider = useCreateProvider();

  const existingOrgUrls = new Set(
    existingProviders
      .filter((p) => p.type === 'azure-devops')
      .map((p) => p.baseUrl)
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

    const selectedOrgsList = organizations.filter((org) => selectedOrgs.has(org.id));

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
        <button
          onClick={onClose}
          className="cursor-pointer rounded-lg p-1 text-neutral-500 hover:bg-neutral-700 hover:text-neutral-300"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {step === 'selectToken' && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-neutral-400">
            Select a token to authenticate with Azure DevOps:
          </p>

          {tokensLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
            </div>
          ) : tokens.length === 0 ? (
            <div className="rounded-lg border border-neutral-600 bg-neutral-700/50 p-4 text-center">
              <p className="text-sm text-neutral-400">No Azure DevOps tokens found</p>
              <Link
                to="/settings/tokens"
                className="mt-2 inline-block text-sm text-blue-400 hover:text-blue-300"
              >
                Add a token first →
              </Link>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {tokens.map((token) => (
                <button
                  key={token.id}
                  onClick={() => handleSelectToken(token.id)}
                  disabled={getOrganizations.isPending}
                  className="flex cursor-pointer items-center justify-between rounded-lg border border-neutral-600 bg-neutral-700 px-3 py-2 text-left hover:border-neutral-500 disabled:opacity-50"
                >
                  <span className="text-sm font-medium text-neutral-200">
                    {token.label}
                  </span>
                  {getOrganizations.isPending && selectedTokenId === token.id && (
                    <Loader2 className="h-4 w-4 animate-spin text-neutral-400" />
                  )}
                </button>
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
              <label
                key={org.id}
                className="flex cursor-pointer items-center gap-3 rounded-lg border border-neutral-600 bg-neutral-700 px-3 py-2 hover:border-neutral-500"
              >
                <input
                  type="checkbox"
                  checked={selectedOrgs.has(org.id)}
                  onChange={() => handleToggleOrg(org.id)}
                  className="h-4 w-4 rounded border-neutral-500 bg-neutral-600 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
                />
                <div>
                  <div className="text-sm font-medium text-neutral-200">{org.name}</div>
                  <div className="text-xs text-neutral-500">{org.url}</div>
                </div>
              </label>
            ))}
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setStep('selectToken')}
              className="flex-1 cursor-pointer rounded-lg border border-neutral-600 bg-neutral-700 px-4 py-2 text-sm font-medium text-neutral-300 hover:bg-neutral-600"
            >
              Back
            </button>
            <button
              onClick={handleAddSelected}
              disabled={selectedOrgs.size === 0 || createProvider.isPending}
              className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-blue-600"
            >
              {createProvider.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                `Add ${selectedOrgs.size > 0 ? `(${selectedOrgs.size})` : ''}`
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
