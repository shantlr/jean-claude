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
import { Button } from '@/common/ui/button';
import { IconButton } from '@/common/ui/icon-button';
import { Input } from '@/common/ui/input';
import { useCreateProject } from '@/hooks/use-projects';
import { useDeleteProvider, useProviderDetails } from '@/hooks/use-providers';
import { api, type ProviderProject, type ProviderRepo } from '@/lib/api';
import { getRandomColor } from '@/lib/colors';
import type { Provider } from '@shared/types';

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
      <div className="border-glass-border bg-bg-1/50 rounded-lg border p-3">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GitBranch className="text-ink-3 h-4 w-4" />
            <span className="text-ink-1 text-sm font-medium">{repo.name}</span>
          </div>
          <IconButton
            onClick={() => setShowCloneConfig(false)}
            icon={<X />}
            size="sm"
          />
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-ink-2 mb-1 block text-xs font-medium">
              Clone to folder
            </label>
            <div className="flex gap-2">
              <Button
                onClick={handleSelectFolder}
                className="border-glass-border bg-glass-medium/50 hover:border-glass-border-strong flex flex-1 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm"
              >
                <Folder className="text-ink-3 h-4 w-4 shrink-0" />
                <span className="text-ink-1 flex-1 truncate">
                  {cloneConfig.parentPath || 'Select parent folder...'}
                </span>
              </Button>
            </div>
          </div>

          <div>
            <label className="text-ink-2 mb-1 block text-xs font-medium">
              Folder name
            </label>
            <Input
              value={cloneConfig.folderName}
              onChange={(e) =>
                setCloneConfig((prev) => ({
                  ...prev,
                  folderName: e.target.value,
                }))
              }
              placeholder="repo-name"
            />
          </div>

          {cloneError && (
            <div className="bg-status-fail/10 text-status-fail border-status-fail/50 rounded-lg border px-3 py-2 text-xs">
              {cloneError}
            </div>
          )}

          <Button
            onClick={handleClone}
            disabled={
              isCloning || !cloneConfig.parentPath || !cloneConfig.folderName
            }
            loading={isCloning}
            variant="primary"
            icon={<Download />}
            className="w-full"
          >
            {isCloning ? 'Cloning...' : 'Clone & Create Project'}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="hover:bg-glass-medium/50 flex items-center gap-2 rounded px-2 py-1.5">
      <GitBranch className="text-ink-3 h-3.5 w-3.5 shrink-0" />
      <span className="text-ink-2 flex-1 truncate text-sm">{repo.name}</span>
      <Button
        onClick={() => setShowCloneConfig(true)}
        variant="ghost"
        size="sm"
      >
        Clone
      </Button>
      <a
        href={repo.url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-ink-3 hover:bg-bg-3 hover:text-ink-1 shrink-0 rounded p-1"
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
    <div className="border-glass-border bg-bg-1/30 rounded-lg border">
      <Button
        onClick={() => setIsExpanded(!isExpanded)}
        className="hover:bg-glass-medium/50 flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left"
      >
        {isExpanded ? (
          <ChevronDown className="text-ink-3 h-4 w-4 shrink-0" />
        ) : (
          <ChevronRight className="text-ink-3 h-4 w-4 shrink-0" />
        )}
        <span className="text-ink-1 flex-1 truncate text-sm font-medium">
          {project.name}
        </span>
        <a
          href={project.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-ink-3 hover:bg-bg-3 hover:text-ink-1 shrink-0 rounded p-1"
          title="Open project in browser"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </Button>

      {isExpanded && (
        <div className="border-glass-border border-t px-3 py-2">
          {repos.length === 0 ? (
            <p className="text-ink-3 py-1 text-xs">No repositories</p>
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
    <div className="border-glass-border bg-bg-1/50 flex h-full w-96 shrink-0 flex-col rounded-lg border">
      {/* Header */}
      <div className="border-glass-border flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="bg-acc/20 text-acc-ink flex h-7 w-7 items-center justify-center rounded-lg">
            <svg
              className="h-3.5 w-3.5"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M0 8.877L2.247 5.91l8.405-3.416V.022l7.37 5.393L2.966 8.338v8.225L0 15.707zm24-4.45v14.651l-5.753 4.9-9.303-3.057v3.056l-5.978-7.416 15.057 1.798V5.415z" />
            </svg>
          </div>
          <div>
            <h3 className="text-ink-1 font-medium">{provider.label}</h3>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <a
            href={provider.baseUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-ink-3 hover:bg-glass-medium hover:text-ink-1 rounded-lg p-2"
            title="Open organization in browser"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
          <IconButton
            onClick={onClose}
            icon={<X />}
            tooltip="Close"
            size="sm"
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="text-ink-3 h-6 w-6 animate-spin" />
          </div>
        )}

        {error && (
          <div className="bg-status-fail/10 text-status-fail border-status-fail/50 rounded-lg border px-3 py-2 text-sm">
            {error.message}
          </div>
        )}

        {data && (
          <div className="flex flex-col gap-2">
            <h4 className="text-ink-3 mb-1 text-xs font-medium tracking-wide uppercase">
              Projects ({data.projects.length})
            </h4>
            {data.projects.length === 0 ? (
              <p className="text-ink-3 text-sm">No projects found</p>
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
      <div className="border-glass-border border-t px-4 py-3">
        <Button
          onClick={handleDeleteClick}
          variant="danger"
          icon={<Trash2 />}
          className="w-full"
        >
          Delete Organization
        </Button>
      </div>
    </div>
  );
}
