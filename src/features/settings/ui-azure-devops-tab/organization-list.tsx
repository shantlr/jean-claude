import { useProviders } from '@/hooks/use-providers';

import type { Provider } from '../../../../shared/types';

import { OrganizationCard } from './organization-card';

export function OrganizationList({
  selectedProviderId,
  onSelectProvider,
}: {
  selectedProviderId: string | null;
  onSelectProvider: (provider: Provider | null) => void;
}) {
  const { data: providers = [] } = useProviders();

  const azureDevOpsProviders = providers.filter((p) => p.type === 'azure-devops');

  if (azureDevOpsProviders.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-700 px-6 py-8 text-center">
        <p className="text-neutral-500">No organizations connected yet</p>
        <p className="mt-1 text-sm text-neutral-600">
          Click "Add Organization" to connect your Azure DevOps account
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {azureDevOpsProviders.map((provider) => (
        <OrganizationCard
          key={provider.id}
          provider={provider}
          isSelected={selectedProviderId === provider.id}
          onSelect={() => {
            // Toggle selection if clicking the same provider
            if (selectedProviderId === provider.id) {
              onSelectProvider(null);
            } else {
              onSelectProvider(provider);
            }
          }}
        />
      ))}
    </div>
  );
}
