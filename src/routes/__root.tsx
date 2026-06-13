import {
  createRootRoute,
  Outlet,
  useNavigate,
  useRouter,
  useRouterState,
} from '@tanstack/react-router';
import clsx from 'clsx';
import { useCallback, useEffect, useRef } from 'react';
import { scan, setOptions } from 'react-scan';

import { useKeyboardLayer } from '@/common/context/keyboard-bindings';
import { useCommands } from '@/common/hooks/use-commands';
import { Button } from '@/common/ui/button';
import { GlobalPromptFromBackModal } from '@/common/ui/global-prompt-from-back-modal';
import { ActivityCenterOverlay } from '@/features/activity-center/ui-activity-center-overlay';
import { TaskMessageManager } from '@/features/agent/task-message-manager';
import { CalendarOverlay } from '@/features/calendar/ui-calendar-overlay';
import { ChangelogModal } from '@/features/changelog/ui-changelog-modal';
import { CommandPaletteOverlay } from '@/features/command-palette/ui-command-palette-overlay';
import { NewTaskOverlay } from '@/features/new-task/ui-new-task-overlay';
import { PipelinesOverlay } from '@/features/pipelines/ui-pipelines-overlay';
import { BacklogOverlay } from '@/features/project/ui-backlog-overlay';
import { ProjectOverlay } from '@/features/project/ui-project-overlay';
import { RunningCommandsOverlay } from '@/features/run-commands/ui-running-commands-overlay';
import { SettingsOverlay } from '@/features/settings/ui-settings-overlay';
import { UsageOverlay } from '@/features/usage/ui-usage-overlay';
import { Header } from '@/layout/ui-header';
import { MainSidebar } from '@/layout/ui-main-sidebar';
import { api } from '@/lib/api';
import { resolveLastLocationRedirect } from '@/lib/navigation';
import { useChangelogStore } from '@/stores/changelog';
import {
  useCurrentVisibleProject,
  useNavigationStore,
} from '@/stores/navigation';
import { useNewTaskDraft } from '@/stores/new-task-draft';
import { useOverlaysStore } from '@/stores/overlays';
import { pruneOrphanedReviewComments } from '@/stores/review-comments';
import { pruneOrphanedTaskPrompts } from '@/stores/task-prompts';
import { pruneOrphanedTaskReviewDrafts } from '@/stores/task-review-comment-drafts';
import { useToastStore } from '@/stores/toasts';
import { useUISetting } from '@/stores/ui';

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
  const layer = useKeyboardLayer('global-nav');
  const isOpen = useOverlaysStore((s) => s.activeOverlay === 'command-palette');
  const toggle = useOverlaysStore((s) => s.toggle);
  const close = useOverlaysStore((s) => s.close);

  useCommands(
    'command-palette-trigger',
    [
      {
        shortcut: 'cmd+p',
        label: 'Open Command Palette',
        handler: () => {
          toggle('command-palette');
        },
        hideInCommandPalette: true,
      },
    ],
    { layer },
  );

  if (!isOpen) return null;
  return <CommandPaletteOverlay onClose={() => close('command-palette')} />;
}

function GlobalCommands() {
  const layer = useKeyboardLayer('global-nav');
  const toggle = useOverlaysStore((s) => s.toggle);
  const openChangelog = useChangelogStore((s) => s.open);
  useCommands(
    'global-commands',
    [
      {
        label: 'Settings',
        shortcut: 'cmd+,',
        handler: () => {
          toggle('settings');
        },
      },
      {
        label: 'Changelog',
        section: 'General',
        handler: () => {
          openChangelog();
        },
      },
    ],
    { layer },
  );
  return null;
}

function NewTaskContainer() {
  const layer = useKeyboardLayer('global-nav');
  const isOpen = useOverlaysStore((s) => s.activeOverlay === 'new-task');
  const toggle = useOverlaysStore((s) => s.toggle);
  const close = useOverlaysStore((s) => s.close);
  const { draft, discardDraft, setSelectedProjectId } = useNewTaskDraft();
  const { projectId } = useCurrentVisibleProject();

  useEffect(() => {
    if (!isOpen || projectId === 'all') return;
    if (draft?.backlogTodoIds?.length) return;
    setSelectedProjectId(projectId);
  }, [draft?.backlogTodoIds?.length, isOpen, projectId, setSelectedProjectId]);

  const handleClose = useCallback(() => close('new-task'), [close]);
  const handleDiscardDraft = useCallback(() => {
    discardDraft();
    close('new-task');
  }, [discardDraft, close]);

  useCommands(
    'new-task-trigger',
    [
      {
        shortcut: 'cmd+n',
        label: 'New Task',
        handler: () => {
          toggle('new-task');
        },
      },
    ],
    { layer },
  );

  if (!isOpen) return null;
  return (
    <NewTaskOverlay onClose={handleClose} onDiscardDraft={handleDiscardDraft} />
  );
}

