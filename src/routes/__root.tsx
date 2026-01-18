import { createRootRoute, Outlet } from '@tanstack/react-router';

import { Header } from '@/components/header';
import { MainSidebar } from '@/components/main-sidebar';

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  return (
    <div className="flex h-screen bg-neutral-900 text-white">
      <MainSidebar />
      <div className="flex flex-1 flex-col">
        <Header />
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
