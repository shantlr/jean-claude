import { Plus } from 'lucide-react';

import { usePackageScripts } from '@/hooks/use-package-scripts';
import {
  useProjectCommands,
  useCreateProjectCommand,
  useUpdateProjectCommand,
  useDeleteProjectCommand,
} from '@/hooks/use-project-commands';
import type { UpdateProjectCommand } from '@shared/run-command-types';

import { CommandRow } from './command-row';

export function RunCommandsConfig({
  projectId,
  projectPath,
}: {
  projectId: string;
  projectPath: string;
}) {
  const { data: commands = [] } = useProjectCommands(projectId);
  const { data: scriptsData } = usePackageScripts(projectPath);
  const createCommand = useCreateProjectCommand();
  const updateCommand = useUpdateProjectCommand();
  const deleteCommand = useDeleteProjectCommand();

  const workspaceScripts =
    scriptsData?.workspacePackages?.flatMap((p) => p.scripts) ?? [];
  const suggestions = [...(scriptsData?.scripts ?? []), ...workspaceScripts];

  const handleAddCommand = () => {
    createCommand.mutate({
      projectId,
      command: '',
      ports: [],
    });
  };

  const handleUpdateCommand = (id: string, data: UpdateProjectCommand) => {
    updateCommand.mutate({ id, data });
  };

  const handleDeleteCommand = (id: string) => {
    deleteCommand.mutate(id);
  };

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold">Run Commands</h2>
      <p className="mb-4 text-sm text-neutral-400">
        Configure commands to run from the task page. Each command can have
        ports that will be checked before starting.
      </p>

      <div className="space-y-3">
        {commands.map((cmd) => (
          <CommandRow
            key={cmd.id}
            command={cmd}
            suggestions={suggestions}
            onUpdate={(data) => handleUpdateCommand(cmd.id, data)}
            onDelete={() => handleDeleteCommand(cmd.id)}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={handleAddCommand}
        disabled={createCommand.isPending}
        className="mt-4 flex items-center gap-2 rounded-md border border-dashed border-neutral-600 px-4 py-2 text-sm text-neutral-400 hover:border-neutral-500 hover:text-neutral-300 disabled:opacity-50"
      >
        <Plus className="h-4 w-4" />
        Add Command
      </button>
    </div>
  );
}
