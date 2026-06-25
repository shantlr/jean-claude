import { Loader2, RotateCw, Search, Trash2, X } from 'lucide-react';
import {
  type MouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import clsx from 'clsx';



import {
  getRunCommandLogLineCount,
  type RunCommandLogs,
  type RunCommandLogState,
  useTaskMessagesStore,
} from '@/stores/task-messages';
import { api } from '@/lib/api';
import { Button } from '@/common/ui/button';
import { ConfirmRunModal } from '@/features/agent/ui-run-button/confirm-run-modal';
import { getRunCommandDisplayName } from '@shared/run-command-types';
import { IconButton } from '@/common/ui/icon-button';
import { Input } from '@/common/ui/input';
import { InteractiveLog } from '@/features/common/interactive-log';
import { Kbd } from '@/common/ui/kbd';
import { keyEventToTerminalInput } from '@/features/common/interactive-log/key-event-to-terminal-input';
import { KillPortsModal } from '@/features/agent/ui-run-button/kill-ports-modal';
import { Separator } from '@/common/ui/separator';
import { useCommandLogsPaneWidth } from '@/stores/navigation';
import { useHorizontalResize } from '@/hooks/use-horizontal-resize';
import { useProjectCommands } from '@/hooks/use-project-commands';
import { useRunCommands } from '@/hooks/use-run-commands';



import { TASK_PANEL_HEADER_HEIGHT_CLS } from '../constants';

const EMPTY_RUN_COMMAND_LOGS: RunCommandLogs = {};
const RUN_COMMAND_LOG_RENDER_THROTTLE_MS = 500;

function hasLogContent(log: RunCommandLogState | null | undefined): boolean {
  return getRunCommandLogLineCount(log) > 0;
}

function shouldFlushRunCommandLogsImmediately({
  previous,
  next,
}: {
  previous: RunCommandLogs;
  next: RunCommandLogs;
}): boolean {
  const previousIds = Object.keys(previous);
  const nextIds = new Set(Object.keys(next));

  for (const commandId of previousIds) {
    const previousLog = previous[commandId];
    const nextLog = next[commandId];

    if (!nextIds.has(commandId)) return true;
    if (getRunCommandLogLineCount(nextLog) < getRunCommandLogLineCount(previousLog)) {
      return true;
    }
  }

  return false;
}

function useThrottledRunCommandLogs(taskId: string): RunCommandLogs {
  const getSnapshot = useCallback(
    () =>
      useTaskMessagesStore.getState().runCommandLogs[taskId] ??
      EMPTY_RUN_COMMAND_LOGS,
    [taskId],
  );

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      let lastFlushAt = 0;
      let timeout: ReturnType<typeof setTimeout> | null = null;

      const flush = () => {
        timeout = null;
        lastFlushAt = Date.now();
        onStoreChange();
      };

      const unsubscribe = useTaskMessagesStore.subscribe(
        (state, previousState) => {
          if (state.runCommandLogs === previousState.runCommandLogs) return;

          const previousLogs =
            previousState.runCommandLogs[taskId] ?? EMPTY_RUN_COMMAND_LOGS;
          const nextLogs = state.runCommandLogs[taskId] ?? EMPTY_RUN_COMMAND_LOGS;
          if (nextLogs === previousLogs) return;

          if (
            shouldFlushRunCommandLogsImmediately({
              previous: previousLogs,
              next: nextLogs,
            })
          ) {
            if (timeout) {
              clearTimeout(timeout);
              timeout = null;
            }
            flush();
            return;
          }

          const elapsed = Date.now() - lastFlushAt;
          if (elapsed >= RUN_COMMAND_LOG_RENDER_THROTTLE_MS) {
            if (timeout) {
              clearTimeout(timeout);
              timeout = null;
            }
            flush();
            return;
          }

          if (!timeout) {
            timeout = setTimeout(
              flush,
              RUN_COMMAND_LOG_RENDER_THROTTLE_MS - elapsed,
            );
          }
        },
      );

      return () => {
        unsubscribe();
        if (timeout) {
          clearTimeout(timeout);
        }
      };
    },
    [taskId],
  );

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function logIncludesQuery(
  log: RunCommandLogState | null | undefined,
  query: string,
): boolean {
  if (!log) return false;

  for (const chunk of log.chunks) {
    if (chunk.lines.some((entry) => entry.line.toLowerCase().includes(query))) {
      return true;
    }
  }

  return (
    log.pendingLines.stdout?.line.toLowerCase().includes(query) === true ||
    log.pendingLines.stderr?.line.toLowerCase().includes(query) === true
  );
}

