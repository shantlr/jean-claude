import { useProviders, useDeleteProvider } from '@/hooks/use-providers';

import { OrganizationCard } from './organization-card';

export function OrganizationList() {
  const { data: providers = [] } = useProviders();
  const deleteProvider = useDeleteProvider();

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
          onDelete={() => deleteProvider.mutate(provider.id)}
        />
      ))}
    </div>
  );
}
