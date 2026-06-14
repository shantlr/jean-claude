import {
  AlertTriangle,
  Box,
  Check,
  ChevronRight,
  Cpu,
  Diamond,
  Folder,
  Grid3X3,
  List,
  MoreHorizontal,
  Play,
  Plug,
  Search,
  Settings,
  Sparkles,
  Terminal,
  X,
  Zap,
} from 'lucide-react';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
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
import { RateLimitSwapSettings } from '@/features/settings/ui-rate-limit-swap-settings';
import { SkillsSettings } from '@/features/settings/ui-skills-settings';
import { SourcesSettings } from '@/features/settings/ui-sources-settings';
import { TokensTab } from '@/features/settings/ui-tokens-tab';
import { api } from '@/lib/api';

import { useCurrentSettingsProject } from './use-current-settings-project';

/* ── Types ── */

type GlobalSubItem = {
  id: string;
  label: string;
  beta?: boolean;
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
        { id: 'rate-limit-swap', label: 'Rate Limit Swap' },
        { id: 'claude-code', label: 'Claude Code', layout: 'fill' },
        { id: 'opencode', label: 'OpenCode', layout: 'fill' },
        { id: 'codex', label: 'Codex', beta: true, layout: 'fill' },
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

type SettingsNavLeaf = {
  key: string;
  label: string;
  icon: React.ElementType;
  beta?: boolean;
  selection: ActiveSelection;
};

type SettingsNavGroup = {
  label: string;
  danger?: boolean;
  items: SettingsNavLeaf[];
};

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

function globalLeaf(
  sectionId: string,
  subId?: string,
  label?: string,
): SettingsNavLeaf {
  const section = getGlobalSections().find((s) => s.id === sectionId);
  if (!section)
    throw new Error(`Unknown global settings section: ${sectionId}`);
  const sub = subId ? section.subs?.find((s) => s.id === subId) : undefined;
  return {
    key: subId ? `${sectionId}:${subId}` : sectionId,
    label: label ?? sub?.label ?? section.label,
    icon: section.icon,
    beta: sub?.beta,
    selection: subId ? { sectionId, subId } : { sectionId },
  };
}

function projectLeaf(
  sectionId: string,
  subId?: string,
  label?: string,
): SettingsNavLeaf {
  const section = PROJECT_SECTIONS.find((s) => s.id === sectionId);
  if (!section)
    throw new Error(`Unknown project settings section: ${sectionId}`);
  const sub = subId ? section.subs?.find((s) => s.id === subId) : undefined;
  return {
    key: subId ? `${sectionId}:${subId}` : sectionId,
    label: label ?? sub?.label ?? section.label,
    icon: section.icon,
    selection: subId ? { sectionId, subId } : { sectionId },
  };
}

function getGlobalNavGroups(): SettingsNavGroup[] {
  return [
    {
      label: 'Workspace',
      items: [
        globalLeaf('general', 'editor', 'General'),
        globalLeaf('general', 'notifications'),
        ...(api.platform === 'darwin'
          ? [globalLeaf('general', 'calendar')]
          : []),
        globalLeaf('ai-generation'),
      ],
    },
    {
      label: 'Agents',
      items: [
        globalLeaf('coding-agents', 'presets', 'Defaults'),
        globalLeaf('coding-agents', 'claude-code', 'Claude Code'),
        globalLeaf('coding-agents', 'opencode', 'OpenCode'),
        globalLeaf('coding-agents', 'codex', 'Codex'),
        globalLeaf('coding-agents', 'prompt-preface'),
        globalLeaf('permissions'),
        globalLeaf('coding-agents', 'rate-limit-swap'),
      ],
    },
    {
      label: 'Capabilities',
      items: [
        globalLeaf('skills-agents', 'skills'),
        globalLeaf('skills-agents', 'agents', 'Subagents'),
        globalLeaf('prompt-snippets', undefined, 'Snippets'),
        globalLeaf('mcp-servers'),
        globalLeaf('skills-agents', 'sources'),
        globalLeaf('autocomplete'),
      ],
    },
    {
      label: 'Connections',
      items: [
        globalLeaf('tokens', undefined, 'Providers'),
        globalLeaf('general', 'usage', 'Usage Display'),
        globalLeaf('azure-devops'),
      ],
    },
    {
      label: 'System',
      items: [globalLeaf('general', 'maintenance'), globalLeaf('debug')],
    },
  ];
}

function getProjectNavGroups(): SettingsNavGroup[] {
  return [
    {
      label: 'Project',
      items: [
        projectLeaf('project-general', 'details'),
        projectLeaf('project-general', 'commit-ignore'),
        projectLeaf('project-general', 'worktree'),
        projectLeaf('project-general', 'feature-map'),
        projectLeaf('project-general', 'autocomplete'),
      ],
    },
    {
      label: 'Agents',
      items: [
        projectLeaf('project-general', 'prompt-preface'),
        projectLeaf('permissions'),
        projectLeaf('run-commands'),
      ],
    },
    {
      label: 'Capabilities',
      items: [
        projectLeaf('skills'),
        projectLeaf('mcp-overrides'),
        projectLeaf('ai-generation'),
      ],
    },
    {
      label: 'Integrations',
      items: [
        projectLeaf('project-integrations', 'integrations', 'Repository'),
        projectLeaf('project-integrations', 'pipelines'),
      ],
    },
    {
      label: 'Danger',
      danger: true,
      items: [projectLeaf('danger-zone')],
    },
  ];
}

function sameSelection(a: ActiveSelection, b: ActiveSelection): boolean {
  return a.sectionId === b.sectionId && a.subId === b.subId;
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

function BetaBadge() {
  return (
    <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-1.5 py-px text-[9px] font-semibold tracking-wide text-amber-300 uppercase">
      Beta
    </span>
  );
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
      case 'coding-agents:rate-limit-swap':
        return <RateLimitSwapSettings />;
      case 'coding-agents:claude-code':
        return <BackendConfigSettings backend="claude-code" />;
      case 'coding-agents:opencode':
        return <BackendConfigSettings backend="opencode" />;
      case 'coding-agents:codex':
        return <BackendConfigSettings backend="codex" />;
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
  const [expandedGlobalSection] = useState<string | null>(() => {
    if (initialNavState) return initialNavState.expandedGlobalSection;
    const sections = getGlobalSections();
    return sections[0].subs ? sections[0].id : null;
  });

  // Project: track active selection + which section is expanded
  const [projectSelection, setProjectSelection] = useState<{
    sectionId: string;
    subId?: string;
  }>(() => initialNavState?.projectSelection ?? getDefaultProjectSelection());
  const [expandedProjectSection] = useState<string | null>(
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
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState('');
  const globalNavGroups = useMemo(() => getGlobalNavGroups(), []);
  const projectNavGroups = useMemo(() => getProjectNavGroups(), []);
  const searchResults = useMemo(() => {
    const query = paletteQuery.trim().toLowerCase();
    const items = [
      ...globalNavGroups.flatMap((group) =>
        group.items.map((item) => ({
          ...item,
          group: group.label,
          scope: 'global' as const,
        })),
      ),
      ...(hasProjectTab
        ? projectNavGroups.flatMap((group) =>
            group.items.map((item) => ({
              ...item,
              group: group.label,
              scope: 'project' as const,
            })),
          )
        : []),
    ];

    if (!query) return items;
    const terms = query.split(/\s+/);
    return items.filter((item) =>
      terms.every((term) =>
        `${item.label} ${item.group} ${item.scope}`
          .toLowerCase()
          .includes(term),
      ),
    );
  }, [globalNavGroups, hasProjectTab, paletteQuery, projectNavGroups]);

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

  // Flatten sections + subs for keyboard navigation
  const flatGlobalItems = useMemo(() => {
    return globalNavGroups.flatMap((group) =>
      group.items.map((item) => item.selection),
    );
  }, [globalNavGroups]);

  const flatProjectItems = useMemo(() => {
    return projectNavGroups.flatMap((group) =>
      group.items.map((item) => item.selection),
    );
  }, [projectNavGroups]);

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
        setGlobalSelection(next);
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
        setProjectSelection(next);
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
      'cmd+k': {
        handler: () => {
          setPaletteOpen((open) => !open);
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

  const jumpToLeaf = useCallback(
    (leaf: SettingsNavLeaf, scope: SettingsTab) => {
      if (scope === 'global') {
        setActiveTab('global');
        setGlobalSelection(leaf.selection);
        return;
      }
      if (hasProjectTab) {
        handleProjectTab();
        setProjectSelection(leaf.selection);
      }
    },
    [handleProjectTab, hasProjectTab],
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
            <div
              className="relative flex h-[52px] shrink-0 items-center gap-3 overflow-hidden border-b px-4"
              style={{
                backgroundColor: 'oklch(1 0 0 / 0.035)',
                borderColor: 'oklch(1 0 0 / 0.08)',
              }}
            >
              <div
                className="pointer-events-none absolute inset-0"
                style={{
                  background:
                    'radial-gradient(ellipse 380px 120px at 14% -40%, oklch(0.78 0.18 295 / 0.18), transparent 70%)',
                }}
              />
              <div className="relative z-[1] flex items-center gap-2.5">
                <Settings size={17} style={{ color: 'oklch(0.78 0.18 295)' }} />
                <span
                  className="text-[14.5px] font-semibold tracking-[-0.01em]"
                  style={{ color: 'oklch(0.96 0.01 280)' }}
                >
                  Settings
                </span>
              </div>
              <div className="flex-1" />
              <button
                className="relative z-[1] flex w-[min(260px,34vw)] items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors hover:bg-white/[0.06]"
                style={{
                  backgroundColor: 'oklch(1 0 0 / 0.045)',
                  border: '1px solid oklch(1 0 0 / 0.09)',
                  color: 'oklch(0.58 0.01 280)',
                }}
                onClick={() => setPaletteOpen(true)}
              >
                <Search size={14} />
                <span className="min-w-0 flex-1 truncate text-[12.5px]">
                  Search settings...
                </span>
                <Kbd shortcut="cmd+k" />
              </button>
              <button
                className="relative z-[1] flex size-8 items-center justify-center rounded-lg transition-colors hover:bg-white/[0.08]"
                style={{
                  backgroundColor: 'oklch(1 0 0 / 0.045)',
                  border: '1px solid oklch(1 0 0 / 0.09)',
                  color: 'oklch(0.7 0.01 280)',
                }}
                onClick={onClose}
                aria-label="Close settings"
              >
                <X size={14} />
              </button>
            </div>

            {/* Main body: sidebar + content */}
            <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
              {/* Left sidebar menu */}
              <div
                className="flex w-[234px] shrink-0 flex-col"
                style={{
                  backgroundColor: 'oklch(0 0 0 / 0.2)',
                  borderRight: '1px solid oklch(1 0 0 / 0.05)',
                }}
              >
                <SettingsScopeHeader
                  activeTab={displayedActiveTab}
                  hasProjectTab={hasProjectTab}
                  resolvedProject={resolvedProject}
                  resolvedProjectId={resolvedProjectId}
                  projectOptions={projectOptions}
                  onGlobal={() => setActiveTab('global')}
                  onProject={handleProjectTab}
                  onProjectChange={handleProjectChange}
                />
                <nav
                  className="flex flex-1 flex-col gap-0.5 overflow-auto px-2 pb-3"
                  aria-label={
                    displayedActiveTab === 'project'
                      ? 'Project settings sections'
                      : 'Global settings sections'
                  }
                >
                  {displayedActiveTab === 'global' &&
                    globalNavGroups.map((group) => (
                      <SettingsNavGroupView
                        key={group.label}
                        group={group}
                        activeSelection={globalSelection}
                        onPick={(leaf) => setGlobalSelection(leaf.selection)}
                      />
                    ))}

                  {displayedActiveTab === 'project' &&
                    hasProjectTab &&
                    projectNavGroups.map((group) => (
                      <SettingsNavGroupView
                        key={group.label}
                        group={group}
                        activeSelection={projectSelection}
                        onPick={(leaf) => setProjectSelection(leaf.selection)}
                      />
                    ))}
                </nav>
              </div>

              {/* Right content area */}
              <div
                className={
                  fillHeight
                    ? 'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden [&_.bg-bg-0]:bg-black/20 [&_.bg-bg-1]:bg-white/[0.035] [&_.border-glass-border]:border-white/10 [&_.border-line-soft]:border-white/10'
                    : 'min-w-0 flex-1 overflow-y-auto [&_.bg-bg-0]:bg-black/20 [&_.bg-bg-1]:bg-white/[0.035] [&_.border-glass-border]:border-white/10 [&_.border-line-soft]:border-white/10 [&_h2]:tracking-[-0.02em] [&_h3]:font-mono [&_h3]:text-[11px] [&_h3]:font-semibold [&_h3]:tracking-[0.08em] [&_h3]:uppercase'
                }
                style={
                  fillHeight ? { padding: 0 } : { padding: '28px 40px 44px' }
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
              <span className="text-status-done flex items-center gap-1.5">
                <Check size={12} strokeWidth={2.6} /> All changes saved
              </span>
              <span
                style={{
                  width: 1,
                  height: 12,
                  background: 'oklch(1 0 0 / 0.08)',
                }}
              />
              <span className="flex items-center gap-1">
                <Kbd shortcut="cmd+k" /> search
              </span>
              <span className="flex items-center gap-1">
                <Kbd shortcut="up" /> <Kbd shortcut="down" /> navigate
              </span>
              <span className="flex items-center gap-1">
                <Kbd shortcut="cmd+1" />/<Kbd shortcut="cmd+2" /> scope
              </span>
              <div className="flex-1" />
              <span className="flex items-center gap-1">
                <Kbd shortcut="escape" /> close
              </span>
            </div>
            {paletteOpen && (
              <SettingsPalette
                query={paletteQuery}
                results={searchResults}
                onQueryChange={setPaletteQuery}
                onClose={() => setPaletteOpen(false)}
                onPick={(result) => {
                  jumpToLeaf(result, result.scope);
                  setPaletteOpen(false);
                  setPaletteQuery('');
                }}
              />
            )}
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

function SettingsScopeHeader({
  activeTab,
  hasProjectTab,
  resolvedProject,
  resolvedProjectId,
  projectOptions,
  onGlobal,
  onProject,
  onProjectChange,
}: {
  activeTab: SettingsTab;
  hasProjectTab: boolean;
  resolvedProject: { id: string; name: string; color: string } | null;
  resolvedProjectId: string | null;
  projectOptions: SelectOption<string>[];
  onGlobal: () => void;
  onProject: () => void;
  onProjectChange: (projectId: string) => void;
}) {
  return (
    <div
      className="border-b p-3"
      style={{ borderColor: 'oklch(1 0 0 / 0.06)' }}
    >
      <div
        className="grid grid-cols-2 gap-0.5 rounded-lg p-0.5"
        style={{
          backgroundColor: 'oklch(0 0 0 / 0.28)',
          border: '1px solid oklch(1 0 0 / 0.07)',
        }}
      >
        <button
          className="flex items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12.5px] font-medium transition-all"
          style={
            activeTab === 'global'
              ? SEGMENTED_TAB_ACTIVE
              : SEGMENTED_TAB_INACTIVE
          }
          onClick={onGlobal}
        >
          <Grid3X3 size={12} />
          Global
        </button>
        <button
          className="flex items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12.5px] font-medium transition-all disabled:cursor-not-allowed disabled:opacity-40"
          style={
            activeTab === 'project'
              ? SEGMENTED_TAB_ACTIVE
              : SEGMENTED_TAB_INACTIVE
          }
          disabled={!hasProjectTab}
          onClick={onProject}
        >
          <Folder size={12} />
          Project
        </button>
      </div>

      <div className="mt-2 min-h-[38px]">
        {activeTab === 'project' && hasProjectTab && resolvedProject ? (
          <div
            className="flex items-center gap-2 rounded-lg px-2 py-1.5"
            style={{
              backgroundColor: 'oklch(1 0 0 / 0.035)',
              border: '1px solid oklch(1 0 0 / 0.07)',
            }}
          >
            <span
              className="pointer-events-none flex size-5 shrink-0 items-center justify-center rounded text-[10px] font-bold"
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
              onChange={onProjectChange}
              label="Select project"
              size="xs"
              className="min-w-0 flex-1 justify-between bg-transparent px-0 py-0 text-xs hover:bg-transparent"
            />
          </div>
        ) : (
          <div
            className="flex items-center gap-2 rounded-lg px-2.5 py-2"
            style={{
              backgroundColor: 'oklch(1 0 0 / 0.025)',
              border: '1px solid oklch(1 0 0 / 0.05)',
              color: 'oklch(0.68 0.01 280)',
            }}
          >
            <Grid3X3 size={14} style={{ color: 'oklch(0.78 0.18 295)' }} />
            <span className="text-[12px]">
              Applies to <b className="text-ink-1">all projects</b>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Nav + palette components ── */

function SettingsNavGroupView({
  group,
  activeSelection,
  onPick,
}: {
  group: SettingsNavGroup;
  activeSelection: ActiveSelection;
  onPick: (leaf: SettingsNavLeaf) => void;
}) {
  return (
    <div className="mb-2">
      <div
        className="sticky top-0 z-[1] -mx-2 px-4 py-1.5 font-mono text-[9.5px] font-semibold tracking-[0.1em] uppercase backdrop-blur"
        style={{
          backgroundColor: 'oklch(0.11 0.012 280 / 0.92)',
          borderBottom: '1px solid oklch(1 0 0 / 0.045)',
          color: group.danger
            ? 'color-mix(in oklch, oklch(0.67 0.2 25) 70%, oklch(0.5 0.01 280))'
            : 'oklch(0.5 0.01 280)',
        }}
      >
        {group.label}
      </div>
      {group.items.map((leaf) => {
        const Icon = leaf.icon;
        const active = sameSelection(activeSelection, leaf.selection);
        return (
          <button
            key={leaf.key}
            className="mb-px flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] transition-colors"
            style={active ? NAV_SECTION_ACTIVE_LEAF : NAV_SECTION_INACTIVE}
            aria-current={active ? 'true' : undefined}
            onClick={() => onPick(leaf)}
          >
            <Icon
              size={14}
              style={active ? NAV_ICON_ACTIVE : NAV_ICON_INACTIVE}
            />
            <span className="min-w-0 flex-1 truncate">{leaf.label}</span>
            {leaf.beta && <BetaBadge />}
          </button>
        );
      })}
    </div>
  );
}

function SettingsPalette({
  query,
  results,
  onQueryChange,
  onClose,
  onPick,
}: {
  query: string;
  results: Array<SettingsNavLeaf & { group: string; scope: SettingsTab }>;
  onQueryChange: (value: string) => void;
  onClose: () => void;
  onPick: (
    result: SettingsNavLeaf & { group: string; scope: SettingsTab },
  ) => void;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const trapTab = useCallback((event: React.KeyboardEvent) => {
    if (event.key !== 'Tab') return;
    const root = rootRef.current;
    if (!root) return;
    const focusable = Array.from(
      root.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled)',
      ),
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
      return;
    }
    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }, []);

  return (
    <div
      className="absolute inset-0 z-10 flex justify-center bg-black/40 pt-24 backdrop-blur-sm"
      onMouseDown={onClose}
    >
      <div
        ref={rootRef}
        className="h-fit max-h-[460px] w-[560px] max-w-[90%] overflow-hidden rounded-xl border shadow-2xl"
        style={{
          backgroundColor: 'oklch(0.14 0.015 280)',
          borderColor: 'oklch(1 0 0 / 0.1)',
        }}
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={trapTab}
      >
        <div
          className="flex items-center gap-3 border-b px-4 py-3"
          style={{ borderColor: 'oklch(1 0 0 / 0.06)' }}
        >
          <Search size={17} style={{ color: 'oklch(0.6 0.01 280)' }} />
          <input
            autoFocus
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') onClose();
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setActiveIndex((index) =>
                  Math.min(index + 1, results.length - 1),
                );
              }
              if (event.key === 'ArrowUp') {
                event.preventDefault();
                setActiveIndex((index) => Math.max(index - 1, 0));
              }
              if (event.key === 'Enter' && results[activeIndex]) {
                event.preventDefault();
                onPick(results[activeIndex]);
              }
            }}
            placeholder="Search every setting across Global and Project..."
            className="min-w-0 flex-1 bg-transparent text-[15px] outline-none"
            style={{ color: 'oklch(0.95 0.01 280)' }}
          />
          <Kbd shortcut="escape" />
        </div>
        <div className="max-h-[390px] overflow-auto p-1.5">
          {results.length === 0 && (
            <div className="text-ink-3 px-4 py-8 text-center text-sm">
              No settings match "{query}".
            </div>
          )}
          {results.map((result, index) => {
            const Icon = result.icon;
            const active = index === activeIndex;
            return (
              <button
                key={`${result.scope}:${result.key}`}
                className="mb-px flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors"
                style={{
                  backgroundColor: active
                    ? 'oklch(1 0 0 / 0.06)'
                    : 'transparent',
                }}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => onPick(result)}
              >
                <Icon
                  size={15}
                  style={{
                    color: active
                      ? 'oklch(0.78 0.18 295)'
                      : 'oklch(0.55 0.01 280)',
                  }}
                />
                <span className="min-w-0 flex-1">
                  <span className="text-ink-1 block truncate text-[13px] font-medium">
                    {result.label}
                  </span>
                  <span className="text-ink-3 block truncate text-[11.5px]">
                    {result.group}
                  </span>
                </span>
                <span
                  className="font-mono text-[10px] tracking-wide uppercase"
                  style={{
                    color:
                      result.scope === 'global'
                        ? 'oklch(0.78 0.18 295)'
                        : 'oklch(0.76 0.14 205)',
                  }}
                >
                  {result.scope}
                </span>
                {active && <Kbd shortcut="enter" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
