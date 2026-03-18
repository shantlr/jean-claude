import { ArrowLeft, Settings } from 'lucide-react';
import { type MouseEvent, useCallback, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import FocusLock from 'react-focus-lock';
import { RemoveScroll } from 'react-remove-scroll';

import { useRegisterKeyboardBindings } from '@/common/context/keyboard-bindings';
import { Button } from '@/common/ui/button';
import { Kbd } from '@/common/ui/kbd';
import { useProjects } from '@/hooks/use-projects';
import { useAllTrackedPipelinesGrouped } from '@/hooks/use-tracked-pipelines';
import { useOverlaysStore } from '@/stores/overlays';
import type { TrackedPipeline } from '@shared/pipeline-types';
import type { Project } from '@shared/types';

import { RunList } from './run-list';
import { Sidebar, getNavId } from './sidebar';
import { TriggerRunDialog } from './trigger-run-dialog';

export type SidebarFilter =
  | { type: 'all' }
  | { type: 'project'; projectId: string }
  | { type: 'definition'; projectId: string; pipeline: TrackedPipeline };

type NavItem =
  | { type: 'all' }
  | { type: 'project'; projectId: string }
  | { type: 'definition'; projectId: string; pipeline: TrackedPipeline };

function buildNavItems(
  projects: Project[],
  pipelineMap: Map<string, TrackedPipeline[]>,
  expandedProjects: Set<string>,
): NavItem[] {
  const items: NavItem[] = [{ type: 'all' }];
  for (const project of projects) {
    const pipelines = pipelineMap.get(project.id);
    if (!pipelines || pipelines.length === 0) continue;
    items.push({ type: 'project', projectId: project.id });
    if (expandedProjects.has(project.id)) {
      for (const pipeline of pipelines) {
        items.push({
          type: 'definition',
          projectId: project.id,
          pipeline,
        });
      }
    }
  }
  return items;
}

function findNavIndex(items: NavItem[], filter: SidebarFilter): number {
  return items.findIndex((item) => {
    if (filter.type === 'all') return item.type === 'all';
    if (filter.type === 'project')
      return item.type === 'project' && item.projectId === filter.projectId;
    return (
      item.type === 'definition' &&
      item.projectId === filter.projectId &&
      'pipeline' in item &&
      item.pipeline.id === filter.pipeline.id
    );
  });
}

export function PipelinesOverlay({ onClose }: { onClose: () => void }) {
  const { data: allProjects = [] } = useProjects();

  const azureLinkedProjects = useMemo(
    () =>
      allProjects.filter(
        (p) => p.repoProviderId && p.repoProjectId && p.repoId,
      ),
    [allProjects],
  );

  const { data: pipelineMap } = useAllTrackedPipelinesGrouped();

  const [filter, setFilter] = useState<SidebarFilter>({ type: 'all' });
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(
    () => new Set(azureLinkedProjects.map((p) => p.id)),
  );
  const [triggerPipeline, setTriggerPipeline] = useState<{
    project: Project;
    pipeline: TrackedPipeline;
  } | null>(null);

  const navItems = useMemo(
    () => buildNavItems(azureLinkedProjects, pipelineMap, expandedProjects),
    [azureLinkedProjects, pipelineMap, expandedProjects],
  );

  const handleToggleExpanded = useCallback((projectId: string) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });
  }, []);

  const navigate = useCallback(
    (direction: -1 | 1) => {
      if (navItems.length === 0) return;
      const currentIndex = findNavIndex(navItems, filter);
      const nextIndex = currentIndex + direction;
      if (nextIndex < 0 || nextIndex >= navItems.length) return;

      const item = navItems[nextIndex];
      // Auto-expand parent project when navigating into a pipeline
      if (item.type === 'definition') {
        setExpandedProjects((prev) => {
          if (prev.has(item.projectId)) return prev;
          return new Set(prev).add(item.projectId);
        });
      }
      setFilter(item);

      // Scroll the selected item into view
      requestAnimationFrame(() => {
        const el = document.querySelector(`[data-nav-id="${getNavId(item)}"]`);
        el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      });
    },
    [navItems, filter],
  );

  useRegisterKeyboardBindings('pipelines-overlay', {
    escape: () => {
      if (triggerPipeline) {
        setTriggerPipeline(null);
        return true;
      }
      onClose();
      return true;
    },
    'cmd+up': () => {
      navigate(-1);
      return true;
    },
    'cmd+down': () => {
      navigate(1);
      return true;
    },
  });

  const handleBackdropClick = useCallback(() => {
    onClose();
  }, [onClose]);

  const handlePanelClick = useCallback((e: MouseEvent) => {
    e.stopPropagation();
  }, []);

  const openOverlay = useOverlaysStore((s) => s.open);
  const handleOpenSettings = useCallback(() => {
    onClose();
    openOverlay('settings');
  }, [onClose, openOverlay]);

  const handleTriggerRun = useCallback(
    (project: Project, pipeline: TrackedPipeline) => {
      setTriggerPipeline({ project, pipeline });
    },
    [],
  );

  const handleCloseTriggerDialog = useCallback(() => {
    setTriggerPipeline(null);
  }, []);

  return createPortal(
    <FocusLock returnFocus>
      <RemoveScroll>
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={handleBackdropClick}
          tabIndex={-1}
          role="dialog"
        >
          <div
            className="flex h-[80svh] w-[90svw] max-w-[1280px] flex-col overflow-hidden rounded-lg border border-neutral-700 bg-neutral-900"
            onClick={handlePanelClick}
          >
            {/* Top bar */}
            <div className="flex shrink-0 items-center gap-2 border-b border-neutral-700 px-4 py-3">
              <Button
                onClick={onClose}
                className="rounded p-1 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
                aria-label="Close pipelines"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <h2 className="text-sm font-medium text-neutral-200">
                Pipelines
              </h2>
            </div>

            {/* Main body: sidebar + content */}
            <div className="flex min-h-0 flex-1">
              <Sidebar
                projects={azureLinkedProjects}
                filter={filter}
                expandedProjects={expandedProjects}
                onToggleExpanded={handleToggleExpanded}
                onFilterChange={setFilter}
                onTriggerRun={handleTriggerRun}
              />

              {/* Right content area */}
              <div className="flex flex-1 overflow-y-auto p-6">
                <RunList projects={azureLinkedProjects} filter={filter} />
              </div>
            </div>

            {/* Footer */}
            <div className="flex shrink-0 items-center justify-between border-t border-neutral-700 px-4 py-2 text-xs text-neutral-500">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <Kbd shortcut="escape" /> close
                </span>
                <span className="flex items-center gap-1">
                  <Kbd shortcut="cmd+up" />
                  <Kbd shortcut="cmd+down" /> navigate
                </span>
              </div>
              <Button
                onClick={handleOpenSettings}
                className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300"
              >
                <Settings className="h-3.5 w-3.5" />
                Pipeline Settings
              </Button>
            </div>
          </div>
        </div>

        {triggerPipeline && (
          <TriggerRunDialog
            project={triggerPipeline.project}
            pipeline={triggerPipeline.pipeline}
            onClose={handleCloseTriggerDialog}
          />
        )}
      </RemoveScroll>
    </FocusLock>,
    document.body,
  );
}
