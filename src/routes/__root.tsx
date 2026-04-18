import {
  createRootRoute,
  Outlet,
  useNavigate,
  useRouter,
} from '@tanstack/react-router';
import { useCallback, useEffect } from 'react';

import { useCommands } from '@/common/hooks/use-commands';
import { Button } from '@/common/ui/button';
import { GlobalPromptFromBackModal } from '@/common/ui/global-prompt-from-back-modal';
import { TaskMessageManager } from '@/features/agent/task-message-manager';
import { BackgroundJobsOverlay } from '@/features/background-jobs/ui-background-jobs-overlay';
import { CommandPaletteOverlay } from '@/features/command-palette/ui-command-palette-overlay';
import { NewTaskOverlay } from '@/features/new-task/ui-new-task-overlay';
import { NotificationCenterOverlay } from '@/features/notifications/ui-notification-center';
import { PipelinesOverlay } from '@/features/pipelines/ui-pipelines-overlay';
import { BacklogOverlay } from '@/features/project/ui-backlog-overlay';
import { ProjectOverlay } from '@/features/project/ui-project-overlay';
import { RunningCommandsOverlay } from '@/features/run-commands/ui-running-commands-overlay';
import { SettingsOverlay } from '@/features/settings/ui-settings-overlay';
import { useBacklogProjectId } from '@/hooks/use-backlog-project-id';
import { Header } from '@/layout/ui-header';
import { MainSidebar } from '@/layout/ui-main-sidebar';
import { resolveLastLocationRedirect } from '@/lib/navigation';
import { useCurrentVisibleProject } from '@/stores/navigation';
import { useNewTaskDraft } from '@/stores/new-task-draft';
import { useNotificationsStore } from '@/stores/notifications';
import { useOverlaysStore } from '@/stores/overlays';

export const Route = createRootRoute({
  component: RootLayout,
  errorComponent: RootErrorBoundary,
  notFoundComponent: NotFoundRedirect,
});

