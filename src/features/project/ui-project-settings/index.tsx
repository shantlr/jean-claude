import type {
  AiSkillSlotConfig,
  AiSkillSlotKey,
  AiSkillSlotsSetting,
  ModelPreference,
  ProjectFeatureMap,
  ProjectFeatureMapItem,
  ProjectLogoHistoryItem,
  UpdateProject,
} from '@shared/types';
import {
  Check,
  ChevronRight,
  FileText,
  FolderOpen,
  ImagePlus,
  Layers,
  Maximize2,
  Minimize2,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  ListDetailLayout,
  ListGroupHeader,
  ListItemButton,
  ListPane,
} from '@/common/ui/list-detail-layout';
import {
  type ReactElement,
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  SLOT_DEFINITIONS,
  SlotDetail,
} from '@/features/common/ui-ai-skill-slot';
import {
  useAiGenerationSetting,
  useBackendDefaultModelsSetting,
  useBackendModelPresetsSetting,
  useBackendsSetting,
  useProjectPromptPrefaceSetting,
  useUpdateProjectPromptPrefaceSetting,
} from '@/hooks/use-settings';
import {
  useCreateProjectFeatureMapTask,
  useDeleteGeneratedProjectLogo,
  useDeleteProject,
  useDeleteProjectWorktreesFolder,
  useGeneratedProjectLogos,
  useGenerateProjectLogo,
  useProject,
  useProjectBranches,
  useProjectFeatureMap,
  useRegenerateProjectSummary,
  useRemoveProjectLogo,
  useSelectGeneratedProjectLogo,
  useUpdateProject,
  useUploadProjectLogo,
} from '@/hooks/use-projects';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AgentBackendType } from '@shared/agent-backend-types';
import { api } from '@/lib/api';
import { AVAILABLE_BACKENDS } from '@/features/agent/ui-backend-selector';
import { BackendModelPresetPicker } from '@/features/agent/ui-backend-model-preset-picker';
import { Button } from '@/common/ui/button';
import { Checkbox } from '@/common/ui/checkbox';
import { FavoriteBranchesInput } from './favorite-branches-input';
import { findMatchingBackendModelPresetId } from '@/features/agent/ui-backend-preset-selector';
import { getDefaultModelForBackend } from '@/lib/default-models';
import { getProjectSettingsSaveData } from './utils-project-settings-save-data';
import { ImagePreviewModal } from '@/common/ui/image-preview-modal';
import { Input } from '@/common/ui/input';
import isEqual from 'lodash-es/isEqual';
import { Kbd } from '@/common/ui/kbd';
import { Modal } from '@/common/ui/modal';
import { ProjectColorPicker } from '@/features/project/ui-project-color-picker';
import { ProjectLogo } from '@/features/project/ui-project-logo';
import { ProjectLogoSuggestions } from '@/features/project/ui-project-logo-suggestions';
import { ProjectMcpSettings } from '@/features/project/ui-project-mcp-settings';
import { ProjectPermissionsSettings } from '@/features/project/ui-project-permissions-settings';
import { ProjectPipelineSettings } from '@/features/project/ui-project-pipeline-settings';
import type { ProjectPriority } from '@shared/feed-types';
import { ProjectSkillsSettings } from '@/features/project/ui-project-skills-settings';
import { ProjectWorktreeSettings } from '@/features/project/ui-project-worktree-settings';
import { ProtectedBranchesInput } from './protected-branches-input';
import { RepoLink } from '@/features/project/ui-repo-link';
import { RunCommandsConfig } from '@/features/project/ui-run-commands-config';
import { Select } from '@/common/ui/select';
import { Textarea } from '@/common/ui/textarea';
import { useBackgroundJobsStore } from '@/stores/background-jobs';
import { useEnabledBackends } from '@/hooks/use-enabled-backends';
import { useNavigationStore } from '@/stores/navigation';
import { useRegisterKeyboardBindings } from '@/common/context/keyboard-bindings';
import { useShrinkToTarget } from '@/common/hooks/use-shrink-to-target';
import { useToastStore } from '@/stores/toasts';
import { WorkItemsLink } from '@/features/project/ui-work-items-link';


const PROMPT_PREFACE_MODE_OPTIONS = [
  { value: 'inherit', label: 'Use global' },
  { value: 'extend', label: 'Extend global' },
  { value: 'override', label: 'Override global' },
];

const PROMPT_PREFACE_PLACEMENT_OPTIONS = [
  { value: 'before', label: 'Before user prompt' },
  { value: 'after', label: 'After user prompt' },
];

const PROMPT_PREFACE_FREQUENCY_OPTIONS = [
  { value: 'initial', label: 'Initial prompt only' },
  { value: 'each', label: 'Each prompt' },
];

export type ProjectSettingsMenuItem =
  | 'details'
  | 'commit-ignore'
  | 'permissions'
  | 'worktree'
  | 'feature-map'
  | 'prompt-preface'
  | 'autocomplete'
  | 'integrations'
  | 'pipelines'
  | 'run-commands'
  | 'skills'
  | 'mcp-overrides'
  | 'ai-generation'
  | 'danger-zone';

function assertNever(value: never): never {
  throw new Error(`Unhandled project settings menu item: ${String(value)}`);
}

function ProjectPromptPrefaceSettings({
  projectPath,
}: {
  projectPath: string;
}) {
  const { data: setting, isLoading } =
    useProjectPromptPrefaceSetting(projectPath);
  const updateSetting = useUpdateProjectPromptPrefaceSetting(projectPath);
  const [draftText, setDraftText] = useState('');

  useEffect(() => {
    if (setting) {
      startTransition(() => setDraftText(setting.text));
    }
  }, [setting]);

  if (isLoading || !setting) {
    return <p className="text-ink-3">Loading...</p>;
  }

  const controlsDisabled = setting.mode === 'inherit';

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-ink-1 text-lg font-semibold">Prompt Preface</h2>
        <p className="text-ink-3 mt-1 text-sm">
          Configure project instructions to inherit, extend, or replace the
          global prompt preface.
        </p>
      </div>

      <div>
        <label className="text-ink-1 mb-1 block text-sm font-medium">
          Project behavior
        </label>
        <Select
          value={setting.mode}
          options={PROMPT_PREFACE_MODE_OPTIONS}
          onChange={(mode) =>
            updateSetting.mutate({
              ...setting,
              text: draftText,
              mode: mode as typeof setting.mode,
            })
          }
          className="w-full justify-between sm:w-64"
        />
      </div>

      <Textarea
        size="md"
        value={draftText}
        disabled={controlsDisabled}
        onChange={(e) => setDraftText(e.target.value)}
        onBlur={() => updateSetting.mutate({ ...setting, text: draftText })}
        placeholder="Example: In this project, prefer Zustand selectors and avoid unstable selector outputs."
        rows={8}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="text-ink-1 mb-1 block text-sm font-medium">
            Placement
          </label>
          <Select
            value={setting.placement}
            options={PROMPT_PREFACE_PLACEMENT_OPTIONS}
            disabled={controlsDisabled}
            onChange={(placement) =>
              updateSetting.mutate({
                ...setting,
                text: draftText,
                placement: placement as typeof setting.placement,
              })
            }
            className="w-full justify-between"
          />
        </div>

        <div>
          <label className="text-ink-1 mb-1 block text-sm font-medium">
            Frequency
          </label>
          <Select
            value={setting.frequency}
            options={PROMPT_PREFACE_FREQUENCY_OPTIONS}
            disabled={controlsDisabled}
            onChange={(frequency) =>
              updateSetting.mutate({
                ...setting,
                text: draftText,
                frequency: frequency as typeof setting.frequency,
              })
            }
            className="w-full justify-between"
          />
        </div>
      </div>
    </div>
  );
}