function ProjectOverlayContainer() {
  const layer = useKeyboardLayer('global-nav');
  const isOpen = useOverlaysStore(
    (s) => s.activeOverlay === 'project-switcher',
  );
  const toggle = useOverlaysStore((s) => s.toggle);
  const close = useOverlaysStore((s) => s.close);

  useCommands(
    'project-overlay-trigger',
    [
      {
        shortcut: 'cmd+o',
        label: 'Open Project Overlay',
        section: 'Projects',
        handler: () => {
          toggle('project-switcher');
        },
      },
    ],
    { layer },
  );

  if (!isOpen) return null;
  return <ProjectOverlay onClose={() => close('project-switcher')} />;
}

function ActivityCenterContainer() {
  const layer = useKeyboardLayer('global-nav');
  const isOpen = useOverlaysStore((s) => s.activeOverlay === 'activity-center');
  const toggle = useOverlaysStore((s) => s.toggle);
  const close = useOverlaysStore((s) => s.close);

  useCommands(
    'activity-center-trigger',
    [
      {
        shortcut: 'cmd+j',
        label: 'Activity Center',
        section: 'General',
        handler: () => {
          toggle('activity-center');
        },
      },
    ],
    { layer },
  );

  if (!isOpen) return null;
  return <ActivityCenterOverlay onClose={() => close('activity-center')} />;
}

function CalendarContainer() {
  const layer = useKeyboardLayer('global-nav');
  const isOpen = useOverlaysStore((s) => s.activeOverlay === 'calendar');
  const toggle = useOverlaysStore((s) => s.toggle);
  const close = useOverlaysStore((s) => s.close);

  useCommands(
    'calendar-trigger',
    [
      {
        shortcut: 'cmd+;',
        label: 'Calendar',
        section: 'General',
        handler: () => {
          toggle('calendar');
        },
      },
    ],
    { layer },
  );

  if (!isOpen) return null;
  return <CalendarOverlay onClose={() => close('calendar')} />;
}

function SettingsContainer() {
  const isOpen = useOverlaysStore((s) => s.activeOverlay === 'settings');
  const close = useOverlaysStore((s) => s.close);

  if (!isOpen) return null;
  return <SettingsOverlay onClose={() => close('settings')} />;
}

function UsageContainer() {
  const isOpen = useOverlaysStore((s) => s.activeOverlay === 'usage');
  const close = useOverlaysStore((s) => s.close);

  if (!isOpen) return null;
  return <UsageOverlay onClose={() => close('usage')} />;
}

function BacklogContainer() {
  const layer = useKeyboardLayer('global-nav');
  const isOpen = useOverlaysStore((s) => s.activeOverlay === 'backlog');
  const toggle = useOverlaysStore((s) => s.toggle);
  const close = useOverlaysStore((s) => s.close);

  useCommands(
    'backlog-trigger',
    [
      {
        shortcut: 'cmd+b',
        label: 'Open Backlog',
        section: 'General',
        handler: () => {
          toggle('backlog');
        },
      },
    ],
    { layer },
  );

  if (!isOpen) return null;
  return <BacklogOverlay onClose={() => close('backlog')} />;
}

function RunningCommandsContainer() {
  const layer = useKeyboardLayer('global-nav');
  const isOpen = useOverlaysStore(
    (s) => s.activeOverlay === 'running-commands',
  );
  const toggle = useOverlaysStore((s) => s.toggle);
  const close = useOverlaysStore((s) => s.close);

  useCommands(
    'running-commands-trigger',
    [
      {
        shortcut: 'cmd+shift+r',
        label: 'Open Running Commands',
        section: 'General',
        handler: () => {
          toggle('running-commands');
        },
      },
    ],
    { layer },
  );

  if (!isOpen) return null;
  return <RunningCommandsOverlay onClose={() => close('running-commands')} />;
}

