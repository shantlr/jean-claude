import { useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, Folder, FolderOpen } from 'lucide-react';
import type { FormEvent } from 'react';
import { useState } from 'react';

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

function AddProjectPage() {
  const navigate = useNavigate();
  const createProject = useCreateProject();

  const [pageState, setPageState] = useState<PageState>('source-selection');
  const [formData, setFormData] = useState<ProjectFormData | null>(null);
  const [showClonePane, setShowClonePane] = useState(false);
  const [isFromClone, setIsFromClone] = useState(false);

  const { data: detectedProjects = [], isLoading: isLoadingDetected } =
    useQuery({
      queryKey: ['detected-projects'],
      queryFn: () => api.projects.getDetected(),
    });

  async function handleSelectLocalFolder() {
    const selectedPath = await api.dialog.openDirectory();
    if (!selectedPath) return;

    const name = await inferProjectName(selectedPath);
    const color = getRandomColor();

    setFormData({
      name,
      path: selectedPath,
      color,
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
      // Pre-fill work item settings with same provider/project
      workItemProviderId: result.repoProviderId,
      workItemProjectId: result.repoProjectId,
      workItemProjectName: result.repoProjectName,
    });
    setIsFromClone(true);
    setPageState('form');
  }

  async function handleSelectDetectedProject(project: DetectedProject) {
    const name = await inferProjectName(project.path);
    const color = getRandomColor();

    setFormData({
      name,
      path: project.path,
      color,
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

  // Form state
  if (pageState === 'form' && formData) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="w-full max-w-md">
          <button
            type="button"
            onClick={handleBack}
            className="mb-6 flex cursor-pointer items-center gap-2 text-neutral-400 transition-colors hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>

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

  // Source selection state
  return (
    <div className="flex h-full w-full overflow-hidden p-2">
      {/* Main content */}
      <div className="flex w-full flex-1 items-center justify-center gap-8 p-6">
        {/* Add Project Section */}
        <div className="w-80">
          <h1 className="mb-6 text-center text-2xl font-bold">Add Project</h1>
          <div className="grid gap-4">
            <button
              type="button"
              onClick={handleSelectLocalFolder}
              className="flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-neutral-700 bg-neutral-800/50 p-6 transition-colors hover:border-neutral-500 hover:bg-neutral-800"
            >
              <Folder className="h-10 w-10 text-neutral-400" />
              <span className="font-medium">Local Folder</span>
            </button>

            <button
              type="button"
              onClick={handleShowClonePane}
              className="flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-neutral-700 bg-neutral-800/50 p-6 transition-colors hover:border-blue-500/50 hover:bg-neutral-800"
            >
              <div className="flex h-10 w-10 items-center justify-center text-blue-400">
                <svg
                  className="h-8 w-8"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M0 8.877L2.247 5.91l8.405-3.416V.022l7.37 5.393L2.966 8.338v8.225L0 15.707zm24-4.45v14.651l-5.753 4.9-9.303-3.057v3.056l-5.978-7.416 15.057 1.798V5.415z" />
                </svg>
              </div>
              <span className="font-medium">Clone from Azure DevOps</span>
            </button>
          </div>
        </div>

        {/* Detected Projects Section */}
        {!isLoadingDetected && detectedProjects.length > 0 && (
          <div className="flex w-80 flex-col self-stretch">
            <h2 className="mb-3 text-sm font-medium text-neutral-400">
              Detected from Claude Code
            </h2>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="space-y-2">
                {detectedProjects.map((project) => (
                  <button
                    key={project.path}
                    type="button"
                    onClick={() => handleSelectDetectedProject(project)}
                    className="flex w-full cursor-pointer items-center gap-3 rounded-lg border border-neutral-700 bg-neutral-800/50 px-4 py-3 text-left transition-colors hover:border-neutral-500 hover:bg-neutral-800"
                  >
                    <FolderOpen className="h-5 w-5 shrink-0 text-neutral-500" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">
                        {decodeURIComponent(project.name)}
                      </div>
                      <div className="truncate text-xs text-neutral-500">
                        {project.path}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
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
  if (pkg?.name) {
    return pkg.name;
  }
  // Fallback: extract folder name from path
  return folderPath.split(/[/\\]/).pop() || 'Untitled';
}
