import { beforeEach, describe, expect, it } from 'vitest';

import type { NormalizedEntry } from '@shared/normalized-message-v2';

import { useTaskMessagesStore } from './task-messages';

describe('task messages store', () => {
  beforeEach(() => {
    useTaskMessagesStore.setState({
      steps: {},
      runCommandLogs: {},
      runCommandLogGenerations: {},
      runCommandRunning: {},
    });
  });

  it('keeps run-command output without newline as pending line', () => {
    const store = useTaskMessagesStore.getState();

    store.appendRunCommandLogBatch('task-1', 'cmd-1', 'stdout', 'building', 0);

    const log =
      useTaskMessagesStore.getState().runCommandLogs['task-1']['cmd-1'];

    expect(log.chunks).toEqual([]);
    expect(log.totalLineCount).toBe(0);
    expect(log.pendingLines.stdout).toMatchObject({
      stream: 'stdout',
      line: 'building',
    });
  });

  it('moves pending run-command output into chunks after newline', () => {
    const store = useTaskMessagesStore.getState();

    store.appendRunCommandLogBatch('task-1', 'cmd-1', 'stdout', 'building', 0);
    store.appendRunCommandLogBatch(
      'task-1',
      'cmd-1',
      'stdout',
      ' done\nnext',
      0,
    );

    const log =
      useTaskMessagesStore.getState().runCommandLogs['task-1']['cmd-1'];

    expect(log.totalLineCount).toBe(1);
    expect(log.chunks).toHaveLength(1);
    expect(log.chunks[0].lines).toHaveLength(1);
    expect(log.chunks[0].lines[0]).toMatchObject({
      stream: 'stdout',
      line: 'building done',
    });
    expect(log.pendingLines.stdout).toMatchObject({ line: 'next' });
  });

  it('keeps pending run-command output separate by stream', () => {
    const store = useTaskMessagesStore.getState();

    store.appendRunCommandLogBatch('task-1', 'cmd-1', 'stdout', 'out', 0);
    store.appendRunCommandLogBatch('task-1', 'cmd-1', 'stderr', 'err\n', 0);

    const log =
      useTaskMessagesStore.getState().runCommandLogs['task-1']['cmd-1'];

    expect(log.chunks[0].lines).toHaveLength(1);
    expect(log.chunks[0].lines[0]).toMatchObject({
      stream: 'stderr',
      line: 'err',
    });
    expect(log.pendingLines.stdout).toMatchObject({ line: 'out' });
    expect(log.pendingLines.stderr).toBeNull();
  });

  it('drops stale run-command log batches after reset', () => {
    const store = useTaskMessagesStore.getState();

    store.appendRunCommandLogBatch('task-1', 'cmd-1', 'stdout', 'old', 0);
    const generation = store.resetRunCommandLogs('task-1', 'cmd-1');
    store.appendRunCommandLogBatch('task-1', 'cmd-1', 'stdout', 'stale', 0);
    store.appendRunCommandLogBatch(
      'task-1',
      'cmd-1',
      'stdout',
      'new',
      generation,
    );

    const log =
      useTaskMessagesStore.getState().runCommandLogs['task-1']['cmd-1'];

    expect(generation).toBeGreaterThan(0);
    expect(log.pendingLines.stdout).toMatchObject({ line: 'new' });
  });

  it('applies authoritative reset generation and clears queued logs', () => {
    const store = useTaskMessagesStore.getState();

    store.appendRunCommandLogBatch('task-1', 'cmd-1', 'stdout', 'old', 10);
    store.applyRunCommandLogsReset('task-1', 'cmd-1', 11);
    store.appendRunCommandLogBatch('task-1', 'cmd-1', 'stdout', 'stale', 10);
    store.appendRunCommandLogBatch('task-1', 'cmd-1', 'stdout', 'new', 11);

    const log =
      useTaskMessagesStore.getState().runCommandLogs['task-1']['cmd-1'];

    expect(log.pendingLines.stdout).toMatchObject({ line: 'new' });
  });

  it('does not let delayed batches shorten refetched text entries', () => {
    const store = useTaskMessagesStore.getState();
    const olderEntry: NormalizedEntry = {
      id: 'msg-1',
      date: '2026-01-01T00:00:00.000Z',
      type: 'assistant-message',
      value: 'hello',
    };
    const refetchedEntry: NormalizedEntry = {
      ...olderEntry,
      value: 'hello world',
    };

    store.loadStep('step-1', 'task-1', [refetchedEntry], 'running');
    store.applyEntryBatch([
      { stepId: 'step-1', entry: olderEntry, mode: 'upsert' },
    ]);

    expect(useTaskMessagesStore.getState().steps['step-1'].messages).toEqual([
      refetchedEntry,
    ]);
  });

  it('does not let delayed batches remove refetched tool results', () => {
    const store = useTaskMessagesStore.getState();
    const pendingTool: NormalizedEntry = {
      id: 'tool-entry-1',
      date: '2026-01-01T00:00:00.000Z',
      type: 'tool-use',
      toolId: 'tool-1',
      name: 'read',
      input: { filePath: 'README.md' },
    };
    const completedTool: NormalizedEntry = {
      ...pendingTool,
      result: 'contents',
    };

    store.loadStep('step-1', 'task-1', [completedTool], 'running');
    store.applyEntryBatch([
      { stepId: 'step-1', entry: pendingTool, mode: 'append' },
    ]);

    expect(useTaskMessagesStore.getState().steps['step-1'].messages).toEqual([
      completedTool,
    ]);
  });
});
