import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import { Button } from '@/common/ui/button';
import { Input } from '@/common/ui/input';
import { Select } from '@/common/ui/select';
import { useProviders, useProviderDetails } from '@/hooks/use-providers';
import { PROJECT_COLORS } from '@/lib/colors';
import type { Provider } from '@shared/types';

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
    formData.repoProviderId || formData.repoProjectId || formData.repoId;

  return (
    <div className="border-glass-border bg-bg-1/30 rounded-lg border">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
        className="hover:bg-glass-medium/30 flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left"
      >
        {isExpanded ? (
          <ChevronDown className="text-ink-3 h-4 w-4 shrink-0" aria-hidden />
        ) : (
          <ChevronRight className="text-ink-3 h-4 w-4 shrink-0" aria-hidden />
        )}
        <span className="text-ink-1 flex-1 text-sm font-medium">
          Repository
        </span>
        <span className="text-ink-3 text-xs">
          {hasValues ? 'Configured' : 'Optional'}
        </span>
      </button>

      {isExpanded && (
        <div className="border-glass-border space-y-3 border-t px-3 py-3">
          {/* Provider */}
          <div>
            <label className="text-ink-2 mb-1 block text-xs font-medium">
              Organization
            </label>
            <Select
              value={formData.repoProviderId || ''}
              options={[
                { value: '', label: 'None' },
                ...azureProviders.map((provider) => ({
                  value: provider.id,
                  label: provider.label,
                })),
              ]}
              onChange={(value) =>
                onChange({
                  repoProviderId: value || null,
                  repoProjectId: null,
                  repoProjectName: null,
                  repoId: null,
                  repoName: null,
                })
              }
              className="w-full justify-between"
            />
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
        <Loader2 className="text-ink-3 h-4 w-4 animate-spin" aria-hidden />
        <span className="sr-only">Loading…</span>
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
        <label className="text-ink-2 mb-1 block text-xs font-medium">
          Project
        </label>
        <Select
          value={formData.repoProjectId || ''}
          options={[
            { value: '', label: 'Select project...' },
            ...projects.map(({ project }) => ({
              value: project.id,
              label: project.name,
            })),
          ]}
          onChange={(value) => {
            const project = projects.find((p) => p.project.id === value);
            onChange({
              repoProjectId: value || null,
              repoProjectName: project?.project.name || null,
              repoId: null,
              repoName: null,
            });
          }}
          className="w-full justify-between"
        />
      </div>

      {/* Repository */}
      {formData.repoProjectId && (
        <div>
          <label className="text-ink-2 mb-1 block text-xs font-medium">
            Repository
          </label>
          <Select
            value={formData.repoId || ''}
            options={[
              { value: '', label: 'Select repository...' },
              ...repos.map((repo) => ({ value: repo.id, label: repo.name })),
            ]}
            onChange={(value) => {
              const repo = repos.find((r) => r.id === value);
              onChange({
                repoId: value || null,
                repoName: repo?.name || null,
              });
            }}
            className="w-full justify-between"
          />
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

  const hasValues = formData.workItemProviderId || formData.workItemProjectId;

  return (
    <div className="border-glass-border bg-bg-1/30 rounded-lg border">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
        className="hover:bg-glass-medium/30 flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left"
      >
        {isExpanded ? (
          <ChevronDown className="text-ink-3 h-4 w-4 shrink-0" aria-hidden />
        ) : (
          <ChevronRight className="text-ink-3 h-4 w-4 shrink-0" aria-hidden />
        )}
        <span className="text-ink-1 flex-1 text-sm font-medium">
          Work Items
        </span>
        <span className="text-ink-3 text-xs">
          {hasValues ? 'Configured' : 'Optional'}
        </span>
      </button>

      {isExpanded && (
        <div className="border-glass-border space-y-3 border-t px-3 py-3">
          {/* Provider */}
          <div>
            <label className="text-ink-2 mb-1 block text-xs font-medium">
              Organization
            </label>
            <Select
              value={formData.workItemProviderId || ''}
              options={[
                { value: '', label: 'None' },
                ...azureProviders.map((provider) => ({
                  value: provider.id,
                  label: provider.label,
                })),
              ]}
              onChange={(value) =>
                onChange({
                  workItemProviderId: value || null,
                  workItemProjectId: null,
                  workItemProjectName: null,
                })
              }
              className="w-full justify-between"
            />
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
        <Loader2 className="text-ink-3 h-4 w-4 animate-spin" aria-hidden />
        <span className="sr-only">Loading…</span>
      </div>
    );
  }

  const projects = data?.projects || [];

  return (
    <div>
      <label className="text-ink-2 mb-1 block text-xs font-medium">
        Project
      </label>
      <Select
        value={formData.workItemProjectId || ''}
        options={[
          { value: '', label: 'Select project...' },
          ...projects.map(({ project }) => ({
            value: project.id,
            label: project.name,
          })),
        ]}
        onChange={(value) => {
          const project = projects.find((p) => p.project.id === value);
          onChange({
            workItemProjectId: value || null,
            workItemProjectName: project?.project.name || null,
          });
        }}
        className="w-full justify-between"
      />
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
          className="text-ink-1 mb-1 block text-sm font-medium"
        >
          Name
        </label>
        <Input
          id="name"
          size="md"
          value={formData.name}
          onChange={(e) => onChange({ name: e.target.value })}
          autoComplete="off"
          required
        />
      </div>

      {/* Path */}
      <div>
        <label className="text-ink-1 mb-1 block text-sm font-medium">
          Path
        </label>
        <div className="border-glass-border bg-bg-1/50 rounded-lg border px-3 py-2">
          <span className="text-ink-2 truncate text-sm">{formData.path}</span>
        </div>
      </div>

      {/* Color */}
      <div>
        <label className="text-ink-1 mb-1 block text-sm font-medium">
          Color
        </label>
        <div
          className="flex flex-wrap gap-2"
          role="radiogroup"
          aria-label="Project color"
        >
          {PROJECT_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              role="radio"
              aria-checked={formData.color === color}
              aria-label={`Select color ${color}`}
              onClick={() => onChange({ color })}
              className={`h-8 w-8 cursor-pointer rounded-lg transition-transform ${
                formData.color === color
                  ? 'ring-offset-bg-0 ring-2 ring-white ring-offset-2'
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
      <Button
        type="submit"
        variant="primary"
        size="md"
        disabled={isSubmitting}
        loading={isSubmitting}
        className="w-full"
      >
        {isSubmitting ? 'Adding…' : 'Add Project'}
      </Button>
    </form>
  );
}
