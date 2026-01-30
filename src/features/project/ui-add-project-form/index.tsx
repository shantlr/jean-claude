import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import { useProviders, useProviderDetails } from '@/hooks/use-providers';
import { PROJECT_COLORS } from '@/lib/colors';

import type { Provider } from '../../../../shared/types';

export interface ProjectFormData {
  name: string;
  path: string;
  color: string;
  // Repository settings (optional)
  repoProviderId: string | null;
  repoProjectId: string | null;
  repoProjectName: string | null;
  repoId: string | null;
  repoName: string | null;
  // Work item settings (optional)
  workItemProviderId: string | null;
  workItemProjectId: string | null;
  workItemProjectName: string | null;
}

function RepoSection({
  formData,
  onChange,
  defaultExpanded = false,
}: {
  formData: ProjectFormData;
  onChange: (updates: Partial<ProjectFormData>) => void;
  defaultExpanded?: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const { data: providers } = useProviders();

  // Filter to only Azure DevOps providers
  const azureProviders =
    providers?.filter((p) => p.type === 'azure-devops') || [];

  const selectedProvider = azureProviders.find(
    (p) => p.id === formData.repoProviderId,
  );

  const hasValues =
    formData.repoProviderId ||
    formData.repoProjectId ||
    formData.repoId;

  return (
    <div className="rounded-lg border border-neutral-700 bg-neutral-800/30">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left hover:bg-neutral-700/30"
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-neutral-500" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-neutral-500" />
        )}
        <span className="flex-1 text-sm font-medium text-neutral-300">
          Repository
        </span>
        <span className="text-xs text-neutral-500">
          {hasValues ? 'Configured' : 'Optional'}
        </span>
      </button>

      {isExpanded && (
        <div className="space-y-3 border-t border-neutral-700 px-3 py-3">
          {/* Provider */}
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-400">
              Organization
            </label>
            <select
              value={formData.repoProviderId || ''}
              onChange={(e) =>
                onChange({
                  repoProviderId: e.target.value || null,
                  // Clear dependent fields when provider changes
                  repoProjectId: null,
                  repoProjectName: null,
                  repoId: null,
                  repoName: null,
                })
              }
              className="w-full rounded-lg border border-neutral-600 bg-neutral-700/50 px-3 py-2 text-sm text-white focus:border-neutral-500 focus:outline-none"
            >
              <option value="">None</option>
              {azureProviders.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.label}
                </option>
              ))}
            </select>
          </div>

          {/* Project and Repo selectors */}
          {selectedProvider && (
            <RepoProjectSelector
              provider={selectedProvider}
              formData={formData}
              onChange={onChange}
            />
          )}
        </div>
      )}
    </div>
  );
}

function RepoProjectSelector({
  provider,
  formData,
  onChange,
}: {
  provider: Provider;
  formData: ProjectFormData;
  onChange: (updates: Partial<ProjectFormData>) => void;
}) {
  const { data, isLoading } = useProviderDetails(provider.id);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-2">
        <Loader2 className="h-4 w-4 animate-spin text-neutral-500" />
      </div>
    );
  }

  const projects = data?.projects || [];
  const selectedProject = projects.find(
    (p) => p.project.id === formData.repoProjectId,
  );
  const repos = selectedProject?.repos || [];

  return (
    <>
      {/* Project */}
      <div>
        <label className="mb-1 block text-xs font-medium text-neutral-400">
          Project
        </label>
        <select
          value={formData.repoProjectId || ''}
          onChange={(e) => {
            const project = projects.find((p) => p.project.id === e.target.value);
            onChange({
              repoProjectId: e.target.value || null,
              repoProjectName: project?.project.name || null,
              // Clear repo when project changes
              repoId: null,
              repoName: null,
            });
          }}
          className="w-full rounded-lg border border-neutral-600 bg-neutral-700/50 px-3 py-2 text-sm text-white focus:border-neutral-500 focus:outline-none"
        >
          <option value="">Select project...</option>
          {projects.map(({ project }) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      </div>

      {/* Repository */}
      {formData.repoProjectId && (
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-400">
            Repository
          </label>
          <select
            value={formData.repoId || ''}
            onChange={(e) => {
              const repo = repos.find((r) => r.id === e.target.value);
              onChange({
                repoId: e.target.value || null,
                repoName: repo?.name || null,
              });
            }}
            className="w-full rounded-lg border border-neutral-600 bg-neutral-700/50 px-3 py-2 text-sm text-white focus:border-neutral-500 focus:outline-none"
          >
            <option value="">Select repository...</option>
            {repos.map((repo) => (
              <option key={repo.id} value={repo.id}>
                {repo.name}
              </option>
            ))}
          </select>
        </div>
      )}
    </>
  );
}

function WorkItemSection({
  formData,
  onChange,
  defaultExpanded = false,
}: {
  formData: ProjectFormData;
  onChange: (updates: Partial<ProjectFormData>) => void;
  defaultExpanded?: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const { data: providers } = useProviders();

  // Filter to only Azure DevOps providers
  const azureProviders =
    providers?.filter((p) => p.type === 'azure-devops') || [];

  const selectedProvider = azureProviders.find(
    (p) => p.id === formData.workItemProviderId,
  );

  const hasValues =
    formData.workItemProviderId || formData.workItemProjectId;

  return (
    <div className="rounded-lg border border-neutral-700 bg-neutral-800/30">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left hover:bg-neutral-700/30"
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-neutral-500" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-neutral-500" />
        )}
        <span className="flex-1 text-sm font-medium text-neutral-300">
          Work Items
        </span>
        <span className="text-xs text-neutral-500">
          {hasValues ? 'Configured' : 'Optional'}
        </span>
      </button>

      {isExpanded && (
        <div className="space-y-3 border-t border-neutral-700 px-3 py-3">
          {/* Provider */}
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-400">
              Organization
            </label>
            <select
              value={formData.workItemProviderId || ''}
              onChange={(e) =>
                onChange({
                  workItemProviderId: e.target.value || null,
                  // Clear dependent fields when provider changes
                  workItemProjectId: null,
                  workItemProjectName: null,
                })
              }
              className="w-full rounded-lg border border-neutral-600 bg-neutral-700/50 px-3 py-2 text-sm text-white focus:border-neutral-500 focus:outline-none"
            >
              <option value="">None</option>
              {azureProviders.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.label}
                </option>
              ))}
            </select>
          </div>

          {/* Project selector */}
          {selectedProvider && (
            <WorkItemProjectSelector
              provider={selectedProvider}
              formData={formData}
              onChange={onChange}
            />
          )}
        </div>
      )}
    </div>
  );
}

