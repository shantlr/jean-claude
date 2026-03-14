import { Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactElement } from 'react';

import { AVAILABLE_BACKENDS } from '@/features/agent/ui-backend-selector';
import { ProjectMcpSettings } from '@/features/project/ui-project-mcp-settings';
import { ProjectPipelineSettings } from '@/features/project/ui-project-pipeline-settings';
import { ProjectSkillsSettings } from '@/features/project/ui-project-skills-settings';
import { RepoLink } from '@/features/project/ui-repo-link';
import { RunCommandsConfig } from '@/features/project/ui-run-commands-config';
import { WorkItemsLink } from '@/features/project/ui-work-items-link';
import {
  useProject,
  useProjectBranches,
  useUpdateProject,
  useDeleteProject,
} from '@/hooks/use-projects';
import { useBackendsSetting } from '@/hooks/use-settings';
import { api } from '@/lib/api';
import { PROJECT_COLORS } from '@/lib/colors';
import { useNavigationStore } from '@/stores/navigation';
import { useToastStore } from '@/stores/toasts';
import type { AgentBackendType } from '@shared/agent-backend-types';
import type { ProjectPriority } from '@shared/feed-types';

export type ProjectSettingsMenuItem =
  | 'details'
  | 'autocomplete'
  | 'integrations'
  | 'pipelines'
  | 'run-commands'
  | 'skills'
  | 'mcp-overrides'
  | 'danger-zone';

