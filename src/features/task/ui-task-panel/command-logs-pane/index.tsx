import clsx from 'clsx';
import { RotateCw, Search, Trash2, X } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from 'react';

import { Button } from '@/common/ui/button';
import { IconButton } from '@/common/ui/icon-button';
import { Input } from '@/common/ui/input';
import { Kbd } from '@/common/ui/kbd';
import { Separator } from '@/common/ui/separator';
import { ConfirmRunModal } from '@/features/agent/ui-run-button/confirm-run-modal';
import { KillPortsModal } from '@/features/agent/ui-run-button/kill-ports-modal';
import { InteractiveLog } from '@/features/common/interactive-log';
import { keyEventToTerminalInput } from '@/features/common/interactive-log/key-event-to-terminal-input';
import { useHorizontalResize } from '@/hooks/use-horizontal-resize';
import { useProjectCommands } from '@/hooks/use-project-commands';
import { useRunCommands } from '@/hooks/use-run-commands';
import { api } from '@/lib/api';
import { useCommandLogsPaneWidth } from '@/stores/navigation';
import {
  type RunCommandLogs,
  useTaskMessagesStore,
} from '@/stores/task-messages';
import { getRunCommandDisplayName } from '@shared/run-command-types';

import { TASK_PANEL_HEADER_HEIGHT_CLS } from '../constants';

const EMPTY_RUN_COMMAND_LOGS: RunCommandLogs = {};

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;

  return !!target.closest('input, textarea, select, button, [contenteditable]');
}

