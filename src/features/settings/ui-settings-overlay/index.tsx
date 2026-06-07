import {
  AlertTriangle,
  Box,
  ChevronDown,
  ChevronRight,
  Cpu,
  Diamond,
  Folder,
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
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import FocusLock from 'react-focus-lock';
import { RemoveScroll } from 'react-remove-scroll';

import {
  useKeyboardLayer,
  useRegisterKeyboardBindings,
} from '@/common/context/keyboard-bindings';
import { Kbd } from '@/common/ui/kbd';
import { Select, type SelectOption } from '@/common/ui/select';
import {
  ProjectSettings,
  type ProjectSettingsMenuItem,
} from '@/features/project/ui-project-settings';
import { AgentsSettings } from '@/features/settings/ui-agents-settings';
import { AiGenerationSettings } from '@/features/settings/ui-ai-generation-settings';
import { AutocompleteSettings } from '@/features/settings/ui-autocomplete-settings';
import { AzureDevOpsTab } from '@/features/settings/ui-azure-devops-tab';
import { BackendConfigSettings } from '@/features/settings/ui-backend-config-settings';
import { DebugDatabase } from '@/features/settings/ui-debug-database';
import {
  EditorSettings,
  NotificationsSettings,
  CalendarSettings,
  UsageDisplaySettings,
  MaintenanceSettings,
  PromptPrefaceSettings,
} from '@/features/settings/ui-general-settings';
import { GlobalPermissionsSettings } from '@/features/settings/ui-global-permissions-settings';
import { McpServersSettings } from '@/features/settings/ui-mcp-servers-settings';
import { ModelPresetsSettings } from '@/features/settings/ui-model-presets-settings';
import { PromptSnippetsSettings } from '@/features/settings/ui-prompt-snippets-settings';
import { SkillsSettings } from '@/features/settings/ui-skills-settings';
import { SourcesSettings } from '@/features/settings/ui-sources-settings';
import { TokensTab } from '@/features/settings/ui-tokens-tab';
import { api } from '@/lib/api';

import { useCurrentSettingsProject } from './use-current-settings-project';

/* ── Types ── */

type GlobalSubItem = {
  id: string;
  label: string;
  layout?: SettingsContentLayout;
};

type SettingsContentLayout = 'standard' | 'fill';

type GlobalSection = {
  id: string;
  label: string;
  icon: React.ElementType;
  title: string;
  subtitle: string;
  subs?: GlobalSubItem[];
  layout?: SettingsContentLayout;
};

type ProjectSubItem = {
  id: string;
  label: string;
  layout?: SettingsContentLayout;
};

type ProjectSection = {
  id: string;
  label: string;
  icon: React.ElementType;
  subs?: ProjectSubItem[];
  layout?: SettingsContentLayout;
};

/* ── Section definitions ── */

let _cachedGlobalSections: GlobalSection[] | null = null;

function getGlobalSections(): GlobalSection[] {
  if (_cachedGlobalSections) return _cachedGlobalSections;

  const generalSubs: GlobalSubItem[] = [
    { id: 'editor', label: 'Editor' },
    { id: 'notifications', label: 'Notifications' },
    ...(api.platform === 'darwin'
      ? [{ id: 'calendar', label: 'Calendar' }]
      : []),
    { id: 'usage', label: 'Usage Display' },
    { id: 'maintenance', label: 'Maintenance' },
  ];

  _cachedGlobalSections = [
    {
      id: 'general',
      label: 'General',
      icon: Settings,
      title: 'General',
      subtitle: 'Editor preferences and app behavior',
      subs: generalSubs,
    },
    {
      id: 'coding-agents',
      label: 'Coding Agents',
      icon: Grid3X3,
      title: 'Coding Agents',
      subtitle: 'Backends, thinking defaults, and model presets',
      subs: [
        { id: 'presets', label: 'Model Presets' },
        { id: 'prompt-preface', label: 'Prompt Preface' },
        { id: 'claude-code', label: 'Claude Code', layout: 'fill' },
        { id: 'opencode', label: 'OpenCode', layout: 'fill' },
      ],
    },
    {
      id: 'ai-generation',
      label: 'AI Generation',
      icon: Sparkles,
      title: 'AI Generation',
      subtitle: 'Configure AI-powered content generation',
      layout: 'fill',
    },
    {
      id: 'permissions',
      label: 'Permissions',
      icon: Zap,
      title: 'Permissions',
      subtitle: 'Manage global tool and command permissions',
    },
    {
      id: 'skills-agents',
      label: 'Skills & Agents',
      icon: Box,
      title: 'Skills & Agents',
      subtitle: 'Manage skills, sources, and backend subagents',
      subs: [
        { id: 'sources', label: 'Sources', layout: 'fill' },
        { id: 'skills', label: 'Skills', layout: 'fill' },
        { id: 'agents', label: 'Agents', layout: 'fill' },
      ],
    },
    {
      id: 'prompt-snippets',
      label: 'Snippets',
      icon: Terminal,
      title: 'Prompt Snippets',
      subtitle: 'Reusable prompt templates with variables',
      layout: 'fill',
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
  return _cachedGlobalSections;
}

const PROJECT_SECTIONS: ProjectSection[] = [
  {
    id: 'project-general',
    label: 'General',
    icon: Settings,
    subs: [
      { id: 'details', label: 'Details' },
      { id: 'commit-ignore', label: 'Commit Ignore' },
      { id: 'worktree', label: 'Worktree' },
      { id: 'feature-map', label: 'Feature Map' },
      { id: 'prompt-preface', label: 'Prompt Preface' },
      { id: 'autocomplete', label: 'Autocomplete' },
    ],
  },
  { id: 'permissions', label: 'Permissions', icon: Zap },
  {
    id: 'project-integrations',
    label: 'Integrations',
    icon: Plug,
    subs: [
      { id: 'integrations', label: 'Repo & Work Items' },
      { id: 'pipelines', label: 'Pipelines' },
    ],
  },
  { id: 'run-commands', label: 'Run Commands', icon: Play },
  { id: 'skills', label: 'Skills', icon: Box, layout: 'fill' },
  { id: 'mcp-overrides', label: 'MCP Overrides', icon: Cpu },
  {
    id: 'ai-generation',
    label: 'AI Generation',
    icon: Sparkles,
    layout: 'fill',
  },
  { id: 'danger-zone', label: 'Danger Zone', icon: AlertTriangle },
];

/* ── Shared style constants ── */

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

const NAV_SECTION_ACTIVE: React.CSSProperties = {
  background: 'oklch(1 0 0 / 0.06)',
  color: 'oklch(0.99 0 0)',
  fontWeight: 500,
};

const NAV_SECTION_INACTIVE: React.CSSProperties = {
  background: 'transparent',
  color: 'oklch(0.72 0.01 280)',
};

const NAV_SECTION_ACTIVE_LEAF: React.CSSProperties = {
  background: 'color-mix(in oklch, oklch(0.78 0.18 295) 14%, transparent)',
  border:
    '1px solid color-mix(in oklch, oklch(0.78 0.18 295) 30%, transparent)',
  borderLeft: '2px solid oklch(0.78 0.18 295)',
  color: 'oklch(0.99 0 0)',
  fontWeight: 500,
};

const NAV_SUB_ACTIVE: React.CSSProperties = {
  background: 'color-mix(in oklch, oklch(0.78 0.18 295) 14%, transparent)',
  border:
    '1px solid color-mix(in oklch, oklch(0.78 0.18 295) 30%, transparent)',
  borderLeft: '2px solid oklch(0.78 0.18 295)',
  paddingLeft: 9,
  color: 'oklch(0.99 0 0)',
  fontWeight: 500,
};

const NAV_SUB_INACTIVE: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid transparent',
  borderLeft: '2px solid transparent',
  paddingLeft: 9,
  color: 'oklch(0.62 0.01 280)',
};

const NAV_ICON_ACTIVE: React.CSSProperties = {
  color: 'oklch(0.78 0.18 295)',
};

const NAV_ICON_INACTIVE: React.CSSProperties = {
  color: 'oklch(0.55 0.01 280)',
};

/* ── Active selection state ── */

type ActiveSelection = {
  sectionId: string;
  subId?: string;
};

type SettingsTab = 'global' | 'project';

type SettingsNavState = {
  focusKey: string;
  selectedProjectId: string | null;
  activeTab: SettingsTab;
  globalSelection: ActiveSelection;
  expandedGlobalSection: string | null;
  projectSelection: ActiveSelection;
  expandedProjectSection: string | null;
};

let lastSettingsNavState: SettingsNavState | null = null;

function getDefaultSelection(sections: GlobalSection[]): ActiveSelection {
  const first = sections[0];
  return first.subs
    ? { sectionId: first.id, subId: first.subs[0].id }
    : { sectionId: first.id };
}

function getDefaultProjectSelection(): {
  sectionId: string;
  subId?: string;
} {
  const first = PROJECT_SECTIONS[0];
  return first.subs
    ? { sectionId: first.id, subId: first.subs[0].id }
    : { sectionId: first.id };
}

/* ── Content rendering ── */

function resolveGlobalContentLayout(
  sel: ActiveSelection,
): SettingsContentLayout {
  const section = getGlobalSections().find((s) => s.id === sel.sectionId);
  if (!section) return 'standard';
  const subItem = section.subs?.find((s) => s.id === sel.subId);
  return subItem?.layout ?? section.layout ?? 'standard';
}

function resolveProjectContentLayout(sel: {
  sectionId: string;
  subId?: string;
}): SettingsContentLayout {
  const section = PROJECT_SECTIONS.find((s) => s.id === sel.sectionId);
  if (!section) return 'standard';
  const subItem = section.subs?.find((s) => s.id === sel.subId);
  return subItem?.layout ?? section.layout ?? 'standard';
}

// List/detail settings need fill-height flex layout.
function isFillHeightGlobal(sel: ActiveSelection): boolean {
  return resolveGlobalContentLayout(sel) === 'fill';
}

function isFillHeightProject(sel: {
  sectionId: string;
  subId?: string;
}): boolean {
  return resolveProjectContentLayout(sel) === 'fill';
}

function GlobalContent({ selection }: { selection: ActiveSelection }) {
  const section = getGlobalSections().find((s) => s.id === selection.sectionId);
  const fillHeight = isFillHeightGlobal(selection);

  if (fillHeight) {
    return (
      <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
        <GlobalContentInner selection={selection} />
      </div>
    );
  }

  // Determine breadcrumb + title
  const subItem = section?.subs?.find((s) => s.id === selection.subId);

  return (
    <div>
      {section && (
        <div className="mb-5">
          {/* Breadcrumb for sub-items */}
          {subItem && (
            <div
              className="mb-3 flex items-center gap-1.5 font-mono text-[11px] tracking-wide uppercase"
              style={{ color: 'oklch(0.55 0.01 280)' }}
            >
              <span>{section.label}</span>
              <ChevronRight size={10} style={{ opacity: 0.5 }} />
              <span style={{ color: 'oklch(0.78 0.18 295)' }}>
                {subItem.label}
              </span>
            </div>
          )}
          <div
            className="text-[18px] font-semibold tracking-tight"
            style={{ color: 'oklch(0.97 0.01 280)' }}
          >
            {subItem?.label ?? section.title}
          </div>
          <div
            className="text-[12.5px]"
            style={{ color: 'oklch(0.62 0.01 280)' }}
          >
            {subItem
              ? getGlobalSubtitle(selection.sectionId, selection.subId!)
              : section.subtitle}
          </div>
        </div>
      )}
      <GlobalContentInner selection={selection} />
    </div>
  );
}

function getGlobalSubtitle(sectionId: string, subId: string): string {
  if (sectionId === 'general') {
    switch (subId) {
      case 'editor':
        return 'Where projects open and how they launch.';
      case 'notifications':
        return 'How and when jean-claude lets you know about runs.';
      case 'calendar':
        return 'Meeting reminders from your macOS Calendar.';
      case 'usage':
        return 'Rate-limit pills shown in the title bar.';
      case 'maintenance':
        return 'Cleanup, gitignore, and housekeeping tools.';
    }
  }
  if (sectionId === 'coding-agents') {
    switch (subId) {
      case 'prompt-preface':
        return 'Reusable instructions injected into coding agent prompts.';
    }
  }
  return '';
}

function GlobalContentInner({ selection }: { selection: ActiveSelection }) {
  // Handle sub-items for sections with subs
  if (selection.subId) {
    switch (`${selection.sectionId}:${selection.subId}`) {
      case 'general:editor':
        return <EditorSettings />;
      case 'general:notifications':
        return <NotificationsSettings />;
      case 'general:calendar':
        return <CalendarSettings />;
      case 'general:usage':
        return <UsageDisplaySettings />;
      case 'general:maintenance':
        return <MaintenanceSettings />;
      case 'skills-agents:skills':
        return <SkillsSettings />;
      case 'skills-agents:sources':
        return <SourcesSettings />;
      case 'skills-agents:agents':
        return <AgentsSettings />;
      case 'coding-agents:presets':
        return <ModelPresetsSettings />;
      case 'coding-agents:prompt-preface':
        return <PromptPrefaceSettings />;
      case 'coding-agents:claude-code':
        return <BackendConfigSettings backend="claude-code" />;
      case 'coding-agents:opencode':
        return <BackendConfigSettings backend="opencode" />;
    }
  }

  // Handle leaf sections (no subs)
  switch (selection.sectionId) {
    case 'coding-agents':
      return <ModelPresetsSettings />;
    case 'ai-generation':
      return <AiGenerationSettings />;
    case 'permissions':
      return <GlobalPermissionsSettings />;
    case 'prompt-snippets':
      return <PromptSnippetsSettings />;
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
    default:
      return null;
  }
}

/* ── Resolve project menu item from section selection ── */

function resolveProjectMenuItem(sel: {
  sectionId: string;
  subId?: string;
}): ProjectSettingsMenuItem {
  // For sections with subs, the subId is the actual menu item
  if (sel.subId) return sel.subId as ProjectSettingsMenuItem;

  // For leaf sections, map sectionId to menu item
  const section = PROJECT_SECTIONS.find((s) => s.id === sel.sectionId);
  if (section && !section.subs) {
    // For leaf project sections, the sectionId IS the menu item (e.g. 'permissions', 'skills')
    return sel.sectionId as ProjectSettingsMenuItem;
  }

  return 'details';
}

/* ── Main component ── */

export function SettingsOverlay({ onClose }: { onClose: () => void }) {
  const layer = useKeyboardLayer('overlay', {
    exclusive: true,
    passthrough: ['global-nav'],
  });

  const {
    currentProject: defaultCurrentProject,
    projects,
    focusKey,
  } = useCurrentSettingsProject();
  const [initialNavState] = useState<SettingsNavState | null>(() =>
    lastSettingsNavState?.focusKey === focusKey ? lastSettingsNavState : null,
  );
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    () => initialNavState?.selectedProjectId ?? null,
  );
  const shouldRestoreNavState = initialNavState !== null;
  const currentProject = selectedProjectId
    ? (projects.find((project) => project.id === selectedProjectId) ?? null)
    : defaultCurrentProject;

  const resolvedProject =
    currentProject ?? (projects.length > 0 ? projects[0] : null);
  const resolvedProjectId = resolvedProject?.id ?? null;

  const [activeTab, setActiveTab] = useState<SettingsTab>(
    () =>
      initialNavState?.activeTab ??
      (resolvedProject !== null ? 'project' : 'global'),
  );

  // Global: track active selection + which section is expanded
  const [globalSelection, setGlobalSelection] = useState<ActiveSelection>(
    () =>
      initialNavState?.globalSelection ??
      getDefaultSelection(getGlobalSections()),
  );
  const [expandedGlobalSection, setExpandedGlobalSection] = useState<
    string | null
  >(() => {
    if (initialNavState) return initialNavState.expandedGlobalSection;
    const sections = getGlobalSections();
    return sections[0].subs ? sections[0].id : null;
  });

  // Project: track active selection + which section is expanded
  const [projectSelection, setProjectSelection] = useState<{
    sectionId: string;
    subId?: string;
  }>(() => initialNavState?.projectSelection ?? getDefaultProjectSelection());
  const [expandedProjectSection, setExpandedProjectSection] = useState<
    string | null
  >(
    () =>
      initialNavState?.expandedProjectSection ??
      (PROJECT_SECTIONS[0].subs ? PROJECT_SECTIONS[0].id : null),
  );
  const [hasAutoSelectedProjectTab, setHasAutoSelectedProjectTab] =
    useState(false);

  useEffect(() => {
    if (
      !shouldRestoreNavState &&
      !hasAutoSelectedProjectTab &&
      resolvedProject
    ) {
      setActiveTab('project');
      setHasAutoSelectedProjectTab(true);
    }
  }, [hasAutoSelectedProjectTab, resolvedProject, shouldRestoreNavState]);

  useEffect(() => {
    lastSettingsNavState = {
      focusKey,
      selectedProjectId,
      activeTab,
      globalSelection,
      expandedGlobalSection,
      projectSelection,
      expandedProjectSection,
    };
  }, [
    activeTab,
    expandedGlobalSection,
    expandedProjectSection,
    focusKey,
    globalSelection,
    projectSelection,
    selectedProjectId,
  ]);

  const hasProjectTab = projects.length > 0;
  const displayedActiveTab =
    activeTab === 'project' && !hasProjectTab ? 'global' : activeTab;
  const projectOptions = useMemo<SelectOption<string>[]>(
    () =>
      projects.map((project) => ({
        value: project.id,
        label: project.name,
      })),
    [projects],
  );

  const handleProjectChange = useCallback((projectId: string) => {
    setSelectedProjectId(projectId);
    setActiveTab('project');
  }, []);

  const handleProjectTab = useCallback(() => {
    if (!resolvedProjectId && projects.length > 0) {
      setSelectedProjectId(projects[0].id);
    }
    setActiveTab('project');
  }, [resolvedProjectId, projects]);

  // Click a global section
  const handleGlobalSectionClick = useCallback(
    (section: GlobalSection) => {
      if (section.subs) {
        // Toggle expand. If expanding and not already selected in this section, select first sub
        if (expandedGlobalSection === section.id) {
          setExpandedGlobalSection(null);
        } else {
          setExpandedGlobalSection(section.id);
          if (globalSelection.sectionId !== section.id) {
            setGlobalSelection({
              sectionId: section.id,
              subId: section.subs[0].id,
            });
          }
        }
      } else {
        // Leaf section — select it directly
        setExpandedGlobalSection(null);
        setGlobalSelection({ sectionId: section.id });
      }
    },
    [expandedGlobalSection, globalSelection.sectionId],
  );

  // Click a global sub-item
  const handleGlobalSubClick = useCallback(
    (sectionId: string, subId: string) => {
      setGlobalSelection({ sectionId, subId });
    },
    [],
  );

  // Click a project section
  const handleProjectSectionClick = useCallback(
    (section: ProjectSection) => {
      if (section.subs) {
        if (expandedProjectSection === section.id) {
          setExpandedProjectSection(null);
        } else {
          setExpandedProjectSection(section.id);
          if (projectSelection.sectionId !== section.id) {
            setProjectSelection({
              sectionId: section.id,
              subId: section.subs[0].id,
            });
          }
        }
      } else {
        setExpandedProjectSection(null);
        setProjectSelection({ sectionId: section.id });
      }
    },
    [expandedProjectSection, projectSelection.sectionId],
  );

  // Click a project sub-item
  const handleProjectSubClick = useCallback(
    (sectionId: string, subId: string) => {
      setProjectSelection({ sectionId, subId });
    },
    [],
  );

  // Flatten sections + subs for keyboard navigation
  const flatGlobalItems = useMemo(() => {
    const items: ActiveSelection[] = [];
    for (const section of getGlobalSections()) {
      if (section.subs && expandedGlobalSection === section.id) {
        for (const sub of section.subs) {
          items.push({ sectionId: section.id, subId: sub.id });
        }
      } else {
        items.push({ sectionId: section.id });
      }
    }
    return items;
  }, [expandedGlobalSection]);

  const flatProjectItems = useMemo(() => {
    const items: { sectionId: string; subId?: string }[] = [];
    for (const section of PROJECT_SECTIONS) {
      if (section.subs && expandedProjectSection === section.id) {
        for (const sub of section.subs) {
          items.push({ sectionId: section.id, subId: sub.id });
        }
      } else {
        items.push({ sectionId: section.id });
      }
    }
    return items;
  }, [expandedProjectSection]);

  const navigateMenu = useCallback(
    (direction: 'up' | 'down') => {
      if (displayedActiveTab === 'global') {
        let currentIndex = flatGlobalItems.findIndex(
          (item) =>
            item.sectionId === globalSelection.sectionId &&
            item.subId === globalSelection.subId,
        );
        // If current selection not in flat list (parent collapsed), start from top
        if (currentIndex === -1) currentIndex = 0;
        const nextIndex =
          direction === 'down'
            ? (currentIndex + 1) % flatGlobalItems.length
            : (currentIndex - 1 + flatGlobalItems.length) %
              flatGlobalItems.length;
        const next = flatGlobalItems[nextIndex];
        if (next.subId) {
          // Navigating to a sub-item: ensure its section is expanded
          setExpandedGlobalSection(next.sectionId);
          setGlobalSelection(next);
        } else {
          // Navigating to a leaf section
          const section = getGlobalSections().find(
            (s) => s.id === next.sectionId,
          );
          if (section?.subs) {
            // Expanding into a section with subs — select first sub
            setExpandedGlobalSection(section.id);
            setGlobalSelection({
              sectionId: section.id,
              subId: section.subs[0].id,
            });
          } else {
            setGlobalSelection(next);
          }
        }
      } else if (displayedActiveTab === 'project') {
        let currentIndex = flatProjectItems.findIndex(
          (item) =>
            item.sectionId === projectSelection.sectionId &&
            item.subId === projectSelection.subId,
        );
        if (currentIndex === -1) currentIndex = 0;
        const nextIndex =
          direction === 'down'
            ? (currentIndex + 1) % flatProjectItems.length
            : (currentIndex - 1 + flatProjectItems.length) %
              flatProjectItems.length;
        const next = flatProjectItems[nextIndex];
        if (next.subId) {
          setExpandedProjectSection(next.sectionId);
          setProjectSelection(next);
        } else {
          const section = PROJECT_SECTIONS.find((s) => s.id === next.sectionId);
          if (section?.subs) {
            setExpandedProjectSection(section.id);
            setProjectSelection({
              sectionId: section.id,
              subId: section.subs[0].id,
            });
          } else {
            setProjectSelection(next);
          }
        }
      }
    },
    [
      displayedActiveTab,
      flatGlobalItems,
      flatProjectItems,
      globalSelection,
      projectSelection,
    ],
  );

  useRegisterKeyboardBindings(
    'settings-overlay',
    {
      escape: (event) => {
        const target = event.target instanceof Element ? event.target : null;
        const isInMonaco = target?.closest('.monaco-editor') != null;
        const hasOpenSuggestWidget =
          document.querySelector('.monaco-editor .suggest-widget.visible') !=
          null;
        if (isInMonaco && hasOpenSuggestWidget) return false;

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
    },
    { layer },
  );

  const handlePanelClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  const handleProjectDeleted = useCallback(() => {
    onClose();
  }, [onClose]);

  const fillHeight =
    (displayedActiveTab === 'global' && isFillHeightGlobal(globalSelection)) ||
    (displayedActiveTab === 'project' && isFillHeightProject(projectSelection));

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
                    displayedActiveTab === 'global'
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
                      displayedActiveTab === 'project'
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
              {hasProjectTab &&
                resolvedProject &&
                displayedActiveTab === 'project' && (
                  <div
                    className="inline-flex items-center gap-2 rounded-md px-2 py-1 text-xs transition-opacity"
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
                    <Select
                      value={resolvedProjectId ?? resolvedProject.id}
                      options={projectOptions}
                      onChange={handleProjectChange}
                      label="Select project"
                      size="xs"
                      className="max-w-[160px] bg-transparent px-0 py-0 text-xs hover:bg-transparent"
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
            <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
              {/* Left sidebar menu */}
              <div
                className="flex w-[220px] shrink-0 flex-col"
                style={{
                  backgroundColor: 'oklch(0 0 0 / 0.2)',
                  borderRight: '1px solid oklch(1 0 0 / 0.05)',
                  padding: '12px 8px',
                }}
              >
                <div
                  className="mb-2 px-2 font-mono text-[9.5px] font-semibold uppercase"
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
                    displayedActiveTab === 'project'
                      ? 'Project settings sections'
                      : 'Global settings sections'
                  }
                >
                  {displayedActiveTab === 'global' &&
                    getGlobalSections().map((section) => (
                      <GlobalNavSection
                        key={section.id}
                        section={section}
                        isExpanded={expandedGlobalSection === section.id}
                        isActive={globalSelection.sectionId === section.id}
                        activeSubId={
                          globalSelection.sectionId === section.id
                            ? globalSelection.subId
                            : undefined
                        }
                        onSectionClick={() => handleGlobalSectionClick(section)}
                        onSubClick={(subId) =>
                          handleGlobalSubClick(section.id, subId)
                        }
                      />
                    ))}

                  {displayedActiveTab === 'project' &&
                    hasProjectTab &&
                    PROJECT_SECTIONS.map((section) => (
                      <ProjectNavSection
                        key={section.id}
                        section={section}
                        isExpanded={expandedProjectSection === section.id}
                        isActive={projectSelection.sectionId === section.id}
                        activeSubId={
                          projectSelection.sectionId === section.id
                            ? projectSelection.subId
                            : undefined
                        }
                        onSectionClick={() =>
                          handleProjectSectionClick(section)
                        }
                        onSubClick={(subId) =>
                          handleProjectSubClick(section.id, subId)
                        }
                      />
                    ))}
                </nav>
              </div>

              {/* Right content area */}
              <div
                className={
                  fillHeight
                    ? 'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden'
                    : 'min-w-0 flex-1 overflow-y-auto'
                }
                style={
                  fillHeight ? { padding: 0 } : { padding: '20px 28px 28px' }
                }
              >
                {displayedActiveTab === 'global' && (
                  <GlobalContent selection={globalSelection} />
                )}

                {displayedActiveTab === 'project' && resolvedProject && (
                  <ProjectContent
                    projectId={resolvedProject.id}
                    selection={projectSelection}
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

/* ── Project content wrapper ── */

function ProjectContent({
  projectId,
  selection,
  onProjectDeleted,
}: {
  projectId: string;
  selection: { sectionId: string; subId?: string };
  onProjectDeleted: () => void;
}) {
  const menuItem = resolveProjectMenuItem(selection);
  const section = PROJECT_SECTIONS.find((s) => s.id === selection.sectionId);
  const subItem = section?.subs?.find((s) => s.id === selection.subId);
  const fillHeight = isFillHeightProject(selection);

  return (
    <>
      {!fillHeight && section && (
        <div className="mb-5">
          {subItem && (
            <div
              className="mb-3 flex items-center gap-1.5 font-mono text-[11px] tracking-wide uppercase"
              style={{ color: 'oklch(0.55 0.01 280)' }}
            >
              <span>{section.label}</span>
              <ChevronRight size={10} style={{ opacity: 0.5 }} />
              <span style={{ color: 'oklch(0.78 0.18 295)' }}>
                {subItem.label}
              </span>
            </div>
          )}
        </div>
      )}
      <ProjectSettings
        key={projectId}
        projectId={projectId}
        menuItem={menuItem}
        onProjectDeleted={onProjectDeleted}
      />
    </>
  );
}

/* ── Nav section components ── */

function GlobalNavSection({
  section,
  isExpanded,
  isActive,
  activeSubId,
  onSectionClick,
  onSubClick,
}: {
  section: GlobalSection;
  isExpanded: boolean;
  isActive: boolean;
  activeSubId?: string;
  onSectionClick: () => void;
  onSubClick: (subId: string) => void;
}) {
  const Icon = section.icon;
  const hasSubs = !!section.subs;
  const isLeafActive = isActive && !hasSubs;

  return (
    <>
      <button
        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors"
        style={
          isLeafActive
            ? NAV_SECTION_ACTIVE_LEAF
            : isActive && hasSubs
              ? NAV_SECTION_ACTIVE
              : NAV_SECTION_INACTIVE
        }
        aria-current={isActive ? 'true' : undefined}
        aria-expanded={hasSubs ? isExpanded : undefined}
        onClick={onSectionClick}
      >
        <Icon
          size={14}
          style={isActive ? NAV_ICON_ACTIVE : NAV_ICON_INACTIVE}
        />
        <span className="flex-1">{section.label}</span>
        {hasSubs &&
          (isExpanded ? (
            <ChevronDown size={12} style={{ color: 'oklch(0.5 0.01 280)' }} />
          ) : (
            <ChevronRight size={12} style={{ color: 'oklch(0.5 0.01 280)' }} />
          ))}
      </button>

      {/* Sub-items */}
      {isExpanded && section.subs && (
        <div className="relative my-0.5 mb-1.5" style={{ paddingLeft: 24 }}>
          {/* Vertical rail line */}
          <div
            className="absolute"
            style={{
              left: 16,
              top: 4,
              bottom: 4,
              width: 1,
              background: 'oklch(1 0 0 / 0.08)',
            }}
          />
          {section.subs.map((sub) => {
            const isSubActive = activeSubId === sub.id;
            return (
              <button
                key={sub.id}
                className="flex w-full items-center gap-1.5 rounded-[5px] px-2.5 py-[6px] text-left text-[12.5px] transition-colors"
                style={isSubActive ? NAV_SUB_ACTIVE : NAV_SUB_INACTIVE}
                aria-current={isSubActive ? 'true' : undefined}
                onClick={() => onSubClick(sub.id)}
              >
                {sub.label}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

function ProjectNavSection({
  section,
  isExpanded,
  isActive,
  activeSubId,
  onSectionClick,
  onSubClick,
}: {
  section: ProjectSection;
  isExpanded: boolean;
  isActive: boolean;
  activeSubId?: string;
  onSectionClick: () => void;
  onSubClick: (subId: string) => void;
}) {
  const Icon = section.icon;
  const hasSubs = !!section.subs;
  const isLeafActive = isActive && !hasSubs;

  return (
    <>
      <button
        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors"
        style={
          isLeafActive
            ? NAV_SECTION_ACTIVE_LEAF
            : isActive && hasSubs
              ? NAV_SECTION_ACTIVE
              : NAV_SECTION_INACTIVE
        }
        aria-current={isActive ? 'true' : undefined}
        aria-expanded={hasSubs ? isExpanded : undefined}
        onClick={onSectionClick}
      >
        <Icon
          size={14}
          style={isActive ? NAV_ICON_ACTIVE : NAV_ICON_INACTIVE}
        />
        <span className="flex-1">{section.label}</span>
        {hasSubs &&
          (isExpanded ? (
            <ChevronDown size={12} style={{ color: 'oklch(0.5 0.01 280)' }} />
          ) : (
            <ChevronRight size={12} style={{ color: 'oklch(0.5 0.01 280)' }} />
          ))}
      </button>

      {isExpanded && section.subs && (
        <div className="relative my-0.5 mb-1.5" style={{ paddingLeft: 24 }}>
          <div
            className="absolute"
            style={{
              left: 16,
              top: 4,
              bottom: 4,
              width: 1,
              background: 'oklch(1 0 0 / 0.08)',
            }}
          />
          {section.subs.map((sub) => {
            const isSubActive = activeSubId === sub.id;
            return (
              <button
                key={sub.id}
                className="flex w-full items-center gap-1.5 rounded-[5px] px-2.5 py-[6px] text-left text-[12.5px] transition-colors"
                style={isSubActive ? NAV_SUB_ACTIVE : NAV_SUB_INACTIVE}
                aria-current={isSubActive ? 'true' : undefined}
                onClick={() => onSubClick(sub.id)}
              >
                {sub.label}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
