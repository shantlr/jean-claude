import { query } from '@anthropic-ai/claude-agent-sdk';

import { dbg } from '../lib/debug';
import { TaskRepository } from '../database/repositories';


import { emitTaskUpsert } from './cache-event-service';

type TaskId = string;
type ActiveTask = {
  taskId: string;
  abortController: AbortController;
};

const ACTIVE_TASKS: Map<TaskId, ActiveTask> = new Map();

export const TASK_SERVICE = {
  start: async (taskId: TaskId) => {
    if (ACTIVE_TASKS.has(taskId)) {
      throw new Error(`Task ${taskId} is already active`);
    }

    const task = await TaskRepository.findById(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    const activeTask: ActiveTask = {
      taskId,
      abortController: new AbortController(),
    };
    ACTIVE_TASKS.set(taskId, activeTask);

    const generator = query({
      prompt: task.prompt,
      options: {},
    });

    try {
      const runningTask = await TaskRepository.update(taskId, {
        status: 'running',
      });
      emitTaskUpsert(runningTask);
      for await (const message of generator) {
        if (activeTask.abortController.signal.aborted) {
          break;
        }
        dbg.agent('Task %s message: %O', taskId, message);
      }

      // this.emit(AGENT_CHANNELS.MESSAGE, { taskId, message });
    } catch (error) {
      dbg.agent('Task %s error: %O', taskId, error);
      const erroredTask = await TaskRepository.update(taskId, {
        status: 'errored',
      });
      emitTaskUpsert(erroredTask);
    }
    const completedTask = await TaskRepository.update(taskId, {
      status: 'completed',
    });
    emitTaskUpsert(completedTask);
  },
  stop: (taskId: TaskId) => {
    const activeTask = ACTIVE_TASKS.get(taskId);
    if (!activeTask) {
      throw new Error(`Task ${taskId} is not active`);
    }
    activeTask.abortController.abort();
  },
};