function ProjectFeatureMapSettings({
  featureMap,
  onCreateTask,
  isGenerating,
}: {
  featureMap: ProjectFeatureMap | null;
  onCreateTask: () => void;
  isGenerating: boolean;
}) {
  const [query, setQuery] = useState('');
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [openFileIds, setOpenFileIds] = useState<Set<string>>(() => new Set());

  const flatFeatures = useMemo(
    () => flattenProjectFeatureMap(featureMap?.features ?? []),
    [featureMap],
  );
  const parentIds = useMemo(
    () => flatFeatures.filter((feature) => feature.children.length > 0),
    [flatFeatures],
  );
  const normalizedQuery = query.trim().toLowerCase();
  const visibleIds = useMemo(() => {
    if (!normalizedQuery) return null;
    const ids = new Set<string>();
    for (const feature of flatFeatures) {
      if (!projectFeatureMapItemMatches(feature, normalizedQuery)) continue;
      ids.add(feature.id);
      for (const ancestorId of feature.ancestorIds) ids.add(ancestorId);
    }
    return ids;
  }, [flatFeatures, normalizedQuery]);
  const rows = useMemo(
    () =>
      collectVisibleProjectFeatureRows(featureMap?.features ?? [], {
        collapsedIds,
        visibleIds,
      }),
    [collapsedIds, featureMap, visibleIds],
  );
  const totalFiles = useMemo(() => {
    const files = new Set<string>();
    for (const feature of flatFeatures) {
      for (const file of feature.key_files) files.add(file);
    }
    return files.size;
  }, [flatFeatures]);
  const anyExpanded = collapsedIds.size < parentIds.length;

  function toggleCollapsed(featureId: string) {
    setCollapsedIds((current) => {
      const next = new Set(current);
      if (next.has(featureId)) next.delete(featureId);
      else next.add(featureId);
      return next;
    });
  }

  function toggleFiles(featureId: string) {
    setOpenFileIds((current) => {
      const next = new Set(current);
      if (next.has(featureId)) next.delete(featureId);
      else next.add(featureId);
      return next;
    });
  }

  function toggleAll() {
    if (anyExpanded) {
      setCollapsedIds(new Set(parentIds.map((feature) => feature.id)));
      return;
    }
    setCollapsedIds(new Set());
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-ink-1 text-lg font-semibold">Feature Map</h2>
          <div className="text-ink-3 mt-1 space-y-1 text-sm">
            <p>
              Project feature tree used as reusable prompt context. Create a
              task to draft or improve it, review the result, then save from
              task details.
            </p>
            <p>
              Use <span className="font-mono">#Feature Name</span> in prompt
              composers to quickly contextualize prompts with that feature's
              summary and key files.
            </p>
            <p>
              Jean-Claude replaces the reference with the feature name and
              appends a
              <span className="font-mono"> &lt;feature_context&gt;</span> block
              to the prompt sent to the agent.
            </p>
          </div>
          {featureMap?.generatedAt && (
            <p className="text-ink-3 mt-2 flex items-center gap-1.5 font-mono text-[11px]">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Generated {new Date(featureMap.generatedAt).toLocaleString()}
            </p>
          )}
        </div>
        <Button
          variant="accent"
          size="sm"
          onClick={onCreateTask}
          disabled={isGenerating}
          loading={isGenerating}
          icon={<RefreshCw />}
        >
          {isGenerating ? 'Creating...' : 'Create feature map task'}
        </Button>
      </div>

      {!featureMap || featureMap.features.length === 0 ? (
        <div className="border-glass-border bg-glass-light rounded-xl border p-5">
          <p className="text-ink-2 text-sm">No feature map yet.</p>
          <p className="text-ink-3 mt-1 text-xs">
            Generate one to make project features searchable from prompt
            composers with #Feature Name references.
          </p>
        </div>
      ) : (
        <div className="border-glass-border bg-glass-light flex min-h-[460px] flex-1 flex-col overflow-hidden rounded-xl border">
          <div className="border-glass-border/70 bg-bg-1/40 flex flex-wrap items-center gap-2 border-b p-2.5">
            <div
              className={`bg-bg-0/40 flex min-w-0 flex-1 items-center gap-2 rounded-lg border px-3 py-2 sm:max-w-sm ${
                query ? 'border-accent-1/50' : 'border-glass-border'
              }`}
            >
              <Search
                className={`h-3.5 w-3.5 shrink-0 ${query ? 'text-accent-1' : 'text-ink-3'}`}
              />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Filter features, summaries, files..."
                spellCheck={false}
                className="text-ink-1 placeholder:text-ink-4 min-w-0 flex-1 bg-transparent text-sm outline-none"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="text-ink-3 hover:text-ink-1 rounded p-0.5"
                  aria-label="Clear feature map filter"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {query && (
              <span className="text-ink-3 font-mono text-[11px]">
                {rows.length} match{rows.length === 1 ? '' : 'es'}
              </span>
            )}
            <div className="hidden flex-1 sm:block" />
            <button
              type="button"
              onClick={toggleAll}
              disabled={!!query}
              className="border-glass-border bg-glass-medium text-ink-2 hover:text-ink-1 disabled:text-ink-4 inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs disabled:cursor-default disabled:opacity-50"
            >
              {anyExpanded ? (
                <Minimize2 className="h-3.5 w-3.5" />
              ) : (
                <Maximize2 className="h-3.5 w-3.5" />
              )}
              {anyExpanded ? 'Collapse all' : 'Expand all'}
            </button>
          </div>

          <div className="scroll flex-1 overflow-auto p-1.5">
            {rows.length > 0 ? (
              rows.map((row) => (
                <ProjectFeatureMapRow
                  key={row.feature.id}
                  row={row}
                  query={query}
                  isOpen={!collapsedIds.has(row.feature.id) || !!visibleIds}
                  filesOpen={openFileIds.has(row.feature.id)}
                  onToggleCollapsed={toggleCollapsed}
                  onToggleFiles={toggleFiles}
                />
              ))
            ) : (
              <div className="text-ink-3 px-4 py-12 text-center text-sm">
                No features match "{query}".
              </div>
            )}
          </div>

          <div className="border-glass-border/70 bg-bg-1/40 text-ink-3 flex flex-wrap items-center gap-2 border-t px-3 py-2 font-mono text-[11px]">
            <span className="inline-flex items-center gap-1.5">
              <Layers className="text-ink-4 h-3 w-3" />
              {flatFeatures.length} features
            </span>
            <span className="text-ink-4">·</span>
            <span className="inline-flex items-center gap-1.5">
              <FileText className="text-ink-4 h-3 w-3" />
              {totalFiles} files
            </span>
            <span className="text-ink-4">·</span>
            <span>{featureMap.features.length} top-level groups</span>
          </div>
        </div>
      )}
    </div>
  );
}

