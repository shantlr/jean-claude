import { Plus, X } from 'lucide-react';
import { type MouseEvent, useState } from 'react';

import { Button } from '@/common/ui/button';
import { IconButton } from '@/common/ui/icon-button';
import { WorkItemsBrowser } from '@/features/agent/ui-work-items-browser';
import type { AzureDevOpsWorkItem } from '@/lib/api';

export function WorkItemsEditor({
  projectId,
  providerId,
  azureProjectId,
  azureProjectName,
  workItemIds,
  workItemUrls,
  onUpdate,
}: {
  projectId: string;
  providerId: string;
  azureProjectId: string;
  azureProjectName: string;
  workItemIds: string[];
  workItemUrls: string[];
  onUpdate: (update: {
    workItemIds: string[] | null;
    workItemUrls: string[] | null;
  }) => void;
  onClose: () => void;
}) {
  const [showBrowser, setShowBrowser] = useState(false);

  function handleRemove(index: number) {
    const newIds = workItemIds.filter((_, i) => i !== index);
    const newUrls = workItemUrls.filter((_, i) => i !== index);
    onUpdate({
      workItemIds: newIds.length > 0 ? newIds : null,
      workItemUrls: newUrls.length > 0 ? newUrls : null,
    });
  }

  function handleAdd(wi: AzureDevOpsWorkItem) {
    const wiId = String(wi.id);
    if (workItemIds.includes(wiId)) {
      setShowBrowser(false);
      return;
    }
    onUpdate({
      workItemIds: [...workItemIds, wiId],
      workItemUrls: [...workItemUrls, wi.url],
    });
    setShowBrowser(false);
  }

  return (
    <div className="space-y-2">
      {/* Current work items */}
      {workItemIds.length > 0 ? (
        <div className="space-y-1">
          {workItemIds.map((id, index) => {
            const url = workItemUrls[index];
            return (
              <div
                key={id}
                className="hover:bg-glass-medium flex items-center justify-between rounded px-2 py-1"
              >
                <span className="text-ink-1 text-sm">
                  {url ? (
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-acc-ink hover:underline"
                    >
                      #{id}
                    </a>
                  ) : (
                    `#${id}`
                  )}
                </span>
                <IconButton
                  onClick={(e: MouseEvent<HTMLButtonElement>) => {
                    e.stopPropagation();
                    handleRemove(index);
                  }}
                  icon={<X />}
                  size="sm"
                  variant="ghost"
                  tooltip={`Remove work item #${id}`}
                />
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-ink-2 text-sm">No linked work items</p>
      )}

      {/* Add work item */}
      {showBrowser ? (
        <WorkItemsBrowser
          localProjectId={projectId}
          providerId={providerId}
          projectId={azureProjectId}
          projectName={azureProjectName}
          onSelect={handleAdd}
          onClose={() => setShowBrowser(false)}
        />
      ) : (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowBrowser(true)}
          icon={<Plus />}
        >
          Add Work Item
        </Button>
      )}
    </div>
  );
}
