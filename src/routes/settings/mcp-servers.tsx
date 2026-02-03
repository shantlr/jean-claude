import { createFileRoute } from '@tanstack/react-router';

import { McpServersSettings } from '@/features/settings/ui-mcp-servers-settings';

export const Route = createFileRoute('/settings/mcp-servers')({
  component: McpServersSettingsPage,
});

function McpServersSettingsPage() {
  return <McpServersSettings />;
}
