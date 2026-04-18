import clsx from 'clsx';
import { Loader2, Square, Terminal, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useCommands } from '@/common/hooks/use-commands';
import { IconButton } from '@/common/ui/icon-button';
import { Kbd } from '@/common/ui/kbd';
import { useProjects } from '@/hooks/use-projects';
import { useTasks } from '@/hooks/use-tasks';
import { api } from '@/lib/api';
import { useTaskMessagesStore } from '@/stores/task-messages';
import { useToastStore } from '@/stores/toasts';
import type { CommandRunStatus } from '@shared/run-command-types';

/** Stable empty array to avoid unstable selector references. */
const EMPTY_ARRAY: never[] = [];

interface RunningCommand {
  taskId: string;
  taskName: string;
  projectName: string;
  commandStatus: CommandRunStatus;
}

export function RunningCommandsOverlay({ onClose }: { onClose: () => void }) {
  const runCommandRunning = useTaskMessagesStore((s) => s.runCommandRunning);
  const { data: tasks } = useTasks();
  const { data: projects } = useProjects();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [stoppingKeys, setStoppingKeys] = useState<Set<string>>(new Set());
  const addToast = useToastStore((s) => s.addToast);

  const runningCommands = useMemo(() => {
    const result: RunningCommand[] = [];
    const taskMap = new Map(tasks?.map((t) => [t.id, t]));
    const projectMap = new Map(projects?.map((p) => [p.id, p]));

    for (const [taskId, status] of Object.entries(runCommandRunning)) {
      const task = taskMap.get(taskId);
      const project = task ? projectMap.get(task.projectId) : undefined;

      for (const cmd of status.commands) {
        if (cmd.status !== 'running') continue;
        result.push({
          taskId,
          taskName:
            task?.name ?? task?.prompt.split('\n')[0].slice(0, 30) ?? taskId,
          projectName: project?.name ?? 'Unknown Project',
          commandStatus: cmd,
        });
      }
    }
    return result;
  }, [runCommandRunning, tasks, projects]);

  // Auto-select first command if nothing selected or selected got removed
  useEffect(() => {
    if (runningCommands.length === 0) {
      setSelectedKey(null);
      return;
    }
    const stillExists = selectedKey
      ? runningCommands.some(
          (c) => makeKey(c.taskId, c.commandStatus.id) === selectedKey,
        )
      : false;
    if (!stillExists) {
      setSelectedKey(
        makeKey(runningCommands[0].taskId, runningCommands[0].commandStatus.id),
      );
    }
  }, [runningCommands, selectedKey]);

  const selectedCommand = useMemo(
    () =>
      runningCommands.find(
        (c) => makeKey(c.taskId, c.commandStatus.id) === selectedKey,
      ),
    [runningCommands, selectedKey],
  );

  const handleStop = useCallback(
    async (taskId: string, runCommandId: string) => {
      const key = makeKey(taskId, runCommandId);
      setStoppingKeys((prev) => new Set(prev).add(key));
      try {
        await api.runCommands.stopCommand({ taskId, runCommandId });
      } catch (error) {
        addToast({
          type: 'error',
          message:
            error instanceof Error ? error.message : 'Failed to stop command',
        });
      } finally {
        setStoppingKeys((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    },
    [addToast],
  );

  const handleStopSelected = useCallback(() => {
    if (!selectedCommand) return;
    const key = makeKey(
      selectedCommand.taskId,
      selectedCommand.commandStatus.id,
    );
    if (stoppingKeys.has(key)) return;
    void handleStop(selectedCommand.taskId, selectedCommand.commandStatus.id);
  }, [selectedCommand, stoppingKeys, handleStop]);

  const handleArrowNavigation = useCallback(
    (direction: 'up' | 'down') => {
      if (runningCommands.length === 0) return;
      const currentIndex = runningCommands.findIndex(
        (c) => makeKey(c.taskId, c.commandStatus.id) === selectedKey,
      );
      let nextIndex: number;
      if (direction === 'up') {
        nextIndex =
          currentIndex <= 0 ? runningCommands.length - 1 : currentIndex - 1;
      } else {
        nextIndex =
          currentIndex >= runningCommands.length - 1 ? 0 : currentIndex + 1;
      }
      const next = runningCommands[nextIndex];
      setSelectedKey(makeKey(next.taskId, next.commandStatus.id));
    },
    [runningCommands, selectedKey],
  );

  useCommands('running-commands-overlay', [
    {
      label: 'Close Running Commands Overlay',
      shortcut: 'escape',
      handler: () => onClose(),
      hideInCommandPalette: true,
    },
    {
      label: 'Stop Selected Command',
      shortcut: 'cmd+backspace',
      handler: handleStopSelected,
      hideInCommandPalette: true,
    },
    {
      label: 'Select Previous Command',
      shortcut: 'up',
      handler: () => handleArrowNavigation('up'),
      hideInCommandPalette: true,
    },
    {
      label: 'Select Next Command',
      shortcut: 'down',
      handler: () => handleArrowNavigation('down'),
      hideInCommandPalette: true,
    },
  ]);

  return (
    <div
      className="bg-bg-0/40 fixed inset-0 z-50 flex items-start justify-center p-4 pt-[10vh]"
      onClick={onClose}
    >
      <div
        className="bg-bg-0/85 flex max-h-[75svh] w-[min(1000px,96vw)] flex-col overflow-hidden rounded-xl border border-white/10 shadow-2xl shadow-black/50 backdrop-blur-xl"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 bg-gradient-to-r from-white/5 to-transparent px-4 py-3">
          <div className="flex items-center gap-2">
            <Terminal className="text-status-done h-4 w-4" />
            <div>
              <h2 className="text-ink-0 text-sm font-semibold">
                Running Commands
              </h2>
              <p className="text-ink-2 mt-0.5 text-xs">
                {runningCommands.length === 0
                  ? 'No running commands'
                  : `${runningCommands.length} running`}
              </p>
            </div>
          </div>
          <IconButton
            variant="ghost"
            size="sm"
            onClick={onClose}
            icon={<X />}
            tooltip="Close"
          />
        </div>

        {/* Content */}
        {runningCommands.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <Terminal className="text-ink-4 mx-auto mb-3 h-8 w-8" />
            <p className="text-ink-3 text-sm">
              No commands are currently running.
            </p>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1">
            {/* Left: command list */}
            <div className="w-64 shrink-0 overflow-y-auto border-r border-white/10 p-2">
              {runningCommands.map((cmd) => {
                const key = makeKey(cmd.taskId, cmd.commandStatus.id);
                const isSelected = selectedKey === key;
                const isStopping = stoppingKeys.has(key);
                return (
                  <div
                    key={key}
                    role="button"
                    tabIndex={0}
                    className={clsx(
                      'group flex w-full cursor-pointer items-start gap-2 rounded-lg px-3 py-2 text-left transition-colors',
                      isSelected
                        ? 'text-ink-0 bg-white/10'
                        : 'text-ink-2 hover:text-ink-1 hover:bg-white/5',
                    )}
                    onClick={() => setSelectedKey(key)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedKey(key);
                      }
                    }}
                  >
                    <Loader2 className="text-status-done mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">
                        {cmd.commandStatus.command}
                      </p>
                      <p className="text-ink-3 mt-0.5 truncate text-[11px]">
                        {cmd.taskName}
                      </p>
                      <p className="text-ink-4 truncate text-[11px]">
                        {cmd.projectName}
                      </p>
                    </div>
                    <button
                      className={clsx(
                        'mt-0.5 shrink-0 cursor-pointer rounded p-1 transition-colors',
                        isStopping
                          ? 'text-ink-4 cursor-not-allowed'
                          : 'text-ink-4 hover:bg-status-fail/20 hover:text-status-fail',
                      )}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!isStopping) {
                          void handleStop(cmd.taskId, cmd.commandStatus.id);
                        }
                      }}
                      title="Stop command"
                    >
                      <Square className="h-3 w-3" />
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Right: log viewer */}
            <div className="flex min-w-0 flex-1 flex-col">
              {selectedCommand ? (
                <LogViewer
                  taskId={selectedCommand.taskId}
                  runCommandId={selectedCommand.commandStatus.id}
                  command={selectedCommand.commandStatus.command}
                  isStopping={stoppingKeys.has(
                    makeKey(
                      selectedCommand.taskId,
                      selectedCommand.commandStatus.id,
                    ),
                  )}
                  onStop={() =>
                    handleStop(
                      selectedCommand.taskId,
                      selectedCommand.commandStatus.id,
                    )
                  }
                />
              ) : (
                <div className="text-ink-4 flex flex-1 items-center justify-center text-sm">
                  Select a command to view logs
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer with shortcut hints */}
        <div className="flex items-center gap-4 border-t border-white/10 px-4 py-2">
          <div className="text-ink-3 flex items-center gap-1.5 text-[11px]">
            <Kbd shortcut="up" />
            <Kbd shortcut="down" />
            <span>Navigate</span>
          </div>
          <div className="text-ink-3 flex items-center gap-1.5 text-[11px]">
            <Kbd shortcut="cmd+backspace" />
            <span>Stop</span>
          </div>
          <div className="text-ink-3 flex items-center gap-1.5 text-[11px]">
            <Kbd shortcut="escape" />
            <span>Close</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function LogViewer({
  taskId,
  runCommandId,
  command,
  isStopping,
  onStop,
}: {
  taskId: string;
  runCommandId: string;
  command: string;
  isStopping: boolean;
  onStop: () => void;
}) {
  const logContainerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Subscribe directly to the specific command's log lines to avoid
  // re-rendering the entire overlay on every log line from any command.
  const logLines = useTaskMessagesStore(
    (s) => s.runCommandLogs[taskId]?.[runCommandId]?.lines ?? EMPTY_ARRAY,
  );

  // Auto-scroll to bottom when new logs come in
  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logLines, autoScroll]);

  const handleScroll = useCallback(() => {
    const el = logContainerRef.current;
    if (!el) return;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setAutoScroll(isAtBottom);
  }, []);

  return (
    <div className="flex h-full flex-col">
      {/* Log header */}
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-ink-1 font-mono text-xs">{command}</span>
          <span className="text-status-done flex items-center gap-1 text-[11px]">
            <Loader2 className="h-3 w-3 animate-spin" />
            running
          </span>
        </div>
        <button
          className={clsx(
            'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
            isStopping
              ? 'text-ink-4 bg-bg-1 cursor-not-allowed'
              : 'bg-status-fail/15 text-status-fail hover:bg-status-fail/25',
          )}
          disabled={isStopping}
          onClick={onStop}
        >
          <Square className="h-3 w-3" />
          {isStopping ? 'Stopping...' : 'Stop'}
        </button>
      </div>

      {/* Log content */}
      <div
        ref={logContainerRef}
        className="bg-bg-0/50 flex-1 overflow-auto p-3 font-mono text-xs leading-5"
        onScroll={handleScroll}
      >
        {logLines.length === 0 ? (
          <p className="text-ink-4">Waiting for output...</p>
        ) : (
          logLines.map((entry, i) => (
            <div
              key={i}
              className={clsx(
                'break-all whitespace-pre-wrap',
                entry.stream === 'stderr'
                  ? 'text-status-fail/80'
                  : 'text-ink-1',
              )}
            >
              {entry.line}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function makeKey(taskId: string, commandId: string) {
  return `${taskId}::${commandId}`;
}
