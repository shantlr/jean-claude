import { createFileRoute } from '@tanstack/react-router';

import { DebugDatabase } from '@/features/settings/ui-debug-database';

export const Route = createFileRoute('/settings/debug')({
  component: DebugSettingsPage,
});

function DebugSettingsPage() {
  return <DebugDatabase />;
}
