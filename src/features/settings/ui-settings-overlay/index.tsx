import {
  AlertTriangle,
  Box,
  ChevronDown,
  Cpu,
  Diamond,
  FileText,
  Folder,
  GitBranch,
  Grid3X3,
  List,
  MoreHorizontal,
  Play,
  Plug,
  Settings,
  Sparkles,
  Terminal,
  X,
  Zap,
} from 'lucide-react';
import React, { useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import FocusLock from 'react-focus-lock';
import { RemoveScroll } from 'react-remove-scroll';

import { useRegisterKeyboardBindings } from '@/common/context/keyboard-bindings';
import { Kbd } from '@/common/ui/kbd';
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

const GLOBAL_MENU_ITEMS: {
  id: GlobalMenuItem;
  label: string;
  icon: React.ElementType;
  title: string;
  subtitle: string;
}[] = [
  {
    id: 'general',
    label: 'General',
    icon: Settings,
    title: 'General',
    subtitle: 'Editor preferences and app behavior',
  },
  {
    id: 'ai-generation',
    label: 'AI Generation',
    icon: Sparkles,
    title: 'AI Generation',
    subtitle: 'Configure AI-powered content generation',
  },
  {
    id: 'permissions',
    label: 'Permissions',
    icon: Zap,
    title: 'Permissions',
    subtitle: 'Manage global tool and command permissions',
  },
  {
    id: 'skills',
    label: 'Skills',
    icon: Box,
    title: 'Skills',
    subtitle: 'Manage and discover agent skills',
  },
  {
    id: 'mcp-servers',
    label: 'MCP Servers',
    icon: Cpu,
    title: 'MCP Servers',
    subtitle: 'Model Context Protocol server templates',
  },
  {
    id: 'tokens',
    label: 'Tokens',
    icon: MoreHorizontal,
    title: 'Tokens',
    subtitle: 'Provider authentication tokens',
  },
  {
    id: 'azure-devops',
    label: 'Azure DevOps',
    icon: Diamond,
    title: 'Azure DevOps',
    subtitle: 'Organization and PAT management',
  },
  {
    id: 'autocomplete',
    label: 'Autocomplete',
    icon: Terminal,
    title: 'Autocomplete',
    subtitle: 'Inline code completion configuration',
  },
  {
    id: 'debug',
    label: 'Debug',
    icon: List,
    title: 'Debug',
    subtitle: 'Database viewer and diagnostics',
  },
];

const PROJECT_MENU_ITEMS: {
  id: ProjectSettingsMenuItem;
  label: string;
  icon: React.ElementType;
}[] = [
  { id: 'details', label: 'Details', icon: FileText },
  { id: 'permissions', label: 'Permissions', icon: Zap },
  { id: 'autocomplete', label: 'Autocomplete', icon: Terminal },
  { id: 'integrations', label: 'Integrations', icon: Plug },
  { id: 'pipelines', label: 'Pipelines', icon: GitBranch },
  { id: 'run-commands', label: 'Run Commands', icon: Play },
  { id: 'skills', label: 'Skills', icon: Box },
  { id: 'mcp-overrides', label: 'MCP Overrides', icon: Cpu },
  { id: 'ai-generation', label: 'AI Generation', icon: Sparkles },
  { id: 'danger-zone', label: 'Danger Zone', icon: AlertTriangle },
];

/* ── Shared style constants (avoid recreating objects every render) ── */

const SEGMENTED_TAB_ACTIVE: React.CSSProperties = {
  background:
    'linear-gradient(135deg, oklch(0.78 0.18 295), oklch(0.6 0.2 260))',
  color: 'oklch(0.1 0 0)',
  boxShadow:
    '0 2px 8px oklch(0.65 0.18 295 / 0.4), 0 0 0 1px oklch(1 0 0 / 0.1) inset',
};

const SEGMENTED_TAB_INACTIVE: React.CSSProperties = {
  background: 'transparent',
  color: 'oklch(0.7 0.01 280)',
};

const NAV_ITEM_ACTIVE: React.CSSProperties = {
  background:
    'linear-gradient(135deg, color-mix(in oklch, oklch(0.78 0.18 295) 22%, transparent), color-mix(in oklch, oklch(0.78 0.18 295) 4%, transparent))',
  border:
    '1px solid color-mix(in oklch, oklch(0.78 0.18 295) 35%, transparent)',
  color: 'oklch(0.99 0 0)',
  fontWeight: 500,
  boxShadow:
    '0 0 20px color-mix(in oklch, oklch(0.78 0.18 295) 15%, transparent)',
};

const NAV_ITEM_INACTIVE: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid transparent',
  color: 'oklch(0.72 0.01 280)',
};