function PipelinesOverlayContainer() {
  const layer = useKeyboardLayer('global-nav');
  const isOpen = useOverlaysStore((s) => s.activeOverlay === 'pipelines');
  const toggle = useOverlaysStore((s) => s.toggle);
  const close = useOverlaysStore((s) => s.close);

  useCommands(
    'pipelines-trigger',
    [
      {
        shortcut: 'cmd+shift+y',
        label: 'Open Pipelines',
        section: 'Navigation',
        handler: () => {
          toggle('pipelines');
        },
      },
    ],
    { layer },
  );

  if (!isOpen) return null;
  return <PipelinesOverlay onClose={() => close('pipelines')} />;
}

/** Clean up persisted store data for tasks that no longer exist or are completed */
function useCleanupNonActiveTasks() {
  useEffect(() => {
    void api.tasks.findAll().then((tasks) => {
      const activeIds = new Set(
        tasks.filter((t) => t.status !== 'completed').map((t) => t.id),
      );

      // Prune review comments
      pruneOrphanedReviewComments(activeIds);

      // Prune task prompt drafts
      pruneOrphanedTaskPrompts(activeIds);

      // Prune task review comment drafts
      pruneOrphanedTaskReviewDrafts(activeIds);

      // Prune navigation task state
      // Note: clearTaskNavHistoryState also calls clearReviewCommentsForTask
      // internally, but pruneOrphanedReviewComments above already handled that.
      const navState = useNavigationStore.getState();
      for (const taskId of Object.keys(navState.taskState)) {
        if (!activeIds.has(taskId)) {
          navState.clearTaskNavHistoryState(taskId);
        }
      }
    });
  }, []);
}

function RootLayout() {
  useCleanupNonActiveTasks();

  return (
    <div
      className={clsx(
        'aurora-app-bg flex h-screen w-screen overflow-hidden',
        api.app.isDevMode &&
          'rounded-xl border-2 border-amber-400/50 shadow-[inset_0_0_0_1px_oklch(0.8_0.18_80_/_0.22),inset_0_0_32px_oklch(0.8_0.18_80_/_0.18)]',
      )}
    >
      <ReactScanBridge />
      <NotificationTaskOpenBridge />
      <RateLimitSwapBridge />
      <TaskMessageManager />
      <GlobalPromptFromBackModal />
      <GlobalCommands />
      {/* <TaskCommands /> */}

      {/* Changelog modal (startup only) */}
      <ChangelogModal />

      {/* Overlay containers */}
      <NewTaskContainer />
      <CommandPaletteContainer />
      <ProjectOverlayContainer />
      <BacklogContainer />
      <ActivityCenterContainer />
      <CalendarContainer />
      <SettingsContainer />
      <UsageContainer />
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

function ReactScanBridge() {
  const enabled = useUISetting('reactScanEnabled');
  const wasEnabledRef = useRef(enabled);

  useEffect(() => {
    if (enabled) {
      window.localStorage.removeItem('react-scan-options');

      scan({
        enabled: true,
        showToolbar: true,
        animationSpeed: 'fast',
        dangerouslyForceRunInProduction: true,
      });
      wasEnabledRef.current = true;
      return;
    }

    window.localStorage.removeItem('react-scan-options');

    setOptions({
      enabled: false,
      ...(wasEnabledRef.current ? { showToolbar: false } : {}),
      animationSpeed: 'fast',
      dangerouslyForceRunInProduction: false,
    });
    wasEnabledRef.current = false;
  }, [enabled]);

  return null;
}

function NotificationTaskOpenBridge() {
  const navigate = useNavigate();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  useEffect(() => {
    return api.notifications.onOpenTask(({ taskId, projectId }) => {
      const shouldStayInProjectContext =
        pathname.startsWith('/projects/') &&
        !pathname.startsWith('/projects/new');

      if (shouldStayInProjectContext) {
        void navigate({
          to: '/projects/$projectId/tasks/$taskId',
          params: { projectId, taskId },
        });
        return;
      }

      void navigate({
        to: '/all/$taskId',
        params: { taskId },
      });
    });
  }, [navigate, pathname]);

  return null;
}

function RateLimitSwapBridge() {
  const addToast = useToastStore((s) => s.addToast);

  useEffect(() => {
    return api.onRateLimitSwap((data) => {
      addToast({
        message: `Rate limit approaching for ${data.from} — routing new tasks to ${data.to}`,
        type: 'success',
      });
    });
  }, [addToast]);

  return null;
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
