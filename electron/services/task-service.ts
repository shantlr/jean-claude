import { query } from "@anthropic-ai/claude-agent-sdk";

import { TaskRepository } from "../database/repositories";

type TaskId = string;
type ActiveTask = {
  taskId: string;
  abortController: AbortController;
}

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
      options: {
      },
    });

    try {
      await TaskRepository.update(taskId, { status: 'running' });
      for await (const message of generator) {
        if (activeTask.abortController.signal.aborted) {
          break;
        }
        console.log(`[TaskService] Task ${taskId} message:`, message);
      }

    // this.emit(AGENT_CHANNELS.MESSAGE, { taskId, message });
    } catch (error) {
      console.error(`[TaskService] Task ${taskId} error:`, error);
      await TaskRepository.update(taskId, { status: 'errored' });
    }
    await TaskRepository.update(taskId, { status: 'completed' });
  },
  stop: (taskId: TaskId) => {
    const activeTask = ACTIVE_TASKS.get(taskId);
    if (!activeTask) {
      throw new Error(`Task ${taskId} is not active`);
    }
    activeTask.abortController.abort();
  },
}