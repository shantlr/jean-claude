import { useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, Folder, FolderOpen, Search } from 'lucide-react';
import type { FormEvent } from 'react';
import { useState } from 'react';

import { Button } from '@/common/ui/button';
import { Input } from '@/common/ui/input';
import {
  AddProjectForm,
  type ProjectFormData,
} from '@/features/project/ui-add-project-form';
import {
  CloneRepoPane,
  type CloneResult,
} from '@/features/project/ui-clone-repo-pane';
import { useCreateProject } from '@/hooks/use-projects';
import { api, type DetectedProject } from '@/lib/api';
import { getRandomColor } from '@/lib/colors';

export const Route = createFileRoute('/projects/new')({
  component: AddProjectPage,
});

type PageState = 'source-selection' | 'form';

// Badge config defined once at module level — not recreated on every render
const SOURCE_BADGE_CONFIG: Record<
  string,
  { className: string; label: string }
> = {
  'claude-code': {
    className:
      'rounded px-1.5 py-0.5 text-[10px] font-medium bg-amber-500/15 text-amber-400',
    label: 'Claude Code',
  },
  opencode: {
    className:
      'rounded px-1.5 py-0.5 text-[10px] font-medium bg-teal-500/15 text-teal-400',
    label: 'OpenCode',
  },
  codex: {
    className:
      'rounded px-1.5 py-0.5 text-[10px] font-medium bg-violet-500/15 text-violet-400',
    label: 'Codex',
  },
};

