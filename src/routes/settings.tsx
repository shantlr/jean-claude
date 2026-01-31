import {
  createFileRoute,
  Link,
  Outlet,
  useRouterState,
} from '@tanstack/react-router';

export const Route = createFileRoute('/settings')({
  component: SettingsLayout,
});

function SettingsLayout() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  const tabs = [
    { to: '/settings/general', label: 'General' },
    { to: '/settings/tokens', label: 'Tokens' },
    { to: '/settings/azure-devops', label: 'Azure DevOps' },
    { to: '/settings/debug', label: 'Debug' },
  ] as const;

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-tl-lg border-t border-l border-neutral-800 p-6">
      {/* Tab navigation */}
      <div className="flex gap-2">
        {tabs.map((tab) => {
          const isActive = pathname === tab.to;
          return (
            <Link
              key={tab.to}
              to={tab.to}
              className={`cursor-pointer rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-neutral-700 text-neutral-100'
                  : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200'
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="mt-8 flex-1 overflow-auto">
        <Outlet />
      </div>
    </div>
  );
}
