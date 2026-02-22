import clsx from 'clsx';
import { FileText, Play, Square } from 'lucide-react';

import { Dropdown, DropdownItem, DropdownDivider } from '@/common/ui/dropdown';
import { useProjectCommands } from '@/hooks/use-project-commands';
import { useRunCommands } from '@/hooks/use-run-commands';
import { useTaskMessagesStore } from '@/stores/task-messages';

import { KillPortsModal } from './kill-ports-modal';

export function RunButton({
  taskId,
  projectId,
  workingDir,
  onOpenLogs,
  isLogsPaneOpen,
}: {
  taskId: string;
  projectId: string;
  workingDir: string;
  onOpenLogs: () => void;
  isLogsPaneOpen: boolean;
}) {
  const { data: commands = [] } = useProjectCommands(projectId);
  const {
    status,
    statusByCommandId,
    isStartingCommandId,
    isStoppingCommandId,
    startCommand,
    stopCommand,
    portsInUseError,
    confirmKillPorts,
    dismissPortsError,
  } = useRunCommands({ taskId, projectId, workingDir });

  const runCommandLogs =
    useTaskMessagesStore((state) => state.tasks[taskId]?.runCommandLogs) ?? {};

  // Don't show button if no commands configured
  if (commands.length === 0) {
    return null;
  }

  const runningCount = Object.values(statusByCommandId).filter(
    (c) => c.status === 'running',
  ).length;

  const hasLogEntries =
    Object.values(runCommandLogs).some((entry) => entry.lines.length > 0) ||
    (status?.commands.length ?? 0) > 0;

  const handleCommandAction = (runCommandId: string) => {
    if (
      isStartingCommandId === runCommandId ||
      isStoppingCommandId === runCommandId
    ) {
      return;
    }

    const commandStatus = statusByCommandId[runCommandId];
    if (commandStatus?.status === 'running') {
      void stopCommand(runCommandId);
      return;
    }

    void startCommand(runCommandId);
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <Dropdown
          align="right"
          trigger={
            <button
              className={clsx(
                'flex items-center gap-2 rounded-md px-3 py-1 text-sm font-medium transition-colors',
                runningCount > 0
                  ? 'bg-red-600 text-white hover:bg-red-700'
                  : 'bg-green-600 text-white hover:bg-green-700',
              )}
              aria-label="Run command"
            >
              {runningCount > 0 ? (
                <Square className="h-4 w-4" aria-hidden />
              ) : (
                <Play className="h-4 w-4" aria-hidden />
              )}
              Run
            </button>
          }
        >
          {commands.map((command, index) => {
            const commandStatus = statusByCommandId[command.id];
            const isRunningCommand = commandStatus?.status === 'running';
            const isBusy =
              isStartingCommandId === command.id ||
              isStoppingCommandId === command.id;
            return (
              <div key={command.id}>
                <DropdownItem onClick={() => handleCommandAction(command.id)}>
                  <span className="mr-2 truncate font-mono text-xs text-neutral-400">
                    {command.command}
                  </span>
                  <span
                    className={clsx(
                      'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase',
                      isRunningCommand
                        ? 'bg-red-500/20 text-red-300'
                        : 'bg-green-500/20 text-green-300',
                    )}
                  >
                    {isBusy ? '...' : isRunningCommand ? 'Stop' : 'Run'}
                  </span>
                </DropdownItem>
                {index < commands.length - 1 && <DropdownDivider />}
              </div>
            );
          })}
        </Dropdown>

        {hasLogEntries && (
          <button
            type="button"
            onClick={onOpenLogs}
            className={clsx(
              'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm transition-colors',
              isLogsPaneOpen
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-neutral-700 text-neutral-200 hover:bg-neutral-600',
            )}
            aria-label="Open command logs"
          >
            <FileText className="h-4 w-4" aria-hidden />
            Logs
          </button>
        )}

        {runningCount > 0 && (
          <span
            className={clsx(
              'rounded-full px-2 py-0.5 text-xs font-medium',
              runningCount === commands.length
                ? 'bg-green-500/20 text-green-400'
                : 'bg-yellow-500/20 text-yellow-400',
            )}
          >
            {runningCount}/{commands.length}
          </span>
        )}
      </div>

      {portsInUseError && (
        <KillPortsModal
          error={portsInUseError}
          onConfirm={confirmKillPorts}
          onCancel={dismissPortsError}
          isLoading={isStartingCommandId !== null}
        />
      )}
    </>
  );
}