const NAV_ICON_ACTIVE: React.CSSProperties = {
  color: 'oklch(0.78 0.18 295)',
};

const NAV_ICON_INACTIVE: React.CSSProperties = {
  color: 'oklch(0.55 0.01 280)',
};

/* ── Components ── */

function GlobalContent({ menuItem }: { menuItem: GlobalMenuItem }) {
  const item = GLOBAL_MENU_ITEMS.find((i) => i.id === menuItem);

  return (
    <div>
      {item && (
        <div className="mb-5">
          <div
            className="mb-1 font-mono text-[10.5px] font-semibold tracking-wide uppercase"
            style={{ color: 'oklch(0.78 0.18 295)' }}
          >
            Section
          </div>
          <div
            className="text-[18px] font-semibold tracking-tight"
            style={{ color: 'oklch(0.97 0.01 280)' }}
          >
            {item.title}
          </div>
          <div
            className="text-[12.5px]"
            style={{ color: 'oklch(0.62 0.01 280)' }}
          >
            {item.subtitle}
          </div>
        </div>
      )}
      <GlobalContentInner menuItem={menuItem} />
    </div>
  );
}

function GlobalContentInner({ menuItem }: { menuItem: GlobalMenuItem }) {
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
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: 'oklch(0.08 0.01 280 / 0.7)' }}
          onClick={onClose}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label="Settings"
        >
          <div
            className="flex h-[85svh] w-[92svw] max-w-[1280px] flex-col overflow-hidden rounded-2xl border"
            style={{
              background:
                'radial-gradient(ellipse at 15% 5%, oklch(0.25 0.12 295 / 0.35), transparent 55%), radial-gradient(ellipse at 85% 95%, oklch(0.22 0.1 250 / 0.3), transparent 55%), oklch(0.14 0.015 280 / 0.92)',
              backdropFilter: 'blur(40px) saturate(140%)',
              borderColor: 'oklch(1 0 0 / 0.1)',
              boxShadow:
                '0 30px 80px oklch(0 0 0 / 0.55), 0 0 0 1px oklch(1 0 0 / 0.04) inset',
            }}
            onClick={handlePanelClick}
          >
            {/* Header: segmented toggle + project chip + close */}
            <div className="flex shrink-0 items-center gap-3 px-4 py-3">
              {/* Segmented pill */}
              <div
                className="flex items-center gap-0.5 rounded-lg p-[3px]"
                style={{
                  backgroundColor: 'oklch(0 0 0 / 0.3)',
                  border: '1px solid oklch(1 0 0 / 0.06)',
                }}
              >
                <button
                  className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all"
                  style={
                    activeTab === 'global'
                      ? SEGMENTED_TAB_ACTIVE
                      : SEGMENTED_TAB_INACTIVE
                  }
                  onClick={() => setActiveTab('global')}
                >
                  <Grid3X3 size={13} />
                  Global
                  <Kbd shortcut="cmd+1" />
                </button>

                {hasProjectTab && (
                  <button
                    className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all"
                    style={
                      activeTab === 'project'
                        ? SEGMENTED_TAB_ACTIVE
                        : SEGMENTED_TAB_INACTIVE
                    }
                    onClick={handleProjectTab}
                  >
                    <Folder size={13} />
                    Project
                    <Kbd shortcut="cmd+2" />
                  </button>
                )}
              </div>

              {/* Project chip with dropdown */}
              {hasProjectTab && resolvedProject && activeTab === 'project' && (
                <div
                  className="relative inline-flex items-center gap-2 rounded-md px-2 py-1 text-xs transition-opacity"
                  style={{
                    color: 'oklch(0.8 0.01 280)',
                  }}
                >
                  <span
                    className="pointer-events-none flex h-4 w-4 shrink-0 items-center justify-center rounded text-[9px] font-bold"
                    style={{
                      backgroundColor: resolvedProject.color,
                      color: 'oklch(1 0 0)',
                    }}
                  >
                    {resolvedProject.name.charAt(0).toUpperCase()}
                  </span>
                  <select
                    className="max-w-[120px] cursor-pointer appearance-none truncate bg-transparent pr-4 outline-none"
                    style={{ color: 'inherit' }}
                    value={resolvedProjectId ?? ''}
                    onChange={(e) => handleProjectChange(e.target.value)}
                    aria-label="Select project"
                  >
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    size={12}
                    className="pointer-events-none absolute right-2"
                    style={{ color: 'oklch(0.6 0.01 280)' }}
                  />
                </div>
              )}

              <div className="flex-1" />

              {/* Settings label */}
              <span
                className="font-mono text-[10.5px] tracking-wider uppercase"
                style={{ color: 'oklch(0.5 0.01 280)' }}
              >
                Settings
              </span>

              {/* Close button */}
              <button
                className="flex items-center justify-center rounded transition-colors"
                style={{
                  width: 22,
                  height: 22,
                  backgroundColor: 'oklch(1 0 0 / 0.06)',
                  color: 'oklch(0.65 0.01 280)',
                }}
                onClick={onClose}
                aria-label="Close settings"
              >
                <X size={13} />
              </button>
            </div>

            {/* Main body: sidebar + content */}
            <div className="flex min-h-0 flex-1">
              {/* Left sidebar menu */}
              <div
                className="flex w-[200px] shrink-0 flex-col"
                style={{
                  backgroundColor: 'oklch(0 0 0 / 0.2)',
                  borderRight: '1px solid oklch(1 0 0 / 0.05)',
                  padding: '12px 8px',
                }}
              >
                <div
                  className="mb-2 px-2 font-mono text-[9.5px] uppercase"
                  style={{
                    letterSpacing: '0.1em',
                    color: 'oklch(0.5 0.01 280)',
                  }}
                >
                  Sections
                </div>

                <nav
                  className="flex flex-1 flex-col gap-0.5 overflow-auto"
                  aria-label={
                    activeTab === 'project'
                      ? 'Project settings sections'
                      : 'Global settings sections'
                  }
                  {...(activeTab === 'project' && hasProjectTab
                    ? { role: 'tablist' as const }
                    : {})}
                >
                  {activeTab === 'global' &&
                    GLOBAL_MENU_ITEMS.map((item) => {
                      const Icon = item.icon;
                      const isActive = globalMenuItem === item.id;
                      return (
                        <button
                          key={item.id}
                          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors"
                          style={isActive ? NAV_ITEM_ACTIVE : NAV_ITEM_INACTIVE}
                          aria-current={isActive ? 'true' : undefined}
                          onClick={() => setGlobalMenuItem(item.id)}
                        >
                          <Icon
                            size={14}
                            style={
                              isActive ? NAV_ICON_ACTIVE : NAV_ICON_INACTIVE
                            }
                          />
                          {item.label}
                        </button>
                      );
                    })}

                  {activeTab === 'project' &&
                    hasProjectTab &&
                    PROJECT_MENU_ITEMS.map((item) => {
                      const Icon = item.icon;
                      const isActive = projectMenuItem === item.id;
                      return (
                        <button
                          key={item.id}
                          id={`project-settings-tab-${item.id}`}
                          role="tab"
                          aria-selected={isActive}
                          aria-controls={`project-settings-panel-${item.id}`}
                          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors"
                          style={isActive ? NAV_ITEM_ACTIVE : NAV_ITEM_INACTIVE}
                          onClick={() => setProjectMenuItem(item.id)}
                        >
                          <Icon
                            size={14}
                            style={
                              isActive ? NAV_ICON_ACTIVE : NAV_ICON_INACTIVE
                            }
                          />
                          {item.label}
                        </button>
                      );
                    })}
                </nav>
              </div>

              {/* Right content area */}
              <div
                className="flex-1 overflow-y-auto"
                style={{ padding: '20px 28px 28px' }}
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

            {/* Footer */}
            <div
              className="flex shrink-0 items-center gap-3 font-mono text-[10.5px]"
              style={{
                backgroundColor: 'oklch(0 0 0 / 0.2)',
                borderTop: '1px solid oklch(1 0 0 / 0.06)',
                padding: '9px 16px',
                color: 'oklch(0.55 0.01 280)',
              }}
            >
              <span className="flex items-center gap-1">
                <Kbd shortcut="up" /> <Kbd shortcut="down" /> navigate
              </span>
              <span className="flex items-center gap-1">
                <Kbd shortcut="enter" /> edit
              </span>
              <span className="flex items-center gap-1">
                <Kbd shortcut="cmd+1" /> global
              </span>
              <span className="flex items-center gap-1">
                <Kbd shortcut="cmd+2" /> project
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