function AddProjectPage() {
  const navigate = useNavigate();
  const createProject = useCreateProject();

  const [pageState, setPageState] = useState<PageState>('source-selection');
  const [formData, setFormData] = useState<ProjectFormData | null>(null);
  const [showClonePane, setShowClonePane] = useState(false);
  const [isFromClone, setIsFromClone] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const { data: detectedProjects = [], isLoading: isLoadingDetected } =
    useQuery({
      queryKey: ['detected-projects'],
      queryFn: () => api.projects.getDetected(),
    });

  const filteredProjects = detectedProjects.filter((p) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.path.toLowerCase().includes(q) ||
      p.displayPath.toLowerCase().includes(q)
    );
  });

  const hasDetected = detectedProjects.length > 0;
  const showDetectedSection = isLoadingDetected || hasDetected;

  async function handleSelectLocalFolder() {
    const selectedPath = await api.dialog.openDirectory();
    if (!selectedPath) return;

    const name = await inferProjectName(selectedPath);
    setFormData({
      name,
      path: selectedPath,
      color: getRandomColor(),
      repoProviderId: null,
      repoProjectId: null,
      repoProjectName: null,
      repoId: null,
      repoName: null,
      workItemProviderId: null,
      workItemProjectId: null,
      workItemProjectName: null,
    });
    setIsFromClone(false);
    setPageState('form');
  }

  function handleShowClonePane() {
    setShowClonePane(true);
  }

  function handleCloneSuccess(result: CloneResult) {
    setShowClonePane(false);
    setFormData({
      name: result.repoName,
      path: result.path,
      color: getRandomColor(),
      repoProviderId: result.repoProviderId,
      repoProjectId: result.repoProjectId,
      repoProjectName: result.repoProjectName,
      repoId: result.repoId,
      repoName: result.repoName,
      workItemProviderId: result.repoProviderId,
      workItemProjectId: result.repoProjectId,
      workItemProjectName: result.repoProjectName,
    });
    setIsFromClone(true);
    setPageState('form');
  }

  async function handleSelectDetectedProject(project: DetectedProject) {
    const name = await inferProjectName(project.path);
    setFormData({
      name,
      path: project.path,
      color: getRandomColor(),
      repoId: null,
      repoName: null,
      repoProviderId: null,
      repoProjectId: null,
      repoProjectName: null,
      workItemProviderId: null,
      workItemProjectId: null,
      workItemProjectName: null,
    });
    setPageState('form');
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!formData) return;
    const project = await createProject.mutateAsync({
      name: formData.name,
      path: formData.path,
      type: 'local',
      color: formData.color,
      repoProviderId: formData.repoProviderId,
      repoProjectId: formData.repoProjectId,
      repoProjectName: formData.repoProjectName,
      repoId: formData.repoId,
      repoName: formData.repoName,
      workItemProviderId: formData.workItemProviderId,
      workItemProjectId: formData.workItemProjectId,
      workItemProjectName: formData.workItemProjectName,
      updatedAt: new Date().toISOString(),
    });
    navigate({ to: '/projects/$projectId', params: { projectId: project.id } });
  }

  function handleFormChange(updates: Partial<ProjectFormData>) {
    if (!formData) return;
    setFormData({ ...formData, ...updates });
  }

  function handleBack() {
    setPageState('source-selection');
    setFormData(null);
    setIsFromClone(false);
  }

  // ── Form state ──────────────────────────────────────────────────────────────
  if (pageState === 'form' && formData) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="w-full max-w-md">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBack}
            icon={<ArrowLeft />}
            className="mb-6"
          >
            Back
          </Button>
          <h1 className="mb-6 text-2xl font-bold">
            {isFromClone ? 'Configure Cloned Project' : 'Add Local Project'}
          </h1>
          <AddProjectForm
            formData={formData}
            onChange={handleFormChange}
            onSubmit={handleSubmit}
            isSubmitting={createProject.isPending}
            repoSectionExpanded={isFromClone}
            workItemSectionExpanded={false}
          />
        </div>
      </div>
    );
  }

  // ── Source selection state ───────────────────────────────────────────────────
  return (
    <div className="flex h-full w-full overflow-hidden">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden p-6">
        {/* Header — title + action buttons */}
        <div className="mb-4 flex shrink-0 items-center justify-between">
          <h1 className="text-2xl font-bold">Add Project</h1>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="md"
              onClick={handleSelectLocalFolder}
              icon={<Folder />}
            >
              Local Folder
            </Button>
            <Button
              variant="secondary"
              size="md"
              onClick={handleShowClonePane}
              icon={
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M0 8.877L2.247 5.91l8.405-3.416V.022l7.37 5.393L2.966 8.338v8.225L0 15.707zm24-4.45v14.651l-5.753 4.9-9.303-3.057v3.056l-5.978-7.416 15.057 1.798V5.415z" />
                </svg>
              }
            >
              Clone from Azure DevOps
            </Button>
          </div>
        </div>

        {/* Search box — only shown when detected projects exist */}
        {hasDetected && (
          <div className="mb-3 shrink-0">
            <Input
              size="md"
              icon={<Search />}
              aria-label="Filter detected projects"
              placeholder="Filter projects…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        )}

        {/* Scrollable 3-column grid */}
        {showDetectedSection && (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="grid grid-cols-3 gap-3">
              {/* Loading skeletons — 6 fills 2 rows */}
              {isLoadingDetected &&
                [0, 1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className="h-[88px] animate-pulse rounded-lg bg-neutral-800/50"
                  />
                ))}

              {/* Project cards */}
              {!isLoadingDetected &&
                filteredProjects.map((project) => (
                  <button
                    key={project.path}
                    type="button"
                    aria-label={`Add project: ${project.name}`}
                    onClick={() => handleSelectDetectedProject(project)}
                    className="flex min-h-[88px] w-full cursor-pointer flex-col items-start rounded-lg border border-neutral-700 bg-neutral-800/50 p-3 text-left transition-colors hover:border-neutral-600 hover:bg-neutral-800"
                  >
                    <div className="flex items-center gap-1.5 overflow-hidden">
                      <FolderOpen className="h-3.5 w-3.5 shrink-0 text-neutral-500" />
                      <span className="truncate text-sm font-medium">
                        {project.name}
                      </span>
                    </div>
                    {project.sources.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {project.sources.map((source) => {
                          const badge = SOURCE_BADGE_CONFIG[source];
                          if (!badge) return null;
                          return (
                            <span key={source} className={badge.className}>
                              {badge.label}
                            </span>
                          );
                        })}
                      </div>
                    )}
                    <div className="mt-auto w-full truncate text-xs text-neutral-500">
                      {project.displayPath}
                    </div>
                  </button>
                ))}

              {/* Empty filter state */}
              {!isLoadingDetected &&
                hasDetected &&
                filteredProjects.length === 0 && (
                  <p className="col-span-3 py-8 text-center text-sm text-neutral-500">
                    No projects match &ldquo;{searchQuery}&rdquo;
                  </p>
                )}
            </div>
          </div>
        )}
      </div>

      {/* Clone pane */}
      {showClonePane && (
        <CloneRepoPane
          onClose={() => setShowClonePane(false)}
          onCloneSuccess={handleCloneSuccess}
        />
      )}
    </div>
  );
}

async function inferProjectName(folderPath: string): Promise<string> {
  const pkg = await api.fs.readPackageJson(folderPath);
  if (pkg?.name) return pkg.name;
  return folderPath.split(/[/\\]/).pop() || 'Untitled';
}
