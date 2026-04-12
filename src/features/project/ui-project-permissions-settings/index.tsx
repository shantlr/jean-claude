import { useCallback } from 'react';

import {
  PermissionsEditor,
  type FlatRule,
} from '@/features/common/ui-permissions-editor';
import {
  useProjectPermissions,
  useAddProjectPermissionRule,
  useRemoveProjectPermissionRule,
  useEditProjectPermissionRule,
} from '@/hooks/use-project-permissions';
import type { PermissionAction } from '@shared/permission-types';

export function ProjectPermissionsSettings({
  projectPath,
}: {
  projectPath: string;
}) {
  const { data: permissions, isLoading } = useProjectPermissions(projectPath);
  const addRule = useAddProjectPermissionRule(projectPath);
  const removeRule = useRemoveProjectPermissionRule(projectPath);
  const editRule = useEditProjectPermissionRule(projectPath);

  const handleAdd = useCallback(
    async (params: {
      toolName: string;
      input: Record<string, unknown>;
      action: PermissionAction;
    }) => {
      await addRule.mutateAsync(params);
    },
    [addRule],
  );

  const handleRemove = useCallback(
    (rule: FlatRule) => {
      removeRule.mutate(
        {
          tool: rule.tool,
          pattern: rule.pattern ?? undefined,
        },
        {
          onError: (err: Error) => {
            console.error('Failed to remove permission rule:', err.message);
          },
        },
      );
    },
    [removeRule],
  );

  const handleEdit = useCallback(
    (
      rule: FlatRule,
      update: { pattern: string | null; action: PermissionAction },
    ) => {
      editRule.mutate({
        tool: rule.tool,
        oldPattern: rule.pattern ?? undefined,
        newPattern: update.pattern ?? undefined,
        action: update.action,
      });
    },
    [editRule],
  );

  return (
    <PermissionsEditor
      permissions={permissions}
      isLoading={isLoading}
      isBusy={addRule.isPending || removeRule.isPending || editRule.isPending}
      onAdd={handleAdd}
      onRemove={handleRemove}
      onEdit={handleEdit}
      title="Permissions"
      description="Project-level permission rules. These take precedence over global rules."
      emptyTitle="No project permission rules configured."
      emptyDescription="Add a rule above to control tool access for this project."
    />
  );
}
