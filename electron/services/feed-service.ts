import type { FeedItem, FeedItemAttention, FeedNote } from '@shared/feed-types';
import type { TaskStatus, TaskStep, TaskStepStatus } from '@shared/types';

import {
  FeedNoteRepository,
  ProjectRepository,
  TaskRepository,
} from '../database/repositories';
import { PrViewSnapshotRepository } from '../database/repositories/pr-view-snapshots';
import { TaskStepRepository } from '../database/repositories/task-steps';
import { dbg } from '../lib/debug';

import {
  getCurrentUser,
  getPullRequestActivityMetadata,
  getPullRequestStatuses,
  listPullRequests,
  queryAssignedWorkItems,
} from './azure-devops-service';
import type { LinkedPr } from './azure-devops-service';
import { getMostRecentlyUpdatedStep } from './step-service';

// In-memory cache for PR feed items to avoid hammering Azure DevOps API
let prCache: { items: FeedItem[]; fetchedAt: number } | null = null;
const PR_CACHE_TTL_MS = 3 * 60 * 1000;

let activityCache: {
  metadata: Map<
    string,
    {
      lastCommitDate: string | null;
      lastThreadActivityDate: string | null;
      activeThreadCount: number;
    }
  >;
  fetchedAt: number;
} | null = null;

let workItemCache: { items: FeedItem[]; fetchedAt: number } | null = null;
const WORK_ITEM_CACHE_TTL_MS = 3 * 60 * 1000;

export function invalidatePrCache(): void {
  prCache = null;
  activityCache = null;
}

export function invalidateWorkItemCache(): void {
  workItemCache = null;
}

const PR_ACTIVITY_CHUNK_SIZE = 10;

async function runInChunks<T>(
  items: T[],
  chunkSize: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    await Promise.all(chunk.map(fn));
  }
}

