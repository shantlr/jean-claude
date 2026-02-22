import clsx from 'clsx';
import { X } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { useHorizontalResize } from '@/hooks/use-horizontal-resize';
import { useProjectCommands } from '@/hooks/use-project-commands';
import { api } from '@/lib/api';
import { useCommandLogsPaneWidth } from '@/stores/navigation';
import { useTaskMessagesStore } from '@/stores/task-messages';
import type { RunStatus } from '@shared/run-command-types';

import { TASK_PANEL_HEADER_HEIGHT_CLS } from '../constants';

export function CommandLogsPane({
  taskId,
  projectId,
  selectedCommandId,
  onSelectCommand,
  onClose,
}: {
  taskId: string;
  projectId: string;
  selectedCommandId: string | null;
  onSelectCommand: (commandId: string | null) => void;
  onClose: () => void;
}) {
  const { data: commands = [] } = useProjectCommands(projectId);
  const runCommandLogs =
    useTaskMessagesStore((state) => state.tasks[taskId]?.runCommandLogs) ?? {};
  const [status, setStatus] = useState<RunStatus | null>(null);

  useEffect(() => {
    api.runCommands.getStatus(taskId).then(setStatus);

    const unsubscribe = api.runCommands.onStatusChange(
      (changedTaskId, nextStatus) => {
        if (changedTaskId === taskId) {
          setStatus(nextStatus);
        }
      },
    );

    return unsubscribe;
  }, [taskId]);

  const runningCommandIds = useMemo(
    () =>
      new Set(
        (status?.commands ?? [])
          .filter((entry) => entry.status === 'running')
          .map((entry) => entry.id),
      ),
    [status],
  );

  const tabs = commands.filter(
    (command) =>
      (runCommandLogs[command.id]?.lines.length ?? 0) > 0 ||
      runningCommandIds.has(command.id),
  );

  const activeCommandId =
    selectedCommandId && tabs.some((tab) => tab.id === selectedCommandId)
      ? selectedCommandId
      : (tabs[0]?.id ?? null);
  const activeLog = activeCommandId ? runCommandLogs[activeCommandId] : null;

  const scrollRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Consider "at bottom" if within 32px of the bottom
    isAtBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 32;
  }, []);

  // Auto-scroll to bottom when new log lines arrive (if user was at bottom)
  const lineCount = activeLog?.lines.length ?? 0;
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && isAtBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [lineCount, activeCommandId]);

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
      style={{ width }}
      className="relative flex h-full flex-col border-l border-neutral-700 bg-neutral-900"
    >
      <div
        onMouseDown={handleMouseDown}
        className={clsx(
          'absolute top-0 left-0 z-10 h-full w-1 cursor-col-resize transition-colors hover:bg-blue-500/50',
          isDragging && 'bg-blue-500/50',
        )}
      />

      <div
        className={clsx(
          'flex shrink-0 items-center justify-between border-b border-neutral-700 px-4 py-2',
          TASK_PANEL_HEADER_HEIGHT_CLS,
        )}
      >
        <h3 className="text-sm font-medium text-neutral-200">Command Logs</h3>
        <button
          onClick={onClose}
          className="cursor-pointer rounded p-1.5 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200"
          title="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {tabs.length > 0 ? (
        <>
          <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-neutral-700 px-2 py-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => onSelectCommand(tab.id)}
                className={clsx(
                  'max-w-64 truncate rounded px-2.5 py-1 text-xs font-medium transition-colors',
                  activeCommandId === tab.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700',
                )}
                title={tab.command}
              >
                {tab.command}
              </button>
            ))}
          </div>

          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="flex-1 overflow-auto px-3 py-2 font-mono text-xs leading-relaxed"
          >
            {activeLog?.lines.map((entry, index) => (
              <div
                key={`${entry.timestamp}-${index}`}
                className={clsx(
                  'break-words whitespace-pre-wrap',
                  entry.stream === 'stderr'
                    ? 'text-red-300'
                    : 'text-neutral-200',
                )}
              >
                {entry.line || ' '}
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="flex flex-1 items-center justify-center px-4 text-sm text-neutral-500">
          Run a command to see logs.
        </div>
      )}
    </div>
  );
}
