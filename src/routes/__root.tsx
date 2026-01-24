import { createRootRoute, Outlet } from '@tanstack/react-router';

import { TaskMessageManager } from '@/features/agent/task-message-manager';
import { Header } from '@/layout/ui-header';
import { MainSidebar } from '@/layout/ui-main-sidebar';

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-neutral-900 text-white">
      <TaskMessageManager />
      <MainSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