function RootErrorBoundary({ error }: { error: Error }) {
  const router = useRouter();

  return (
    <div className="aurora-app-bg flex h-screen w-screen items-center justify-center text-white">
      <div className="max-w-lg space-y-4 p-8 text-center">
        <h1 className="text-2xl font-semibold text-red-400">
          Something went wrong
        </h1>
        <div className="bg-glass-light rounded-lg p-4 text-left">
          <p className="text-ink-1 font-mono text-sm">{error.message}</p>
        </div>
        <div className="flex justify-center gap-3">
          <Button
            variant="secondary"
            size="md"
            onClick={() => router.invalidate()}
          >
            Try again
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={() => router.navigate({ to: '/' })}
          >
            Go home
          </Button>
        </div>
        {process.env.NODE_ENV === 'development' && error.stack && (
          <details className="mt-4 text-left">
            <summary className="text-ink-3 cursor-pointer text-sm">
              Stack trace
            </summary>
            <pre className="bg-glass-light text-ink-2 mt-2 overflow-auto rounded p-3 text-xs">
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

function GlobalCommands() {
  const toggle = useOverlaysStore((s) => s.toggle);
  useCommands('global-commands', [
    {
      label: 'Settings',
      shortcut: 'cmd+,',
      handler: () => {
        toggle('settings');
      },
    },
  ]);
  return null;
}

function NewTaskContainer() {
  const isOpen = useOverlaysStore((s) => s.activeOverlay === 'new-task');
  const toggle = useOverlaysStore((s) => s.toggle);
  const close = useOverlaysStore((s) => s.close);
  const { discardDraft, setSelectedProjectId } = useNewTaskDraft();
  const { projectId } = useCurrentVisibleProject();

  useEffect(() => {
    if (!isOpen || projectId === 'all') return;
    setSelectedProjectId(projectId);
  }, [isOpen, projectId, setSelectedProjectId]);

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

function BackgroundJobsContainer() {
  const isOpen = useOverlaysStore((s) => s.activeOverlay === 'background-jobs');
  const toggle = useOverlaysStore((s) => s.toggle);
  const close = useOverlaysStore((s) => s.close);

  useCommands('background-jobs-trigger', [
    {
      shortcut: 'cmd+j',
      label: 'Open Background Jobs',
      section: 'General',
      handler: () => {
        toggle('background-jobs');
      },
    },
  ]);

  if (!isOpen) return null;
  return <BackgroundJobsOverlay onClose={() => close('background-jobs')} />;
}

function SettingsContainer() {
  const isOpen = useOverlaysStore((s) => s.activeOverlay === 'settings');
  const close = useOverlaysStore((s) => s.close);

  if (!isOpen) return null;
  return <SettingsOverlay onClose={() => close('settings')} />;
}

function ProjectBacklogContainer() {
  const isOpen = useOverlaysStore((s) => s.activeOverlay === 'project-backlog');
  const toggle = useOverlaysStore((s) => s.toggle);
  const close = useOverlaysStore((s) => s.close);
  const projectId = useBacklogProjectId();

  useCommands('project-backlog-trigger', [
    {
      shortcut: 'cmd+b',
      label: 'Open Project Backlog',
      section: 'Projects',
      handler: () => {
        if (projectId) {
          toggle('project-backlog');
        }
      },
    },
  ]);

  if (!isOpen || !projectId) return null;
  return (
    <BacklogOverlay
      initialProjectId={projectId}
      onClose={() => close('project-backlog')}
    />
  );
}

function RunningCommandsContainer() {
  const isOpen = useOverlaysStore(
    (s) => s.activeOverlay === 'running-commands',
  );
  const toggle = useOverlaysStore((s) => s.toggle);
  const close = useOverlaysStore((s) => s.close);

  useCommands('running-commands-trigger', [
    {
      shortcut: 'cmd+shift+r',
      label: 'Open Running Commands',
      section: 'General',
      handler: () => {
        toggle('running-commands');
      },
    },
  ]);

  if (!isOpen) return null;
  return <RunningCommandsOverlay onClose={() => close('running-commands')} />;
}

function PipelinesOverlayContainer() {
  const isOpen = useOverlaysStore((s) => s.activeOverlay === 'pipelines');
  const toggle = useOverlaysStore((s) => s.toggle);
  const close = useOverlaysStore((s) => s.close);

  useCommands('pipelines-trigger', [
    {
      shortcut: 'cmd+shift+y',
      label: 'Open Pipelines',
      section: 'Navigation',
      handler: () => {
        toggle('pipelines');
      },
    },
  ]);

  if (!isOpen) return null;
  return <PipelinesOverlay onClose={() => close('pipelines')} />;
}

function NotificationCenterContainer() {
  const isOpen = useOverlaysStore(
    (s) => s.activeOverlay === 'notification-center',
  );
  const toggle = useOverlaysStore((s) => s.toggle);
  const close = useOverlaysStore((s) => s.close);
  const markAllAsRead = useNotificationsStore((s) => s.markAllAsRead);

  const handleClose = useCallback(() => {
    markAllAsRead();
    close('notification-center');
  }, [markAllAsRead, close]);

  useCommands('notification-center-trigger', [
    {
      shortcut: 'cmd+shift+j',
      label: 'Open Notification Center',
      section: 'General',
      handler: () => {
        if (isOpen) {
          markAllAsRead();
        }
        toggle('notification-center');
      },
    },
  ]);

  if (!isOpen) return null;
  return <NotificationCenterOverlay onClose={handleClose} />;
}

function RootLayout() {
  return (
    <div className="aurora-app-bg flex h-screen w-screen overflow-hidden">
      <TaskMessageManager />
      <GlobalPromptFromBackModal />
      <GlobalCommands />
      {/* <TaskCommands /> */}

      {/* Overlay containers */}
      <NewTaskContainer />
      <CommandPaletteContainer />
      <ProjectOverlayContainer />
      <ProjectBacklogContainer />
      <BackgroundJobsContainer />
      <SettingsContainer />
      <NotificationCenterContainer />
      <RunningCommandsContainer />
      <PipelinesOverlayContainer />

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
