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
        <h2 className="text-ink-0 mb-4 text-lg font-semibold">MCP Servers</h2>
        <p className="text-ink-3 text-sm">Loading...</p>
      </div>
    );
  }

  if (!servers || servers.length === 0) {
    return (
      <div>
        <h2 className="text-ink-0 mb-4 text-lg font-semibold">MCP Servers</h2>
        <div className="border-glass-border rounded-lg border border-dashed p-4">
          <div className="text-ink-3 flex items-center gap-2">
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
      <h2 className="text-ink-0 mb-4 text-lg font-semibold">MCP Servers</h2>

      <div className="space-y-3">
        {servers.map((server) => {
          const isActivePending = pendingAction === `active-${server.name}`;
          const isWorktreePending = pendingAction === `worktree-${server.name}`;
          const isPending = isActivePending || isWorktreePending;

          return (
            <div
              key={server.name}
              className="border-glass-border bg-bg-1/50 rounded-lg border p-4"
            >
              {/* Header row */}
              <div className="mb-2 flex items-center gap-2">
                <Server className="text-ink-2 h-4 w-4" />
                <span className="text-ink-1 font-medium">{server.name}</span>
                {server.template && (
                  <span className="text-acc-ink bg-acc/50 rounded px-1.5 py-0.5 text-xs">
                    Template
                  </span>
                )}
              </div>

              {/* Command */}
              <p className="text-ink-3 mb-3 truncate text-xs">
                {server.command}
              </p>

              {/* Toggles row */}
              <div className="flex flex-col gap-3">
                {/* Active now toggle */}
                <label className="hover:bg-glass-medium/50 flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 transition-colors">
                  <div>
                    <div className="text-ink-1 text-sm font-medium">
                      Active now
                    </div>
                    <div className="text-ink-3 text-xs">
                      Enable this MCP server for the main project
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={server.isActive}
                    disabled={isPending}
                    onClick={() => handleActiveToggle(server, !server.isActive)}
                    className={`focus:ring-acc focus:ring-offset-bg-0 relative h-5 w-9 flex-shrink-0 cursor-pointer rounded-full transition-colors focus:ring-2 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${
                      server.isActive ? 'bg-status-done' : 'bg-bg-3'
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
                  <label className="hover:bg-glass-medium/50 flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 transition-colors">
                    <div>
                      <div className="text-ink-1 text-sm font-medium">
                        Auto-install on new worktrees
                      </div>
                      <div className="text-ink-3 text-xs">
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
                      className={`focus:ring-acc focus:ring-offset-bg-0 relative h-5 w-9 flex-shrink-0 cursor-pointer rounded-full transition-colors focus:ring-2 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${
                        server.installOnWorktree ? 'bg-acc' : 'bg-bg-3'
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