function WorkItemProjectSelector({
  provider,
  formData,
  onChange,
}: {
  provider: Provider;
  formData: ProjectFormData;
  onChange: (updates: Partial<ProjectFormData>) => void;
}) {
  const { data, isLoading } = useProviderDetails(provider.id);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-2">
        <Loader2 className="h-4 w-4 animate-spin text-neutral-500" />
      </div>
    );
  }

  const projects = data?.projects || [];

  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-neutral-400">
        Project
      </label>
      <select
        value={formData.workItemProjectId || ''}
        onChange={(e) => {
          const project = projects.find((p) => p.project.id === e.target.value);
          onChange({
            workItemProjectId: e.target.value || null,
            workItemProjectName: project?.project.name || null,
          });
        }}
        className="w-full rounded-lg border border-neutral-600 bg-neutral-700/50 px-3 py-2 text-sm text-white focus:border-neutral-500 focus:outline-none"
      >
        <option value="">Select project...</option>
        {projects.map(({ project }) => (
          <option key={project.id} value={project.id}>
            {project.name}
          </option>
        ))}
      </select>
    </div>
  );
}

export function AddProjectForm({
  formData,
  onChange,
  onSubmit,
  isSubmitting,
  repoSectionExpanded = false,
  workItemSectionExpanded = false,
}: {
  formData: ProjectFormData;
  onChange: (updates: Partial<ProjectFormData>) => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  isSubmitting: boolean;
  repoSectionExpanded?: boolean;
  workItemSectionExpanded?: boolean;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {/* Name */}
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
          value={formData.name}
          onChange={(e) => onChange({ name: e.target.value })}
          className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-white placeholder-neutral-500 focus:border-neutral-500 focus:outline-none"
          required
        />
      </div>

      {/* Path */}
      <div>
        <label className="mb-1 block text-sm font-medium text-neutral-300">
          Path
        </label>
        <div className="rounded-lg border border-neutral-700 bg-neutral-800/50 px-3 py-2">
          <span className="truncate text-sm text-neutral-400">
            {formData.path}
          </span>
        </div>
      </div>

      {/* Color */}
      <div>
        <label className="mb-1 block text-sm font-medium text-neutral-300">
          Color
        </label>
        <div className="flex flex-wrap gap-2">
          {PROJECT_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => onChange({ color })}
              className={`h-8 w-8 cursor-pointer rounded-lg transition-all ${
                formData.color === color
                  ? 'ring-2 ring-white ring-offset-2 ring-offset-neutral-900'
                  : 'hover:scale-110'
              }`}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      </div>

      {/* Repository section */}
      <RepoSection
        formData={formData}
        onChange={onChange}
        defaultExpanded={repoSectionExpanded}
      />

      {/* Work Items section */}
      <WorkItemSection
        formData={formData}
        onChange={onChange}
        defaultExpanded={workItemSectionExpanded}
      />

      {/* Submit */}
      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full cursor-pointer rounded-lg bg-white px-4 py-2 font-medium text-black transition-colors hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isSubmitting ? 'Adding...' : 'Add Project'}
      </button>
    </form>
  );
}
