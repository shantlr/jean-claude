import { Play, Square } from 'lucide-react';

import { useProjectCommands } from '@/hooks/use-project-commands';
import { useRunCommands } from '@/hooks/use-run-commands';

import { KillPortsModal } from './kill-ports-modal';

export function RunButton({ projectId, workingDir }: {
  projectId: string;
  workingDir: string;
}) {
  const { data: commands = [] } = useProjectCommands(projectId);
  const {
    status,
    isRunning,
    isStarting,
    isStopping,
    start,
    stop,
    portsInUseError,
    confirmKillPorts,
    dismissPortsError,
  } = useRunCommands(projectId, workingDir);

  // Don't show button if no commands configured
  if (commands.length === 0) {
    return null;
  }

  const runningCount = status?.commands.filter((c) => c.status === 'running').length ?? 0;
  const totalCount = status?.commands.length ?? 0;

  const handleClick = () => {
    if (isRunning) {
      stop();
    } else {
      start();
    }
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          onClick={handleClick}
          disabled={isStarting || isStopping}
          className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ${
            isRunning
              ? 'bg-red-600 text-white hover:bg-red-700'
              : 'bg-green-600 text-white hover:bg-green-700'
          }`}
          title={isRunning ? 'Stop all commands' : 'Run all commands'}
        >
          {isRunning ? (
            <>
              <Square className="h-4 w-4" />
              Stop
            </>
          ) : (
            <>
              <Play className="h-4 w-4" />
              Run
            </>
          )}
        </button>
        {isRunning && totalCount > 0 && (
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              runningCount === totalCount
                ? 'bg-green-500/20 text-green-400'
                : 'bg-yellow-500/20 text-yellow-400'
            }`}
          >
            {runningCount}/{totalCount}
          </span>
        )}
      </div>

      {portsInUseError && (
        <KillPortsModal
          error={portsInUseError}
          onConfirm={confirmKillPorts}
          onCancel={dismissPortsError}
          isLoading={isStarting}
        />
      )}
    </>
  );
}