function isNewerActivity({
  latest,
  viewed,
}: {
  latest: string | null;
  viewed: string | null;
}): boolean {
  if (!latest) return false;
  if (!viewed) return true;
  return latest > viewed;
}

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

    const taskFeedItem: FeedItem = {
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
      taskType: task.type,
      pendingMessage: task.pendingMessage ?? undefined,
      pullRequestId: task.pullRequestId
        ? parseInt(task.pullRequestId, 10)
        : undefined,
      pullRequestUrl: task.pullRequestUrl ?? undefined,
      workItemIds: task.workItemIds ?? undefined,
    };

    feedItems.push(taskFeedItem);
  }

  // Fetch PR items (with cache to avoid hammering Azure DevOps API)
  const prItems = await fetchPrFeedItems();

  // Fetch note items
  const noteItems = await fetchNoteFeedItems();

  const workItemItems = await fetchWorkItemFeedItems(prItems);

  // Filter out work items that already have an associated task
  const taskWorkItemIds = new Set(
    activeTasks.flatMap((t) => (t.workItemIds ?? []).map(Number)),
  );

  const filteredWorkItems = workItemItems.filter(
    (wi) => wi.workItemId === undefined || !taskWorkItemIds.has(wi.workItemId),
  );

  // --- Enrich task feed items with PR status ---
  // Build a set of known active PR IDs from the PR feed
  const activePrMap = new Map(
    prItems
      .filter((p) => p.pullRequestId)
      .map((p) => [p.pullRequestId as number, { isDraft: !!p.isDraft }]),
  );

  // Propagate work item PR status to task feed items whose work items were
  // filtered out — so the PR icon still shows on the task card.
  const workItemPrStatusMap = new Map<
    number,
    { status: 'active' | 'completed' | 'abandoned'; url?: string }
  >();
  for (const wi of workItemItems) {
    if (wi.workItemId && wi.workItemPrStatus) {
      workItemPrStatusMap.set(wi.workItemId, {
        status: wi.workItemPrStatus,
        url: wi.workItemPrUrl,
      });
    }
  }

  // Collect task PRs that need status fetching (not already active in feed)
  const projects = await ProjectRepository.findAll();
  const projectsById = new Map(projects.map((p) => [p.id, p]));

  const taskPrsToFetch: {
    item: FeedItem;
    linkedPr: LinkedPr;
    providerId: string;
  }[] = [];

  for (const item of feedItems) {
    if (item.source !== 'task') continue;

    // Case 1: task has pullRequestId directly — check if we know the status
    if (item.pullRequestId) {
      const activePrInfo = activePrMap.get(item.pullRequestId);
      if (activePrInfo) {
        // PR is active in the feed — mark it
        item.workItemPrStatus = 'active';
        item.isDraft = activePrInfo.isDraft;
      } else {
        // Need to fetch status — parse project/repo from the task's project config
        const project = projectsById.get(item.projectId);
        if (
          project?.repoProviderId &&
          project.repoProjectId &&
          project.repoId
        ) {
          taskPrsToFetch.push({
            item,
            linkedPr: {
              prId: item.pullRequestId,
              projectId: project.repoProjectId,
              repoId: project.repoId,
            },
            providerId: project.repoProviderId,
          });
        }
      }
      continue;
    }

    // Case 2: task has no pullRequestId — propagate from linked work items
    if (item.workItemIds) {
      for (const wiIdStr of item.workItemIds) {
        const prInfo = workItemPrStatusMap.get(Number(wiIdStr));
        if (prInfo) {
          item.workItemPrStatus = prInfo.status;
          item.workItemPrUrl = prInfo.url;
          break;
        }
      }
    }
  }

  // Fetch unknown task PR statuses grouped by provider
  if (taskPrsToFetch.length > 0) {
    const byProvider = new Map<
      string,
      { item: FeedItem; linkedPr: LinkedPr }[]
    >();
    for (const entry of taskPrsToFetch) {
      if (!byProvider.has(entry.providerId)) {
        byProvider.set(entry.providerId, []);
      }
      byProvider.get(entry.providerId)!.push(entry);
    }

    for (const [providerId, entries] of byProvider) {
      try {
        const statuses = await getPullRequestStatuses({
          providerId,
          linkedPrs: entries.map((e) => e.linkedPr),
        });
        for (const entry of entries) {
          const status = statuses.get(entry.linkedPr.prId);
          if (status) {
            entry.item.workItemPrStatus = status.status;
            entry.item.isDraft = status.isDraft;
            if (status.url) {
              entry.item.workItemPrUrl = status.url;
            }
          }
        }
      } catch (err) {
        dbg.feed(
          'Error fetching task PR statuses for provider %s: %O',
          providerId,
          err,
        );
      }
    }
  }

  const allItems = [
    ...feedItems,
    ...prItems,
    ...noteItems,
    ...filteredWorkItems,
  ];

  dbg.feed(
    'getFeedItems: returning %d items (%d tasks, %d PRs, %d notes, %d work items [%d filtered])',
    allItems.length,
    feedItems.length,
    prItems.length,
    noteItems.length,
    filteredWorkItems.length,
    workItemItems.length - filteredWorkItems.length,
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
    (p) => p.repoProviderId && p.repoProjectId && p.repoId && p.showPrsInFeed,
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
            approvedBy: pr.reviewers
              .filter(
                (r) =>
                  !r.isContainer &&
                  (r.voteStatus === 'approved' ||
                    r.voteStatus === 'approved-with-suggestions'),
              )
              .map((r) => ({
                displayName: r.displayName,
                uniqueName: r.uniqueName,
                imageUrl: r.imageUrl,
              })),
            isApprovedByMe:
              !!project.repoProviderId &&
              pr.reviewers.some(
                (r) =>
                  !r.isContainer &&
                  (r.voteStatus === 'approved' ||
                    r.voteStatus === 'approved-with-suggestions') &&
                  r.uniqueName.toLowerCase() ===
                    providerUserEmailMap.get(project.repoProviderId!),
              ),
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
  const repoProjectsById = new Map(
    repoProjects.map((project) => [project.id, project]),
  );

  // Fetch activity metadata for each PR (cached separately)
  const shouldRefreshActivity =
    !activityCache || Date.now() - activityCache.fetchedAt > PR_CACHE_TTL_MS;

  if (shouldRefreshActivity) {
    const metadataMap = new Map<
      string,
      {
        lastCommitDate: string | null;
        lastThreadActivityDate: string | null;
        activeThreadCount: number;
      }
    >();

    await runInChunks(prItems, PR_ACTIVITY_CHUNK_SIZE, async (item) => {
      if (!item.pullRequestId) return;
      const project = repoProjectsById.get(item.projectId);
      if (!project?.repoProviderId || !project.repoProjectId || !project.repoId)
        return;

      try {
        const metadata = await getPullRequestActivityMetadata({
          providerId: project.repoProviderId,
          projectId: project.repoProjectId,
          repoId: project.repoId,
          pullRequestId: item.pullRequestId,
        });
        metadataMap.set(item.id, metadata);
      } catch (err) {
        dbg.feed(
          'fetchPrFeedItems: error fetching activity for %s: %O',
          item.id,
          err,
        );
      }
    });

    activityCache = { metadata: metadataMap, fetchedAt: Date.now() };
  }

  // Load all snapshots for comparison
  const snapshotsByProject = new Map<
    string,
    Map<
      string,
      { lastCommitDate: string | null; lastThreadActivityDate: string | null }
    >
  >();
  const projectIds = [...new Set(prItems.map((item) => item.projectId))];
  await Promise.all(
    projectIds.map(async (projectId) => {
      const snapshots = await PrViewSnapshotRepository.findByProject(projectId);
      const map = new Map<
        string,
        {
          lastCommitDate: string | null;
          lastThreadActivityDate: string | null;
        }
      >();
      for (const s of snapshots) {
        map.set(s.pullRequestId, {
          lastCommitDate: s.lastCommitDate,
          lastThreadActivityDate: s.lastThreadActivityDate,
        });
      }
      snapshotsByProject.set(projectId, map);
    }),
  );

  // Enrich each PR item with activity data
  const enrichedItems = prItems.map((item) => {
    if (!item.pullRequestId) return item;

    const metadata = activityCache?.metadata.get(item.id);
    const snapshot = snapshotsByProject
      .get(item.projectId)
      ?.get(String(item.pullRequestId));

    // Determine hasNewActivity by comparing timestamps.
    // If the user has never viewed this PR (no snapshot), any existing activity
    // counts as new so the blue dot appears.
    let hasNewActivity = false;
    if (metadata) {
      if (!snapshot) {
        // Never viewed — any activity at all means new
        hasNewActivity =
          !!metadata.lastCommitDate || !!metadata.lastThreadActivityDate;
      } else {
        const newCommits = isNewerActivity({
          latest: metadata.lastCommitDate,
          viewed: snapshot.lastCommitDate,
        });
        const newThreads = isNewerActivity({
          latest: metadata.lastThreadActivityDate,
          viewed: snapshot.lastThreadActivityDate,
        });
        hasNewActivity = newCommits || newThreads;
      }
    }

    const activeThreadCount = metadata?.activeThreadCount ?? 0;

    // Determine attention level
    let attention = item.attention;
    if (item.isApprovedByMe && !hasNewActivity) {
      attention = 'pr-approved-by-me' as const;
    } else if (hasNewActivity) {
      attention = 'review-requested' as const;
    } else if (activeThreadCount > 0) {
      attention = 'pr-comments' as const;
    }

    return {
      ...item,
      attention,
      hasNewActivity,
      activeThreadCount,
    };
  });

  prCache = { items: enrichedItems, fetchedAt: Date.now() };
  dbg.feed('fetchPrFeedItems: cached %d PR items', enrichedItems.length);
  return enrichedItems;
}

