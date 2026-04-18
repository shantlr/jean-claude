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

import { Button } from '@/common/ui/button';
import { IconButton } from '@/common/ui/icon-button';
import { Input } from '@/common/ui/input';
import { Select } from '@/common/ui/select';
import { useProviders, useProviderDetails } from '@/hooks/use-providers';
import { api, ProviderProject, ProviderRepo } from '@/lib/api';
import type { Provider } from '@shared/types';

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
      <div className="border-glass-border bg-bg-1/50 rounded-lg border p-3">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GitBranch className="text-ink-3 h-4 w-4" aria-hidden />
            <span className="text-ink-1 text-sm font-medium">{repo.name}</span>
          </div>
          <IconButton
            variant="ghost"
            size="sm"
            onClick={() => setShowCloneConfig(false)}
            icon={<X />}
            tooltip="Cancel clone"
          />
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-ink-2 mb-1 block text-xs font-medium">
              Clone to folder
            </label>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="md"
                onClick={handleSelectFolder}
                icon={<Folder />}
                className="flex-1 justify-start"
              >
                <span className="text-ink-1 flex-1 truncate">
                  {cloneConfig.parentPath || 'Select parent folder…'}
                </span>
              </Button>
            </div>
          </div>

          <div>
            <label className="text-ink-2 mb-1 block text-xs font-medium">
              Folder name
            </label>
            <Input
              size="md"
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
            variant="primary"
            size="md"
            onClick={handleClone}
            disabled={
              isCloning || !cloneConfig.parentPath || !cloneConfig.folderName
            }
            loading={isCloning}
            icon={<Download />}
            className="w-full"
          >
            {isCloning ? 'Cloning…' : 'Clone Repository'}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="hover:bg-glass-medium/50 flex items-center gap-2 rounded px-2 py-1.5">
      <GitBranch className="text-ink-3 h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="text-ink-2 flex-1 truncate text-sm">{repo.name}</span>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setShowCloneConfig(true)}
        className="text-acc-ink shrink-0"
        aria-label={`Clone ${repo.name}`}
      >
        Clone
      </Button>
      <a
        href={repo.url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-ink-3 hover:bg-bg-3 hover:text-ink-1 shrink-0 rounded p-1"
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
    <div className="border-glass-border bg-bg-1/30 rounded-lg border">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
        className="hover:bg-glass-medium/50 flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left"
      >
        {isExpanded ? (
          <ChevronDown className="text-ink-3 h-4 w-4 shrink-0" aria-hidden />
        ) : (
          <ChevronRight className="text-ink-3 h-4 w-4 shrink-0" aria-hidden />
        )}
        <span className="text-ink-1 flex-1 truncate text-sm font-medium">
          {project.name}
        </span>
        <span className="text-ink-3 shrink-0 text-xs">
          {repos.length} {repos.length === 1 ? 'repo' : 'repos'}
        </span>
      </button>

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
        <Loader2 className="text-ink-3 h-6 w-6 animate-spin" aria-hidden />
        <span className="sr-only">Loading…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-status-fail/10 text-status-fail border-status-fail/50 rounded-lg border px-3 py-2 text-sm">
        {error.message}
      </div>
    );
  }

  if (!data || data.projects.length === 0) {
    return (
      <p className="text-ink-3 py-4 text-center text-sm">No projects found</p>
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
    <div className="border-glass-border bg-bg-1/50 flex h-full w-96 shrink-0 flex-col rounded-lg border">
      {/* Header */}
      <div className="border-glass-border flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="bg-acc/20 text-acc-ink flex h-7 w-7 items-center justify-center rounded-lg">
            <svg
              className="h-3.5 w-3.5"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden
            >
              <path d="M0 8.877L2.247 5.91l8.405-3.416V.022l7.37 5.393L2.966 8.338v8.225L0 15.707zm24-4.45v14.651l-5.753 4.9-9.303-3.057v3.056l-5.978-7.416 15.057 1.798V5.415z" />
            </svg>
          </div>
          <h3 className="text-ink-1 font-medium">Clone Repository</h3>
        </div>
        <IconButton
          variant="ghost"
          size="sm"
          onClick={onClose}
          icon={<X />}
          tooltip="Close pane"
        />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {isLoadingProviders && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="text-ink-3 h-6 w-6 animate-spin" aria-hidden />
            <span className="sr-only">Loading…</span>
          </div>
        )}

        {!isLoadingProviders && azureProviders.length === 0 && (
          <div className="py-8 text-center">
            <p className="text-ink-2 mb-2 text-sm">
              No Azure DevOps organizations configured
            </p>
            <p className="text-ink-3 text-xs">
              Go to Settings → Azure DevOps to add an organization
            </p>
          </div>
        )}

        {!isLoadingProviders && azureProviders.length > 0 && (
          <div className="space-y-4">
            {/* Provider selector (only if multiple) */}
            {azureProviders.length > 1 && (
              <div>
                <label className="text-ink-2 mb-1 block text-xs font-medium">
                  Organization
                </label>
                <Select
                  value={effectiveProviderId || ''}
                  options={[
                    { value: '', label: 'Select organization...' },
                    ...azureProviders.map((provider) => ({
                      value: provider.id,
                      label: provider.label,
                    })),
                  ]}
                  onChange={(value) => setSelectedProviderId(value || null)}
                  className="w-full justify-between"
                />
              </div>
            )}

            {/* Projects/Repos list */}
            {selectedProvider && (
              <div>
                <h4 className="text-ink-3 mb-2 text-xs font-medium tracking-wide uppercase">
                  Projects
                </h4>
                <ProviderContent
                  provider={selectedProvider}
                  onCloneSuccess={onCloneSuccess}
                />
              </div>
            )}

            {!selectedProvider && azureProviders.length > 1 && (
              <p className="text-ink-3 py-4 text-center text-sm">
                Select an organization to browse repositories
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