export function CommandLogsPane({
  taskId,
  projectId,
  workingDir,
  selectedCommandId,
  onSelectCommand,
  onClose,
}: {
  taskId: string;
  projectId: string;
  workingDir: string;
  selectedCommandId: string | null;
  onSelectCommand: (commandId: string | null) => void;
  onClose: () => void;
}) {
  const { data: commands = [] } = useProjectCommands(projectId);
  const {
    status,
    isCommandStarting,
    isStartingAnyCommand,
    startCommand,
    portsInUseError,
    confirmKillPorts,
    dismissPortsError,
  } = useRunCommands({ taskId, projectId, workingDir });
  const runCommandLogs =
    useTaskMessagesStore((state) => state.runCommandLogs[taskId]) ??
    EMPTY_RUN_COMMAND_LOGS;
  const clearRunCommandLogs = useTaskMessagesStore(
    (state) => state.clearRunCommandLogs,
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [pendingConfirm, setPendingConfirm] = useState<{
    commandId: string;
    label: string;
    message: string | null;
  } | null>(null);
  const paneRef = useRef<HTMLDivElement>(null);
  const restartInFlightRef = useRef(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const runningCommandIds = useMemo(
    () =>
      new Set(
        (status?.commands ?? [])
          .filter((entry) => entry.status === 'running')
          .map((entry) => entry.id),
      ),
    [status],
  );

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();

  const tabs = useMemo(
    () =>
      commands.filter(
        (command) =>
          (runCommandLogs[command.id]?.lines.length ?? 0) > 0 ||
          runningCommandIds.has(command.id),
      ),
    [commands, runCommandLogs, runningCommandIds],
  );

  const filteredTabs = useMemo(() => {
    if (!normalizedSearchQuery) return tabs;

    return tabs.filter((tab) => {
      if (
        getRunCommandDisplayName(tab)
          .toLowerCase()
          .includes(normalizedSearchQuery)
      ) {
        return true;
      }

      return (
        runCommandLogs[tab.id]?.lines.some((entry) =>
          entry.line.toLowerCase().includes(normalizedSearchQuery),
        ) ?? false
      );
    });
  }, [normalizedSearchQuery, runCommandLogs, tabs]);

  const activeCommandId =
    selectedCommandId && tabs.some((tab) => tab.id === selectedCommandId)
      ? selectedCommandId
      : (tabs[0]?.id ?? null);
  const activeLog = activeCommandId ? runCommandLogs[activeCommandId] : null;
  const isActiveRunning = !!(
    activeCommandId && runningCommandIds.has(activeCommandId)
  );
  const isActiveStarting = !!(
    activeCommandId && isCommandStarting(activeCommandId)
  );

  const restartCommand = useCallback(
    async (commandId: string) => {
      if (restartInFlightRef.current) return;
      restartInFlightRef.current = true;
      try {
        await startCommand(commandId);
      } finally {
        restartInFlightRef.current = false;
      }
    },
    [startCommand],
  );

  const requestRestartActiveCommand = useCallback(() => {
    if (!activeCommandId || isActiveStarting || restartInFlightRef.current) {
      return;
    }

    const command = commands.find((entry) => entry.id === activeCommandId);
    if (command?.confirmBeforeRun) {
      setPendingConfirm({
        commandId: activeCommandId,
        label: getRunCommandDisplayName(command),
        message: command.confirmMessage,
      });
      return;
    }

    void restartCommand(activeCommandId);
  }, [activeCommandId, commands, isActiveStarting, restartCommand]);

  const handleConfirmRestart = useCallback(() => {
    if (!pendingConfirm) return;

    const commandId = pendingConfirm.commandId;
    setPendingConfirm(null);
    void restartCommand(commandId);
  }, [pendingConfirm, restartCommand]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;

      const pane = paneRef.current;
      const target = event.target;
      if (!(target instanceof Node) || !pane?.contains(target)) return;

      if ((event.metaKey || event.ctrlKey) && !event.altKey) {
        const key = event.key.toLowerCase();
        if (key === 'f' && !event.shiftKey) {
          event.preventDefault();
          searchInputRef.current?.focus();
          searchInputRef.current?.select();
          return;
        }

        if (key === 'u' && event.shiftKey && !event.repeat) {
          event.preventDefault();
          requestRestartActiveCommand();
        }
      }

      if (!activeCommandId || !isActiveRunning || isInteractiveTarget(target)) {
        return;
      }

      const input = keyEventToTerminalInput(event);
      if (input === null) return;

      event.preventDefault();
      void api.runCommands.sendInput({
        taskId,
        runCommandId: activeCommandId,
        input,
      });
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeCommandId, isActiveRunning, requestRestartActiveCommand, taskId]);

  const focusPaneInput = useCallback((event: MouseEvent) => {
    if (isInteractiveTarget(event.target)) return;
    paneRef.current?.focus();
  }, []);
  const filteredActiveLines = useMemo(() => {
    if (!activeLog) return [];
    if (!normalizedSearchQuery) return activeLog.lines;

    return activeLog.lines.filter((entry) =>
      entry.line.toLowerCase().includes(normalizedSearchQuery),
    );
  }, [activeLog, normalizedSearchQuery]);
  const hasAnyTabs = tabs.length > 0;
  const showNoSearchMatches =
    normalizedSearchQuery.length > 0 && filteredTabs.length === 0;

  const { width, setWidth, minWidth, maxWidth } = useCommandLogsPaneWidth();
  const { isDragging, handleMouseDown } = useHorizontalResize({
    initialWidth: width,
    minWidth,
    maxWidth,
    maxWidthFraction: 0.7,
    direction: 'left',
    onWidthChange: setWidth,
  });

  return (
    <div
      ref={paneRef}
      tabIndex={-1}
      onMouseDown={focusPaneInput}
      style={{ width }}
      className="panel-edge-shadow bg-bg-0 relative flex h-full flex-col"
    >
      <div
        onMouseDown={handleMouseDown}
        className={clsx(
          'hover:bg-acc/50 absolute top-0 left-0 z-10 h-full w-1 cursor-col-resize transition-colors',
          isDragging && 'bg-acc/50',
        )}
      />

      <div
        className={clsx(
          'flex shrink-0 items-center justify-between px-4 py-2',
          TASK_PANEL_HEADER_HEIGHT_CLS,
        )}
      >
        <h3 className="text-ink-1 text-sm font-medium">Command Logs</h3>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            onClick={requestRestartActiveCommand}
            size="xs"
            variant="secondary"
            icon={<RotateCw />}
            loading={isActiveStarting}
            disabled={!activeCommandId}
            aria-label="Restart command"
            title="Restart command (⌘⇧U)"
          >
            <Kbd shortcut="cmd+shift+u" />
          </Button>
          <IconButton
            onClick={() => {
              if (activeCommandId) clearRunCommandLogs(taskId, activeCommandId);
            }}
            size="sm"
            icon={<Trash2 />}
            tooltip="Clear logs"
          />
          <IconButton
            onClick={onClose}
            size="sm"
            icon={<X />}
            tooltip="Close"
          />
        </div>
      </div>
      <Separator />

      <div className="shrink-0 px-4 py-2">
        <Input
          ref={searchInputRef}
          size="sm"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search commands and logs..."
          icon={<Search />}
        />
      </div>

      <Separator />

      {hasAnyTabs && !showNoSearchMatches ? (
        <>
          <div className="flex shrink-0 gap-1 overflow-x-auto px-2 py-2">
            {filteredTabs.map((tab) => (
              <Button
                key={tab.id}
                type="button"
                onClick={() => onSelectCommand(tab.id)}
                className={clsx(
                  'max-w-64 truncate rounded px-2.5 py-1 text-xs font-medium transition-colors',
                  activeCommandId === tab.id
                    ? 'bg-acc text-ink-0'
                    : 'text-ink-1 bg-bg-1 hover:bg-glass-medium',
                )}
                title={getRunCommandDisplayName(tab)}
              >
                {getRunCommandDisplayName(tab)}
              </Button>
            ))}
          </div>
          <Separator />

          {activeCommandId && (
            <InteractiveLog
              lines={filteredActiveLines}
              taskId={taskId}
              runCommandId={activeCommandId}
              isRunning={isActiveRunning}
              emptyText={
                normalizedSearchQuery
                  ? `No log lines match "${searchQuery.trim()}".`
                  : 'Waiting for output...'
              }
            />
          )}
        </>
      ) : (
        <div className="text-ink-3 flex flex-1 items-center justify-center px-4 text-sm">
          {normalizedSearchQuery
            ? `No command logs match "${searchQuery.trim()}".`
            : 'Run a command to see logs.'}
        </div>
      )}

      {portsInUseError && (
        <KillPortsModal
          error={portsInUseError}
          onConfirm={confirmKillPorts}
          onCancel={dismissPortsError}
          isLoading={isStartingAnyCommand}
        />
      )}

      {pendingConfirm && (
        <ConfirmRunModal
          commandName={pendingConfirm.label}
          message={pendingConfirm.message}
          onConfirm={handleConfirmRestart}
          onCancel={() => setPendingConfirm(null)}
        />
      )}
    </div>
  );
}
