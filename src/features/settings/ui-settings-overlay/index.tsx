import clsx from 'clsx';
import { ArrowLeft } from 'lucide-react';
import React, { useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import FocusLock from 'react-focus-lock';
import { RemoveScroll } from 'react-remove-scroll';

import { useRegisterKeyboardBindings } from '@/common/context/keyboard-bindings';
import { Button } from '@/common/ui/button';
import { Kbd } from '@/common/ui/kbd';
import { Select } from '@/common/ui/select';
import {
  ProjectSettings,
  type ProjectSettingsMenuItem,
} from '@/features/project/ui-project-settings';
import { AiGenerationSettings } from '@/features/settings/ui-ai-generation-settings';
import { AutocompleteSettings } from '@/features/settings/ui-autocomplete-settings';
import { AzureDevOpsTab } from '@/features/settings/ui-azure-devops-tab';
import { DebugDatabase } from '@/features/settings/ui-debug-database';
import { GeneralSettings } from '@/features/settings/ui-general-settings';
import { GlobalPermissionsSettings } from '@/features/settings/ui-global-permissions-settings';
import { McpServersSettings } from '@/features/settings/ui-mcp-servers-settings';
import { SkillsSettings } from '@/features/settings/ui-skills-settings';
import { TokensTab } from '@/features/settings/ui-tokens-tab';

import { useCurrentSettingsProject } from './use-current-settings-project';

type GlobalMenuItem =
  | 'general'
  | 'ai-generation'
  | 'permissions'
  | 'skills'
  | 'mcp-servers'
  | 'tokens'
  | 'azure-devops'
  | 'autocomplete'
  | 'debug';

const GLOBAL_MENU_ITEMS: { id: GlobalMenuItem; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'ai-generation', label: 'AI Generation' },
  { id: 'permissions', label: 'Permissions' },
  { id: 'skills', label: 'Skills' },
  { id: 'mcp-servers', label: 'MCP Servers' },
  { id: 'tokens', label: 'Tokens' },
  { id: 'azure-devops', label: 'Azure DevOps' },
  { id: 'autocomplete', label: 'Autocomplete' },
  { id: 'debug', label: 'Debug' },
];

const PROJECT_MENU_ITEMS: { id: ProjectSettingsMenuItem; label: string }[] = [
  { id: 'details', label: 'Details' },
  { id: 'autocomplete', label: 'Autocomplete' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'pipelines', label: 'Pipelines' },
  { id: 'run-commands', label: 'Run Commands' },
  { id: 'skills', label: 'Skills' },
  { id: 'mcp-overrides', label: 'MCP Overrides' },
  { id: 'ai-generation', label: 'AI Generation' },
  { id: 'danger-zone', label: 'Danger Zone' },
];

function GlobalContent({ menuItem }: { menuItem: GlobalMenuItem }) {
  switch (menuItem) {
    case 'general':
      return <GeneralSettings />;
    case 'ai-generation':
      return <AiGenerationSettings />;
    case 'permissions':
      return <GlobalPermissionsSettings />;
    case 'skills':
      return <SkillsSettings />;
    case 'mcp-servers':
      return <McpServersSettings />;
    case 'tokens':
      return <TokensTab />;
    case 'azure-devops':
      return <AzureDevOpsTab />;
    case 'autocomplete':
      return <AutocompleteSettings />;
    case 'debug':
      return <DebugDatabase />;
  }
}

