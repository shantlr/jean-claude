import { FileText, Loader2, Play, Square } from 'lucide-react';
import { type MutableRefObject, useMemo, useState } from 'react';
import clsx from 'clsx';


import { Dropdown, DropdownDivider, DropdownItem } from '@/common/ui/dropdown';
import {
  getRunCommandLogLineCount,
  useTaskMessagesStore,
} from '@/stores/task-messages';
import { Button } from '@/common/ui/button';
import { Chip } from '@/common/ui/chip';
import { getRunCommandDisplayName } from '@shared/run-command-types';
import { Kbd } from '@/common/ui/kbd';
import { useProjectCommandGroups } from '@/hooks/use-project-command-groups';
import { useProjectCommands } from '@/hooks/use-project-commands';
import { useRunCommands } from '@/hooks/use-run-commands';



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
  onRunCommand: (runCommandIds: string[]) => void;
  isLogsPaneOpen: boolean;
  dropdownRef?: MutableRefObject<{ toggle: () => void } | null>;
}) {
  const { data: commands = [] } = useProjectCommands(projectId);
  const { data: groups = [] } = useProjectCommandGroups(projectId);
  const {
    status,
    statusByCommandId,
    isCommandStarting,
    isCommandStopping,
    isStartingAnyCommand,
    startCommand,
    startGroup,
    stopCommand,
    stopGroup,
    portsInUseError,
    confirmKillPorts,
    dismissPortsError,
  } = useRunCommands({ taskId, projectId, workingDir });

  const [pendingConfirm, setPendingConfirm] = useState<{
    commandIds: string[];
    label: string;
    message: string | null;
  } | null>(null);

  const hasRunCommandLogEntries = useTaskMessagesStore((state) => {
    const runCommandLogs = state.runCommandLogs[taskId];
    if (!runCommandLogs) return false;

    return Object.values(runCommandLogs).some(
      (entry) => getRunCommandLogLineCount(entry) > 0,
    );
  });

  const menuItems = useMemo(
    () =>
      [
        ...commands.map((command) => ({
          type: 'command' as const,
          item: command,
        })),
        ...groups.map((group) => ({ type: 'group' as const, item: group })),
      ].sort(
        (a, b) =>
          a.item.sortOrder - b.item.sortOrder ||
          a.item.createdAt.localeCompare(b.item.createdAt),
      ),
    [commands, groups],
  );

  // Don't show button if no commands configured
  if (menuItems.length === 0) {
    return null;
  }

  const runningCount = Object.values(statusByCommandId).filter(
    (c) => c.status === 'running',
  ).length;

  const hasLogEntries =
    hasRunCommandLogEntries || (status?.commands.length ?? 0) > 0;

  const executeCommand = (runCommandId: string) => {
    onRunCommand([runCommandId]);
    void startCommand(runCommandId);
  };

  const executeGroup = (runCommandIds: string[]) => {
    if (runCommandIds.length === 0) return;
    onRunCommand(runCommandIds);
    void startGroup(runCommandIds);
  };

  const handleCommandAction = (runCommandId: string) => {
    if (isCommandStarting(runCommandId) || isCommandStopping(runCommandId)) {
      return;
    }

    const commandStatus = statusByCommandId[runCommandId];
    if (commandStatus?.status === 'running') {
      void stopCommand(runCommandId);
      return;
    }

    const cmd = commands.find((c) => c.id === runCommandId);
    if (cmd?.confirmBeforeRun) {
      setPendingConfirm({
        commandIds: [runCommandId],
        label: getRunCommandDisplayName(cmd),
        message: cmd.confirmMessage,
      });
      return;
    }

    executeCommand(runCommandId);
  };

  const handleGroupAction = (groupId: string) => {
    const group = groups.find((entry) => entry.id === groupId);
    if (!group || group.commandIds.length === 0) {
      return;
    }

    const groupCommands = group.commandIds
      .map((commandId) => commands.find((command) => command.id === commandId))
      .filter(
        (command): command is (typeof commands)[number] => command != null,
      );
    if (groupCommands.length === 0) {
      return;
    }

    if (
      groupCommands.some(
        (command) =>
          isCommandStarting(command.id) || isCommandStopping(command.id),
      )
    ) {
      return;
    }

    const runningCommandIds = groupCommands
      .filter((command) => statusByCommandId[command.id]?.status === 'running')
      .map((command) => command.id);
    if (runningCommandIds.length > 0) {
      void stopGroup(runningCommandIds);
      return;
    }

    const confirmCommands = groupCommands.filter(
      (command) => command.confirmBeforeRun,
    );
    if (confirmCommands.length > 0) {
      setPendingConfirm({
        commandIds: groupCommands.map((command) => command.id),
        label: group.name,
        message:
          confirmCommands
            .map((command) => command.confirmMessage?.trim())
            .filter(Boolean)
            .join('\n') ||
          `Run group ${group.name} (${groupCommands.length} commands)?`,
      });
      return;
    }

    executeGroup(groupCommands.map((command) => command.id));
  };

  const handleConfirmRun = () => {
    if (!pendingConfirm) {
      return;
    }

    const commandIds = pendingConfirm.commandIds.filter((id) =>
      commands.some((command) => command.id === id),
    );
    setPendingConfirm(null);

    if (commandIds.length === 1) {
      executeCommand(commandIds[0]);
      return;
    }

    if (commandIds.length > 1) {
      executeGroup(commandIds);
    }
  };

  const handleCancelConfirm = () => {
    setPendingConfirm(null);
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
          {menuItems.map((menuItem, index) => {
            if (menuItem.type === 'command') {
              const command = menuItem.item;
              const commandStatus = statusByCommandId[command.id];
              const isRunningCommand = commandStatus?.status === 'running';
              const isBusy =
                isCommandStarting(command.id) || isCommandStopping(command.id);

              return (
                <div key={`command:${command.id}`}>
                  <DropdownItem onClick={() => handleCommandAction(command.id)}>
                    <span className="text-ink-2 mr-2 truncate text-xs">
                      {getRunCommandDisplayName(command)}
                    </span>
                    <Chip
                      size="xs"
                      color={isRunningCommand ? 'red' : 'green'}
                      className="uppercase"
                    >
                      {isBusy ? '...' : isRunningCommand ? 'Stop' : 'Run'}
                    </Chip>
                  </DropdownItem>
                  {index < menuItems.length - 1 && <DropdownDivider />}
                </div>
              );
            }

            const group = menuItem.item;
            const groupCommandIds = group.commandIds.filter((commandId) =>
              commands.some((command) => command.id === commandId),
            );
            const runningInGroup = groupCommandIds.filter(
              (commandId) => statusByCommandId[commandId]?.status === 'running',
            ).length;
            const isBusy = groupCommandIds.some(
              (commandId) =>
                isCommandStarting(commandId) || isCommandStopping(commandId),
            );

            return (
              <div key={`group:${group.id}`}>
                <DropdownItem onClick={() => handleGroupAction(group.id)}>
                  <span className="text-ink-2 mr-2 truncate text-xs">
                    {group.name}
                  </span>
                  <Chip size="xs" color="blue">
                    Group
                  </Chip>
                  <Chip
                    size="xs"
                    color={runningInGroup > 0 ? 'red' : 'green'}
                    className="uppercase"
                  >
                    {isBusy ? '...' : runningInGroup > 0 ? 'Stop' : 'Run'}
                  </Chip>
                </DropdownItem>
                {index < menuItems.length - 1 && <DropdownDivider />}
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
            title="Open command logs (⌘L)"
          >
            <Kbd
              shortcut="cmd+l"
              className={clsx(
                isLogsPaneOpen && 'border-white/25 bg-white/10 text-white/90',
              )}
            />
          </Button>
        )}
      </div>

      {pendingConfirm && (
        <ConfirmRunModal
          commandName={pendingConfirm.label}
          message={pendingConfirm.message}
          onConfirm={handleConfirmRun}
          onCancel={handleCancelConfirm}
        />
      )}

      {portsInUseError && (
        <KillPortsModal
          error={portsInUseError}
          onConfirm={confirmKillPorts}
          onCancel={dismissPortsError}
          isLoading={isStartingAnyCommand}
        />
      )}
    </>
  );
}