function assertNever(value: never): never {
  throw new Error(`Unhandled project settings menu item: ${String(value)}`);
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
  const { data: branches, isLoading: branchesLoading } =
    useProjectBranches(projectId);
  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();
  const clearProjectNavHistoryState = useNavigationStore(
    (s) => s.clearProjectNavHistoryState,
  );
  const addToast = useToastStore((s) => s.addToast);

  const [name, setName] = useState('');
  const [color, setColor] = useState('');
  const [defaultBranch, setDefaultBranch] = useState('');
  const [defaultAgentBackend, setDefaultAgentBackend] =
    useState<AgentBackendType | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [completionContext, setCompletionContext] = useState('');
  const [priority, setPriority] = useState<ProjectPriority>('normal');
  const [isGeneratingContext, setIsGeneratingContext] = useState(false);

  // Resolve enabled backends from global settings
  const { data: backendsSetting } = useBackendsSetting();
  const enabledBackends = useMemo(
    () =>
      AVAILABLE_BACKENDS.filter((b) =>
        (backendsSetting?.enabledBackends ?? ['claude-code']).includes(b.value),
      ),
    [backendsSetting],
  );

  // Sync local state when project loads or changes
  useEffect(() => {
    if (project) {
      setName(project.name);
      setColor(project.color);
      setDefaultBranch(project.defaultBranch ?? '');
      setDefaultAgentBackend(project.defaultAgentBackend);
      setPriority(project.priority ?? 'normal');
      setCompletionContext(project.completionContext ?? '');
    }
  }, [project]);

  // Initialize default branch when branches load
  useEffect(() => {
    if (branches && branches.length > 0 && !defaultBranch) {
      const initial =
        project?.defaultBranch ??
        (branches.includes('main')
          ? 'main'
          : branches.includes('master')
            ? 'master'
            : branches[0]);
      setDefaultBranch(initial);
    }
  }, [branches, project?.defaultBranch, defaultBranch]);

  useEffect(() => {
    if (menuItem !== 'danger-zone' && showDeleteConfirm) {
      setShowDeleteConfirm(false);
    }
  }, [menuItem, showDeleteConfirm]);

  if (!project) {
    return (
      <div className="flex h-full items-center justify-center text-neutral-500">
        Loading...
      </div>
    );
  }

  async function handleSave() {
    await updateProject.mutateAsync({
      id: projectId,
      data: {
        name,
        color,
        defaultBranch: defaultBranch || null,
        defaultAgentBackend,
        priority,
        completionContext: completionContext || null,
      },
    });
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

  const hasChanges =
    name !== project.name ||
    color !== project.color ||
    defaultBranch !== (project.defaultBranch ?? '') ||
    defaultAgentBackend !== project.defaultAgentBackend ||
    priority !== (project.priority ?? 'normal') ||
    completionContext !== (project.completionContext ?? '');

  let content: ReactElement;

  switch (menuItem) {
    case 'details':
      content = (
        <div className="space-y-6">
          <div>
            <label
              htmlFor="name"
              className="mb-1 block text-sm font-medium text-neutral-300"
            >
              Name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-white placeholder-neutral-500 focus:border-neutral-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-300">
              Path
            </label>
            <div className="rounded-lg border border-neutral-700 bg-neutral-800/50 px-3 py-2">
              <span className="text-sm text-neutral-400">{project.path}</span>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-300">
              Type
            </label>
            <span className="inline-block rounded-md bg-neutral-700 px-2 py-1 text-sm">
              {project.type === 'local' ? 'Local folder' : 'Git provider'}
            </span>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-300">
              Color
            </label>
            <div className="flex flex-wrap gap-2">
              {PROJECT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`h-8 w-8 cursor-pointer rounded-lg transition-all ${
                    color === c
                      ? 'ring-2 ring-white ring-offset-2 ring-offset-neutral-900'
                      : 'hover:scale-110'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div>
            <label
              htmlFor="defaultBranch"
              className="mb-1 block text-sm font-medium text-neutral-300"
            >
              Default merge branch
            </label>
            <select
              id="defaultBranch"
              value={defaultBranch}
              onChange={(e) => setDefaultBranch(e.target.value)}
              disabled={branchesLoading || !branches?.length}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-white focus:border-neutral-500 focus:outline-none disabled:opacity-50"
            >
              {branchesLoading ? (
                <option>Loading...</option>
              ) : branches?.length === 0 ? (
                <option>No branches found</option>
              ) : (
                branches?.map((branch) => (
                  <option key={branch} value={branch}>
                    {branch}
                  </option>
                ))
              )}
            </select>
            <p className="mt-1 text-xs text-neutral-500">
              The branch that worktrees will merge into
            </p>
          </div>

          <div>
            <label
              htmlFor="defaultAgentBackend"
              className="mb-1 block text-sm font-medium text-neutral-300"
            >
              Default agent backend
            </label>
            <select
              id="defaultAgentBackend"
              value={defaultAgentBackend ?? ''}
              onChange={(e) => {
                const val = e.target.value;
                setDefaultAgentBackend(
                  val === '' ? null : (val as AgentBackendType),
                );
              }}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-white focus:border-neutral-500 focus:outline-none"
            >
              <option value="">
                Use global default
                {backendsSetting?.defaultBackend
                  ? ` (${AVAILABLE_BACKENDS.find((b) => b.value === backendsSetting.defaultBackend)?.label ?? backendsSetting.defaultBackend})`
                  : ''}
              </option>
              {enabledBackends.map((b) => (
                <option key={b.value} value={b.value}>
                  {b.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-neutral-500">
              The agent backend used for new tasks in this project
            </p>
          </div>

          <div>
            <label
              htmlFor="priority"
              className="mb-1 block text-sm font-medium text-neutral-300"
            >
              Feed priority
            </label>
            <select
              id="priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value as ProjectPriority)}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-white focus:border-neutral-500 focus:outline-none"
            >
              <option value="high">High</option>
              <option value="normal">Normal</option>
              <option value="low">Low</option>
            </select>
            <p className="mt-1 text-xs text-neutral-500">
              Affects how tasks from this project are ranked in the feed
            </p>
          </div>
        </div>
      );
      break;
    case 'autocomplete':
      content = (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-neutral-200">
            Autocomplete Context
          </h2>
          <p className="text-xs text-neutral-500">
            Provides context to the autocomplete model when completing prompts
            in this project. Describe what the project is about and include
            example prompts.
          </p>
          <textarea
            value={completionContext}
            onChange={(e) => setCompletionContext(e.target.value)}
            placeholder={`Project: An e-commerce platform for artisan goods\n\nExample prompts:\n- add filtering by price range to the product catalog\n- fix the checkout flow when cart has mixed shipping`}
            rows={8}
            className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white placeholder-neutral-600 focus:border-neutral-500 focus:outline-none"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleGenerateContext}
              disabled={isGeneratingContext}
              className="cursor-pointer rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm text-neutral-300 transition-colors hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isGeneratingContext
                ? 'Generating...'
                : 'Generate from task history'}
            </button>
          </div>
        </div>
      );
      break;
    case 'integrations':
      content = (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-neutral-200">
            Integrations
          </h2>
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
    case 'danger-zone':
      content = (
        <div>
          <h2 className="mb-4 text-lg font-semibold text-red-400">
            Danger Zone
          </h2>
          {showDeleteConfirm ? (
            <div className="rounded-lg border border-red-900 bg-red-950/50 p-4">
              <p className="mb-4 text-sm text-neutral-300">
                Are you sure you want to delete this project? This action cannot
                be undone.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleteProject.isPending}
                  className="cursor-pointer rounded-lg bg-red-600 px-4 py-2 font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                >
                  {deleteProject.isPending ? 'Deleting...' : 'Delete Project'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="cursor-pointer rounded-lg bg-neutral-700 px-4 py-2 font-medium transition-colors hover:bg-neutral-600"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-red-900 bg-red-950/50 px-4 py-2 text-red-400 transition-colors hover:bg-red-950"
            >
              <Trash2 className="h-4 w-4" />
              Delete Project
            </button>
          )}
        </div>
      );
      break;
    default:
      assertNever(menuItem);
  }

  return (
    <div className="space-y-6">
      {content}
      {hasChanges && (
        <button
          type="button"
          onClick={handleSave}
          disabled={updateProject.isPending}
          className="w-full cursor-pointer rounded-lg bg-white px-4 py-2 font-medium text-black transition-colors hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {updateProject.isPending ? 'Saving...' : 'Save Changes'}
        </button>
      )}
    </div>
  );
}
