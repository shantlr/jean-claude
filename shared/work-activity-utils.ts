import type { WorkActivityEvent } from './work-activity-types';

export const WORK_ACTIVITY_PROMPT_SNIPPET_LIMIT = 500;

export type WorkActivityPromptSnapshot = {
  promptSnippet: string;
  promptLength: number;
};

export type GroupedWorkActivityWorkItem = {
  workItemId: string;
  events: WorkActivityEvent[];
};

export type GroupedWorkActivityProject = {
  projectId: string;
  projectName: string | null;
  workItems: GroupedWorkActivityWorkItem[];
};

export type GroupedWorkActivityDay = {
  date: string;
  projects: GroupedWorkActivityProject[];
};

export function buildPromptSnapshot(
  prompt: string,
): WorkActivityPromptSnapshot {
  return {
    promptSnippet: prompt.slice(0, WORK_ACTIVITY_PROMPT_SNIPPET_LIMIT),
    promptLength: prompt.length,
  };
}

export function parseAzureOrgId(baseUrl: string | null): string | null {
  if (!baseUrl) {
    return null;
  }

  try {
    const url = new URL(baseUrl);
    const host = url.hostname.toLowerCase();
    if (host === 'dev.azure.com') {
      return url.pathname.split('/').filter(Boolean)[0] ?? null;
    }

    if (host.endsWith('.visualstudio.com')) {
      return url.hostname.split('.')[0] || null;
    }
  } catch {
    return null;
  }

  return null;
}

export function getWeekRange(isoDate: string): { start: string; end: string } {
  const date = new Date(isoDate);
  const day = date.getUTCDay();
  const daysSinceMonday = (day + 6) % 7;
  const start = new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate() - daysSinceMonday,
    ),
  );
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 7);

  return { start: start.toISOString(), end: end.toISOString() };
}

export function groupWorkActivityEvents(
  events: WorkActivityEvent[],
): GroupedWorkActivityDay[] {
  const days = new Map<string, Map<string, GroupedWorkActivityProject>>();

  for (const event of events) {
    const date = new Date(event.occurredAt).toISOString().slice(0, 10);
    const projectId = event.projectId ?? 'unknown-project';
    const workItemIds =
      event.workItemIds.length > 0 ? event.workItemIds : ['no-work-item'];

    let projects = days.get(date);
    if (!projects) {
      projects = new Map();
      days.set(date, projects);
    }

    let project = projects.get(projectId);
    if (!project) {
      project = {
        projectId,
        projectName: event.projectName,
        workItems: [],
      };
      projects.set(projectId, project);
    }

    for (const workItemId of workItemIds) {
      let workItem = project.workItems.find(
        (item) => item.workItemId === workItemId,
      );
      if (!workItem) {
        workItem = { workItemId, events: [] };
        project.workItems.push(workItem);
      }
      workItem.events.push(event);
    }
  }

  return [...days.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, projects]) => ({
      date,
      projects: [...projects.values()]
        .sort((left, right) => left.projectId.localeCompare(right.projectId))
        .map((project) => ({
          ...project,
          workItems: project.workItems
            .sort((left, right) =>
              left.workItemId.localeCompare(right.workItemId),
            )
            .map((workItem) => ({
              ...workItem,
              events: [...workItem.events].sort((left, right) =>
                left.occurredAt.localeCompare(right.occurredAt),
              ),
            })),
        })),
    }));
}
