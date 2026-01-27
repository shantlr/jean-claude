import { createFileRoute } from '@tanstack/react-router';

import { AzureDevOpsTab } from '@/features/settings/ui-azure-devops-tab';

export const Route = createFileRoute('/settings/azure-devops')({
  component: AzureDevOpsSettingsPage,
});

function AzureDevOpsSettingsPage() {
  return <AzureDevOpsTab />;
}
