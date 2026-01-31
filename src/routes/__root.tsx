import { createRootRoute, Outlet, useRouter } from '@tanstack/react-router';

import { GlobalPromptModal } from '@/common/ui/global-prompt-modal';
import { TaskMessageManager } from '@/features/agent/task-message-manager';
import { Header } from '@/layout/ui-header';
import { MainSidebar } from '@/layout/ui-main-sidebar';

export const Route = createRootRoute({
  component: RootLayout,
  errorComponent: RootErrorBoundary,
});

function RootErrorBoundary({ error }: { error: Error }) {
  const router = useRouter();

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-neutral-900 text-white">
      <div className="max-w-lg space-y-4 p-8 text-center">
        <h1 className="text-2xl font-semibold text-red-400">
          Something went wrong
        </h1>
        <div className="rounded-lg bg-neutral-800 p-4 text-left">
          <p className="font-mono text-sm text-neutral-300">{error.message}</p>
        </div>
        <div className="flex justify-center gap-3">
          <button
            onClick={() => router.invalidate()}
            className="rounded-md bg-neutral-700 px-4 py-2 text-sm hover:bg-neutral-600"
          >
            Try again
          </button>
          <button
            onClick={() => router.navigate({ to: '/' })}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm hover:bg-blue-500"
          >
            Go home
          </button>
        </div>
        {process.env.NODE_ENV === 'development' && error.stack && (
          <details className="mt-4 text-left">
            <summary className="cursor-pointer text-sm text-neutral-500">
              Stack trace
            </summary>
            <pre className="mt-2 overflow-auto rounded bg-neutral-800 p-3 text-xs text-neutral-400">
              {error.stack}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}

function RootLayout() {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-neutral-900 text-white">
      <TaskMessageManager />
      <GlobalPromptModal />
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
