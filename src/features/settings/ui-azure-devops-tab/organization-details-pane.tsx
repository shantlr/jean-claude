import { useNavigate } from '@tanstack/react-router';
import {
  ChevronDown,
  ChevronRight,
  Download,
  ExternalLink,
  Folder,
  GitBranch,
  Loader2,
  Trash2,
  X,
} from 'lucide-react';
import { useState } from 'react';

import { useModal } from '@/common/context/modal';
import { useCreateProject } from '@/hooks/use-projects';
import { useDeleteProvider, useProviderDetails } from '@/hooks/use-providers';
import { api, type ProviderProject, type ProviderRepo } from '@/lib/api';
import { getRandomColor } from '@/lib/colors';

import type { Provider } from '../../../../shared/types';

interface CloneConfig {
  parentPath: string;
  folderName: string;
}

function RepoRow({
  repo,
  project,
  provider,
}: {
  repo: ProviderRepo;
  project: ProviderProject;
  provider: Provider;
}) {
  const navigate = useNavigate();
  const createProject = useCreateProject();
  const [showCloneConfig, setShowCloneConfig] = useState(false);
  const [cloneConfig, setCloneConfig] = useState<CloneConfig>({
    parentPath: '',
    folderName: repo.name,
  });
  const [isCloning, setIsCloning] = useState(false);
  const [cloneError, setCloneError] = useState<string | null>(null);

  const orgName = provider.baseUrl.split('/').pop() || '';

  async function handleSelectFolder() {
    const selectedPath = await api.dialog.openDirectory();
    if (selectedPath) {
      setCloneConfig((prev) => ({ ...prev, parentPath: selectedPath }));
    }
  }

  async function handleClone() {
    if (!cloneConfig.parentPath || !cloneConfig.folderName) return;

    setIsCloning(true);
    setCloneError(null);

    const targetPath = `${cloneConfig.parentPath}/${cloneConfig.folderName}`;

    try {
      const result = await api.azureDevOps.cloneRepository({
        orgName,
        projectName: project.name,
        repoName: repo.name,
        targetPath,
      });

      if (result.success) {
        // Create project with all metadata
        const newProject = await createProject.mutateAsync({
          name: repo.name,
          path: targetPath,
          type: 'local',
          color: getRandomColor(),
          repoProviderId: provider.id,
          repoProjectId: project.id,
          repoProjectName: project.name,
          repoId: repo.id,
          repoName: repo.name,
          workItemProviderId: provider.id,
          workItemProjectId: project.id,
          workItemProjectName: project.name,
          updatedAt: new Date().toISOString(),
        });

        // Navigate to the new project
        navigate({
          to: '/projects/$projectId',
          params: { projectId: newProject.id },
        });
      } else {
        setCloneError(result.error || 'Clone failed');
      }
    } catch (err) {
      setCloneError(err instanceof Error ? err.message : 'Clone failed');
    } finally {
      setIsCloning(false);
    }
  }

  if (showCloneConfig) {
    return (
      <div className="rounded-lg border border-neutral-600 bg-neutral-800/50 p-3">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-neutral-500" />
            <span className="text-sm font-medium text-neutral-200">
              {repo.name}
            </span>
          </div>
          <button
            onClick={() => setShowCloneConfig(false)}
            className="cursor-pointer rounded p-1 text-neutral-500 hover:bg-neutral-700 hover:text-neutral-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-400">
              Clone to folder
            </label>
            <div className="flex gap-2">
              <button
                onClick={handleSelectFolder}
                className="flex flex-1 cursor-pointer items-center gap-2 rounded-lg border border-neutral-600 bg-neutral-700/50 px-3 py-2 text-left text-sm hover:border-neutral-500"
              >
                <Folder className="h-4 w-4 shrink-0 text-neutral-500" />
                <span className="flex-1 truncate text-neutral-300">
                  {cloneConfig.parentPath || 'Select parent folder...'}
                </span>
              </button>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-400">
              Folder name
            </label>
            <input
              type="text"
              value={cloneConfig.folderName}
              onChange={(e) =>
                setCloneConfig((prev) => ({
                  ...prev,
                  folderName: e.target.value,
                }))
              }
              className="w-full rounded-lg border border-neutral-600 bg-neutral-700/50 px-3 py-2 text-sm text-white placeholder-neutral-500 focus:border-neutral-500 focus:outline-none"
              placeholder="repo-name"
            />
          </div>

          {cloneError && (
            <div className="rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-2 text-xs text-red-400">
              {cloneError}
            </div>
          )}

          <button
            onClick={handleClone}
            disabled={
              isCloning || !cloneConfig.parentPath || !cloneConfig.folderName
            }
            className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isCloning ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Cloning...
              </>
            ) : (
              <>
                <Download className="h-4 w-4" />
                Clone & Create Project
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-neutral-700/50">
      <GitBranch className="h-3.5 w-3.5 shrink-0 text-neutral-500" />
      <span className="flex-1 truncate text-sm text-neutral-400">
        {repo.name}
      </span>
      <button
        onClick={() => setShowCloneConfig(true)}
        className="shrink-0 cursor-pointer rounded px-2 py-1 text-xs font-medium text-blue-400 hover:bg-blue-500/20"
        title="Clone repository"
      >
        Clone
      </button>
      <a
        href={repo.url}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 rounded p-1 text-neutral-500 hover:bg-neutral-600 hover:text-neutral-300"
        title="Open repository in browser"
      >
        <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}

function ProjectAccordion({
  project,
  repos,
  provider,
}: {
  project: ProviderProject;
  repos: ProviderRepo[];
  provider: Provider;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-neutral-700 bg-neutral-800/30">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left hover:bg-neutral-700/50"
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-neutral-500" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-neutral-500" />
        )}
        <span className="flex-1 truncate text-sm font-medium text-neutral-200">
          {project.name}
        </span>
        <a
          href={project.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="shrink-0 rounded p-1 text-neutral-500 hover:bg-neutral-600 hover:text-neutral-300"
          title="Open project in browser"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </button>

      {isExpanded && (
        <div className="border-t border-neutral-700 px-3 py-2">
          {repos.length === 0 ? (
            <p className="py-1 text-xs text-neutral-500">No repositories</p>
          ) : (
            <div className="flex flex-col gap-1">
              {repos.map((repo) => (
                <RepoRow
                  key={repo.id}
                  repo={repo}
                  project={project}
                  provider={provider}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function OrganizationDetailsPane({
  provider,
  onClose,
}: {
  provider: Provider;
  onClose: () => void;
}) {
  const { data, isLoading, error } = useProviderDetails(provider.id);
  const deleteProvider = useDeleteProvider();
  const modal = useModal();

  const handleDeleteClick = () => {
    modal.confirm({
      title: 'Delete Organization',
      content: (
        <>
          Are you sure you want to delete{' '}
          <span className="font-semibold">{provider.label}</span>? This will
          remove the organization and its credentials. This action cannot be
          undone.
        </>
      ),
      confirmLabel: 'Delete',
      variant: 'danger',
      onConfirm: async () => {
        await deleteProvider.mutateAsync(provider.id);
        onClose();
      },
    });
  };

  return (
    <div className="flex h-full w-96 shrink-0 flex-col rounded-lg border border-neutral-700 bg-neutral-800/50">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-neutral-700 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/20 text-blue-400">
            <svg
              className="h-3.5 w-3.5"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M0 8.877L2.247 5.91l8.405-3.416V.022l7.37 5.393L2.966 8.338v8.225L0 15.707zm24-4.45v14.651l-5.753 4.9-9.303-3.057v3.056l-5.978-7.416 15.057 1.798V5.415z" />
            </svg>
          </div>
          <div>
            <h3 className="font-medium text-neutral-200">{provider.label}</h3>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <a
            href={provider.baseUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-700 hover:text-neutral-300"
            title="Open organization in browser"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
          <button
            onClick={onClose}
            className="cursor-pointer rounded-lg p-2 text-neutral-500 hover:bg-neutral-700 hover:text-neutral-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-neutral-500" />
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {error.message}
          </div>
        )}

        {data && (
          <div className="flex flex-col gap-2">
            <h4 className="mb-1 text-xs font-medium tracking-wide text-neutral-500 uppercase">
              Projects ({data.projects.length})
            </h4>
            {data.projects.length === 0 ? (
              <p className="text-sm text-neutral-500">No projects found</p>
            ) : (
              data.projects.map(({ project, repos }) => (
                <ProjectAccordion
                  key={project.id}
                  project={project}
                  repos={repos}
                  provider={provider}
                />
              ))
            )}
          </div>
        )}
      </div>

      {/* Footer with delete button */}
      <div className="border-t border-neutral-700 px-4 py-3">
        <button
          onClick={handleDeleteClick}
          className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-500/20"
        >
          <Trash2 className="h-4 w-4" />
          Delete Organization
        </button>
      </div>
    </div>
  );
}
