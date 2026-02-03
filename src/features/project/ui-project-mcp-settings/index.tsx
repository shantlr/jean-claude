import { Server } from 'lucide-react';
import { useState } from 'react';

import {
  useUnifiedMcpServers,
  useActivateMcpServer,
  useDeactivateMcpServer,
  useUpsertProjectMcpOverride,
  useDeleteProjectMcpOverride,
  useSubstituteVariables,
} from '@/hooks/use-mcp-templates';
import { useProject } from '@/hooks/use-projects';

export function ProjectMcpSettings({ projectId }: { projectId: string }) {
  const { data: project } = useProject(projectId);
  const projectPath = project?.path ?? '';

  const { data: servers, isLoading } = useUnifiedMcpServers(
    projectId,
    projectPath,
  );
  const activateMcp = useActivateMcpServer();
  const deactivateMcp = useDeactivateMcpServer();
  const upsertOverride = useUpsertProjectMcpOverride();
  const deleteOverride = useDeleteProjectMcpOverride();
  const substituteVars = useSubstituteVariables();

  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const handleActiveToggle = async (
    server: NonNullable<typeof servers>[number],
    newActive: boolean,
  ) => {
    if (!project) return;

    setPendingAction(`active-${server.name}`);
    try {
      if (newActive) {
        // Activate: need to substitute variables if it's a template
        let command = server.command;
        if (server.template) {
          command = await substituteVars.mutateAsync({
            commandTemplate: server.template.commandTemplate,
            userVariables: server.template.variables,
            context: {
              projectPath: project.path,
              projectName: project.name,
              branchName: '', // Not in worktree context
              mainRepoPath: project.path,
            },
          });
        }
        await activateMcp.mutateAsync({
          projectPath: project.path,
          name: server.name,
          command,
        });
      } else {
        await deactivateMcp.mutateAsync({
          projectPath: project.path,
          name: server.name,
        });
      }
    } finally {
      setPendingAction(null);
    }
  };

  const handleWorktreeToggle = async (
    server: NonNullable<typeof servers>[number],
    newValue: boolean,
  ) => {
    if (!server.template) return;

    setPendingAction(`worktree-${server.name}`);
    try {
      // Default is true (enabled), so if newValue is true, remove override
      if (newValue === true) {
        // Remove override since it matches the default (enabled)
        await deleteOverride.mutateAsync({
          projectId,
          mcpTemplateId: server.template.id,
        });
      } else {
        // Create/update override to disable
        await upsertOverride.mutateAsync({
          projectId,
          mcpTemplateId: server.template.id,
          enabled: newValue,
        });
      }
    } finally {
      setPendingAction(null);
    }
  };

  if (isLoading || !project) {
    return (
      <div>
        <h2 className="mb-4 text-lg font-semibold">MCP Servers</h2>
        <p className="text-sm text-neutral-500">Loading...</p>
      </div>
    );
  }

  if (!servers || servers.length === 0) {
    return (
      <div>
        <h2 className="mb-4 text-lg font-semibold">MCP Servers</h2>
        <div className="rounded-lg border border-dashed border-neutral-700 p-4">
          <div className="flex items-center gap-2 text-neutral-500">
            <Server className="h-4 w-4" />
            <span className="text-sm">
              No MCP servers configured. Add templates in Settings → MCP Servers
              or configure servers via Claude CLI.
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold">MCP Servers</h2>

      <div className="space-y-3">
        {servers.map((server) => {
          const isActivePending = pendingAction === `active-${server.name}`;
          const isWorktreePending = pendingAction === `worktree-${server.name}`;
          const isPending = isActivePending || isWorktreePending;

          return (
            <div
              key={server.name}
              className="rounded-lg border border-neutral-700 bg-neutral-800/50 p-4"
            >
              {/* Header row */}
              <div className="mb-2 flex items-center gap-2">
                <Server className="h-4 w-4 text-neutral-400" />
                <span className="font-medium text-neutral-200">
                  {server.name}
                </span>
                {server.template && (
                  <span className="rounded bg-blue-900/50 px-1.5 py-0.5 text-xs text-blue-400">
                    Template
                  </span>
                )}
              </div>

              {/* Command */}
              <p className="mb-3 truncate text-xs text-neutral-500">
                {server.command}
              </p>

              {/* Toggles row */}
              <div className="flex flex-col gap-3">
                {/* Active now toggle */}
                <label className="flex cursor-pointer items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-neutral-300">
                      Active now
                    </div>
                    <div className="text-xs text-neutral-500">
                      Enable this MCP server for the main project
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={server.isActive}
                    disabled={isPending}
                    onClick={() => handleActiveToggle(server, !server.isActive)}
                    className={`relative h-5 w-9 flex-shrink-0 cursor-pointer rounded-full transition-colors focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-neutral-900 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${
                      server.isActive ? 'bg-green-600' : 'bg-neutral-600'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                        server.isActive ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </label>

                {/* Auto-install on new worktrees toggle (only for templates) */}
                {server.template && (
                  <label className="flex cursor-pointer items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-neutral-300">
                        Auto-install on new worktrees
                      </div>
                      <div className="text-xs text-neutral-500">
                        Automatically configure when creating worktree tasks
                      </div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={server.installOnWorktree}
                      disabled={
                        isPending || !server.template.installOnCreateWorktree
                      }
                      onClick={() =>
                        handleWorktreeToggle(server, !server.installOnWorktree)
                      }
                      title={
                        !server.template.installOnCreateWorktree
                          ? 'This template is not configured for worktree installation'
                          : undefined
                      }
                      className={`relative h-5 w-9 flex-shrink-0 cursor-pointer rounded-full transition-colors focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-neutral-900 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${
                        server.installOnWorktree
                          ? 'bg-blue-600'
                          : 'bg-neutral-600'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                          server.installOnWorktree
                            ? 'translate-x-4'
                            : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </label>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
