import { createFileRoute } from '@tanstack/react-router';

import { TokensTab } from '@/features/settings/ui-tokens-tab';

export const Route = createFileRoute('/settings/tokens')({
  component: TokensSettingsPage,
});

function TokensSettingsPage() {
  return <TokensTab />;
}