async function fetchWorkItemFeedItems(
  prFeedItems: FeedItem[],
): Promise<FeedItem[]> {
  if (
    workItemCache &&
    Date.now() - workItemCache.fetchedAt < WORK_ITEM_CACHE_TTL_MS
  ) {
    dbg.feed(
      'fetchWorkItemFeedItems: using cache (%d items)',
      workItemCache.items.length,
    );
    return workItemCache.items;
  }

  dbg.feed('fetchWorkItemFeedItems: fetching from Azure DevOps');
  const projects = await ProjectRepository.findAll();
  const wiProjects = projects.filter(
    (p) =>
      p.workItemProviderId && p.workItemProjectName && p.showWorkItemsInFeed,
  );

  if (wiProjects.length === 0) {
    workItemCache = { items: [], fetchedAt: Date.now() };
    return [];
  }

  // Build a map of known active PRs from the already-fetched PR feed items
  const knownActivePrs = new Map<
    number,
    { status: 'active' | 'completed' | 'abandoned'; url: string }
  >();
  for (const prItem of prFeedItems) {
    if (prItem.pullRequestId) {
      knownActivePrs.set(prItem.pullRequestId, {
        status: 'active',
        url: prItem.pullRequestUrl ?? '',
      });
    }
  }

  const feedItems: FeedItem[] = [];
  const seen = new Set<string>();

  // Collect linked PRs that we DON'T already know about (not in the active PR feed)
  const unknownPrsByProvider = new Map<string, LinkedPr[]>();
  const workItemPrMap = new Map<number, LinkedPr[]>(); // workItemId → linked PRs

  for (const project of wiProjects) {
    const key = `${project.workItemProviderId}:${project.workItemProjectName}`;
    if (seen.has(key)) continue;
    seen.add(key);

    try {
      const workItems = await queryAssignedWorkItems({
        providerId: project.workItemProviderId!,
        projectName: project.workItemProjectName!,
      });

      for (const wi of workItems) {
        // Track linked PRs — only queue unknown ones for fetching
        if (wi.linkedPrs && wi.linkedPrs.length > 0) {
          workItemPrMap.set(wi.id, wi.linkedPrs);
          const providerId = project.workItemProviderId!;
          for (const lpr of wi.linkedPrs) {
            if (!knownActivePrs.has(lpr.prId)) {
              if (!unknownPrsByProvider.has(providerId)) {
                unknownPrsByProvider.set(providerId, []);
              }
              unknownPrsByProvider.get(providerId)!.push(lpr);
            }
          }
        }

        feedItems.push({
          id: `work-item:${project.id}:${wi.id}`,
          source: 'work-item',
          attention: 'assigned-work-item',
          timestamp: wi.fields.changedDate ?? new Date().toISOString(),
          projectId: project.id,
          projectName: project.name,
          projectColor: project.color,
          projectPriority:
            (project.priority as 'high' | 'normal' | 'low') ?? 'normal',
          title: wi.fields.title,
          subtitle: `${wi.fields.workItemType} #${wi.id}`,
          workItemId: wi.id,
          workItemUrl: wi.url,
          workItemType: wi.fields.workItemType,
          workItemState: wi.fields.state,
        });
      }
    } catch (err) {
      dbg.feed(
        'fetchWorkItemFeedItems: error fetching work items for project %s: %O',
        project.id,
        err,
      );
    }
  }

  // Only fetch statuses for PRs NOT already in the active PR feed (likely completed/abandoned)
  const allPrStatuses = new Map(knownActivePrs);

  for (const [providerId, linkedPrs] of unknownPrsByProvider) {
    try {
      const statuses = await getPullRequestStatuses({
        providerId,
        linkedPrs,
      });
      for (const [prId, status] of statuses) {
        allPrStatuses.set(prId, status);
      }
    } catch (err) {
      dbg.feed(
        'fetchWorkItemFeedItems: error fetching PR statuses for provider %s: %O',
        providerId,
        err,
      );
    }
  }

  // Enrich feed items with PR status (use the "best" status: completed > active > abandoned)
  for (const item of feedItems) {
    if (!item.workItemId) continue;
    const linkedPrs = workItemPrMap.get(item.workItemId);
    if (!linkedPrs || linkedPrs.length === 0) continue;

    // Pick the most relevant PR status
    let bestStatus: 'active' | 'completed' | 'abandoned' | undefined;
    let bestUrl: string | undefined;
    for (const lpr of linkedPrs) {
      const prInfo = allPrStatuses.get(lpr.prId);
      if (!prInfo) continue;
      // Prefer completed (merged), then active, then abandoned
      if (
        !bestStatus ||
        prInfo.status === 'completed' ||
        (prInfo.status === 'active' && bestStatus !== 'completed')
      ) {
        bestStatus = prInfo.status;
        bestUrl = prInfo.url;
      }
    }

    if (bestStatus) {
      item.workItemPrStatus = bestStatus;
      item.workItemPrUrl = bestUrl;
    }
  }

  workItemCache = { items: feedItems, fetchedAt: Date.now() };
  dbg.feed(
    'fetchWorkItemFeedItems: cached %d work item items',
    feedItems.length,
  );
  return feedItems;
}
