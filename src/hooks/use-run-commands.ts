import { useState, useEffect, useCallback, useMemo } from 'react';

import { api } from '@/lib/api';
import { useTaskMessagesStore } from '@/stores/task-messages';
import type { RunStatus, PortsInUseErrorData } from '@shared/run-command-types';
import { isPortsInUseError } from '@shared/run-command-types';

export function useRunCommands({
  taskId,
  projectId,
  workingDir,
}: {
  taskId: string;
  projectId: string;
  workingDir: string;
}) {
  const [status, setStatus] = useState<RunStatus | null>(null);
  const [portsInUseError, setPortsInUseError] =
    useState<PortsInUseErrorData | null>(null);
  const [isStartingCommandId, setIsStartingCommandId] = useState<string | null>(
    null,
  );
  const [isStoppingCommandId, setIsStoppingCommandId] = useState<string | null>(
    null,
  );
  const [pendingStartCommandId, setPendingStartCommandId] = useState<
    string | null
  >(null);

  const clearRunCommandLogs = useTaskMessagesStore(
    (state) => state.clearRunCommandLogs,
  );

  useEffect(() => {
    api.runCommands.getStatus(taskId).then(setStatus);
  }, [taskId]);

  useEffect(() => {
    const unsubscribeStatus = api.runCommands.onStatusChange(
      (changedTaskId, newStatus) => {
        if (changedTaskId === taskId) {
          setStatus(newStatus);
        }
      },
    );

    return () => {
      unsubscribeStatus();
    };
  }, [taskId]);

  const startCommand = useCallback(
    async (runCommandId: string) => {
      setIsStartingCommandId(runCommandId);
      setPortsInUseError(null);
      setPendingStartCommandId(runCommandId);

      const wasStartedBefore =
        status?.commands.some((command) => command.id === runCommandId) ??
        false;
      if (wasStartedBefore) {
        clearRunCommandLogs(taskId, runCommandId);
      }

      try {
        const result = await api.runCommands.startCommand({
          taskId,
          projectId,
          workingDir,
          runCommandId,
        });

        if (isPortsInUseError(result)) {
          setPortsInUseError(result);
          return;
        }

        setStatus(result);
        setPendingStartCommandId(null);
      } finally {
        setIsStartingCommandId(null);
      }
    },
    [taskId, projectId, workingDir, clearRunCommandLogs, status],
  );

  const stopCommand = useCallback(
    async (runCommandId: string) => {
      setIsStoppingCommandId(runCommandId);
      try {
        await api.runCommands.stopCommand({ taskId, runCommandId });
      } finally {
        setIsStoppingCommandId(null);
      }
    },
    [taskId],
  );

  const confirmKillPorts = useCallback(async () => {
    if (!portsInUseError || !pendingStartCommandId) return;

    const commandIds = [
      ...new Set(portsInUseError.portsInUse.map((p) => p.commandId)),
    ];
    for (const commandId of commandIds) {
      await api.runCommands.killPortsForCommand(projectId, commandId);
    }

    setPortsInUseError(null);
    await startCommand(pendingStartCommandId);
  }, [projectId, portsInUseError, pendingStartCommandId, startCommand]);

  const dismissPortsError = useCallback(() => {
    setPortsInUseError(null);
    setPendingStartCommandId(null);
  }, []);

  const statusByCommandId = useMemo(() => {
    const byId: Record<string, RunStatus['commands'][number]> = {};
    for (const commandStatus of status?.commands ?? []) {
      byId[commandStatus.id] = commandStatus;
    }
    return byId;
  }, [status]);

  return {
    status,
    statusByCommandId,
    isRunning: status?.isRunning ?? false,
    isStartingCommandId,
    isStoppingCommandId,
    startCommand,
    stopCommand,
    portsInUseError,
    confirmKillPorts,
    dismissPortsError,
  };
}
