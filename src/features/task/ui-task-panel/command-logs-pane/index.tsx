import clsx from 'clsx';
import { Trash2, X } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { Button } from '@/common/ui/button';
import { IconButton } from '@/common/ui/icon-button';
import { Separator } from '@/common/ui/separator';
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
    useTaskMessagesStore((state) => state.runCommandLogs[taskId]) ?? {};
  const clearRunCommandLogs = useTaskMessagesStore(
    (state) => state.clearRunCommandLogs,
  );
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

      {tabs.length > 0 ? (
        <>
          <div className="flex shrink-0 gap-1 overflow-x-auto px-2 py-2">
            {tabs.map((tab) => (
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
                title={tab.command}
              >
                {tab.command}
              </Button>
            ))}
          </div>
          <Separator />

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
                  entry.stream === 'stderr' ? 'text-status-fail' : 'text-ink-1',
                )}
              >
                {entry.line || ' '}
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="text-ink-3 flex flex-1 items-center justify-center px-4 text-sm">
          Run a command to see logs.
        </div>
      )}
    </div>
  );
}
