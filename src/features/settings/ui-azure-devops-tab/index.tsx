import { Plus } from 'lucide-react';
import { useState } from 'react';

import { AddOrganizationPane } from './add-organization-pane';
import { OrganizationList } from './organization-list';

export function AzureDevOpsTab() {
  const [showAddPane, setShowAddPane] = useState(false);

  return (
    <div className="flex h-full gap-6">
      {/* Main content */}
      <div className="flex-1">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-neutral-200">Organizations</h2>
            <p className="mt-1 text-sm text-neutral-500">
              Connect your Azure DevOps organizations
            </p>
          </div>
          <button
            onClick={() => setShowAddPane(true)}
            className="flex cursor-pointer items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
          >
            <Plus className="h-4 w-4" />
            Add Organization
          </button>
        </div>

        <OrganizationList />
      </div>

      {/* Right pane for adding */}
      {showAddPane && (
        <AddOrganizationPane onClose={() => setShowAddPane(false)} />
      )}
    </div>
  );
}