function filterLogByQuery(
  log: RunCommandLogState | null,
  query: string,
): RunCommandLogState | null {
  if (!log || !query) return log;

  let totalLineCount = 0;
  const chunks = log.chunks
    .map((chunk) => {
      const lines = chunk.lines.filter((entry) =>
        entry.line.toLowerCase().includes(query),
      );
      totalLineCount += lines.length;
      return { ...chunk, lines, lineCount: lines.length };
    })
    .filter((chunk) => chunk.lineCount > 0);

  return {
    ...log,
    chunks,
    pendingLines: {
      stdout:
        log.pendingLines.stdout?.line.toLowerCase().includes(query) === true
          ? log.pendingLines.stdout
          : null,
      stderr:
        log.pendingLines.stderr?.line.toLowerCase().includes(query) === true
          ? log.pendingLines.stderr
          : null,
    },
    totalLineCount,
  };
}

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
  const runCommandLogs = useThrottledRunCommandLogs(taskId);
  const resetRunCommandLogs = useTaskMessagesStore(
    (state) => state.resetRunCommandLogs,
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
          hasLogContent(runCommandLogs[command.id]) ||
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

      return logIncludesQuery(runCommandLogs[tab.id], normalizedSearchQuery);
    });
  }, [normalizedSearchQuery, runCommandLogs, tabs]);

  const selectableTabs = normalizedSearchQuery ? filteredTabs : tabs;
  const activeCommandId =
    selectedCommandId &&
    selectableTabs.some((tab) => tab.id === selectedCommandId)
      ? selectedCommandId
      : (selectableTabs[0]?.id ?? null);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
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
  const activeLogView = useMemo(() => {
    return filterLogByQuery(activeLog, normalizedSearchQuery);
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
              if (!activeCommandId) return;
              const generation = resetRunCommandLogs(taskId, activeCommandId);
              void api.runCommands.resetLogs({
                taskId,
                runCommandId: activeCommandId,
                generation,
              });
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
            {filteredTabs.map((tab) => {
              const isRunning = runningCommandIds.has(tab.id);
              const isActive = activeCommandId === tab.id;
              const displayName = getRunCommandDisplayName(tab);

              return (
                <Button
                  key={tab.id}
                  type="button"
                  onClick={() => onSelectCommand(tab.id)}
                  className={clsx(
                    'max-w-64 rounded border px-2.5 py-1 text-xs font-medium transition-colors',
                    isActive
                      ? 'bg-acc text-ink-0 border-transparent'
                      : 'text-ink-1 bg-bg-1 hover:bg-glass-medium',
                    isRunning && !isActive
                      ? 'border-status-done/40'
                      : 'border-transparent',
                  )}
                  title={`${displayName}${isRunning ? ' (running)' : ''}`}
                  aria-label={`${displayName}${isRunning ? ', running' : ''}`}
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    {isRunning && (
                      <Loader2
                        className={clsx(
                          'h-3 w-3 shrink-0 animate-spin',
                          isActive ? 'text-ink-0' : 'text-status-done',
                        )}
                        aria-hidden
                      />
                    )}
                    <span className="truncate">{displayName}</span>
                    {isRunning && (
                      <span
                        className={clsx(
                          'shrink-0 text-[10px] font-semibold uppercase',
                          isActive ? 'text-ink-0/80' : 'text-status-done',
                        )}
                      >
                        Running
                      </span>
                    )}
                  </span>
                </Button>
              );
            })}
          </div>
          <Separator />

          {activeCommandId && (
            <InteractiveLog
              log={activeLogView}
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
