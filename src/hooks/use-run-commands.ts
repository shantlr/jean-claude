import { useCallback, useEffect, useMemo, useState } from 'react';

import type { PortsInUseErrorData, RunStatus } from '@shared/run-command-types';
import { api } from '@/lib/api';
import { isPortsInUseError } from '@shared/run-command-types';
import { useLatestRef } from '@/hooks/use-latest-ref';
import { useTaskMessagesStore } from '@/stores/task-messages';



interface PendingStart {
  commandIds: string[];
  kind: 'command' | 'group';
}

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
  const [startingCommandIds, setStartingCommandIds] = useState<string[]>([]);
  const [stoppingCommandIds, setStoppingCommandIds] = useState<string[]>([]);
  const [pendingStart, setPendingStart] = useState<PendingStart | null>(null);

  const resetRunCommandLogs = useTaskMessagesStore(
    (state) => state.resetRunCommandLogs,
  );
  const projectIdRef = useLatestRef(projectId);
  const resetRunCommandLogsRef = useLatestRef(resetRunCommandLogs);
  const taskIdRef = useLatestRef(taskId);
  const workingDirRef = useLatestRef(workingDir);

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

  const runStart = useCallback(
    async (commandIds: string[], kind: PendingStart['kind']) => {
      const uniqueCommandIds = [...new Set(commandIds)];
      const currentProjectId = projectIdRef.current;
      const currentResetRunCommandLogs = resetRunCommandLogsRef.current;
      const currentTaskId = taskIdRef.current;
      const currentWorkingDir = workingDirRef.current;
      try {
        setStartingCommandIds(uniqueCommandIds);
        setPortsInUseError(null);
        setPendingStart({ commandIds: uniqueCommandIds, kind });

        await Promise.all(
          uniqueCommandIds.map((runCommandId) =>
            api.runCommands.stopCommand({ taskId: currentTaskId, runCommandId }),
          ),
        );

        await Promise.all(
          uniqueCommandIds.map((runCommandId) => {
            const generation = currentResetRunCommandLogs(
              currentTaskId,
              runCommandId,
            );
            return api.runCommands.resetLogs({
              taskId: currentTaskId,
              runCommandId,
              generation,
            });
          }),
        );

        const result =
          uniqueCommandIds.length === 1
            ? await api.runCommands.startCommand({
                taskId: currentTaskId,
                projectId: currentProjectId,
                workingDir: currentWorkingDir,
                runCommandId: uniqueCommandIds[0],
              })
            : await api.runCommands.startGroup({
                taskId: currentTaskId,
                projectId: currentProjectId,
                workingDir: currentWorkingDir,
                runCommandIds: uniqueCommandIds,
              });

        if (isPortsInUseError(result)) {
          setPortsInUseError(result);
          return;
        }

        setStatus(result);
        setPendingStart(null);
      } finally {
        setStartingCommandIds([]);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const startCommand = useCallback(
    async (runCommandId: string) => runStart([runCommandId], 'command'),
    [runStart],
  );

  const startGroup = useCallback(
    async (runCommandIds: string[]) => runStart(runCommandIds, 'group'),
    [runStart],
  );

  const stopCommand = useCallback(
    async (runCommandId: string) => {
      setStoppingCommandIds([runCommandId]);
      try {
        await api.runCommands.stopCommand({
          taskId: taskIdRef.current,
          runCommandId,
        });
      } finally {
        setStoppingCommandIds([]);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const stopGroup = useCallback(
    async (runCommandIds: string[]) => {
      const uniqueCommandIds = [...new Set(runCommandIds)];
      setStoppingCommandIds(uniqueCommandIds);
      try {
        await Promise.all(
          uniqueCommandIds.map((runCommandId) =>
            api.runCommands.stopCommand({
              taskId: taskIdRef.current,
              runCommandId,
            }),
          ),
        );
      } finally {
        setStoppingCommandIds([]);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const confirmKillPorts = useCallback(async () => {
    if (!portsInUseError || !pendingStart) return;

    const commandIds = [
      ...new Set(portsInUseError.portsInUse.map((port) => port.commandId)),
    ];
    for (const commandId of commandIds) {
      await api.runCommands.killPortsForCommand(projectId, commandId);
    }

    setPortsInUseError(null);
    await runStart(pendingStart.commandIds, pendingStart.kind);
  }, [pendingStart, portsInUseError, projectId, runStart]);

  const dismissPortsError = useCallback(() => {
    setPortsInUseError(null);
    setPendingStart(null);
  }, []);

  const statusByCommandId = useMemo(() => {
    const byId: Record<string, RunStatus['commands'][number]> = {};
    for (const commandStatus of status?.commands ?? []) {
      byId[commandStatus.id] = commandStatus;
    }
    return byId;
  }, [status]);

  const startingCommandIdSet = useMemo(
    () => new Set(startingCommandIds),
    [startingCommandIds],
  );
  const stoppingCommandIdSet = useMemo(
    () => new Set(stoppingCommandIds),
    [stoppingCommandIds],
  );

  return {
    status,
    statusByCommandId,
    isRunning: status?.isRunning ?? false,
    isCommandStarting: (commandId: string) =>
      startingCommandIdSet.has(commandId),
    isCommandStopping: (commandId: string) =>
      stoppingCommandIdSet.has(commandId),
    isStartingAnyCommand: startingCommandIds.length > 0,
    startCommand,
    startGroup,
    stopCommand,
    stopGroup,
    portsInUseError,
    confirmKillPorts,
    dismissPortsError,
  };
}
