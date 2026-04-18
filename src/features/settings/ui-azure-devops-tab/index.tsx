import { Plus } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/common/ui/button';
import { Provider } from '@shared/types';

import { AddOrganizationPane } from './add-organization-pane';
import { OrganizationDetailsPane } from './organization-details-pane';
import { OrganizationList } from './organization-list';

export function AzureDevOpsTab() {
  const [showAddPane, setShowAddPane] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(
    null,
  );

  // Determine which pane to show (details takes precedence, add pane closes when selecting)
  const showDetailsPane = selectedProvider !== null;

  const handleSelectProvider = (provider: Provider | null) => {
    setSelectedProvider(provider);
    // Close add pane when selecting an organization
    if (provider !== null) {
      setShowAddPane(false);
    }
  };

  const handleShowAddPane = () => {
    setShowAddPane(true);
    // Clear selection when opening add pane
    setSelectedProvider(null);
  };

  return (
    <div className="flex h-full gap-6">
      {/* Main content */}
      <div className="flex-1">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-ink-1 text-lg font-semibold">Organizations</h2>
            <p className="text-ink-3 mt-1 text-sm">
              Connect your Azure DevOps organizations
            </p>
          </div>
          <Button onClick={handleShowAddPane} variant="primary" icon={<Plus />}>
            Add Organization
          </Button>
        </div>

        <OrganizationList
          selectedProviderId={selectedProvider?.id ?? null}
          onSelectProvider={handleSelectProvider}
        />
      </div>

      {/* Right pane for adding */}
      {showAddPane && (
        <AddOrganizationPane onClose={() => setShowAddPane(false)} />
      )}

      {/* Right pane for organization details */}
      {showDetailsPane && (
        <OrganizationDetailsPane
          provider={selectedProvider}
          onClose={() => setSelectedProvider(null)}
        />
      )}
    </div>
  );
}
