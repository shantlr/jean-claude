import clsx from 'clsx';
import { Search, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/common/ui/button';
import { IconButton } from '@/common/ui/icon-button';
import { Input } from '@/common/ui/input';
import { Separator } from '@/common/ui/separator';
import { InteractiveLog } from '@/features/common/interactive-log';
import { useHorizontalResize } from '@/hooks/use-horizontal-resize';
import { useProjectCommands } from '@/hooks/use-project-commands';
import { api } from '@/lib/api';
import { useCommandLogsPaneWidth } from '@/stores/navigation';
import {
  type RunCommandLogs,
  useTaskMessagesStore,
} from '@/stores/task-messages';
import {
  getRunCommandDisplayName,
  type RunStatus,
} from '@shared/run-command-types';

import { TASK_PANEL_HEADER_HEIGHT_CLS } from '../constants';

const EMPTY_RUN_COMMAND_LOGS: RunCommandLogs = {};

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
    useTaskMessagesStore((state) => state.runCommandLogs[taskId]) ??
    EMPTY_RUN_COMMAND_LOGS;
  const clearRunCommandLogs = useTaskMessagesStore(
    (state) => state.clearRunCommandLogs,
  );
  const [status, setStatus] = useState<RunStatus | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const paneRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const pane = paneRef.current;
      const target = event.target;
      if (!(target instanceof Node) || !pane?.contains(target)) return;

      if (
        (event.metaKey || event.ctrlKey) &&
        !event.shiftKey &&
        !event.altKey
      ) {
        if (event.key.toLowerCase() !== 'f') return;
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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
    </div>
  );
}
