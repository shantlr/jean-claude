import type { FeedItem, FeedItemAttention, FeedNote } from '@shared/feed-types';
import type { TaskStatus, TaskStep, TaskStepStatus } from '@shared/types';

import {
  FeedNoteRepository,
  ProjectRepository,
  TaskRepository,
} from '../database/repositories';
import { TaskStepRepository } from '../database/repositories/task-steps';
import { dbg } from '../lib/debug';

import { getCurrentUser, listPullRequests } from './azure-devops-service';
import { getMostRecentlyUpdatedStep } from './step-service';

// In-memory cache for PR feed items to avoid hammering Azure DevOps API
let prCache: { items: FeedItem[]; fetchedAt: number } | null = null;
const PR_CACHE_TTL_MS = 3 * 60 * 1000;

/**
 * Derives the attention level for a task based on its own status and its steps' statuses.
 * Priority order: errored > needs-permission > completed > running > waiting
 */
function deriveTaskAttention({
  taskStatus,
  steps,
}: {
  taskStatus: TaskStatus;
  steps: TaskStep[];
}): FeedItemAttention {
  // Use the most recently updated step's status for errored/interrupted so that
  // earlier failed steps don't keep the feed item marked as errored once a
  // newer step has progressed past that state.
  const mostRecentStep = getMostRecentlyUpdatedStep(steps);
  if (taskStatus === 'errored' || mostRecentStep?.status === 'errored') {
    return 'errored';
  }

  if (
    taskStatus === 'interrupted' ||
    mostRecentStep?.status === 'interrupted'
  ) {
    return 'interrupted';
  }

  // Waiting can mean different things (permission, question, or general wait).
  // We keep this neutral here and let renderer-side state refine the attention
  // to "needs-permission" or "has-question" when pending requests are known.
  if (taskStatus === 'waiting') {
    return 'waiting';
  }

  // If any step completed and no step is running, the task round is complete
  if (taskStatus === 'completed') {
    return 'completed';
  }

  // If any step is actively running
  if (taskStatus === 'running' || steps.some((s) => s.status === 'running')) {
    return 'running';
  }

  // Fallback: task exists but nothing active
  return 'waiting';
}

/**
 * Returns the subtitle text for a feed item based on the most relevant step.
 */
function getSubtitleFromSteps({
  stepStatuses,
  stepNames,
}: {
  stepStatuses: TaskStepStatus[];
  stepNames: string[];
}): string | undefined {
  // Find the most relevant step: first running, then first errored, then last completed
  const runningIdx = stepStatuses.indexOf('running');
  if (runningIdx !== -1) {
    return stepNames[runningIdx];
  }

  const erroredIdx = stepStatuses.indexOf('errored');
  if (erroredIdx !== -1) {
    return stepNames[erroredIdx];
  }

  // Last completed step
  for (let i = stepStatuses.length - 1; i >= 0; i--) {
    if (stepStatuses[i] === 'completed') {
      return stepNames[i];
    }
  }

  return undefined;
}

/**
 * Aggregates active and recently completed tasks into FeedItem[].
 */
export async function getFeedItems(): Promise<FeedItem[]> {
  dbg.feed('getFeedItems: fetching active tasks');

  const activeTasks = await TaskRepository.findAllActive();
  const stepsByTaskId = await TaskStepRepository.findByTaskIds(
    activeTasks.map((task) => task.id),
  );
  dbg.feed('getFeedItems: %d active', activeTasks.length);

  const feedItems: FeedItem[] = [];

  for (const task of activeTasks) {
    const steps = stepsByTaskId[task.id] ?? [];
    const stepStatuses = steps.map((s) => s.status);
    const stepNames = steps.map((s) => s.name);

    const attention = deriveTaskAttention({
      taskStatus: task.status,
      steps,
    });

    const subtitle = getSubtitleFromSteps({ stepStatuses, stepNames });

    // The findAllActive / findAllCompleted queries join with projects table
    // and include projectName, projectColor, projectPriority as extra fields.
    const taskWithProject = task as typeof task & {
      projectName: string;
      projectColor: string;
      projectPriority: 'high' | 'normal' | 'low';
    };

    feedItems.push({
      id: `task:${task.id}`,
      source: 'task',
      attention,
      timestamp: task.updatedAt,
      projectId: task.projectId,
      projectName: taskWithProject.projectName,
      projectColor: taskWithProject.projectColor,
      projectPriority: taskWithProject.projectPriority,
      title: task.name ?? task.prompt.slice(0, 80),
      subtitle,
      hasUnread: task.hasUnread,
      taskId: task.id,
      pullRequestId: task.pullRequestId
        ? parseInt(task.pullRequestId, 10)
        : undefined,
      pullRequestUrl: task.pullRequestUrl ?? undefined,
    });
  }

  // Fetch PR items (with cache to avoid hammering Azure DevOps API)
  const prItems = await fetchPrFeedItems();

  // Fetch note items
  const noteItems = await fetchNoteFeedItems();

  const allItems = [...feedItems, ...prItems, ...noteItems];

  dbg.feed(
    'getFeedItems: returning %d items (%d tasks, %d PRs, %d notes)',
    allItems.length,
    feedItems.length,
    prItems.length,
    noteItems.length,
  );
  return allItems;
}