export function SettingsOverlay({ onClose }: { onClose: () => void }) {
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null,
  );
  const { currentProject, projects } = useCurrentSettingsProject({
    overrideProjectId: selectedProjectId,
  });

  // Auto-select first project when none is inferred (e.g. opening from /all route)
  const resolvedProject =
    currentProject ?? (projects.length > 0 ? projects[0] : null);
  const resolvedProjectId = resolvedProject?.id ?? null;

  const [activeTab, setActiveTab] = useState<'global' | 'project'>(
    resolvedProject !== null ? 'project' : 'global',
  );
  const [globalMenuItem, setGlobalMenuItem] =
    useState<GlobalMenuItem>('general');
  const [projectMenuItem, setProjectMenuItem] =
    useState<ProjectSettingsMenuItem>('details');

  const hasProjectTab = projects.length > 0;

  const projectOptions = projects.map((p) => ({
    value: p.id,
    label: p.name,
  }));

  const handleProjectChange = useCallback((projectId: string) => {
    setSelectedProjectId(projectId);
    setActiveTab('project');
  }, []);

  // When switching to project tab, ensure a project is selected
  const handleProjectTab = useCallback(() => {
    if (!resolvedProjectId && projects.length > 0) {
      setSelectedProjectId(projects[0].id);
    }
    setActiveTab('project');
  }, [resolvedProjectId, projects]);

  const navigateMenu = useCallback(
    (direction: 'up' | 'down') => {
      if (activeTab === 'global') {
        const currentIndex = GLOBAL_MENU_ITEMS.findIndex(
          (item) => item.id === globalMenuItem,
        );
        const nextIndex =
          direction === 'down'
            ? (currentIndex + 1) % GLOBAL_MENU_ITEMS.length
            : (currentIndex - 1 + GLOBAL_MENU_ITEMS.length) %
              GLOBAL_MENU_ITEMS.length;
        setGlobalMenuItem(GLOBAL_MENU_ITEMS[nextIndex].id);
      } else if (activeTab === 'project') {
        const currentIndex = PROJECT_MENU_ITEMS.findIndex(
          (item) => item.id === projectMenuItem,
        );
        const nextIndex =
          direction === 'down'
            ? (currentIndex + 1) % PROJECT_MENU_ITEMS.length
            : (currentIndex - 1 + PROJECT_MENU_ITEMS.length) %
              PROJECT_MENU_ITEMS.length;
        setProjectMenuItem(PROJECT_MENU_ITEMS[nextIndex].id);
      }
    },
    [activeTab, globalMenuItem, projectMenuItem],
  );

  useRegisterKeyboardBindings('settings-overlay', {
    escape: () => {
      onClose();
      return true;
    },
    'cmd+1': {
      handler: () => {
        setActiveTab('global');
        return true;
      },
      ignoreIfInput: true,
    },
    'cmd+2': {
      handler: () => {
        if (hasProjectTab) {
          handleProjectTab();
        }
        return true;
      },
      ignoreIfInput: true,
    },
    up: {
      handler: () => {
        navigateMenu('up');
        return true;
      },
      ignoreIfInput: true,
    },
    down: {
      handler: () => {
        navigateMenu('down');
        return true;
      },
      ignoreIfInput: true,
    },
  });

  const handleBackdropClick = useCallback(() => {
    onClose();
  }, [onClose]);

  const handlePanelClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  const handleProjectDeleted = useCallback(() => {
    onClose();
  }, [onClose]);

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
            {/* Top bar with back arrow and tabs */}
            <div className="flex shrink-0 items-center gap-2 border-b border-neutral-700 px-4 py-3">
              <Button
                onClick={onClose}
                className="rounded p-1 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
                aria-label="Close settings"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>

              <div className="flex items-center gap-1">
                <Button
                  onClick={() => setActiveTab('global')}
                  className={clsx(
                    'flex items-center gap-2 rounded px-3 py-1.5 text-sm font-medium transition-colors',
                    activeTab === 'global'
                      ? 'bg-neutral-700 text-neutral-100'
                      : 'text-neutral-400 hover:bg-neutral-800',
                  )}
                >
                  Global
                  <Kbd shortcut="cmd+1" />
                </Button>

                {hasProjectTab && (
                  <div className="flex items-center gap-1.5">
                    <Button
                      onClick={handleProjectTab}
                      className={clsx(
                        'flex items-center gap-2 rounded px-3 py-1.5 text-sm font-medium transition-colors',
                        activeTab === 'project'
                          ? 'bg-neutral-700 text-neutral-100'
                          : 'text-neutral-400 hover:bg-neutral-800',
                      )}
                    >
                      Project
                      <Kbd shortcut="cmd+2" />
                    </Button>
                    {projectOptions.length > 0 && (
                      <Select
                        value={
                          resolvedProjectId ?? projectOptions[0]?.value ?? ''
                        }
                        options={projectOptions}
                        onChange={handleProjectChange}
                        label="Select project"
                      />
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Main body: sidebar + content */}
            <div className="flex min-h-0 flex-1">
              {/* Left sidebar menu */}
              <div className="w-48 shrink-0 p-3">
                {activeTab === 'global' && (
                  <nav className="flex flex-col gap-1">
                    {GLOBAL_MENU_ITEMS.map((item) => (
                      <Button
                        key={item.id}
                        onClick={() => setGlobalMenuItem(item.id)}
                        className={clsx(
                          'rounded px-3 py-1.5 text-left text-sm transition-colors',
                          globalMenuItem === item.id
                            ? 'bg-neutral-700 font-medium text-neutral-100'
                            : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200',
                        )}
                      >
                        {item.label}
                      </Button>
                    ))}
                  </nav>
                )}

                {activeTab === 'project' && hasProjectTab && (
                  <nav
                    className="flex flex-col gap-1"
                    role="tablist"
                    aria-label="Project settings sections"
                  >
                    {PROJECT_MENU_ITEMS.map((item) => (
                      <Button
                        key={item.id}
                        id={`project-settings-tab-${item.id}`}
                        role="tab"
                        type="button"
                        aria-selected={projectMenuItem === item.id}
                        aria-controls={`project-settings-panel-${item.id}`}
                        onClick={() => setProjectMenuItem(item.id)}
                        className={clsx(
                          'rounded px-3 py-1.5 text-left text-sm transition-colors',
                          projectMenuItem === item.id
                            ? 'bg-neutral-700 font-medium text-neutral-100'
                            : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200',
                        )}
                      >
                        {item.label}
                      </Button>
                    ))}
                  </nav>
                )}
              </div>

              {/* Right content area */}
              <div
                className="flex-1 overflow-y-auto p-6"
                role={
                  activeTab === 'project' && hasProjectTab
                    ? 'tabpanel'
                    : undefined
                }
                id={
                  activeTab === 'project' && hasProjectTab
                    ? `project-settings-panel-${projectMenuItem}`
                    : undefined
                }
                aria-labelledby={
                  activeTab === 'project' && hasProjectTab
                    ? `project-settings-tab-${projectMenuItem}`
                    : undefined
                }
              >
                {activeTab === 'global' && (
                  <GlobalContent menuItem={globalMenuItem} />
                )}

                {activeTab === 'project' && resolvedProject && (
                  <ProjectSettings
                    projectId={resolvedProject.id}
                    menuItem={projectMenuItem}
                    onProjectDeleted={handleProjectDeleted}
                  />
                )}
              </div>
            </div>

            {/* Footer tips */}
            <div className="flex shrink-0 items-center gap-3 border-t border-neutral-700 px-4 py-2 text-xs text-neutral-500">
              <span className="flex items-center gap-1">
                <Kbd shortcut="up" /> <Kbd shortcut="down" /> navigate
              </span>
              <span className="flex items-center gap-1">
                <Kbd shortcut="escape" /> close
              </span>
            </div>
          </div>
        </div>
      </RemoveScroll>
    </FocusLock>,
    document.body,
  );
}
