import clsx from 'clsx';
import { FileText, Loader2, Play, Square } from 'lucide-react';
import { type MutableRefObject, useState } from 'react';

import { Button } from '@/common/ui/button';
import { Chip } from '@/common/ui/chip';
import { Dropdown, DropdownItem, DropdownDivider } from '@/common/ui/dropdown';
import { Kbd } from '@/common/ui/kbd';
import { useProjectCommands } from '@/hooks/use-project-commands';
import { useRunCommands } from '@/hooks/use-run-commands';
import { useTaskMessagesStore } from '@/stores/task-messages';

import { ConfirmRunModal } from './confirm-run-modal';
import { KillPortsModal } from './kill-ports-modal';

export function RunButton({
  taskId,
  projectId,
  workingDir,
  onToggleLogs,
  onRunCommand,
  isLogsPaneOpen,
  dropdownRef,
}: {
  taskId: string;
  projectId: string;
  workingDir: string;
  onToggleLogs: () => void;
  onRunCommand: (runCommandId: string) => void;
  isLogsPaneOpen: boolean;
  dropdownRef?: MutableRefObject<{ toggle: () => void } | null>;
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

  const [pendingConfirmCommandId, setPendingConfirmCommandId] = useState<
    string | null
  >(null);

  const pendingConfirmCommand = pendingConfirmCommandId
    ? commands.find((c) => c.id === pendingConfirmCommandId)
    : null;

  const runCommandLogs =
    useTaskMessagesStore((state) => state.runCommandLogs[taskId]) ?? {};

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

  const executeCommand = (runCommandId: string) => {
    onRunCommand(runCommandId);
    void startCommand(runCommandId);
  };

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

    const cmd = commands.find((c) => c.id === runCommandId);
    if (cmd?.confirmBeforeRun) {
      setPendingConfirmCommandId(runCommandId);
      return;
    }

    executeCommand(runCommandId);
  };

  const handleConfirmRun = () => {
    if (pendingConfirmCommandId) {
      const id = pendingConfirmCommandId;
      setPendingConfirmCommandId(null);
      if (commands.some((c) => c.id === id)) {
        executeCommand(id);
      }
    }
  };

  const handleCancelConfirm = () => {
    setPendingConfirmCommandId(null);
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <Dropdown
          align="right"
          dropdownRef={dropdownRef}
          trigger={
            <button
              className={clsx(
                'flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium transition-colors',
                runningCount > 0
                  ? 'bg-red-600 text-white hover:bg-red-700'
                  : 'bg-green-600 text-white hover:bg-green-700',
              )}
              aria-label="Run command"
            >
              {runningCount > 0 ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                  <Square className="h-3 w-3" aria-hidden />
                </>
              ) : (
                <Play className="h-3 w-3" aria-hidden />
              )}
              <Kbd
                shortcut="cmd+u"
                className="border-white/25 bg-white/10 text-white/90"
              />
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
                  <span className="text-ink-2 mr-2 truncate font-mono text-xs">
                    {command.command}
                  </span>
                  <Chip
                    size="xs"
                    color={isRunningCommand ? 'red' : 'green'}
                    className="uppercase"
                  >
                    {isBusy ? '...' : isRunningCommand ? 'Stop' : 'Run'}
                  </Chip>
                </DropdownItem>
                {index < commands.length - 1 && <DropdownDivider />}
              </div>
            );
          })}
        </Dropdown>

        {hasLogEntries && (
          <Button
            onClick={onToggleLogs}
            variant={isLogsPaneOpen ? 'primary' : 'secondary'}
            size="xs"
            icon={<FileText />}
            aria-label="Open command logs"
          >
            Logs
          </Button>
        )}

        {runningCount > 0 && (
          <Chip
            size="sm"
            color={runningCount === commands.length ? 'green' : 'yellow'}
            pill
          >
            {runningCount}/{commands.length}
          </Chip>
        )}
      </div>

      {pendingConfirmCommand && (
        <ConfirmRunModal
          commandName={pendingConfirmCommand.command}
          message={pendingConfirmCommand.confirmMessage}
          onConfirm={handleConfirmRun}
          onCancel={handleCancelConfirm}
        />
      )}

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