function ProjectFeatureMapRow({
  row,
  query,
  isOpen,
  filesOpen,
  onToggleCollapsed,
  onToggleFiles,
}: {
  row: ProjectFeatureMapRowData;
  query: string;
  isOpen: boolean;
  filesOpen: boolean;
  onToggleCollapsed: (featureId: string) => void;
  onToggleFiles: (featureId: string) => void;
}) {
  const { feature, depth } = row;
  const isParent = feature.children.length > 0;

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={() =>
          isParent ? onToggleCollapsed(feature.id) : onToggleFiles(feature.id)
        }
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          if (isParent) onToggleCollapsed(feature.id);
          else onToggleFiles(feature.id);
        }}
        className="hover:bg-glass-medium group flex min-h-8 cursor-pointer items-center gap-2 rounded-lg px-2"
      >
        <div className="flex self-stretch" aria-hidden="true">
          {Array.from({ length: depth }).map((_, index) => (
            <span key={index} className="border-glass-border/70 w-4 border-l" />
          ))}
        </div>

        {isParent ? (
          <ChevronRight
            className={`text-ink-3 group-hover:text-ink-1 h-3.5 w-3.5 shrink-0 transition-transform ${
              isOpen ? 'rotate-90' : ''
            }`}
          />
        ) : (
          <span className="flex w-3.5 shrink-0 justify-center">
            <span className="bg-ink-4 h-1 w-1 rounded-full" />
          </span>
        )}

        <span
          className={`shrink-0 truncate text-sm tracking-[-0.01em] ${
            depth === 0
              ? 'text-ink-1 font-semibold'
              : isParent
                ? 'text-ink-1 font-medium'
                : 'text-ink-2'
          }`}
        >
          <ProjectFeatureMapHighlight text={feature.name} query={query} />
        </span>

        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onToggleFiles(feature.id);
          }}
          className={`inline-flex h-[18px] shrink-0 items-center gap-1 rounded px-1.5 font-mono text-[10px] font-semibold ${
            filesOpen
              ? 'border-accent-1/40 bg-accent-1/15 text-accent-1'
              : 'border-glass-border bg-glass-medium text-ink-3'
          } border`}
          title={filesOpen ? 'Hide files' : 'Show files'}
        >
          <FileText className="h-2.5 w-2.5" />
          {feature.key_files.length}
        </button>

        <span className="text-ink-3 min-w-0 flex-1 truncate text-xs">
          <ProjectFeatureMapHighlight text={feature.summary} query={query} />
        </span>
      </div>

      {filesOpen && feature.key_files.length > 0 && (
        <div
          className="flex flex-wrap gap-1.5 pt-0.5 pb-1"
          style={{ paddingLeft: depth * 16 + 36 }}
        >
          {feature.key_files.map((file) => {
            const slashIndex = file.lastIndexOf('/');
            const directory =
              slashIndex >= 0 ? file.slice(0, slashIndex + 1) : '';
            const basename =
              slashIndex >= 0 ? file.slice(slashIndex + 1) : file;

            return (
              <code
                key={file}
                className="border-glass-border bg-bg-0/30 text-ink-3 inline-flex max-w-full items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[11px]"
              >
                <FileText className="text-ink-4 h-2.5 w-2.5 shrink-0" />
                <span className="truncate">
                  <ProjectFeatureMapHighlight text={directory} query={query} />
                  <span className="text-ink-1">
                    <ProjectFeatureMapHighlight text={basename} query={query} />
                  </span>
                </span>
              </code>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ProjectFeatureMapHighlight({
  text,
  query,
}: {
  text: string;
  query: string;
}) {
  const needle = query.trim();
  if (!needle) return text;
  const index = text.toLowerCase().indexOf(needle.toLowerCase());
  if (index < 0) return text;

  return (
    <>
      {text.slice(0, index)}
      <mark className="bg-accent-1/25 text-ink-1 rounded px-0.5">
        {text.slice(index, index + needle.length)}
      </mark>
      {text.slice(index + needle.length)}
    </>
  );
}

type ProjectFeatureMapFlatItem = ProjectFeatureMapItem & {
  ancestorIds: string[];
};

type ProjectFeatureMapRowData = {
  feature: ProjectFeatureMapItem;
  depth: number;
};

function flattenProjectFeatureMap(
  features: ProjectFeatureMapItem[],
  ancestorIds: string[] = [],
): ProjectFeatureMapFlatItem[] {
  return features.flatMap((feature) => [
    { ...feature, ancestorIds },
    ...flattenProjectFeatureMap(feature.children, [...ancestorIds, feature.id]),
  ]);
}

function projectFeatureMapItemMatches(
  feature: ProjectFeatureMapItem,
  query: string,
) {
  return (
    feature.name.toLowerCase().includes(query) ||
    feature.summary.toLowerCase().includes(query) ||
    feature.key_files.some((file) => file.toLowerCase().includes(query))
  );
}

function collectVisibleProjectFeatureRows(
  features: ProjectFeatureMapItem[],
  {
    collapsedIds,
    visibleIds,
    depth = 0,
  }: {
    collapsedIds: Set<string>;
    visibleIds: Set<string> | null;
    depth?: number;
  },
): ProjectFeatureMapRowData[] {
  return features.flatMap((feature) => {
    if (visibleIds && !visibleIds.has(feature.id)) return [];

    const row = { feature, depth };
    const shouldShowChildren = visibleIds || !collapsedIds.has(feature.id);
    if (!shouldShowChildren) return [row];

    return [
      row,
      ...collectVisibleProjectFeatureRows(feature.children, {
        collapsedIds,
        visibleIds,
        depth: depth + 1,
      }),
    ];
  });
}

function ProjectCommitIgnoreSettings({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);
  const { data: content = '', isLoading } = useQuery({
    queryKey: ['project-commit-ignore', projectId],
    queryFn: () => api.projects.getCommitIgnore(projectId),
  });
  const [draft, setDraft] = useState('');
  const lastLoadedContentRef = useRef('');
  const saveVersionRef = useRef(0);
  const pendingSaveContentRef = useRef<string | null>(null);
  const updateCommitIgnore = useMutation({
    mutationFn: ({
      content: nextContent,
    }: {
      content: string;
      version: number;
    }) => api.projects.updateCommitIgnore(projectId, nextContent),
    onSuccess: (_, { content: nextContent, version }) => {
      if (version !== saveVersionRef.current) return;
      lastLoadedContentRef.current = nextContent;
      queryClient.setQueryData(
        ['project-commit-ignore', projectId],
        nextContent,
      );
    },
    onError: (error, { version }) => {
      if (version !== saveVersionRef.current) return;
      addToast({
        message:
          error instanceof Error
            ? error.message
            : 'Failed to save commit ignore rules',
        type: 'error',
      });
    },
    onSettled: (_, __, { content: nextContent }) => {
      if (pendingSaveContentRef.current === nextContent) {
        pendingSaveContentRef.current = null;
      }
    },
  });

  useEffect(() => {
    setDraft((current) =>
      current === lastLoadedContentRef.current ? content : current,
    );
    lastLoadedContentRef.current = content;
  }, [content]);

  if (isLoading) return <p className="text-ink-3">Loading...</p>;

  const hasChanges = draft !== content;

  function saveDraft() {
    if (!hasChanges || pendingSaveContentRef.current === draft) return;
    pendingSaveContentRef.current = draft;
    const version = saveVersionRef.current + 1;
    saveVersionRef.current = version;
    updateCommitIgnore.mutate({ content: draft, version });
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-ink-1 text-lg font-semibold">Commit Ignore</h2>
        <p className="text-ink-3 mt-1 text-sm">
          Gitignore-style rules stored at <code>.jean-claude/ignore</code>.
          Jean-Claude skips matching paths when committing all changes.
        </p>
      </div>
      <Textarea
        size="md"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          saveDraft();
        }}
        placeholder={`# Examples\ndist/\n.env.local\n*.log`}
        rows={12}
      />
      <div className="flex items-center gap-3">
        <Button
          variant="primary"
          size="sm"
          onClick={saveDraft}
          disabled={!hasChanges || updateCommitIgnore.isPending}
          loading={updateCommitIgnore.isPending}
        >
          {updateCommitIgnore.isPending ? 'Saving...' : 'Save'}
        </Button>
        <p className="text-ink-3 text-xs">
          Existing Git ignore still applies. These rules only affect Jean-Claude
          commits.
        </p>
      </div>
    </div>
  );
}

export function ProjectSettings({
  projectId,
  menuItem,
  onProjectDeleted,
}: {
  projectId: string;
  menuItem: ProjectSettingsMenuItem;
  onProjectDeleted: () => void;
}) {
  const { data: project } = useProject(projectId);
  const { data: branchInfos, isLoading: branchesLoading } =
    useProjectBranches(projectId);
  const branches = useMemo(
    () => branchInfos?.map((b) => b.name),
    [branchInfos],
  );
  const { mutateAsync: updateProject } = useUpdateProject();
  const uploadProjectLogo = useUploadProjectLogo();
  const generateProjectLogo = useGenerateProjectLogo();
  const selectGeneratedProjectLogo = useSelectGeneratedProjectLogo();
  const deleteGeneratedProjectLogo = useDeleteGeneratedProjectLogo();
  const regenerateProjectSummary = useRegenerateProjectSummary();
  const createProjectFeatureMapTask = useCreateProjectFeatureMapTask();
  const removeProjectLogo = useRemoveProjectLogo();
  const deleteProject = useDeleteProject();
  const deleteWorktreesFolder = useDeleteProjectWorktreesFolder();
  const clearProjectNavHistoryState = useNavigationStore(
    (s) => s.clearProjectNavHistoryState,
  );
  const addToast = useToastStore((s) => s.addToast);
  const addRunningJob = useBackgroundJobsStore((s) => s.addRunningJob);
  const markJobSucceeded = useBackgroundJobsStore((s) => s.markJobSucceeded);
  const markJobFailed = useBackgroundJobsStore((s) => s.markJobFailed);
  const panelRef = useRef<HTMLDivElement>(null);
  const { triggerAnimation } = useShrinkToTarget({
    panelRef,
    targetSelector: '[data-animation-target="jobs-button"]',
  });
  const { data: detectedLogos = [] } = useQuery({
    queryKey: ['project-logo-suggestions', project?.path],
    queryFn: () => api.projects.detectLogos(project?.path ?? ''),
    enabled: !!project?.path,
  });
  const { data: logoPreviewUrl } = useQuery({
    queryKey: ['project-logo-preview', project?.logoPath],
    queryFn: () => api.fs.getImageUrl(project?.logoPath ?? ''),
    enabled: !!project?.logoPath,
    staleTime: Infinity,
  });
  const { data: generatedLogoHistory = [] } =
    useGeneratedProjectLogos(projectId);
  const { data: featureMap = null } = useProjectFeatureMap(projectId);

  const [name, setName] = useState('');
  const [path, setPath] = useState('');
  const [color, setColor] = useState('');
  const [defaultBranch, setDefaultBranch] = useState('');
  const [autoPullSourceBranch, setAutoPullSourceBranch] = useState(false);
  const [commitWithNoVerify, setCommitWithNoVerify] = useState(false);
  const [defaultAgentBackend, setDefaultAgentBackend] =
    useState<AgentBackendType | null>(null);
  const [defaultAgentModelPreference, setDefaultAgentModelPreference] =
    useState<ModelPreference | null>(null);
  const [defaultAgentPresetId, setDefaultAgentPresetId] = useState<
    string | null
  >(null);
  const [worktreesPath, setWorktreesPath] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [completionContext, setCompletionContext] = useState('');
  const [summary, setSummary] = useState('');
  const [isLogoPromptModalOpen, setIsLogoPromptModalOpen] = useState(false);
  const [logoPromptDraft, setLogoPromptDraft] = useState('');
  const [prPriority, setPrPriority] = useState<ProjectPriority>('normal');
  const [workItemPriority, setWorkItemPriority] =
    useState<ProjectPriority>('normal');
  const [aiSkillSlots, setAiSkillSlots] = useState<AiSkillSlotsSetting | null>(
    null,
  );
  const [protectedBranches, setProtectedBranches] = useState<string[]>([]);
  const [favoriteBranches, setFavoriteBranches] = useState<string[]>([]);
  const [isGeneratingContext, setIsGeneratingContext] = useState(false);
  const [isLogoPreviewOpen, setIsLogoPreviewOpen] = useState(false);
  const initializedProjectIdRef = useRef<string | null>(null);

  const { data: backendsSetting } = useBackendsSetting();
  const { data: aiGenerationSetting } = useAiGenerationSetting();
  const { data: backendModelPresets = [] } = useBackendModelPresetsSetting();
  const enabledBackends = useEnabledBackends();
  const canGenerateLogoWithOpenAi =
    !!aiGenerationSetting?.openAiApiKey &&
    aiGenerationSetting.openAiImageGenerationEnabled === true;

  useRegisterKeyboardBindings(
    'project-logo-prompt-modal',
    {
      'cmd+enter': () => {
        if (generateProjectLogo.isPending || !canGenerateLogoWithOpenAi) {
          return false;
        }
        handleConfirmGenerateLogo();
      },
    },
    { enabled: isLogoPromptModalOpen },
  );

  const projectData = useMemo(() => {
    if (!project) return null;

    return {
      name: project.name,
      path: project.path,
      color: project.color,
      defaultBranch: project.defaultBranch ?? null,
      autoPullSourceBranch: project.autoPullSourceBranch,
      commitWithNoVerify: project.commitWithNoVerify,
      defaultAgentBackend: project.defaultAgentBackend,
      defaultAgentModelPreference: project.defaultAgentModelPreference,
      prPriority: project.prPriority ?? 'normal',
      workItemPriority: project.workItemPriority ?? 'normal',
      completionContext: project.completionContext ?? null,
      summary: project.summary ?? null,
      worktreesPath: project.worktreesPath ?? null,
      protectedBranches: project.protectedBranches ?? [],
      favoriteBranches: project.favoriteBranches ?? [],
      aiSkillSlots: project.aiSkillSlots,
    };
  }, [project]);

  const draftData = useMemo(
    () => ({
      name,
      path,
      color,
      defaultBranch: defaultBranch || null,
      autoPullSourceBranch,
      commitWithNoVerify,
      defaultAgentBackend,
      defaultAgentModelPreference,
      prPriority,
      workItemPriority,
      completionContext: completionContext || null,
      summary: summary || null,
      worktreesPath: worktreesPath || null,
      protectedBranches,
      favoriteBranches,
      aiSkillSlots,
    }),
    [
      aiSkillSlots,
      autoPullSourceBranch,
      commitWithNoVerify,
      color,
      completionContext,
      defaultAgentBackend,
      defaultAgentModelPreference,
      defaultBranch,
      favoriteBranches,
      name,
      path,
      prPriority,
      protectedBranches,
      summary,
      workItemPriority,
      worktreesPath,
    ],
  );

  const hasChanges = projectData ? !isEqual(draftData, projectData) : false;
  const hasChangesRef = useRef(false);
  const savingProjectRef = useRef(false);
  const pendingProjectSaveRef = useRef<{
    data: UpdateProject;
    fieldVersions: Map<keyof UpdateProject, number>;
  } | null>(null);
  const dirtyFieldsRef = useRef(new Set<keyof UpdateProject>());
  const dirtyFieldVersionsRef = useRef(new Map<keyof UpdateProject, number>());

  const markFieldDirty = useCallback((field: keyof UpdateProject) => {
    dirtyFieldsRef.current.add(field);
    dirtyFieldVersionsRef.current.set(
      field,
      (dirtyFieldVersionsRef.current.get(field) ?? 0) + 1,
    );
  }, []);

  useEffect(() => {
    hasChangesRef.current = hasChanges;
  }, [hasChanges]);

  // Sync local state when project loads or changes
  useEffect(() => {
    if (project) {
      const isInitialProjectLoad =
        initializedProjectIdRef.current !== project.id;
      if (!isInitialProjectLoad && hasChangesRef.current) return;

      setName(project.name);
      setPath(project.path);
      setColor(project.color);
      setDefaultBranch(project.defaultBranch ?? '');
      setAutoPullSourceBranch(project.autoPullSourceBranch);
      setCommitWithNoVerify(project.commitWithNoVerify);
      setDefaultAgentBackend(project.defaultAgentBackend);
      setDefaultAgentModelPreference(project.defaultAgentModelPreference);
      setDefaultAgentPresetId(
        findMatchingBackendModelPresetId({
          presets: backendModelPresets,
          backend: project.defaultAgentBackend,
          model: project.defaultAgentModelPreference,
        }),
      );
      setPrPriority(project.prPriority ?? 'normal');
      setWorkItemPriority(project.workItemPriority ?? 'normal');
      setCompletionContext(project.completionContext ?? '');
      setSummary(project.summary ?? '');
      dirtyFieldsRef.current.clear();
      dirtyFieldVersionsRef.current.clear();
      setWorktreesPath(project.worktreesPath ?? '');
      setProtectedBranches(project.protectedBranches ?? []);
      setFavoriteBranches(project.favoriteBranches ?? []);
      setAiSkillSlots(project.aiSkillSlots);
      initializedProjectIdRef.current = project.id;
    }
  }, [backendModelPresets, project]);

  const saveProjectSettings = useCallback(
    async (save: {
      data: UpdateProject;
      fieldVersions: Map<keyof UpdateProject, number>;
    }) => {
      pendingProjectSaveRef.current = save;
      if (savingProjectRef.current) return;

      savingProjectRef.current = true;
      try {
        while (pendingProjectSaveRef.current) {
          const nextSave = pendingProjectSaveRef.current;
          pendingProjectSaveRef.current = null;
          await updateProject({
            id: projectId,
            data: nextSave.data,
          });
          const pendingSave = pendingProjectSaveRef.current as
            | typeof nextSave
            | null;
          for (const [field, version] of nextSave.fieldVersions) {
            const currentVersion = dirtyFieldVersionsRef.current.get(field);
            const pendingVersion = pendingSave?.fieldVersions.get(field);
            if (currentVersion === version && pendingVersion === undefined) {
              dirtyFieldsRef.current.delete(field);
              dirtyFieldVersionsRef.current.delete(field);
            }
          }
        }
      } catch (error) {
        addToast({
          message:
            error instanceof Error
              ? error.message
              : 'Failed to save project settings',
          type: 'error',
        });
      } finally {
        savingProjectRef.current = false;
      }
    },
    [addToast, projectId, updateProject],
  );

  useEffect(() => {
    if (!projectData || !hasChanges) return;
    const saveData = getProjectSettingsSaveData({
      data: draftData,
      dirtyFields: dirtyFieldsRef.current,
    });
    if (Object.keys(saveData).length === 0) return;
    const fieldVersions = new Map<keyof UpdateProject, number>();
    for (const field of Object.keys(saveData) as (keyof UpdateProject)[]) {
      fieldVersions.set(field, dirtyFieldVersionsRef.current.get(field) ?? 0);
    }

    const saveTimeout = window.setTimeout(() => {
      void saveProjectSettings({ data: saveData, fieldVersions });
    }, 500);

    return () => window.clearTimeout(saveTimeout);
  }, [draftData, hasChanges, projectData, saveProjectSettings]);

  useEffect(() => {
    if (menuItem !== 'danger-zone' && showDeleteConfirm) {
      startTransition(() => setShowDeleteConfirm(false));
    }
  }, [menuItem, showDeleteConfirm]);

  if (!project) {
    return (
      <div className="text-ink-3 flex h-full items-center justify-center">
        Loading...
      </div>
    );
  }

  async function handlePickFolder() {
    const selected = await api.dialog.openDirectory();
    if (selected) {
      markFieldDirty('path');
      setPath(selected);
    }
  }

  async function handleDelete() {
    clearProjectNavHistoryState(projectId);
    await deleteProject.mutateAsync(projectId);
    onProjectDeleted();
  }

  async function handleGenerateContext() {
    setIsGeneratingContext(true);
    try {
      const result = await api.completion.generateContext({ projectId });
      if (result) {
        markFieldDirty('completionContext');
        setCompletionContext(result);
      } else {
        addToast({
          message: 'No task history found. Create some tasks first.',
          type: 'error',
        });
      }
    } catch {
      addToast({
        message: 'Failed to generate context. Please try again.',
        type: 'error',
      });
    } finally {
      setIsGeneratingContext(false);
    }
  }

  function handleRegenerateSummary() {
    if (!project) return;

    const jobId = addRunningJob({
      type: 'project-summary-generation',
      title: `Regenerating summary for ${project.name}`,
      projectId,
      details: {
        projectName: project.name,
      },
    });

    void triggerAnimation();

    void regenerateProjectSummary
      .mutateAsync(projectId)
      .then((updatedProject) => {
        setSummary(updatedProject.summary ?? '');
        markJobSucceeded(jobId, { projectId });
      })
      .catch((error: unknown) => {
        const message =
          error instanceof Error
            ? error.message
            : 'Failed to regenerate project summary.';
        markJobFailed(jobId, message);
        addToast({
          message,
          type: 'error',
        });
      });
  }

  function handleCreateFeatureMapTask() {
    if (!project) return;

    void createProjectFeatureMapTask
      .mutateAsync(projectId)
      .then(() => {
        addToast({
          message: 'Feature map task created.',
          type: 'success',
        });
      })
      .catch((error: unknown) => {
        const message =
          error instanceof Error
            ? error.message
            : 'Failed to create project feature map task.';
        addToast({
          message,
          type: 'error',
        });
      });
  }

  async function handleUploadLogo() {
    const sourcePath = await api.dialog.openImageFile();
    if (!sourcePath) return;
    try {
      await uploadProjectLogo.mutateAsync({ projectId, sourcePath });
    } catch (error) {
      addToast({
        message:
          error instanceof Error ? error.message : 'Failed to upload logo.',
        type: 'error',
      });
    }
  }

  async function startLogoGeneration(customPrompt: string) {
    if (!project) return;
    const trimmedCustomPrompt = customPrompt.trim();

    const jobId = addRunningJob({
      type: 'logo-generation',
      title: `Generating logo for ${project.name}`,
      projectId,
      details: {
        projectName: project.name,
        customPrompt: trimmedCustomPrompt || null,
      },
    });

    void triggerAnimation();

    void generateProjectLogo
      .mutateAsync({
        projectId,
        customPrompt: trimmedCustomPrompt || undefined,
      })
      .then((updatedProject) => {
        setSummary((current) =>
          current.trim() ? current : (updatedProject.summary ?? ''),
        );
        markJobSucceeded(jobId, { projectId });
      })
      .catch((error: unknown) => {
        const message =
          error instanceof Error
            ? error.message
            : 'Failed to generate logo. Check AI generation settings.';
        markJobFailed(jobId, message);
        addToast({
          message,
          type: 'error',
        });
      });
  }

  function handleGenerateLogo() {
    setIsLogoPromptModalOpen(true);
  }

  function handleConfirmGenerateLogo() {
    setIsLogoPromptModalOpen(false);
    void startLogoGeneration(logoPromptDraft);
  }

  async function handleSelectLogoSuggestion(sourcePath: string) {
    try {
      await uploadProjectLogo.mutateAsync({ projectId, sourcePath });
    } catch (error) {
      addToast({
        message: error instanceof Error ? error.message : 'Failed to use logo.',
        type: 'error',
      });
    }
  }

  async function handleUseGeneratedLogo(logoId: string) {
    try {
      await selectGeneratedProjectLogo.mutateAsync({ projectId, logoId });
    } catch (error) {
      addToast({
        message: error instanceof Error ? error.message : 'Failed to use logo.',
        type: 'error',
      });
    }
  }

  async function handleDeleteGeneratedLogo(logoId: string) {
    try {
      await deleteGeneratedProjectLogo.mutateAsync({ projectId, logoId });
    } catch (error) {
      addToast({
        message:
          error instanceof Error ? error.message : 'Failed to delete logo.',
        type: 'error',
      });
    }
  }
  let content: ReactElement;

  switch (menuItem) {
    case 'details':
      content = (
        <div className="space-y-6">
          <div>
            <label
              htmlFor="name"
              className="text-ink-1 mb-1 block text-sm font-medium"
            >
              Name
            </label>
            <Input
              id="name"
              size="md"
              value={name}
              onChange={(e) => {
                markFieldDirty('name');
                setName(e.target.value);
              }}
            />
          </div>

          <div>
            <label className="text-ink-1 mb-1 block text-sm font-medium">
              Path
            </label>
            <div className="flex gap-2">
              <Input
                size="md"
                value={path}
                readOnly
                className="text-ink-2 min-w-0 flex-1 cursor-default"
              />
              <Button
                variant="secondary"
                size="md"
                onClick={handlePickFolder}
                icon={<FolderOpen />}
                className="shrink-0"
              >
                Browse
              </Button>
            </div>
          </div>

          <div>
            <label className="text-ink-1 mb-1 block text-sm font-medium">
              Type
            </label>
            <span className="bg-glass-medium inline-block rounded-md px-2 py-1 text-sm">
              {project.type === 'local' ? 'Local folder' : 'Git provider'}
            </span>
          </div>

          <div>
            <label className="text-ink-1 mb-1 block text-sm font-medium">
              Color
            </label>
            <ProjectColorPicker
              value={color}
              onChange={(value) => {
                markFieldDirty('color');
                setColor(value);
              }}
            />
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between gap-3">
              <label className="text-ink-1 block text-sm font-medium">
                Summary
              </label>
              <Button
                variant="accent"
                size="sm"
                onClick={handleRegenerateSummary}
                disabled={regenerateProjectSummary.isPending}
                loading={regenerateProjectSummary.isPending}
                icon={<RefreshCw />}
              >
                {regenerateProjectSummary.isPending
                  ? 'Regenerating...'
                  : 'Regenerate'}
              </Button>
            </div>
            <Textarea
              size="md"
              value={summary}
              onChange={(e) => {
                markFieldDirty('summary');
                setSummary(e.target.value);
              }}
              placeholder="Short project summary used as context for generated app icons"
              rows={3}
            />
            <p className="text-ink-3 mt-1 text-xs">
              Used as context for generated project logos. You can edit it
              manually or regenerate it using AI generation settings.
            </p>
          </div>

          <div>
            <label className="text-ink-1 mb-1 block text-sm font-medium">
              Logo
            </label>
            <div className="border-glass-border bg-glass-light flex flex-col gap-4 rounded-xl border p-4 sm:flex-row sm:items-center">
              <button
                type="button"
                className="rounded-xl transition-transform hover:scale-105 disabled:hover:scale-100"
                onClick={() => setIsLogoPreviewOpen(true)}
                disabled={!logoPreviewUrl}
                aria-label="Preview project logo"
              >
                <ProjectLogo project={{ ...project, color }} size="lg" />
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-ink-1 text-sm font-medium">
                  {project.logoPath
                    ? project.logoSource === 'generated'
                      ? 'Generated logo'
                      : 'Uploaded logo'
                    : 'No logo set'}
                </p>
                <p className="text-ink-3 mt-1 text-xs">
                  Logos are stored in Jean-Claude app data and shown anywhere
                  projects are listed.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleUploadLogo}
                  disabled={uploadProjectLogo.isPending}
                  icon={<ImagePlus />}
                >
                  Upload
                </Button>
                <Button
                  variant="accent"
                  size="sm"
                  onClick={handleGenerateLogo}
                  disabled={
                    generateProjectLogo.isPending || !canGenerateLogoWithOpenAi
                  }
                  icon={<Sparkles />}
                >
                  {generateProjectLogo.isPending ? 'Generating...' : 'Generate'}
                </Button>
                {project.logoPath && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => removeProjectLogo.mutate(projectId)}
                    disabled={removeProjectLogo.isPending}
                    icon={<X />}
                  >
                    Remove
                  </Button>
                )}
              </div>
            </div>
            {!canGenerateLogoWithOpenAi && (
              <p className="text-ink-3 mt-2 text-xs">
                Enable GPT-image project logos with a saved OpenAI API key in AI
                Generation settings to generate logos.
              </p>
            )}
            {detectedLogos.length > 0 && (
              <div className="mt-3">
                <p className="text-ink-3 mb-2 text-xs">
                  Suggestions found in this project folder
                </p>
                <ProjectLogoSuggestions
                  logos={detectedLogos}
                  selectedPath={project.logoPath}
                  onSelect={handleSelectLogoSuggestion}
                />
              </div>
            )}
            {generatedLogoHistory.length > 0 && (
              <div className="mt-3">
                <p className="text-ink-3 mb-2 text-xs">
                  Generated logo history
                </p>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(76px,1fr))] gap-2 sm:grid-cols-[repeat(auto-fill,minmax(88px,1fr))]">
                  {generatedLogoHistory.map((logo) => (
                    <GeneratedLogoHistoryItem
                      key={logo.id}
                      logo={logo}
                      isActive={project.logoPath === logo.path}
                      onUse={handleUseGeneratedLogo}
                      onDelete={handleDeleteGeneratedLogo}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="text-ink-1 mb-1 block text-sm font-medium">
              Default merge branch
            </label>
            <Select
              value={
                branchesLoading ? '' : defaultBranch || branches?.[0] || ''
              }
              options={
                branchesLoading
                  ? [{ value: '', label: 'Loading…' }]
                  : branches?.length === 0
                    ? [{ value: '', label: 'No branches found' }]
                    : (branches ?? []).map((branch) => ({
                        value: branch,
                        label: branch,
                      }))
              }
              onChange={(value) => {
                markFieldDirty('defaultBranch');
                setDefaultBranch(value);
              }}
              disabled={branchesLoading || !branches?.length}
              className="w-full justify-between"
            />
            <p className="text-ink-3 mt-1 text-xs">
              The branch that worktrees will merge into
            </p>
          </div>

          <div>
            <Checkbox
              id="autoPullSourceBranch"
              checked={autoPullSourceBranch}
              onChange={(checked) => {
                markFieldDirty('autoPullSourceBranch');
                setAutoPullSourceBranch(checked);
              }}
              label="Auto-pull source branch when creating tasks"
            />
            <p className="text-ink-3 mt-1 text-xs">
              Pulls the selected base branch before creating a task worktree.
            </p>
          </div>

          <div>
            <Checkbox
              id="commitWithNoVerify"
              checked={commitWithNoVerify}
              onChange={(checked) => {
                markFieldDirty('commitWithNoVerify');
                setCommitWithNoVerify(checked);
              }}
              label="Commit with --no-verify"
            />
            <p className="text-ink-3 mt-1 text-xs">
              Skips Git hooks for app-created commits in this project.
            </p>
          </div>

          <ProtectedBranchesInput
            branches={branches ?? []}
            branchesLoading={branchesLoading}
            protectedBranches={protectedBranches}
            onChange={(value) => {
              markFieldDirty('protectedBranches');
              setProtectedBranches(value);
            }}
          />

          <FavoriteBranchesInput
            branches={branches ?? []}
            branchesLoading={branchesLoading}
            favoriteBranches={favoriteBranches}
            onChange={(value) => {
              markFieldDirty('favoriteBranches');
              setFavoriteBranches(value);
            }}
          />

          <div>
            <label className="text-ink-1 mb-1 block text-sm font-medium">
              Worktrees folder
            </label>
            <div className="flex gap-2">
              <Input
                size="md"
                value={worktreesPath}
                onChange={(e) => {
                  markFieldDirty('worktreesPath');
                  setWorktreesPath(e.target.value);
                }}
                placeholder="Auto-created on first use"
                className="min-w-0 flex-1"
              />
              <Button
                variant="secondary"
                size="md"
                onClick={async () => {
                  const selected = await api.dialog.openDirectory();
                  if (selected) {
                    markFieldDirty('worktreesPath');
                    setWorktreesPath(selected);
                  }
                }}
                icon={<FolderOpen />}
                className="shrink-0"
              >
                Browse
              </Button>
              {project.worktreesPath && (
                <Button
                  variant="danger"
                  size="md"
                  onClick={() => deleteWorktreesFolder.mutate(projectId)}
                  disabled={deleteWorktreesFolder.isPending}
                  icon={<Trash2 />}
                  className="shrink-0"
                >
                  Delete
                </Button>
              )}
            </div>
            <p className="text-ink-3 mt-1 text-xs">
              Where worktrees for this project are stored
            </p>
          </div>

          <div>
            <label className="text-ink-1 mb-1 block text-sm font-medium">
              Default coding agent
            </label>
            <Select
              value={defaultAgentBackend === null ? 'global' : 'project'}
              options={[
                {
                  value: 'global',
                  label: `Use global default${backendsSetting?.defaultBackend ? ` (${AVAILABLE_BACKENDS.find((b) => b.value === backendsSetting.defaultBackend)?.label ?? backendsSetting.defaultBackend})` : ''}`,
                },
                { value: 'project', label: 'Use project default' },
              ]}
              onChange={(value) => {
                markFieldDirty('defaultAgentBackend');
                markFieldDirty('defaultAgentModelPreference');
                if (value === 'global') {
                  setDefaultAgentBackend(null);
                  setDefaultAgentModelPreference(null);
                  setDefaultAgentPresetId(null);
                  return;
                }

                setDefaultAgentBackend(
                  defaultAgentBackend ??
                    enabledBackends[0]?.value ??
                    'claude-code',
                );
                setDefaultAgentModelPreference(
                  defaultAgentModelPreference ?? 'default',
                );
              }}
              className="w-full justify-between"
            />
            {defaultAgentBackend !== null && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <BackendModelPresetPicker
                  backend={defaultAgentBackend}
                  model={defaultAgentModelPreference ?? 'default'}
                  selectedPresetId={defaultAgentPresetId}
                  enabledBackends={enabledBackends.map((b) => b.value)}
                  className="w-full justify-between sm:w-auto"
                  modelClassName="w-full justify-between sm:w-auto"
                  onChange={(selection) => {
                    markFieldDirty('defaultAgentBackend');
                    markFieldDirty('defaultAgentModelPreference');
                    setDefaultAgentBackend(selection.backend);
                    setDefaultAgentModelPreference(selection.model);
                    setDefaultAgentPresetId(selection.presetId);
                  }}
                />
              </div>
            )}
            <p className="text-ink-3 mt-1 text-xs">
              Used to prefill backend and model for new tasks in this project.
            </p>
          </div>

          <div>
            <label className="text-ink-1 mb-1 block text-sm font-medium">
              PR feed priority
            </label>
            <Select
              value={prPriority}
              options={[
                { value: 'high', label: 'High' },
                { value: 'normal', label: 'Normal' },
                { value: 'low', label: 'Low' },
              ]}
              onChange={(value) => {
                markFieldDirty('prPriority');
                setPrPriority(value as ProjectPriority);
              }}
              className="w-full justify-between"
            />
            <p className="text-ink-3 mt-1 text-xs">
              Priority for pull requests from this project in the feed
            </p>
          </div>

          <div>
            <label className="text-ink-1 mb-1 block text-sm font-medium">
              Work item feed priority
            </label>
            <Select
              value={workItemPriority}
              options={[
                { value: 'high', label: 'High' },
                { value: 'normal', label: 'Normal' },
                { value: 'low', label: 'Low' },
              ]}
              onChange={(value) => {
                markFieldDirty('workItemPriority');
                setWorkItemPriority(value as ProjectPriority);
              }}
              className="w-full justify-between"
            />
            <p className="text-ink-3 mt-1 text-xs">
              Priority for work items from this project in the feed
            </p>
          </div>
        </div>
      );
      break;
    case 'commit-ignore':
      content = <ProjectCommitIgnoreSettings projectId={projectId} />;
      break;
    case 'permissions':
      content = <ProjectPermissionsSettings projectPath={project.path} />;
      break;
    case 'worktree':
      content = <ProjectWorktreeSettings projectPath={project.path} />;
      break;
    case 'feature-map':
      content = (
        <ProjectFeatureMapSettings
          featureMap={featureMap}
          onCreateTask={handleCreateFeatureMapTask}
          isGenerating={createProjectFeatureMapTask.isPending}
        />
      );
      break;
    case 'prompt-preface':
      content = <ProjectPromptPrefaceSettings projectPath={project.path} />;
      break;
    case 'autocomplete':
      content = (
        <div className="space-y-3">
          <h2 className="text-ink-1 text-lg font-semibold">
            Autocomplete Context
          </h2>
          <p className="text-ink-3 text-xs">
            Provides context to the autocomplete model when completing prompts
            in this project. Describe what the project is about and include
            example prompts.
          </p>
          <Textarea
            size="md"
            value={completionContext}
            onChange={(e) => {
              markFieldDirty('completionContext');
              setCompletionContext(e.target.value);
            }}
            placeholder={`Project: An e-commerce platform for artisan goods\n\nExample prompts:\n- add filtering by price range to the product catalog\n- fix the checkout flow when cart has mixed shipping`}
            rows={8}
          />
          <div className="flex gap-2">
            <Button
              variant="accent"
              size="sm"
              onClick={handleGenerateContext}
              disabled={isGeneratingContext}
              loading={isGeneratingContext}
            >
              {isGeneratingContext
                ? 'Generating...'
                : 'Generate from task history'}
            </Button>
          </div>
        </div>
      );
      break;
    case 'integrations':
      content = (
        <div className="space-y-4">
          <h2 className="text-ink-1 text-lg font-semibold">Integrations</h2>
          <RepoLink project={project} />
          <WorkItemsLink project={project} />
        </div>
      );
      break;
    case 'pipelines':
      content = <ProjectPipelineSettings projectId={projectId} />;
      break;
    case 'run-commands':
      content = (
        <RunCommandsConfig projectId={projectId} projectPath={project.path} />
      );
      break;
    case 'skills':
      content = <ProjectSkillsSettings projectId={projectId} />;
      break;
    case 'mcp-overrides':
      content = <ProjectMcpSettings projectId={projectId} />;
      break;
    case 'ai-generation':
      content = (
        <ProjectAiGenerationSettings
          aiSkillSlots={aiSkillSlots}
          projectPath={project.path}
          onUpdate={(value) => {
            markFieldDirty('aiSkillSlots');
            setAiSkillSlots(value);
          }}
        />
      );
      break;
    case 'danger-zone':
      content = (
        <div>
          <h2 className="text-status-fail mb-4 text-lg font-semibold">
            Danger Zone
          </h2>
          {showDeleteConfirm ? (
            <div className="border-status-fail bg-status-fail/50 rounded-lg border p-4">
              <p className="text-ink-1 mb-4 text-sm">
                Are you sure you want to delete this project? This action cannot
                be undone.
              </p>
              <div className="flex gap-2">
                <Button
                  variant="danger"
                  size="md"
                  onClick={handleDelete}
                  disabled={deleteProject.isPending}
                  loading={deleteProject.isPending}
                >
                  {deleteProject.isPending ? 'Deleting...' : 'Delete Project'}
                </Button>
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => setShowDeleteConfirm(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="danger"
              size="md"
              onClick={() => setShowDeleteConfirm(true)}
              icon={<Trash2 />}
            >
              Delete Project
            </Button>
          )}
        </div>
      );
      break;
    default:
      assertNever(menuItem);
  }

  const fillHeight = menuItem === 'skills' || menuItem === 'ai-generation';

  return (
    <div
      ref={panelRef}
      className={
        fillHeight ? 'flex min-h-0 min-w-0 flex-1 flex-col' : 'space-y-6'
      }
    >
      {content}
      <ImagePreviewModal
        isOpen={isLogoPreviewOpen}
        title={`${project.name} logo`}
        imageUrl={logoPreviewUrl ?? null}
        onClose={() => setIsLogoPreviewOpen(false)}
      />
      <Modal
        isOpen={isLogoPromptModalOpen}
        onClose={() => setIsLogoPromptModalOpen(false)}
        title="Generate Logo"
      >
        <div className="space-y-4">
          <div>
            <label
              htmlFor="logoCustomPrompt"
              className="text-ink-1 mb-1 block text-sm font-medium"
            >
              Custom prompt
            </label>
            <Textarea
              id="logoCustomPrompt"
              size="md"
              value={logoPromptDraft}
              onChange={(event) => setLogoPromptDraft(event.target.value)}
              placeholder="Optional details like mascot, mood, symbols, or colors"
              rows={4}
              autoFocus
            />
            <p className="text-ink-3 mt-1 text-xs">
              Added to the base image instructions and saved project summary for
              this generation only.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setIsLogoPromptModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="accent"
              size="sm"
              onClick={handleConfirmGenerateLogo}
              disabled={
                generateProjectLogo.isPending || !canGenerateLogoWithOpenAi
              }
              loading={generateProjectLogo.isPending}
              icon={<Sparkles />}
            >
              {generateProjectLogo.isPending ? 'Generating...' : 'Generate'}
              <Kbd shortcut="cmd+enter" />
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function GeneratedLogoHistoryItem({
  logo,
  isActive,
  onUse,
  onDelete,
}: {
  logo: ProjectLogoHistoryItem;
  isActive: boolean;
  onUse: (logoId: string) => void | Promise<void>;
  onDelete: (logoId: string) => void | Promise<void>;
}) {
  const { data: imageUrl } = useQuery({
    queryKey: ['project-logo-history-image', logo.path],
    queryFn: () => api.fs.getImageUrl(logo.path),
    staleTime: Infinity,
  });

  return (
    <div className="border-glass-border bg-glass-light rounded-lg border p-1.5">
      <button
        type="button"
        className="bg-glass-medium border-glass-border flex aspect-square w-full items-center justify-center overflow-hidden rounded-md border disabled:cursor-default"
        onClick={() => onUse(logo.id)}
        disabled={isActive}
        aria-label="Use generated logo"
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt="Generated logo"
            className="h-full w-full object-cover"
          />
        ) : (
          <Sparkles className="text-ink-3 h-5 w-5" />
        )}
      </button>
      <div className="mt-1.5 flex items-center justify-center gap-1">
        <div className="flex shrink-0 gap-1">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onUse(logo.id)}
            disabled={isActive}
            icon={<Check />}
            aria-label="Use generated logo"
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onDelete(logo.id)}
            icon={<Trash2 />}
            aria-label="Delete generated logo"
          />
        </div>
      </div>
    </div>
  );
}

// --- AI Generation Settings (project-level overrides) ---

function ProjectAiGenerationSettings({
  aiSkillSlots,
  projectPath,
  onUpdate,
}: {
  aiSkillSlots: AiSkillSlotsSetting | null;
  projectPath: string;
  onUpdate: (slots: AiSkillSlotsSetting | null) => void;
}) {
  const enabledBackends = useEnabledBackends();
  const { data: backendsSetting } = useBackendsSetting();
  const { data: backendDefaultModels } = useBackendDefaultModelsSetting();
  const [selectedSlotKey, setSelectedSlotKey] = useState<AiSkillSlotKey>(
    SLOT_DEFINITIONS[0].key,
  );

  const handleSlotUpdate = useCallback(
    (slotKey: AiSkillSlotKey, config: AiSkillSlotConfig | null) => {
      const current = aiSkillSlots ?? {};
      if (config === null) {
        const { [slotKey]: _, ...rest } = current;
        const hasKeys = Object.keys(rest).length > 0;
        onUpdate(hasKeys ? rest : null);
      } else {
        onUpdate({ ...current, [slotKey]: config });
      }
    },
    [aiSkillSlots, onUpdate],
  );

  const selectedSlot = SLOT_DEFINITIONS.find(
    (slot) => slot.key === selectedSlotKey,
  );
  const fallbackBackend = enabledBackends.some(
    (backend) => backend.value === backendsSetting?.defaultBackend,
  )
    ? backendsSetting!.defaultBackend
    : (enabledBackends[0]?.value ?? 'claude-code');
  const fallbackModel = getDefaultModelForBackend({
    backend: fallbackBackend,
    backendDefaultModels,
  });

  return (
    <ListDetailLayout
      list={
        <ProjectAiGenerationRail
          slots={aiSkillSlots ?? {}}
          selectedSlotKey={selectedSlotKey}
          onSelect={setSelectedSlotKey}
        />
      }
      detail={
        selectedSlot ? (
          <SlotDetail
            key={selectedSlot.key}
            label={selectedSlot.label}
            description={selectedSlot.description}
            config={aiSkillSlots?.[selectedSlot.key] ?? null}
            enabledBackends={enabledBackends}
            projectPath={projectPath}
            fallbackBackend={fallbackBackend}
            fallbackModel={fallbackModel}
            emptySummary="Using global default"
            emptyBadgeLabel="Global default"
            toggleLabel="Project override"
            toggleDescription="Turn off to inherit the global AI generation setting for this slot."
            onUpdate={(config) => handleSlotUpdate(selectedSlot.key, config)}
          />
        ) : null
      }
    />
  );
}

function ProjectAiGenerationRail({
  slots,
  selectedSlotKey,
  onSelect,
}: {
  slots: Partial<Record<AiSkillSlotKey, AiSkillSlotConfig>>;
  selectedSlotKey: AiSkillSlotKey;
  onSelect: (slotKey: AiSkillSlotKey) => void;
}) {
  const [width, setWidth] = useState(280);

  return (
    <ListPane
      width={width}
      minWidth={220}
      maxWidth={420}
      onWidthChange={setWidth}
      title="AI Generation"
      count={SLOT_DEFINITIONS.length}
      headerSupplement={
        <p className="text-[12px] leading-relaxed text-white/45">
          Override AI generation by project. Empty slots inherit global
          settings.
        </p>
      }
    >
      <ListGroupHeader label={`Overrides (${SLOT_DEFINITIONS.length})`} />
      {SLOT_DEFINITIONS.map((slot) => (
        <ListItemButton
          key={slot.key}
          label={slot.label}
          isActive={selectedSlotKey === slot.key}
          isDimmed={!slots[slot.key]}
          size="compact"
          onClick={() => onSelect(slot.key)}
          renderIcon={({ isActive, isDimmed }) => (
            <Sparkles
              size={14}
              className="shrink-0"
              style={{
                color: isDimmed
                  ? 'oklch(0.4 0.01 280)'
                  : isActive
                    ? 'oklch(0.78 0.18 295)'
                    : 'oklch(0.78 0.16 295)',
                opacity: isDimmed ? 0.6 : 1,
              }}
            />
          )}
        />
      ))}
    </ListPane>
  );
}
