import { useState, useEffect, useCallback } from 'react';

import { api } from '@/lib/api';

import type { RunStatus, PortsInUseErrorData } from '../../shared/run-command-types';
import { isPortsInUseError } from '../../shared/run-command-types';

export function useRunCommands(projectId: string, workingDir: string) {
  const [status, setStatus] = useState<RunStatus | null>(null);
  const [portsInUseError, setPortsInUseError] = useState<PortsInUseErrorData | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);

  // Fetch initial status
  useEffect(() => {
    api.runCommands.getStatus(projectId).then(setStatus);
  }, [projectId]);

  // Subscribe to status changes
  useEffect(() => {
    const unsubscribe = api.runCommands.onStatusChange((changedProjectId, newStatus) => {
      if (changedProjectId === projectId) {
        setStatus(newStatus);
      }
    });
    return unsubscribe;
  }, [projectId]);

  const start = useCallback(async () => {
    setIsStarting(true);
    setPortsInUseError(null);
    try {
      const result = await api.runCommands.start(projectId, workingDir);
      if (isPortsInUseError(result)) {
        setPortsInUseError(result);
      } else {
        setStatus(result);
      }
    } finally {
      setIsStarting(false);
    }
  }, [projectId, workingDir]);

  const stop = useCallback(async () => {
    setIsStopping(true);
    try {
      await api.runCommands.stop(projectId);
    } finally {
      setIsStopping(false);
    }
  }, [projectId]);

  const confirmKillPorts = useCallback(async () => {
    if (!portsInUseError) return;

    // Kill ports for each affected command
    const commandIds = [...new Set(portsInUseError.portsInUse.map((p) => p.commandId))];
    for (const commandId of commandIds) {
      await api.runCommands.killPortsForCommand(projectId, commandId);
    }

    setPortsInUseError(null);

    // Retry start
    await start();
  }, [projectId, portsInUseError, start]);

  const dismissPortsError = useCallback(() => {
    setPortsInUseError(null);
  }, []);

  return {
    status,
    isRunning: status?.isRunning ?? false,
    isStarting,
    isStopping,
    start,
    stop,
    portsInUseError,
    confirmKillPorts,
    dismissPortsError,
  };
}
