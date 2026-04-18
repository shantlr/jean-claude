import { ListTodo, Link2Off } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Button } from '@/common/ui/button';
import { Checkbox } from '@/common/ui/checkbox';
import { Select } from '@/common/ui/select';
import { useUpdateProject } from '@/hooks/use-projects';
import { useProviders, useProviderDetails } from '@/hooks/use-providers';
import { useToastStore } from '@/stores/toasts';
import type { Project } from '@shared/types';

export function WorkItemsLink({ project }: { project: Project }) {
  const { data: providers } = useProviders();
  const updateProject = useUpdateProject();
  const addToast = useToastStore((s) => s.addToast);

  const azureProviders = useMemo(
    () => (providers ?? []).filter((p) => p.type === 'azure-devops'),
    [providers],
  );

  const isLinked = !!project.workItemProjectId;

  const [selectedProviderId, setSelectedProviderId] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState('');

  const { data: providerDetails, isLoading: detailsLoading } =
    useProviderDetails(selectedProviderId, !!selectedProviderId);

  const projects = providerDetails?.projects ?? [];

  function handleProviderChange(providerId: string) {
    setSelectedProviderId(providerId);
    setSelectedProjectId('');
  }

  async function handleLink() {
    const providerProject = projects.find(
      (p) => p.project.id === selectedProjectId,
    );
    if (!providerProject) return;

    await updateProject.mutateAsync({
      id: project.id,
      data: {
        workItemProviderId: selectedProviderId,
        workItemProjectId: selectedProjectId,
        workItemProjectName: providerProject.project.name,
      },
    });

    setSelectedProviderId('');
    setSelectedProjectId('');
  }

  async function handleUnlink() {
    await updateProject.mutateAsync({
      id: project.id,
      data: {
        workItemProviderId: null,
        workItemProjectId: null,
        workItemProjectName: null,
      },
    });
  }

  const canLink = selectedProviderId && selectedProjectId;

  if (azureProviders.length === 0) {
    return (
      <div className="border-glass-border rounded-lg border border-dashed p-4">
        <div className="text-ink-3 flex items-center gap-2">
          <ListTodo className="h-4 w-4" />
          <span className="text-sm">
            Add an Azure DevOps provider in Settings to link work items
          </span>
        </div>
      </div>
    );
  }

  async function handleToggleShowInFeed(checked: boolean) {
    try {
      await updateProject.mutateAsync({
        id: project.id,
        data: { showWorkItemsInFeed: checked },
      });
    } catch {
      addToast({
        message: 'Failed to update feed visibility setting',
        type: 'error',
      });
    }
  }

  if (isLinked) {
    return (
      <div className="border-glass-border bg-bg-0 rounded-lg border p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ListTodo className="text-acc-ink h-4 w-4" />
            <div>
              <p className="text-ink-1 text-sm font-medium">Work Items</p>
              <p className="text-ink-2 text-sm">
                {azureProviders.find((p) => p.id === project.workItemProviderId)
                  ?.label ?? 'Unknown'}{' '}
                / {project.workItemProjectName}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleUnlink}
            disabled={updateProject.isPending}
            loading={updateProject.isPending}
            icon={!updateProject.isPending ? <Link2Off /> : undefined}
          >
            Unlink
          </Button>
        </div>
        <div className="border-line-soft mt-3 border-t pt-3">
          <Checkbox
            checked={!!project.showWorkItemsInFeed}
            onChange={handleToggleShowInFeed}
            disabled={updateProject.isPending}
            label="Show in feed"
            description="Display assigned work items from this project in the feed list"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="border-glass-border bg-bg-0 rounded-lg border p-4">
      <div className="mb-3 flex items-center gap-2">
        <ListTodo className="text-ink-2 h-4 w-4" />
        <p className="text-ink-1 text-sm font-medium">Link Work Items</p>
      </div>

      <div className="space-y-3">
        {/* Organization (Provider) */}
        <Select
          value={selectedProviderId}
          options={[
            { value: '', label: 'Select organization...' },
            ...azureProviders.map((provider) => ({
              value: provider.id,
              label: provider.label,
            })),
          ]}
          onChange={handleProviderChange}
          className="w-full justify-between"
        />

        {/* Project */}
        <Select
          value={selectedProjectId}
          options={[
            {
              value: '',
              label: detailsLoading ? 'Loading projects…' : 'Select project...',
            },
            ...projects.map((p) => ({
              value: p.project.id,
              label: p.project.name,
            })),
          ]}
          onChange={setSelectedProjectId}
          disabled={!selectedProviderId || detailsLoading}
          className="w-full justify-between"
        />

        {/* Link button */}
        <Button
          variant="primary"
          size="md"
          onClick={handleLink}
          disabled={!canLink || updateProject.isPending}
          loading={updateProject.isPending}
          className="w-full"
        >
          {updateProject.isPending ? 'Linking...' : 'Link Work Items'}
        </Button>
      </div>
    </div>
  );
}
