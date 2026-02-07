import {
  createRootRoute,
  Outlet,
  useNavigate,
  useRouter,
} from '@tanstack/react-router';
import { useCallback, useEffect } from 'react';

import { useCommands } from '@/common/hooks/use-commands';
import { GlobalPromptFromBackModal } from '@/common/ui/global-prompt-from-back-modal';
import { TaskMessageManager } from '@/features/agent/task-message-manager';
import { CommandPaletteOverlay } from '@/features/command-palette/ui-command-palette-overlay';
import { NewTaskOverlay } from '@/features/new-task/ui-new-task-overlay';
import { ProjectOverlay } from '@/features/project/ui-project-overlay';
import { Header } from '@/layout/ui-header';
import { MainSidebar } from '@/layout/ui-main-sidebar';
import { resolveLastLocationRedirect } from '@/lib/navigation';
import { useNewTaskDraft } from '@/stores/new-task-draft';
import { useOverlaysStore } from '@/stores/overlays';

export const Route = createRootRoute({
  component: RootLayout,
  errorComponent: RootErrorBoundary,
  notFoundComponent: NotFoundRedirect,
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

function CommandPaletteContainer() {
  const isOpen = useOverlaysStore((s) => s.activeOverlay === 'command-palette');
  const toggle = useOverlaysStore((s) => s.toggle);
  const close = useOverlaysStore((s) => s.close);

  useCommands('command-palette-trigger', [
    {
      shortcut: 'cmd+p',
      label: 'Open Command Palette',
      handler: () => {
        toggle('command-palette');
      },
      hideInCommandPalette: true,
    },
  ]);

  if (!isOpen) return null;
  return <CommandPaletteOverlay onClose={() => close('command-palette')} />;
}

const GlobalCommands = () => {
  const navigate = useNavigate();

  useCommands('global-commands', [
    {
      label: 'Settings',
      shortcut: 'cmd+,',
      handler: () => {
        navigate({ to: '/settings' });
      },
    },
  ]);
  return null;
};

function NewTaskContainer() {
  const isOpen = useOverlaysStore((s) => s.activeOverlay === 'new-task');
  const toggle = useOverlaysStore((s) => s.toggle);
  const close = useOverlaysStore((s) => s.close);
  const { discardDraft } = useNewTaskDraft();

  const handleClose = useCallback(() => close('new-task'), [close]);
  const handleDiscardDraft = useCallback(() => {
    discardDraft();
    close('new-task');
  }, [discardDraft, close]);

  useCommands('new-task-trigger', [
    {
      shortcut: 'cmd+n',
      label: 'New Task',
      handler: () => {
        toggle('new-task');
      },
    },
  ]);

  if (!isOpen) return null;
  return (
    <NewTaskOverlay onClose={handleClose} onDiscardDraft={handleDiscardDraft} />
  );
}

function ProjectOverlayContainer() {
  const isOpen = useOverlaysStore(
    (s) => s.activeOverlay === 'project-switcher',
  );
  const toggle = useOverlaysStore((s) => s.toggle);
  const close = useOverlaysStore((s) => s.close);

  useCommands('project-overlay-trigger', [
    {
      shortcut: 'cmd+o',
      label: 'Open Project Overlay',
      section: 'Projects',
      handler: () => {
        toggle('project-switcher');
      },
    },
  ]);

  if (!isOpen) return null;
  return <ProjectOverlay onClose={() => close('project-switcher')} />;
}

function RootLayout() {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-neutral-900 text-white">
      <TaskMessageManager />
      <GlobalPromptFromBackModal />
      <GlobalCommands />
      {/* <TaskCommands /> */}

      {/* Overlay containers */}
      <NewTaskContainer />
      <CommandPaletteContainer />
      <ProjectOverlayContainer />

      <div className="flex h-full w-full flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex h-full w-full overflow-hidden">
          <MainSidebar />
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function NotFoundRedirect() {
  const navigate = useNavigate();

  useEffect(() => {
    resolveLastLocationRedirect().then((target) => {
      navigate(target);
    });
  }, [navigate]);

  // Return null while redirecting
  return null;
}