async function fetchNoteFeedItems(): Promise<FeedItem[]> {
  const notes = await FeedNoteRepository.findAll();
  return notes
    .filter((note) => !note.completedAt)
    .map((note) => ({
      id: `note:${note.id}`,
      source: 'note' as const,
      attention: 'note' as const,
      timestamp: note.updatedAt,
      projectId: '',
      projectName: '',
      projectColor: '',
      projectPriority: 'normal' as const,
      title: note.content,
      noteId: note.id,
    }));
}

// --- Feed note CRUD ---

export async function getFeedNotes(): Promise<FeedNote[]> {
  return FeedNoteRepository.findAll();
}

export async function createFeedNote({
  content,
}: {
  content: string;
}): Promise<FeedNote> {
  return FeedNoteRepository.create({ content });
}

export async function updateFeedNote({
  id,
  content,
  completedAt,
}: {
  id: string;
  content?: string;
  completedAt?: string | null;
}): Promise<FeedNote> {
  return FeedNoteRepository.update(id, {
    ...(content !== undefined ? { content } : {}),
    ...(completedAt !== undefined ? { completedAt } : {}),
  });
}

export async function deleteFeedNote({ id }: { id: string }): Promise<void> {
  await FeedNoteRepository.delete(id);
}

async function fetchPrFeedItems(): Promise<FeedItem[]> {
  // Return cached items if still fresh
  if (prCache && Date.now() - prCache.fetchedAt < PR_CACHE_TTL_MS) {
    dbg.feed('fetchPrFeedItems: using cache (%d items)', prCache.items.length);
    return prCache.items;
  }

  dbg.feed('fetchPrFeedItems: fetching from Azure DevOps');
  const projects = await ProjectRepository.findAll();
  const repoProjects = projects.filter(
    (p) => p.repoProviderId && p.repoProjectId && p.repoId,
  );

  const providerUserEmailMap = new Map<string, string>();
  await Promise.all(
    [...new Set(repoProjects.map((p) => p.repoProviderId).filter(Boolean))].map(
      async (providerId) => {
        if (!providerId) return;
        try {
          const currentUser = await getCurrentUser(providerId);
          providerUserEmailMap.set(
            providerId,
            currentUser.emailAddress.toLowerCase(),
          );
        } catch (err) {
          dbg.feed(
            'fetchPrFeedItems: error fetching current user for provider %s: %O',
            providerId,
            err,
          );
        }
      },
    ),
  );

  const projectItems = await Promise.all(
    repoProjects.map(async (project) => {
      try {
        const prs = await listPullRequests({
          providerId: project.repoProviderId!,
          projectId: project.repoProjectId!,
          repoId: project.repoId!,
          status: 'active',
        });

        return prs.map(
          (pr): FeedItem => ({
            id: `pr:${project.id}:${pr.id}`,
            source: 'pull-request',
            attention: 'review-requested',
            timestamp: pr.creationDate,
            projectId: project.id,
            projectName: project.name,
            projectColor: project.color,
            projectPriority: project.priority as 'high' | 'normal' | 'low',
            title: pr.title,
            subtitle: pr.createdBy.displayName,
            ownerName: pr.createdBy.displayName,
            isOwnedByCurrentUser:
              !!project.repoProviderId &&
              pr.createdBy.uniqueName.toLowerCase() ===
                providerUserEmailMap.get(project.repoProviderId),
            isDraft: pr.isDraft,
            pullRequestId: pr.id,
            pullRequestUrl: pr.url,
          }),
        );
      } catch (err) {
        // Non-fatal: skip this project's PRs on error
        dbg.feed(
          'fetchPrFeedItems: error fetching PRs for project %s: %O',
          project.id,
          err,
        );
        return [];
      }
    }),
  );

  const prItems = projectItems.flat();

  prCache = { items: prItems, fetchedAt: Date.now() };
  dbg.feed('fetchPrFeedItems: cached %d PR items', prItems.length);
  return prItems;
}
