import { Link2, Link2Off, Loader2 } from 'lucide-react';
import { useMemo, useState } from 'react';

import { useUpdateProject } from '@/hooks/use-projects';
import { useProviders, useProviderDetails } from '@/hooks/use-providers';

import type { Project } from '../../../../shared/types';

export function RepoLink({ project }: { project: Project }) {
  const { data: providers } = useProviders();
  const updateProject = useUpdateProject();

  const azureProviders = useMemo(
    () => (providers ?? []).filter((p) => p.type === 'azure-devops'),
    [providers],
  );

  const isLinked = !!project.repoId;

  const [selectedProviderId, setSelectedProviderId] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [selectedRepoId, setSelectedRepoId] = useState('');

  const { data: providerDetails, isLoading: detailsLoading } =
    useProviderDetails(selectedProviderId, !!selectedProviderId);

  const projects = useMemo(
    () => providerDetails?.projects ?? [],
    [providerDetails?.projects],
  );

  const repos = useMemo(() => {
    const entry = projects.find((p) => p.project.id === selectedProjectId);
    return entry?.repos ?? [];
  }, [projects, selectedProjectId]);

  function handleProviderChange(providerId: string) {
    setSelectedProviderId(providerId);
    setSelectedProjectId('');
    setSelectedRepoId('');
  }

  function handleProjectChange(projectId: string) {
    setSelectedProjectId(projectId);
    setSelectedRepoId('');
  }

  async function handleLink() {
    const providerProject = projects.find(
      (p) => p.project.id === selectedProjectId,
    );
    const repo = repos.find((r) => r.id === selectedRepoId);
    if (!providerProject || !repo) return;

    await updateProject.mutateAsync({
      id: project.id,
      data: {
        repoProviderId: selectedProviderId,
        repoProjectId: selectedProjectId,
        repoProjectName: providerProject.project.name,
        repoId: selectedRepoId,
        repoName: repo.name,
      },
    });

    setSelectedProviderId('');
    setSelectedProjectId('');
    setSelectedRepoId('');
  }

  async function handleUnlink() {
    await updateProject.mutateAsync({
      id: project.id,
      data: {
        repoProviderId: null,
        repoProjectId: null,
        repoProjectName: null,
        repoId: null,
        repoName: null,
      },
    });
  }

  const canLink = selectedProviderId && selectedProjectId && selectedRepoId;

  if (azureProviders.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-700 p-4">
        <div className="flex items-center gap-2 text-neutral-500">
          <Link2 className="h-4 w-4" />
          <span className="text-sm">
            Add an Azure DevOps provider in Settings to link a repository
          </span>
        </div>
      </div>
    );
  }

  if (isLinked) {
    return (
      <div className="rounded-lg border border-neutral-700 bg-neutral-900 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-blue-400" />
            <div>
              <p className="text-sm font-medium text-neutral-200">
                Repository
              </p>
              <p className="text-sm text-neutral-400">
                {azureProviders.find((p) => p.id === project.repoProviderId)
                  ?.label ?? 'Unknown'}{' '}
                / {project.repoProjectName} / {project.repoName}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleUnlink}
            disabled={updateProject.isPending}
            className="flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-sm text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-200 disabled:opacity-50"
          >
            {updateProject.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Link2Off className="h-3 w-3" />
            )}
            Unlink
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-neutral-700 bg-neutral-900 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Link2 className="h-4 w-4 text-neutral-400" />
        <p className="text-sm font-medium text-neutral-200">
          Link Repository
        </p>
      </div>

      <div className="space-y-3">
        {/* Organization (Provider) */}
        <select
          value={selectedProviderId}
          onChange={(e) => handleProviderChange(e.target.value)}
          className="w-full rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white focus:border-neutral-500 focus:outline-none"
        >
          <option value="">Select organization...</option>
          {azureProviders.map((provider) => (
            <option key={provider.id} value={provider.id}>
              {provider.label}
            </option>
          ))}
        </select>

        {/* Project */}
        <select
          value={selectedProjectId}
          onChange={(e) => handleProjectChange(e.target.value)}
          disabled={!selectedProviderId || detailsLoading}
          className="w-full rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white focus:border-neutral-500 focus:outline-none disabled:opacity-50"
        >
          <option value="">
            {detailsLoading ? 'Loading projects...' : 'Select project...'}
          </option>
          {projects.map((p) => (
            <option key={p.project.id} value={p.project.id}>
              {p.project.name}
            </option>
          ))}
        </select>

        {/* Repository */}
        <select
          value={selectedRepoId}
          onChange={(e) => setSelectedRepoId(e.target.value)}
          disabled={!selectedProjectId}
          className="w-full rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white focus:border-neutral-500 focus:outline-none disabled:opacity-50"
        >
          <option value="">Select repository...</option>
          {repos.map((repo) => (
            <option key={repo.id} value={repo.id}>
              {repo.name}
            </option>
          ))}
        </select>

        {/* Link button */}
        <button
          type="button"
          onClick={handleLink}
          disabled={!canLink || updateProject.isPending}
          className="w-full cursor-pointer rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {updateProject.isPending ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              Linking...
            </span>
          ) : (
            'Link Repository'
          )}
        </button>
      </div>
    </div>
  );
}
