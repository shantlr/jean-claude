import {
  ChevronDown,
  ChevronRight,
  Download,
  ExternalLink,
  Folder,
  GitBranch,
  Loader2,
  X,
} from 'lucide-react';
import { useState } from 'react';

import { useProviders, useProviderDetails } from '@/hooks/use-providers';
import { api, ProviderProject, ProviderRepo } from '@/lib/api';

import type { Provider } from '../../../../shared/types';

export interface CloneResult {
  path: string;
  repoProviderId: string;
  repoProjectId: string;
  repoProjectName: string;
  repoId: string;
  repoName: string;
  orgName: string;
}

interface CloneConfig {
  parentPath: string;
  folderName: string;
}

function RepoRow({
  repo,
  project,
  provider,
  onCloneSuccess,
}: {
  repo: ProviderRepo;
  project: ProviderProject;
  provider: Provider;
  onCloneSuccess: (result: CloneResult) => void;
}) {
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
        onCloneSuccess({
          path: targetPath,
          repoProviderId: provider.id,
          repoProjectId: project.id,
          repoProjectName: project.name,
          repoId: repo.id,
          repoName: repo.name,
          orgName,
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
            <GitBranch className="h-4 w-4 text-neutral-500" aria-hidden />
            <span className="text-sm font-medium text-neutral-200">
              {repo.name}
            </span>
          </div>
          <button
            onClick={() => setShowCloneConfig(false)}
            aria-label="Cancel clone"
            className="cursor-pointer rounded p-1 text-neutral-500 hover:bg-neutral-700 hover:text-neutral-300"
          >
            <X className="h-4 w-4" aria-hidden />
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
                <Folder className="h-4 w-4 shrink-0 text-neutral-500" aria-hidden />
                <span className="flex-1 truncate text-neutral-300">
                  {cloneConfig.parentPath || 'Select parent folder…'}
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
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Cloning…
              </>
            ) : (
              <>
                <Download className="h-4 w-4" aria-hidden />
                Clone Repository
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-neutral-700/50">
      <GitBranch className="h-3.5 w-3.5 shrink-0 text-neutral-500" aria-hidden />
      <span className="flex-1 truncate text-sm text-neutral-400">
        {repo.name}
      </span>
      <button
        onClick={() => setShowCloneConfig(true)}
        className="shrink-0 cursor-pointer rounded px-2 py-1 text-xs font-medium text-blue-400 hover:bg-blue-500/20"
        aria-label={`Clone ${repo.name}`}
      >
        Clone
      </button>
      <a
        href={repo.url}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 rounded p-1 text-neutral-500 hover:bg-neutral-600 hover:text-neutral-300"
        aria-label={`Open ${repo.name} in browser`}
      >
        <ExternalLink className="h-3 w-3" aria-hidden />
      </a>
    </div>
  );
}

function ProjectAccordion({
  project,
  repos,
  provider,
  onCloneSuccess,
}: {
  project: ProviderProject;
  repos: ProviderRepo[];
  provider: Provider;
  onCloneSuccess: (result: CloneResult) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-neutral-700 bg-neutral-800/30">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
        className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left hover:bg-neutral-700/50"
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-neutral-500" aria-hidden />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-neutral-500" aria-hidden />
        )}
        <span className="flex-1 truncate text-sm font-medium text-neutral-200">
          {project.name}
        </span>
        <span className="shrink-0 text-xs text-neutral-500">
          {repos.length} {repos.length === 1 ? 'repo' : 'repos'}
        </span>
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
                  onCloneSuccess={onCloneSuccess}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ProviderContent({
  provider,
  onCloneSuccess,
}: {
  provider: Provider;
  onCloneSuccess: (result: CloneResult) => void;
}) {
  const { data, isLoading, error } = useProviderDetails(provider.id);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-neutral-500" aria-hidden />
        <span className="sr-only">Loading…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-400">
        {error.message}
      </div>
    );
  }

  if (!data || data.projects.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-neutral-500">
        No projects found
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {data.projects.map(({ project, repos }) => (
        <ProjectAccordion
          key={project.id}
          project={project}
          repos={repos}
          provider={provider}
          onCloneSuccess={onCloneSuccess}
        />
      ))}
    </div>
  );
}

export function CloneRepoPane({
  onClose,
  onCloneSuccess,
}: {
  onClose: () => void;
  onCloneSuccess: (result: CloneResult) => void;
}) {
  const { data: providers, isLoading: isLoadingProviders } = useProviders();
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(
    null,
  );

  // Filter to only Azure DevOps providers
  const azureProviders =
    providers?.filter((p) => p.type === 'azure-devops') || [];

  // Auto-select first provider if only one
  const effectiveProviderId =
    selectedProviderId ||
    (azureProviders.length === 1 ? azureProviders[0].id : null);
  const selectedProvider = azureProviders.find(
    (p) => p.id === effectiveProviderId,
  );

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
              aria-hidden
            >
              <path d="M0 8.877L2.247 5.91l8.405-3.416V.022l7.37 5.393L2.966 8.338v8.225L0 15.707zm24-4.45v14.651l-5.753 4.9-9.303-3.057v3.056l-5.978-7.416 15.057 1.798V5.415z" />
            </svg>
          </div>
          <h3 className="font-medium text-neutral-200">Clone Repository</h3>
        </div>
        <button
          onClick={onClose}
          aria-label="Close pane"
          className="cursor-pointer rounded-lg p-2 text-neutral-500 hover:bg-neutral-700 hover:text-neutral-300"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {isLoadingProviders && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-neutral-500" aria-hidden />
            <span className="sr-only">Loading…</span>
          </div>
        )}

        {!isLoadingProviders && azureProviders.length === 0 && (
          <div className="py-8 text-center">
            <p className="mb-2 text-sm text-neutral-400">
              No Azure DevOps organizations configured
            </p>
            <p className="text-xs text-neutral-500">
              Go to Settings → Azure DevOps to add an organization
            </p>
          </div>
        )}

        {!isLoadingProviders && azureProviders.length > 0 && (
          <div className="space-y-4">
            {/* Provider selector (only if multiple) */}
            {azureProviders.length > 1 && (
              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-400">
                  Organization
                </label>
                <select
                  value={effectiveProviderId || ''}
                  onChange={(e) => setSelectedProviderId(e.target.value || null)}
                  className="w-full rounded-lg border border-neutral-600 bg-neutral-700/50 px-3 py-2 text-sm text-white focus:border-neutral-500 focus:outline-none"
                >
                  <option value="">Select organization...</option>
                  {azureProviders.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Projects/Repos list */}
            {selectedProvider && (
              <div>
                <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
                  Projects
                </h4>
                <ProviderContent
                  provider={selectedProvider}
                  onCloneSuccess={onCloneSuccess}
                />
              </div>
            )}

            {!selectedProvider && azureProviders.length > 1 && (
              <p className="py-4 text-center text-sm text-neutral-500">
                Select an organization to browse repositories
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
