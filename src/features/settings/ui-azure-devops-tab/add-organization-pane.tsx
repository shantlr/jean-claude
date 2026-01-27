import { ExternalLink, Loader2, X } from 'lucide-react';
import { useState } from 'react';

import { useGetAzureDevOpsOrganizations } from '@/hooks/use-azure-devops';
import { useCreateProvider, useProviders } from '@/hooks/use-providers';
import { AzureDevOpsOrganization } from '@/lib/api';

type PaneStep = 'token' | 'select';

export function AddOrganizationPane({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<PaneStep>('token');
  const [token, setToken] = useState('');
  const [organizations, setOrganizations] = useState<AzureDevOpsOrganization[]>([]);
  const [selectedOrgs, setSelectedOrgs] = useState<Set<string>>(new Set());

  const { data: existingProviders = [] } = useProviders();
  const getOrganizations = useGetAzureDevOpsOrganizations();
  const createProvider = useCreateProvider();

  const existingOrgUrls = new Set(
    existingProviders
      .filter((p) => p.type === 'azure-devops')
      .map((p) => p.baseUrl)
  );

  const handleConnect = async () => {
    try {
      const orgs = await getOrganizations.mutateAsync(token);
      // Filter out already connected organizations
      const newOrgs = orgs.filter((org) => !existingOrgUrls.has(org.url));

      if (newOrgs.length === 0) {
        // All organizations are already connected
        alert('All accessible organizations are already connected.');
        return;
      }

      setOrganizations(newOrgs);
      // Auto-select all if only one
      if (newOrgs.length === 1) {
        setSelectedOrgs(new Set([newOrgs[0].id]));
      }
      setStep('select');
    } catch {
      // Error is displayed via getOrganizations.error
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
    const selectedOrgsList = organizations.filter((org) => selectedOrgs.has(org.id));

    for (const org of selectedOrgsList) {
      await createProvider.mutateAsync({
        type: 'azure-devops',
        label: org.name,
        baseUrl: org.url,
        token: token,
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

      {step === 'token' && (
        <div className="flex flex-col gap-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-neutral-400">
              Personal Access Token
            </label>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && token && handleConnect()}
              placeholder="Enter your PAT"
              className="w-full rounded-lg border border-neutral-600 bg-neutral-700 px-3 py-2 text-sm text-neutral-200 placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
              autoFocus
            />
          </div>

          <a
            href="https://learn.microsoft.com/en-us/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300"
          >
            How to create a PAT
            <ExternalLink className="h-3 w-3" />
          </a>

          {getOrganizations.error && (
            <div className="rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {getOrganizations.error.message}
            </div>
          )}

          <button
            onClick={handleConnect}
            disabled={!token || getOrganizations.isPending}
            className="flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-blue-600"
          >
            {getOrganizations.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Connecting...
              </>
            ) : (
              'Connect'
            )}
          </button>
        </div>
      )}

      {step === 'select' && (
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
              onClick={() => setStep('token')}
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
