import { exec, spawn } from 'child_process';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';

import {
  BrowserWindow,
  Notification,
  app,
  ipcMain,
  dialog,
  shell,
} from 'electron';

import type { AgentBackendType, PromptPart } from '@shared/agent-backend-types';
import {
  AGENT_CHANNELS,
  PermissionResponse,
  QuestionResponse,
} from '@shared/agent-types';
import type {
  CacheSubscription,
  CacheSubscriptionUpdate,
} from '@shared/cache-events';
import type { GlobalPromptResponse } from '@shared/global-prompt-types';
import { getImageMimeType } from '@shared/image-types';
import type {
  NewMcpServerTemplate,
  UpdateMcpServerTemplate,
  NewProjectMcpOverride,
} from '@shared/mcp-types';
import type {
  GetYamlParametersIpcParams,
  QueueBuildIpcParams,
} from '@shared/pipeline-types';
import type {
  NewProjectCommand,
  NewProjectCommandGroup,
  RunCommandConfigItem,
  UpdateProjectCommand,
  UpdateProjectCommandGroup,
} from '@shared/run-command-types';
import type {
  AddGitHubSourceParams,
  InstallSourceItemsParams,
  UpdateSourceInstallParams,
} from '@shared/source-management-types';
import { isValidTeamsJoinUrl } from '@shared/teams-url';
import {
  PRESET_EDITORS,
  type InteractionMode,
  type ModelPreference,
  type ThinkingEffort,
  type AiGenerationSetting,
  type UsageDisplaySetting,
  type EditorSetting,
  type AppSettings,
  type NewToken,
  type UpdateToken,
  type NewTaskStep,
  type Project,
  type Task,
  type UpdateTaskStep,
  type SkillCreationStepMeta,
  type FeatureMapStepMeta,
  isSkillCreationStepMeta,
  isFeatureMapStepMeta,
  isAiSkillSlotsSetting,
  type ReviewerConfig,
  type ReviewStepMeta,
  isOpenAiImageModel,
} from '@shared/types';
import type { UsageProviderType } from '@shared/usage-types';
import type { CreateWorkItemVerificationNoteParams } from '@shared/work-item-verification-note-types';

import type { PermissionScope } from '../../shared/permission-types';
import {
  ProjectRepository,
  TaskRepository,
  ProviderRepository,
  TokenRepository,
  SettingsRepository,
  DebugRepository,
  TaskSummaryRepository,
  ProjectTodoRepository,
  AiUsageRepository,
} from '../database/repositories';
import { McpTemplateRepository } from '../database/repositories/mcp-templates';
import { NotificationRepository } from '../database/repositories/notifications';
import { ProjectCommandGroupRepository } from '../database/repositories/project-command-groups';
import { ProjectCommandRepository } from '../database/repositories/project-commands';
import { ProjectMcpOverrideRepository } from '../database/repositories/project-mcp-overrides';
import { ProjectRunConfigRepository } from '../database/repositories/project-run-config';
import { TaskStepRepository } from '../database/repositories/task-steps';
import { TrackedPipelineRepository } from '../database/repositories/tracked-pipelines';
import { UsageSnapshotRepository } from '../database/repositories/usage-snapshots';
import {
  NewProject,
  NewTask,
  NewProvider,
  UpdateProject,
  UpdateTask,
  UpdateProvider,
} from '../database/schema';
import { dbg } from '../lib/debug';
import { pathExists } from '../lib/fs';
import {
  createAgent,
  deleteAgent,
  disableAgent,
  enableAgent,
  executeLegacyAgentMigration,
  getAgentContent,
  getAllManagedAgents,
  previewLegacyAgentMigration,
  updateAgent,
} from '../services/agent-management-service';
import { agentService } from '../services/agent-service';
import { agentUsageService } from '../services/agent-usage-service';
import {
  listOpenAiBaseImageOptions,
  removeOpenAiBaseImage,
  saveOpenAiBaseImage,
  setOpenAiBaseImageSelection,
} from '../services/ai-generation-settings-service';
import { resolveAiSkillSlot } from '../services/ai-skill-slot-resolver';
import {
  getOrganizationsByTokenId,
  validateTokenAndGetOrganizations,
  getTokenExpiration,
  getProviderDetails,
  queryWorkItems,
  getIterations,
  createPullRequest,
  cloneRepository,
  listPullRequests,
  getPullRequest,
  updatePullRequestTitle,
  updatePullRequestDescription,
  uploadPullRequestAttachment,
  getPullRequestWorkItems,
  linkWorkItemToPr,
  unlinkWorkItemFromPr,
  getPullRequestPolicyEvaluations,
  requeuePolicyEvaluation,
  getPullRequestCommits,
  getPullRequestChanges,
  getPullRequestFileContent,
  getCommitChanges,
  getFileContentAtCommit,
  getPullRequestThreads,
  addPullRequestComment,
  addPullRequestFileComment,
  addThreadReply,
  updateThreadComment,
  deleteThreadComment,
  setThreadCommentLike,
  updateThreadStatus,
  searchIdentities,
  getCurrentUser,
  activateWorkItem,
  listBuilds,
  listReleases,
  getBuild,
  getBuildTimeline,
  getBuildLog,
  getRelease,
  listBranches,
  getBuildDefinitionDetail,
  getYamlPipelineParameters,
  queueBuild,
  createRelease as createAzureRelease,
  cancelBuild,
  votePullRequest,
  setPullRequestAutoComplete,
  publishPullRequest,
  type CloneRepositoryParams,
} from '../services/azure-devops-service';
import { fetchImageAsBase64 } from '../services/azure-image-proxy-service';
import {
  readBackendUserConfig,
  writeBackendUserConfig,
} from '../services/backend-config-settings-service';
import * as backendModelsService from '../services/backend-models-service';
import {
  emitCacheEvent,
  emitStepUpsert,
  emitTaskDelete,
  emitTaskUpsert,
  setCacheSubscriptions,
} from '../services/cache-event-service';
import {
  generateCommitMessageForTask,
  generateMergeMessageForTask,
} from '../services/commit-message-generation-service';
import {
  complete as completeText,
  testCompletion,
  resetClient as resetCompletionClient,
  getDailyUsage as getCompletionDailyUsage,
} from '../services/completion-service';
import {
  CopilotDeviceFlowService,
  type CopilotDeviceCode,
} from '../services/copilot-device-flow-service';
import { closeEditorWindowsForTaskWorktree } from '../services/editor-automation-service';
import {
  createFeedNote,
  deleteFeedNote,
  getFeedItems,
  getNoteFeedItems,
  getPrFeedItems,
  getTaskFeedItems,
  getWorkItemFeedItems,
  invalidatePrCache,
  invalidateWorkItemCache,
  updateFeedNote,
} from '../services/feed-service';
import {
  readGlobalPermissions,
  writeGlobalPermissions,
  validatePermissionScope,
  addGlobalPermission,
  removeGlobalPermission,
  editGlobalPermission,
} from '../services/global-permissions-service';
import { handlePromptResponse } from '../services/global-prompt-service';
import {
  MCP_PRESETS,
  getEnabledTemplatesForProject,
  getUnifiedMcpServers,
  activateMcpServer,
  deactivateMcpServer,
  substituteVariables,
} from '../services/mcp-template-service';
import { generateTaskName } from '../services/name-generation-service';
import { notificationService } from '../services/notification-service';
import {
  addProjectPermission,
  addWorktreePermission,
  buildToolPermissionConfig,
  normalizeToolRequest,
  readProjectPermissions,
  addProjectPermissionRule,
  removeProjectPermissionRule,
  editProjectPermissionRule,
  readSettings,
  writeSettings,
  readProjectPromptPreface,
  writeProjectPromptPreface,
} from '../services/permission-settings-service';
import { pipelineTrackingService } from '../services/pipeline-tracking-service';
import { generatePrDescriptionForTask } from '../services/pr-description-generation-service';
import { detectProjects } from '../services/project-detection-service';
import {
  buildProjectFeatureMapPrompt,
  cleanupFeatureMapTempDir,
  FEATURE_MAP_GIT_PATH,
  getFeatureMapTempPaths,
  getExistingProjectFeatureMapPath,
  getProjectFeatureMap,
  saveProjectFeatureMapFromTemp,
} from '../services/project-feature-map-generation-service';
import { projectFileIndexService } from '../services/project-file-index-service';
import { detectProjectLogos } from '../services/project-logo-detection-service';
import {
  generateProjectLogo,
  cleanupProjectLogoPath,
  cleanupProjectLogos,
  deleteGeneratedProjectLogo,
  listGeneratedProjectLogos,
  removeProjectLogo,
  uploadProjectLogo,
  selectGeneratedProjectLogo,
} from '../services/project-logo-service';
import { regenerateProjectSummary } from '../services/project-summary-generation-service';
import { runReloadPreviewCommand } from '../services/reload-preview-service';
import { runCommandService } from '../services/run-command-service';
import {
  getAllManagedSkills,
  getAllManagedSkillsUnified,
  getSkillContent,
  createSkill,
  updateSkill,
  deleteSkill,
  disableSkill,
  enableSkill,
  previewLegacySkillMigration,
  executeLegacySkillMigration,
} from '../services/skill-management-service';
import {
  searchRegistry,
  fetchRegistrySkillContent,
  installFromRegistry,
} from '../services/skill-registry-service';
import {
  addGitHubSource,
  installSourceItems,
  listSources,
  refreshSource,
  removeSource,
  updateSourceInstall,
} from '../services/source-management-service';
import { StepService } from '../services/step-service';
import { generateSummary } from '../services/summary-generation-service';
import { systemCalendarService } from '../services/system-calendar-service';
import {
  assertValidSourceSkillPath,
  assertValidWorkspacePath,
  cleanupSkillWorkspace,
  getOrCreateSystemProject,
  getSkillWorkspacePath,
} from '../services/system-project-service';
import { generateWorkItemVerificationNote } from '../services/work-item-verification-note-service';
import {
  checkMergeConflicts,
  createWorktree,
  getWorktreeCommitDiff,
  getWorktreeCommitFileContent,
  getWorktreeCommits,
  getWorktreeDiff,
  getWorktreeFileContent,
  getWorktreeUnifiedDiff,
  getProjectBranches,
  getCurrentBranch,
  getCurrentCommitHash,
  isGitRepository,
  getWorktreeStatus,
  getProjectCommitIgnore,
  commitWorktreeChanges,
  updateProjectCommitIgnore,
  cleanupWorktree,
  cleanupMissingWorktree,
  mergeWorktree,
  pushBranch,
  deleteProjectWorktreesFolder,
} from '../services/worktree-service';

import {
  prepareUsageDisplaySettingForSave,
  redactUsageDisplaySetting,
} from './usage-display-settings';

function redactAiGenerationSetting(
  setting: AiGenerationSetting,
): AiGenerationSetting {
  return {
    ...setting,
    openAiApiKey: setting.openAiApiKey ? 'stored' : '',
  };
}

const execAsync = promisify(exec);

async function pullSourceBranch({
  repoPath,
  sourceBranch,
}: {
  repoPath: string;
  sourceBranch: string;
}): Promise<string> {
  const remoteBranch = sourceBranch.startsWith('origin/')
    ? sourceBranch.slice('origin/'.length)
    : sourceBranch;
  await runGit(
    [
      'fetch',
      'origin',
      `+refs/heads/${remoteBranch}:refs/remotes/origin/${remoteBranch}`,
    ],
    repoPath,
  );

  const currentBranch = await runGit(
    ['rev-parse', '--abbrev-ref', 'HEAD'],
    repoPath,
  );

  if (currentBranch === sourceBranch) {
    await runGit(['pull', '--ff-only', 'origin', remoteBranch], repoPath);
    return sourceBranch;
  }

  return `origin/${remoteBranch}`;
}

const VALID_BACKENDS = new Set<string>(['claude-code', 'opencode', 'codex']);

async function cleanupFeatureMapTempDirsForTask(taskId: string): Promise<void> {
  const steps = await TaskStepRepository.findByTaskId(taskId);
  await Promise.all(
    steps
      .filter(
        (step) =>
          step.type === 'feature-map' && isFeatureMapStepMeta(step.meta),
      )
      .map((step) => {
        const meta = step.meta as FeatureMapStepMeta;
        return cleanupFeatureMapTempDir(meta.tempDir).catch((err) => {
          dbg.ipc(
            'Failed to cleanup feature map temp dir %s: %O',
            meta.tempDir,
            err,
          );
        });
      }),
  );
}

async function ensureFeatureMapFileInDiff(
  task: Task,
  diffRootPath: string,
  diff: Awaited<ReturnType<typeof getWorktreeDiff>>,
) {
  if (task.type !== 'feature-map') return diff;
  if (diff.files.some((file) => file.path === FEATURE_MAP_GIT_PATH)) {
    return diff;
  }

  try {
    await fs.access(path.join(diffRootPath, FEATURE_MAP_GIT_PATH));
  } catch {
    return diff;
  }

  return {
    ...diff,
    files: [
      ...diff.files,
      {
        path: FEATURE_MAP_GIT_PATH,
        status: 'added' as const,
        additions: 0,
        deletions: 0,
      },
    ],
  };
}

async function createTaskAndEmit(
  data: Parameters<typeof TaskRepository.create>[0],
) {
  const task = await TaskRepository.create(data);
  emitTaskUpsert(task);
  return task;
}

async function updateTaskAndEmit(
  taskId: string,
  data: Parameters<typeof TaskRepository.update>[1],
) {
  const previousTask = data.projectId
    ? await TaskRepository.findById(taskId)
    : null;
  const task = await TaskRepository.update(taskId, data);
  emitTaskUpsert(task, previousTask?.projectId);
  return task;
}

async function deleteTaskAndEmit(task: Task, stepIds?: string[]) {
  await TaskRepository.delete(task.id);
  emitTaskDelete({ taskId: task.id, projectId: task.projectId, stepIds });
}

async function updateStepAndEmit(
  stepId: string,
  data: Parameters<typeof TaskStepRepository.update>[1],
) {
  const step = await TaskStepRepository.update(stepId, data);
  emitStepUpsert(step);
  return step;
}

async function runGit(
  args: string[],
  cwd: string,
  options: { timeoutMs?: number } = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    let isSettled = false;
    const child = spawn('git', args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const timeout = setTimeout(() => {
      if (isSettled) return;
      isSettled = true;
      child.kill('SIGTERM');
      reject(new Error(`git ${args.join(' ')} timed out`));
    }, options.timeoutMs ?? 15000);

    child.stdout?.on('data', (data: Buffer) => stdout.push(data));
    child.stderr?.on('data', (data: Buffer) => stderr.push(data));
    child.on('error', (error) => {
      if (isSettled) return;
      isSettled = true;
      clearTimeout(timeout);
      reject(error);
    });
    child.on('close', (code) => {
      if (isSettled) return;
      isSettled = true;
      clearTimeout(timeout);
      if (code === 0) {
        resolve(Buffer.concat(stdout).toString('utf8').trim());
        return;
      }

      reject(
        new Error(
          Buffer.concat(stderr).toString('utf8').trim() ||
            `git ${args.join(' ')} failed with exit code ${code}`,
        ),
      );
    });
  });
}

async function getCommitDate(commitHash: string, cwd: string): Promise<number> {
  const timestamp = await runGit(
    ['show', '-s', '--format=%ct', commitHash],
    cwd,
  );
  return Number(timestamp) || 0;
}

function assertValidSkillCreationInput(data: {
  mode: string;
  enabledBackends: string[];
  sourceSkillPath?: string;
}) {
  if (data.mode !== 'create' && data.mode !== 'improve') {
    throw new Error('mode must be "create" or "improve"');
  }
  if (
    !Array.isArray(data.enabledBackends) ||
    data.enabledBackends.length === 0
  ) {
    throw new Error('enabledBackends must be a non-empty array');
  }
  for (const b of data.enabledBackends) {
    if (!VALID_BACKENDS.has(b)) {
      throw new Error(`Invalid backend type: ${b}`);
    }
  }
  if (data.mode === 'improve' && !data.sourceSkillPath) {
    throw new Error('sourceSkillPath is required for improve mode');
  }
}

function assertPlainObject(
  value: unknown,
  name: string,
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
  return value as Record<string, unknown>;
}

function assertNonEmptyString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }
  return value;
}

function assertOptionalBoolean(
  value: unknown,
  name: string,
): boolean | undefined {
  if (value !== undefined && typeof value !== 'boolean') {
    throw new Error(`${name} must be a boolean`);
  }
  return value;
}

function assertValidBackendArray(
  value: unknown,
  name: string,
): AgentBackendType[] {
  if (!Array.isArray(value)) {
    throw new Error(`${name} must be an array`);
  }
  for (const backend of value) {
    if (typeof backend !== 'string' || !VALID_BACKENDS.has(backend)) {
      throw new Error(`Invalid backend type: ${String(backend)}`);
    }
  }
  return value as AgentBackendType[];
}

function validateAddGitHubSourceParams(value: unknown): AddGitHubSourceParams {
  const params = assertPlainObject(value, 'params');
  return { url: assertNonEmptyString(params.url, 'url') };
}

function validateInstallSourceItemsParams(
  value: unknown,
): InstallSourceItemsParams {
  const params = assertPlainObject(value, 'params');
  if (!Array.isArray(params.items)) {
    throw new Error('items must be an array');
  }
  return {
    items: params.items.map((item, index) => {
      const itemParams = assertPlainObject(item, `items[${index}]`);
      return {
        sourceId: assertNonEmptyString(
          itemParams.sourceId,
          `items[${index}].sourceId`,
        ),
        sourceItemId: assertNonEmptyString(
          itemParams.sourceItemId,
          `items[${index}].sourceItemId`,
        ),
        targetName: assertNonEmptyString(
          itemParams.targetName,
          `items[${index}].targetName`,
        ),
        enabledBackends: assertValidBackendArray(
          itemParams.enabledBackends,
          `items[${index}].enabledBackends`,
        ),
      };
    }),
  };
}

function validateUpdateSourceInstallParams(
  value: unknown,
): UpdateSourceInstallParams {
  const params = assertPlainObject(value, 'params');
  return {
    sourceId: assertNonEmptyString(params.sourceId, 'sourceId'),
    installId: assertNonEmptyString(params.installId, 'installId'),
    overwriteLocalChanges: assertOptionalBoolean(
      params.overwriteLocalChanges,
      'overwriteLocalChanges',
    ),
  };
}

function buildSkillCreationPrompt({
  userPrompt,
  mode,
  workspacePath,
}: {
  userPrompt: string;
  mode: 'create' | 'improve';
  workspacePath: string;
}): string {
  if (mode === 'improve') {
    return [
      `Improve an existing skill based on the following request:`,
      ``,
      `<user-request>`,
      userPrompt,
      `</user-request>`,
      ``,
      `The current skill files have been copied to: ${workspacePath}`,
      `Edit the SKILL.md (and any companion files) in that directory.`,
      ``,
      `The SKILL.md must retain valid YAML frontmatter with \`name\` and \`description\` fields.`,
      `Use the skill-creator skill for best practices.`,
    ].join('\n');
  }

  return [
    `Create a new skill based on the following description:`,
    ``,
    `<user-request>`,
    userPrompt,
    `</user-request>`,
    ``,
    `Write the skill to: ${workspacePath}/<skill-name>/SKILL.md`,
    ``,
    `The SKILL.md must have YAML frontmatter:`,
    `---`,
    `name: <skill-name>`,
    `description: <one-line description>`,
    `---`,
    ``,
    `<markdown body with instructions>`,
    ``,
    `Use the skill-creator skill for best practices.`,
  ].join('\n');
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function activateAssociatedWorkItems(params: {
  projectId: string;
  workItemIds: string[] | null | undefined;
  updateWorkItemStatus?: boolean;
}) {
  if (params.updateWorkItemStatus === false || !params.workItemIds?.length) {
    return;
  }

  const project = await ProjectRepository.findById(params.projectId);
  if (!project?.workItemProviderId) {
    return;
  }

  dbg.ipc('Activating %d work items', params.workItemIds.length);
  for (const workItemId of params.workItemIds) {
    activateWorkItem({
      providerId: project.workItemProviderId,
      workItemId: parseInt(workItemId, 10),
    }).catch((err) => {
      dbg.ipc('Failed to activate work item %s: %O', workItemId, err);
    });
  }
}

const MAX_FILE_ATTACHMENT_SIZE = 50 * 1024 * 1024;
const PREVIEW_RELOAD_GIT_PULL_TIMEOUT_MS = 2 * 60 * 1000;
const PREVIEW_RELOAD_INSTALL_TIMEOUT_MS = 10 * 60 * 1000;
const PREVIEW_RELOAD_BUILD_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_CACHE_SUBSCRIPTIONS = 500;
const MAX_CACHE_SUBSCRIPTION_KEY_LENGTH = 300;

type CacheSubscriptionUpdateInput =
  | {
      revision?: number;
      subscriptions?: Array<Partial<CacheSubscription> | null | undefined>;
    }
  | null
  | undefined;

// Renderer owns cache subscriptions, but main still validates the IPC payload
// before storing it because this list is scanned for every cache event.
function toCacheSubscriptionUpdate(
  value: CacheSubscriptionUpdateInput,
): CacheSubscriptionUpdate {
  if (!value || typeof value !== 'object') {
    return { revision: 0, subscriptions: [] };
  }

  const revision =
    typeof value.revision === 'number' &&
    Number.isSafeInteger(value.revision) &&
    value.revision >= 0
      ? value.revision
      : 0;

  const subscriptions = Array.isArray(value.subscriptions)
    ? value.subscriptions
        .slice(0, MAX_CACHE_SUBSCRIPTIONS)
        .flatMap((subscription): CacheSubscription[] => {
          if (!subscription || typeof subscription !== 'object') {
            return [];
          }

          if (
            typeof subscription.resourceKey !== 'string' ||
            subscription.resourceKey.length === 0 ||
            subscription.resourceKey.length > MAX_CACHE_SUBSCRIPTION_KEY_LENGTH
          ) {
            return [];
          }

          return [
            {
              resourceKey: subscription.resourceKey,
              includeChildren: subscription.includeChildren === true,
            },
          ];
        })
    : [];

  return {
    revision,
    subscriptions,
  };
}

function emitProjectUpsert(project: unknown) {
  emitCacheEvent({ type: 'project.upsert', project: project as Project });
}

function emitProjectPatch(projectId: string, patch: Partial<Project>) {
  emitCacheEvent({ type: 'project.patch', projectId, patch });
}

function toProjectLogoSource(logoSource: string | null): Project['logoSource'] {
  return logoSource === 'uploaded' || logoSource === 'generated'
    ? logoSource
    : null;
}

function emitProjectLogoPatch(project: {
  id: string;
  logoPath: string | null;
  logoSource: string | null;
  updatedAt: string;
}) {
  emitProjectPatch(project.id, {
    logoPath: project.logoPath,
    logoSource: toProjectLogoSource(project.logoSource),
    updatedAt: project.updatedAt,
  });
}

export function registerIpcHandlers() {
  dbg.ipc('Registering IPC handlers');
  let previewReloadInProgress = false;

  ipcMain.handle(
    'cache:setSubscriptions',
    (event, update: CacheSubscriptionUpdateInput) => {
      setCacheSubscriptions(event.sender, toCacheSubscriptionUpdate(update));
    },
  );

  ipcMain.handle('windowState:getIsFullscreen', (event) => {
    const currentWindow = BrowserWindow.fromWebContents(event.sender);
    return currentWindow?.isFullScreen() ?? false;
  });

  // Task focus (fire-and-forget from renderer)
  ipcMain.on('tasks:focused', (_, taskId: string) => {
    notificationService.closeForTask(taskId);
    agentService.setFocusedTask(taskId);
    void TaskRepository.setHasUnread(taskId, false)
      .then(() => TaskRepository.findById(taskId))
      .then((task) => {
        if (task) {
          emitTaskUpsert(task);
        }
      })
      .catch((err) => {
        dbg.ipc('Failed to clear hasUnread for task %s: %O', taskId, err);
      });
  });

  // Projects
  ipcMain.handle('projects:findAll', () => ProjectRepository.findAll());
  ipcMain.handle('projects:findById', (_, id: string) =>
    ProjectRepository.findById(id),
  );
  ipcMain.handle('projects:create', async (_, data: NewProject) => {
    dbg.ipc('projects:create %o', { name: data.name, path: data.path });
    const project = await ProjectRepository.create(data);
    emitProjectUpsert(project);
    return project;
  });
  ipcMain.handle(
    'projects:update',
    async (_, id: string, data: UpdateProject) => {
      dbg.ipc('projects:update %s %o', id, data);
      const result = await ProjectRepository.update(id, data);
      if (
        data.showWorkItemsInFeed !== undefined ||
        data.workItemProviderId !== undefined ||
        data.workItemProjectId !== undefined ||
        data.workItemProjectName !== undefined
      ) {
        invalidateWorkItemCache();
      }
      if (
        data.showPrsInFeed !== undefined ||
        data.repoProviderId !== undefined ||
        data.repoProjectId !== undefined ||
        data.repoId !== undefined
      ) {
        invalidatePrCache();
      }
      emitProjectUpsert(result);
      return result;
    },
  );
  ipcMain.handle(
    'projects:uploadLogo',
    async (_, projectId: string, sourcePath: string) => {
      dbg.ipc('projects:uploadLogo %s', projectId);
      const result = await uploadProjectLogo({ projectId, sourcePath });
      emitProjectLogoPatch(result);
      return result;
    },
  );
  ipcMain.handle(
    'projects:generateLogo',
    async (_, projectId: string, customPrompt?: string) => {
      dbg.ipc('projects:generateLogo %s', projectId);
      const result = await generateProjectLogo({ projectId, customPrompt });
      invalidatePrCache();
      invalidateWorkItemCache();
      emitProjectPatch(result.id, {
        logoPath: result.logoPath,
        logoSource: toProjectLogoSource(result.logoSource),
        summary: result.summary,
        updatedAt: result.updatedAt,
      });
      return result;
    },
  );
  ipcMain.handle('projects:listGeneratedLogos', (_, projectId: string) => {
    dbg.ipc('projects:listGeneratedLogos %s', projectId);
    return listGeneratedProjectLogos(projectId);
  });
  ipcMain.handle(
    'projects:selectGeneratedLogo',
    async (_, projectId: string, logoId: string) => {
      dbg.ipc('projects:selectGeneratedLogo %s %s', projectId, logoId);
      const result = await selectGeneratedProjectLogo({ projectId, logoId });
      emitProjectLogoPatch(result);
      return result;
    },
  );
  ipcMain.handle(
    'projects:deleteGeneratedLogo',
    async (_, projectId: string, logoId: string) => {
      dbg.ipc('projects:deleteGeneratedLogo %s %s', projectId, logoId);
      const result = await deleteGeneratedProjectLogo({ projectId, logoId });
      if (result) {
        emitProjectLogoPatch(result);
      }
    },
  );
  ipcMain.handle('projects:regenerateSummary', async (_, projectId: string) => {
    dbg.ipc('projects:regenerateSummary %s', projectId);
    const project = await regenerateProjectSummary(projectId);
    emitProjectPatch(project.id, {
      summary: project.summary,
      updatedAt: project.updatedAt,
    });
    return project;
  });
  ipcMain.handle('projects:getFeatureMap', async (_, projectId: string) => {
    dbg.ipc('projects:getFeatureMap %s', projectId);
    const project = await ProjectRepository.findById(projectId);
    if (!project) throw new Error('Project not found');
    return getProjectFeatureMap(project.path);
  });
  ipcMain.handle(
    'projects:createFeatureMapTask',
    async (_, projectId: string) => {
      dbg.ipc('projects:createFeatureMapTask %s', projectId);
      const project = await ProjectRepository.findById(projectId);
      if (!project) throw new Error('Project not found');

      const task = await createTaskAndEmit({
        projectId,
        type: 'feature-map',
        name: 'Map project features',
        prompt: 'Map project features',
        startCommitHash: await getCurrentCommitHash(project.path),
        updatedAt: new Date().toISOString(),
      });

      let createdTempDir: string | null = null;
      try {
        const paths = getFeatureMapTempPaths({
          projectPath: project.path,
          taskId: task.id,
        });
        createdTempDir = paths.tempDir;
        await fs.mkdir(paths.tempDir, { recursive: true });
        const slotConfig = await resolveAiSkillSlot(
          'project-feature-map',
          project.aiSkillSlots,
        );
        const prompt = buildProjectFeatureMapPrompt({
          project,
          tempFilePath: paths.tempFilePath,
          existingFeatureMapPath: await getExistingProjectFeatureMapPath(
            project.path,
          ),
          skillName: slotConfig?.skillName,
        });
        const meta: FeatureMapStepMeta = {
          projectId,
          projectPath: project.path,
          tempDir: paths.tempDir,
          tempFilePath: paths.tempFilePath,
          savedFilePath: paths.savedFilePath,
        };

        const step = await StepService.create({
          taskId: task.id,
          name: 'Draft feature map',
          type: 'feature-map',
          promptTemplate: prompt,
          interactionMode: 'auto',
          modelPreference: slotConfig?.model ?? 'default',
          thinkingEffort: slotConfig?.thinkingEffort ?? null,
          agentBackend:
            slotConfig?.backend ??
            (VALID_BACKENDS.has(project.defaultAgentBackend ?? '')
              ? (project.defaultAgentBackend as AgentBackendType)
              : 'claude-code'),
          meta,
        });

        agentService.start(step.id).catch((err) => {
          dbg.ipc(
            'Error auto-starting feature map agent for step %s: %O',
            step.id,
            err,
          );
        });

        return task;
      } catch (err) {
        await cleanupFeatureMapTempDirsForTask(task.id);
        if (createdTempDir) {
          await cleanupFeatureMapTempDir(createdTempDir).catch(() => {});
        }
        await deleteTaskAndEmit(task).catch(() => {});
        throw err;
      }
    },
  );
  ipcMain.handle(
    'projects:saveFeatureMapFromTask',
    async (_, stepId: string) => {
      dbg.ipc('projects:saveFeatureMapFromTask %s', stepId);
      const step = await TaskStepRepository.findById(stepId);
      if (!step || step.type !== 'feature-map') {
        throw new Error('Invalid stepId: must reference a feature-map step');
      }
      if (!isFeatureMapStepMeta(step.meta)) {
        throw new Error(
          'Invalid step: missing or malformed feature-map metadata',
        );
      }
      const meta = step.meta;

      const project = await ProjectRepository.findById(meta.projectId);
      if (!project || project.path !== meta.projectPath) {
        throw new Error('Feature map project metadata is stale');
      }

      const featureMap = await saveProjectFeatureMapFromTemp({
        tempFilePath: meta.tempFilePath,
        savedFilePath: meta.savedFilePath,
      });
      await updateStepAndEmit(stepId, {
        meta: { ...meta, saved: true },
      });
      await cleanupFeatureMapTempDir(meta.tempDir).catch((err) => {
        dbg.ipc(
          'Failed to cleanup feature map temp dir %s after save: %O',
          meta.tempDir,
          err,
        );
      });
      const updatedTask = await TaskRepository.markUserCompleted(step.taskId);
      emitTaskUpsert(updatedTask);
      return featureMap;
    },
  );
  ipcMain.handle('projects:detectLogos', (_, projectPath: string) => {
    dbg.ipc('projects:detectLogos %s', projectPath);
    return detectProjectLogos(projectPath);
  });
  ipcMain.handle('projects:removeLogo', async (_, projectId: string) => {
    dbg.ipc('projects:removeLogo %s', projectId);
    const result = await removeProjectLogo(projectId);
    emitProjectLogoPatch(result);
    return result;
  });
  ipcMain.handle('projects:delete', async (_, id: string) => {
    dbg.ipc('projects:delete %s', id);
    const project = await ProjectRepository.findById(id);
    const result = await ProjectRepository.delete(id);
    if (project) {
      await cleanupProjectLogos(id);
      await cleanupProjectLogoPath(project.logoPath);
    }
    emitCacheEvent({ type: 'project.delete', projectId: id });
    return result;
  });
  ipcMain.handle(
    'projects:deleteWorktreesFolder',
    async (_, projectId: string) => {
      dbg.ipc('projects:deleteWorktreesFolder %s', projectId);
      await deleteProjectWorktreesFolder(projectId);
      const project = await ProjectRepository.findById(projectId);
      if (project) {
        emitProjectUpsert(project);
      }
    },
  );
  ipcMain.handle('projects:reorder', async (_, orderedIds: string[]) => {
    const projects = await ProjectRepository.reorder(orderedIds);
    for (const project of projects) {
      emitProjectUpsert(project);
    }
    emitCacheEvent({
      type: 'resource.invalidate',
      resourceKey: 'projects',
      reason: 'projects reordered',
    });
    return projects;
  });
  ipcMain.handle('projects:getBranches', async (_, projectId: string) => {
    const project = await ProjectRepository.findById(projectId);
    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }
    return getProjectBranches(project.path);
  });
  ipcMain.handle('projects:getCurrentBranch', async (_, projectId: string) => {
    const project = await ProjectRepository.findById(projectId);
    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }
    return getCurrentBranch(project.path);
  });
  ipcMain.handle('projects:isGitRepository', async (_, projectId: string) => {
    const project = await ProjectRepository.findById(projectId);
    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }
    return isGitRepository(project.path);
  });
  ipcMain.handle('projects:getCommitIgnore', async (_, projectId: string) => {
    const project = await ProjectRepository.findById(projectId);
    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }
    return getProjectCommitIgnore(project.path);
  });
  ipcMain.handle(
    'projects:updateCommitIgnore',
    async (_, projectId: string, content: string) => {
      const project = await ProjectRepository.findById(projectId);
      if (!project) {
        throw new Error(`Project ${projectId} not found`);
      }
      await updateProjectCommitIgnore({ projectPath: project.path, content });
    },
  );
  ipcMain.handle('projects:getSkills', async (_, projectId: string) => {
    const project = await ProjectRepository.findById(projectId);
    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }
    dbg.ipc(
      'projects:getSkills for project: %s, path: %s',
      projectId,
      project.path,
    );
    const backendType =
      (project.defaultAgentBackend as AgentBackendType | null) ?? 'claude-code';
    const managed = await getAllManagedSkills({
      backendType,
      projectPath: project.path,
    });
    return managed
      .filter((s) => s.enabledBackends[backendType] === true)
      .map(({ name, description, source, pluginName, skillPath }) => ({
        name,
        description,
        source,
        pluginName,
        skillPath,
      }));
  });

  // Tasks
  ipcMain.handle('tasks:findAll', () => TaskRepository.findAll());
  ipcMain.handle('tasks:findByProjectId', (_, projectId: string) =>
    TaskRepository.findByProjectId(projectId),
  );
  ipcMain.handle('tasks:findAllActive', () => TaskRepository.findAllActive());
  ipcMain.handle(
    'tasks:findAllCompleted',
    (_, params: { limit: number; offset: number }) =>
      TaskRepository.findAllCompleted(params),
  );
  ipcMain.handle('tasks:findById', (_, id: string) =>
    TaskRepository.findById(id),
  );
  ipcMain.handle(
    'tasks:create',
    async (
      _,
      data: NewTask & {
        interactionMode?: InteractionMode | null;
        modelPreference?: string | null;
        thinkingEffort?: ThinkingEffort | null;
        agentBackend?: AgentBackendType | null;
      },
    ) => {
      const {
        interactionMode,
        modelPreference,
        thinkingEffort,
        agentBackend,
        images,
        updateWorkItemStatus,
        ...taskData
      } = data;
      const project = await ProjectRepository.findById(taskData.projectId);
      if (!project) {
        throw new Error(`Project ${taskData.projectId} not found`);
      }

      let startCommitHash: string | null = null;
      if (await isGitRepository(project.path)) {
        startCommitHash = await getCurrentCommitHash(project.path);
      }

      const task = await createTaskAndEmit({
        ...taskData,
        startCommitHash: taskData.startCommitHash ?? startCommitHash,
      });

      // Auto-create a single step for the task
      await StepService.create({
        taskId: task.id,
        name: 'Step 1',
        promptTemplate: data.prompt,
        interactionMode: interactionMode ?? null,
        modelPreference: modelPreference ?? null,
        thinkingEffort: thinkingEffort ?? null,
        agentBackend: agentBackend ?? null,
        images: images ?? null,
      });

      // Optionally activate associated work items in Azure DevOps.
      await activateAssociatedWorkItems({
        projectId: data.projectId,
        workItemIds: task.workItemIds,
        updateWorkItemStatus,
      });

      return task;
    },
  );
  ipcMain.handle(
    'tasks:createWithWorktree',
    async (
      event,
      data: NewTask & {
        useWorktree: boolean;
        sourceBranch?: string | null;
        autoStart?: boolean;
        interactionMode?: InteractionMode | null;
        modelPreference?: string | null;
        thinkingEffort?: ThinkingEffort | null;
        agentBackend?: AgentBackendType | null;
      },
    ) => {
      const {
        useWorktree,
        sourceBranch,
        autoStart,
        images,
        interactionMode,
        modelPreference,
        thinkingEffort,
        agentBackend,
        updateWorkItemStatus,
        ...taskData
      } = data;
      dbg.ipc(
        'tasks:createWithWorktree useWorktree=%s, sourceBranch=%s, autoStart=%s',
        useWorktree,
        sourceBranch,
        autoStart,
      );

      let task;

      if (!useWorktree) {
        // No worktree requested, diff against the main repo from task creation.
        dbg.ipc('Creating task without worktree');
        const project = await ProjectRepository.findById(taskData.projectId);
        if (!project) {
          throw new Error(`Project ${taskData.projectId} not found`);
        }

        let startCommitHash: string | null = null;
        if (await isGitRepository(project.path)) {
          startCommitHash = await getCurrentCommitHash(project.path);
        }

        task = await createTaskAndEmit({
          ...taskData,
          startCommitHash: taskData.startCommitHash ?? startCommitHash,
        });
      } else {
        // Get the project to access its path and name
        const project = await ProjectRepository.findById(taskData.projectId);
        if (!project) {
          throw new Error(`Project ${taskData.projectId} not found`);
        }

        // Generate task name first (if not already provided)
        // This allows the worktree directory to use the same name
        let taskName = taskData.name;
        if (!taskName) {
          dbg.ipc('Generating task name from prompt');
          taskName = await generateTaskName(
            taskData.prompt,
            project.aiSkillSlots,
            {
              feature: 'task-name',
              projectId: taskData.projectId,
              taskId: null,
              stepId: null,
              taskName: taskData.name ?? null,
              projectName: project.name,
            },
          );
          dbg.ipc('Generated task name: %s', taskName);
          // taskName may still be null if generation fails - that's ok
        }

        // Create the worktree using the generated task name
        // Use provided sourceBranch, fall back to project defaultBranch, or undefined for current HEAD
        const effectiveSourceBranch = sourceBranch ?? project.defaultBranch;
        let worktreeStartPoint = effectiveSourceBranch ?? undefined;
        if (project.autoPullSourceBranch && effectiveSourceBranch) {
          dbg.ipc(
            'Pulling source branch before worktree: %s',
            effectiveSourceBranch,
          );
          worktreeStartPoint = await pullSourceBranch({
            repoPath: project.path,
            sourceBranch: effectiveSourceBranch,
          });
        }
        dbg.ipc(
          'Creating worktree from branch: %s',
          effectiveSourceBranch ?? 'HEAD',
        );
        const {
          worktreePath,
          startCommitHash,
          branchName,
          sourceBranch: actualSourceBranch,
        } = await createWorktree(
          project.path,
          project.id,
          project.name,
          taskData.prompt,
          taskName ?? undefined,
          effectiveSourceBranch ?? undefined,
          worktreeStartPoint,
        );

        dbg.ipc('Worktree created: %s, branch: %s', worktreePath, branchName);

        // Relocate attached files from project .jean-claude/tmp/ to worktree .jean-claude/tmp/
        const attachedFileRegex =
          /<file\s+name="([^"]+)"\s+path="([^"]+)"\s*\/>/g;
        if (attachedFileRegex.test(taskData.prompt)) {
          const wtTmpDir = path.join(worktreePath, '.jean-claude', 'tmp');
          await fs.mkdir(wtTmpDir, { recursive: true });

          // Reset regex lastIndex after test()
          attachedFileRegex.lastIndex = 0;
          const projectTmpDir = path.join(project.path, '.jean-claude', 'tmp');
          const relocations: Array<{
            oldPath: string;
            newPath: string;
          }> = [];
          let match;
          while ((match = attachedFileRegex.exec(taskData.prompt)) !== null) {
            const oldFilePath = match[2];
            const relativeToProjectTmp = path.relative(
              projectTmpDir,
              oldFilePath,
            );
            const isProjectTempAttachment =
              relativeToProjectTmp !== '' &&
              !relativeToProjectTmp.startsWith('..') &&
              !path.isAbsolute(relativeToProjectTmp);
            if (!isProjectTempAttachment) continue;

            const basename = path.basename(oldFilePath);
            const newFilePath = path.join(wtTmpDir, basename);
            try {
              const stats = await fs.stat(oldFilePath);
              if (stats.size > MAX_FILE_ATTACHMENT_SIZE) continue;

              await fs.copyFile(oldFilePath, newFilePath);
              relocations.push({
                oldPath: oldFilePath,
                newPath: newFilePath,
              });
            } catch (err) {
              dbg.ipc('Failed to relocate attachment %s: %O', oldFilePath, err);
            }
          }
          for (const { oldPath, newPath } of relocations) {
            // Replace only within path="..." attributes to avoid unintended matches
            taskData.prompt = taskData.prompt.replaceAll(
              `path="${oldPath}"`,
              `path="${newPath}"`,
            );
          }
        }

        // Create the task with worktree info and generated name
        task = await createTaskAndEmit({
          ...taskData,
          name: taskName,
          worktreePath,
          startCommitHash,
          branchName,
          sourceBranch: actualSourceBranch,
        });
      }

      // Auto-create a single step for the task
      const step = await StepService.create({
        taskId: task.id,
        name: 'Step 1',
        promptTemplate: taskData.prompt,
        interactionMode: interactionMode ?? null,
        modelPreference: modelPreference ?? null,
        thinkingEffort: thinkingEffort ?? null,
        agentBackend: agentBackend ?? null,
        images: images ?? null,
      });

      // Optionally activate associated work items in Azure DevOps.
      await activateAssociatedWorkItems({
        projectId: taskData.projectId,
        workItemIds: task.workItemIds,
        updateWorkItemStatus,
      });

      // Auto-start the agent if requested
      if (autoStart && task) {
        dbg.ipc('Auto-starting agent for step %s (task %s)', step.id, task.id);
        const window = BrowserWindow.fromWebContents(event.sender);
        if (window) {
          agentService.setMainWindow(window);
        }
        // Attach pending images so they're included in the first prompt
        if (images?.length) {
          agentService.setPendingImages(task.id, images);
        }
        // Start agent in background (don't await to return task immediately)
        agentService.start(step.id).catch((err) => {
          dbg.ipc('Error auto-starting agent for step %s: %O', step.id, err);
        });
      }

      return task;
    },
  );
  ipcMain.handle(
    'tasks:createPrReview',
    async (
      event,
      params: {
        projectId: string;
        pullRequestId: number;
        agentBackend?: AgentBackendType | null;
        modelPreference?: ModelPreference | null;
        thinkingEffort?: ThinkingEffort | null;
      },
    ) => {
      const { projectId, pullRequestId } = params;
      dbg.ipc(
        'tasks:createPrReview projectId=%s prId=%d',
        projectId,
        pullRequestId,
      );

      // 1. Get project and PR details
      const project = await ProjectRepository.findById(projectId);
      if (!project) throw new Error(`Project ${projectId} not found`);
      if (
        !project.repoProviderId ||
        !project.repoProjectId ||
        !project.repoId
      ) {
        throw new Error('Project has no linked repository');
      }

      const pr = await getPullRequest({
        providerId: project.repoProviderId,
        projectId: project.repoProjectId,
        repoId: project.repoId,
        pullRequestId,
      });

      // 2. Extract branch names
      const sourceBranch = pr.sourceRefName.replace('refs/heads/', '');

      // 3. Generate task name
      const rawName = `Review: ${pr.title}`;
      const taskName =
        rawName.length > 40 ? rawName.slice(0, 37) + '...' : rawName;

      // 4. Create worktree on the PR source branch
      const remoteSourceBranch = `origin/${sourceBranch}`;

      try {
        await execAsync(`git fetch origin "${sourceBranch}"`, {
          cwd: project.path,
          encoding: 'utf-8',
        });
      } catch (fetchError) {
        dbg.ipc(
          'Failed to fetch origin/%s before review worktree creation: %O',
          sourceBranch,
          fetchError,
        );
      }

      let worktreeResult:
        | {
            worktreePath: string;
            startCommitHash: string;
            branchName: string;
          }
        | undefined;

      try {
        worktreeResult = await createWorktree(
          project.path,
          project.id,
          project.name,
          `Review PR #${pullRequestId}`,
          taskName,
          remoteSourceBranch,
        );
      } catch (remoteBranchError) {
        dbg.ipc(
          'Failed to create worktree from %s, retrying with local branch %s: %O',
          remoteSourceBranch,
          sourceBranch,
          remoteBranchError,
        );

        worktreeResult = await createWorktree(
          project.path,
          project.id,
          project.name,
          `Review PR #${pullRequestId}`,
          taskName,
          sourceBranch,
        );
      }

      const { worktreePath, startCommitHash, branchName } = worktreeResult;

      // 5. Create task linked to PR
      let task = await createTaskAndEmit({
        projectId,
        prompt: `Review PR #${pullRequestId}: ${pr.title}`,
        name: taskName,
        worktreePath,
        startCommitHash,
        branchName,
        sourceBranch,
        pullRequestId: String(pullRequestId),
        pullRequestUrl: pr.url ?? null,
        updatedAt: new Date().toISOString(),
      });

      // 6. Fetch work items linked to the PR (best-effort)
      let workItemContext = '';
      try {
        const workItems = await getPullRequestWorkItems({
          providerId: project.repoProviderId,
          projectId: project.repoProjectId,
          repoId: project.repoId,
          pullRequestId,
        });

        if (workItems.length > 0) {
          workItemContext = workItems
            .map((wi) => {
              const desc = wi.fields.description
                ? stripHtml(wi.fields.description)
                : '';
              const repro = wi.fields.reproSteps
                ? `\nRepro Steps: ${stripHtml(wi.fields.reproSteps)}`
                : '';
              return `- **#${wi.id} [${wi.fields.workItemType}] ${wi.fields.title}** (${wi.fields.state})${desc ? `\n  ${desc}` : ''}${repro}`;
            })
            .join('\n');

          // Store work item IDs on the task
          task = await updateTaskAndEmit(task.id, {
            workItemIds: workItems.map((wi) => String(wi.id)),
            workItemUrls: workItems.map((wi) => wi.url),
          });
        }
      } catch (wiError) {
        dbg.ipc('Failed to fetch PR work items (non-fatal): %O', wiError);
      }

      // 7. Build reviewer configs
      const defaultBackend =
        params.agentBackend ??
        (project.defaultAgentBackend as AgentBackendType | null) ??
        'claude-code';
      const modelPreference = params.modelPreference ?? 'default';
      const thinkingEffort = params.thinkingEffort ?? 'default';

      const reviewers: ReviewerConfig[] = [
        {
          id: crypto.randomUUID(),
          label: 'Bug Detection',
          focusPrompt:
            'Look for potential bugs, logic errors, race conditions, off-by-one errors, null/undefined issues, and unhandled edge cases in the changed code.',
          backend: defaultBackend,
          model: modelPreference,
          thinkingEffort,
        },
        {
          id: crypto.randomUUID(),
          label: 'Code Quality',
          focusPrompt:
            'Evaluate code quality: naming, readability, DRY violations, overly complex logic, missing error handling, and adherence to project conventions.',
          backend: defaultBackend,
          model: modelPreference,
          thinkingEffort,
        },
        {
          id: crypto.randomUUID(),
          label: 'Security & Performance',
          focusPrompt:
            'Check for security vulnerabilities (injection, XSS, auth issues, secrets exposure) and performance concerns (N+1 queries, unnecessary re-renders, memory leaks, large allocations).',
          backend: defaultBackend,
          model: modelPreference,
          thinkingEffort,
        },
      ];

      if (workItemContext) {
        reviewers.push({
          id: crypto.randomUUID(),
          label: 'Requirements Alignment',
          focusPrompt:
            'Verify that the code changes fulfill the requirements described in the associated work items. Check for missing acceptance criteria, incomplete implementations, and deviations from the specification.',
          backend: defaultBackend,
          model: modelPreference,
          thinkingEffort,
        });
      }

      // 8. Create Step 1: Review Changes (review type with multi-reviewer)
      const reviewMeta: ReviewStepMeta = {
        reviewers,
        ...(workItemContext ? { workItemContext } : {}),
      };

      const reviewStep = await StepService.create({
        taskId: task.id,
        name: 'Review Changes',
        type: 'review',
        promptTemplate: [
          `Reviewing PR #${pullRequestId}: ${pr.title}`,
          '',
          'At the end of your synthesized summary, output a JSON block fenced with ```json containing an array of review comments with this shape:',
          '`[{ "filePath": "path/to/file", "lineNumber": 42, "comment": "Your review comment" }]`',
          '',
          'Each comment should reference a specific file and line number from the changed files.',
          'Only include actionable comments that warrant posting on the PR.',
        ].join('\n'),
        interactionMode: 'auto',
        agentBackend: defaultBackend,
        modelPreference,
        thinkingEffort,
        meta: reviewMeta,
        sortOrder: 0,
      });

      // 9. Create Step 2: Submit Review (pr-review)
      await StepService.create({
        taskId: task.id,
        name: 'Submit Review',
        type: 'pr-review',
        dependsOn: [reviewStep.id],
        promptTemplate: '',
        sortOrder: 1,
        meta: {
          pullRequestId,
          projectId,
          comments: [],
        } as import('@shared/types').PrReviewStepMeta,
      });

      // 10. Auto-start the review step
      const window = BrowserWindow.fromWebContents(event.sender);
      if (window) {
        agentService.setMainWindow(window);
      }
      agentService.start(reviewStep.id).catch((err) => {
        dbg.ipc(
          'Error auto-starting review agent for step %s: %O',
          reviewStep.id,
          err,
        );
      });

      return task;
    },
  );
  ipcMain.handle('tasks:update', (_, id: string, data: UpdateTask) =>
    updateTaskAndEmit(id, data),
  );
  ipcMain.handle(
    'tasks:updatePendingMessage',
    (_, id: string, pendingMessage: string | null) =>
      TaskRepository.updatePendingMessage(id, pendingMessage).then((task) => {
        emitTaskUpsert(task);
        return task;
      }),
  );
  ipcMain.handle(
    'tasks:delete',
    async (
      _,
      id: string,
      options?: {
        deleteWorktree?: boolean;
      },
    ) => {
      await runCommandService.stopCommandsForTask(id);
      dbg.ipc('Stopped commands for task %s', id);

      const task = await TaskRepository.findById(id);

      if (task?.worktreePath) {
        await closeEditorWindowsForTaskWorktree(task);
        const project = await ProjectRepository.findById(task.projectId);
        if (project) {
          await cleanupWorktree({
            worktreePath: task.worktreePath,
            projectPath: project.path,
            skipIfChanges: !options?.deleteWorktree,
            branchCleanup: 'delete',
            force: options?.deleteWorktree ?? false,
          });
          dbg.ipc('Deleted worktree for task %s', id);
        }
      }

      // Clean up task-scoped temporary workspaces (in parallel)
      const steps = await TaskStepRepository.findByTaskId(id);
      await Promise.all(
        steps
          .filter(
            (step) =>
              (step.type === 'skill-creation' &&
                isSkillCreationStepMeta(step.meta)) ||
              (step.type === 'feature-map' && isFeatureMapStepMeta(step.meta)),
          )
          .map((step) => {
            const cleanup =
              step.type === 'feature-map' && isFeatureMapStepMeta(step.meta)
                ? cleanupFeatureMapTempDir(step.meta.tempDir)
                : cleanupSkillWorkspace(
                    (step.meta as SkillCreationStepMeta).workspacePath,
                  );
            return cleanup.catch((err) => {
              dbg.ipc(
                'Failed to cleanup temp workspace for step %s: %O',
                step.id,
                err,
              );
            });
          }),
      );

      if (task) {
        await deleteTaskAndEmit(
          task,
          steps.map((step) => step.id),
        );
      } else {
        await TaskRepository.delete(id);
      }
      dbg.ipc('Deleted task %s', id);
    },
  );
  ipcMain.handle(
    'steps:setMode',
    async (_, stepId: string, mode: InteractionMode) => {
      await agentService.setMode(stepId, mode);
      return TaskStepRepository.findById(stepId);
    },
  );
  ipcMain.handle('steps:submitPrReview', async (_, stepId: string) => {
    dbg.ipc('steps:submitPrReview stepId=%s', stepId);

    const step = await TaskStepRepository.findById(stepId);
    if (!step) throw new Error(`Step not found: ${stepId}`);
    if (step.type !== 'pr-review')
      throw new Error('Step is not a pr-review type');

    const meta = step.meta as import('@shared/types').PrReviewStepMeta;
    const enabledComments = meta.comments.filter((c) => c.enabled);

    if (enabledComments.length > 0) {
      const project = await ProjectRepository.findById(meta.projectId);
      if (
        !project?.repoProviderId ||
        !project?.repoProjectId ||
        !project?.repoId
      ) {
        throw new Error('Project has no linked repository');
      }

      const results = await Promise.allSettled(
        enabledComments.map((comment) =>
          addPullRequestFileComment({
            providerId: project.repoProviderId!,
            projectId: project.repoProjectId!,
            repoId: project.repoId!,
            pullRequestId: meta.pullRequestId,
            filePath: comment.filePath,
            line: comment.lineNumber,
            content: comment.comment,
          }),
        ),
      );

      const failedCommentSet = new Set<(typeof enabledComments)[number]>();
      for (const [index, result] of results.entries()) {
        if (result.status === 'rejected') {
          failedCommentSet.add(enabledComments[index]);
        }
      }

      const failed = failedCommentSet.size;
      if (failed > 0) {
        dbg.ipc(
          '%d of %d comments failed to post',
          failed,
          enabledComments.length,
        );

        const updatedMeta: import('@shared/types').PrReviewStepMeta = {
          ...meta,
          comments: meta.comments.map((comment) => ({
            ...comment,
            enabled: failedCommentSet.has(comment),
          })),
          submittedAt: new Date().toISOString(),
          submittedCount: enabledComments.length - failed,
          submissionError: `${failed} of ${enabledComments.length} comments failed to post. You can retry the remaining comments.`,
        };

        const updatedStep = await updateStepAndEmit(stepId, {
          status: 'ready',
          meta: updatedMeta,
        });

        await StepService.syncTaskStatus(step.taskId);
        return updatedStep;
      }

      const updatedMeta: import('@shared/types').PrReviewStepMeta = {
        ...meta,
        submittedAt: new Date().toISOString(),
        submittedCount: enabledComments.length - failed,
        submissionError: undefined,
      };
      await updateStepAndEmit(stepId, {
        status: 'completed',
        meta: updatedMeta,
      });
    } else {
      const updatedMeta: import('@shared/types').PrReviewStepMeta = {
        ...meta,
        submittedAt: new Date().toISOString(),
        submittedCount: 0,
        submissionError: undefined,
      };
      await updateStepAndEmit(stepId, {
        status: 'completed',
        meta: updatedMeta,
      });
    }

    await StepService.syncTaskStatus(step.taskId);
    return TaskStepRepository.findById(stepId);
  });
  ipcMain.handle('tasks:toggleUserCompleted', async (_, id: string) => {
    // Fetch task before toggling to know the current state
    const taskBefore = await TaskRepository.findById(id);
    const isCompleting = taskBefore && !taskBefore.userCompleted;

    if (isCompleting) {
      await runCommandService.stopCommandsForTask(id);
      await closeEditorWindowsForTaskWorktree(taskBefore);
    }

    // Perform the toggle
    const updatedTask = await TaskRepository.toggleUserCompleted(id);
    emitTaskUpsert(updatedTask);

    if (isCompleting) {
      await cleanupFeatureMapTempDirsForTask(id);
      await agentService.compactRawMessages(id);
    }

    return updatedTask;
  });
  ipcMain.handle(
    'tasks:complete',
    async (_, id: string, options: { cleanupWorktree?: boolean }) => {
      const task = await TaskRepository.findById(id);
      if (!task) throw new Error('Task not found');

      let updatedTask: Task = task;

      if (!task.userCompleted) {
        // Stop running commands and compact messages
        await runCommandService.stopCommandsForTask(id);
        await closeEditorWindowsForTaskWorktree(task);

        updatedTask = await TaskRepository.markUserCompleted(id);
        emitTaskUpsert(updatedTask);
        await cleanupFeatureMapTempDirsForTask(id);
        await agentService.compactRawMessages(id);
      }

      // If worktree cleanup requested, eagerly clear worktree fields so the
      // task appears "deworktree'd" immediately. The actual git cleanup runs
      // as a renderer-side background job via tasks:worktree:cleanupAfterCompletion.
      if (options.cleanupWorktree && task.worktreePath && task.branchName) {
        const clearedTask = await updateTaskAndEmit(id, {
          worktreePath: null,
          branchName: null,
          startCommitHash: null,
          sourceBranch: null,
        });
        return {
          task: clearedTask,
          worktreeCleanup: {
            worktreePath: task.worktreePath,
            branchName: task.branchName,
          },
        };
      }

      return { task: updatedTask };
    },
  );
  ipcMain.handle(
    'tasks:worktree:cleanupAfterCompletion',
    async (
      _,
      taskId: string,
      params: {
        worktreePath: string;
        branchName: string;
      },
    ) => {
      // Resolve projectPath from the database rather than trusting renderer input.
      const task = await TaskRepository.findById(taskId);
      if (!task) throw new Error('Task not found');
      const project = await ProjectRepository.findById(task.projectId);
      if (!project) throw new Error('Project not found');

      const worktreeExists = await pathExists(params.worktreePath);
      const editorCloseWarning = await closeEditorWindowsForTaskWorktree({
        id: taskId,
        worktreePath: params.worktreePath,
      });
      if (worktreeExists) {
        await cleanupWorktree({
          worktreePath: params.worktreePath,
          projectPath: project.path,
          branchName: params.branchName,
          force: true,
        });
      } else {
        await cleanupMissingWorktree({
          projectPath: project.path,
          branchName: params.branchName,
        });
      }
      return { editorCloseWarning };
    },
  );
  ipcMain.handle('tasks:clearUserCompleted', (_, id: string) =>
    TaskRepository.clearUserCompleted(id).then((task) => {
      emitTaskUpsert(task);
      return task;
    }),
  );
  ipcMain.handle(
    'tasks:reorder',
    async (
      _,
      projectId: string,
      activeIds: string[],
      completedIds: string[],
    ) => {
      const tasks = await TaskRepository.reorder(
        projectId,
        activeIds,
        completedIds,
      );
      for (const task of tasks) {
        emitTaskUpsert(task);
      }
      return tasks;
    },
  );
  ipcMain.handle(
    'tasks:addSessionAllowedTool',
    async (
      _,
      taskId: string,
      toolName: string,
      input: Record<string, unknown>,
    ) => {
      const { tool, matchValue } = normalizeToolRequest(toolName, input);

      const task = await TaskRepository.findById(taskId);
      const current: PermissionScope = task?.sessionRules ?? {};
      const updated: PermissionScope = { ...current };
      updated[tool] = buildToolPermissionConfig({
        existing: updated[tool],
        matchValue,
      });

      return updateTaskAndEmit(taskId, { sessionRules: updated });
    },
  );
  ipcMain.handle(
    'tasks:removeSessionAllowedTool',
    async (_, taskId: string, toolName: string, pattern?: string) => {
      const task = await TaskRepository.findById(taskId);
      const current: PermissionScope = { ...(task?.sessionRules ?? {}) };

      if (pattern) {
        const existing = current[toolName];
        if (typeof existing === 'object' && existing !== null) {
          const updatedPatterns = {
            ...(existing as Record<string, 'allow'>),
          };
          delete updatedPatterns[pattern];
          if (Object.keys(updatedPatterns).length > 0) {
            current[toolName] = updatedPatterns;
          } else {
            delete current[toolName];
          }
        }
      } else {
        delete current[toolName];
      }

      return updateTaskAndEmit(taskId, { sessionRules: current });
    },
  );

  ipcMain.handle(
    'tasks:allowForProject',
    async (
      _,
      taskId: string,
      toolName: string,
      input: Record<string, unknown>,
    ) => {
      const task = await TaskRepository.findById(taskId);
      if (!task) throw new Error(`Task ${taskId} not found`);
      const project = await ProjectRepository.findById(task.projectId);
      if (!project) throw new Error(`Project ${task.projectId} not found`);

      // Write to .jean-claude/settings.local.json (project scope)
      await addProjectPermission(project.path, toolName, input);

      // Also add to session rules
      const { tool, matchValue } = normalizeToolRequest(toolName, input);
      const current: PermissionScope = { ...(task.sessionRules ?? {}) };
      current[tool] = buildToolPermissionConfig({
        existing: current[tool],
        matchValue,
      });
      return updateTaskAndEmit(taskId, { sessionRules: current });
    },
  );

  ipcMain.handle(
    'tasks:allowForProjectWorktrees',
    async (
      _,
      taskId: string,
      toolName: string,
      input: Record<string, unknown>,
    ) => {
      const task = await TaskRepository.findById(taskId);
      if (!task) throw new Error(`Task ${taskId} not found`);
      const project = await ProjectRepository.findById(task.projectId);
      if (!project) throw new Error(`Project ${task.projectId} not found`);

      // Write to .jean-claude/settings.local.json (worktrees scope)
      await addWorktreePermission(project.path, toolName, input);

      // Also add to session rules
      const { tool, matchValue } = normalizeToolRequest(toolName, input);
      const current: PermissionScope = { ...(task.sessionRules ?? {}) };
      current[tool] = buildToolPermissionConfig({
        existing: current[tool],
        matchValue,
      });
      return updateTaskAndEmit(taskId, { sessionRules: current });
    },
  );

  // Global permissions
  ipcMain.handle('globalPermissions:get', async () => {
    return readGlobalPermissions();
  });

  ipcMain.handle(
    'globalPermissions:set',
    async (_, permissions: PermissionScope) => {
      // Validate at the IPC boundary (TypeScript types are erased at runtime)
      validatePermissionScope(permissions);
      await writeGlobalPermissions(permissions);
    },
  );

  ipcMain.handle(
    'globalPermissions:addRule',
    async (
      _,
      toolName: string,
      input: Record<string, unknown>,
      action?: import('@shared/permission-types').PermissionAction,
    ) => {
      if (typeof toolName !== 'string' || !toolName.trim()) {
        throw new Error('Invalid toolName: must be a non-empty string');
      }
      if (typeof input !== 'object' || input === null || Array.isArray(input)) {
        throw new Error('Invalid input: must be a plain object');
      }
      if (
        action !== undefined &&
        action !== 'allow' &&
        action !== 'ask' &&
        action !== 'deny'
      ) {
        throw new Error(
          'Invalid action: must be one of "allow", "ask", or "deny"',
        );
      }
      const added = await addGlobalPermission({ toolName, input, action });
      if (!added) {
        throw new Error(
          'Bare "bash" without a command pattern is not allowed globally',
        );
      }
      return readGlobalPermissions();
    },
  );

  ipcMain.handle(
    'globalPermissions:removeRule',
    async (_, tool: string, pattern?: string) => {
      if (typeof tool !== 'string' || !tool.trim()) {
        throw new Error('Invalid tool: must be a non-empty string');
      }
      if (pattern !== undefined && typeof pattern !== 'string') {
        throw new Error('Invalid pattern: must be a string if provided');
      }
      await removeGlobalPermission({ tool, pattern });
      return readGlobalPermissions();
    },
  );

  ipcMain.handle(
    'globalPermissions:editRule',
    async (
      _,
      tool: string,
      oldPattern: string | undefined,
      newPattern: string | undefined,
      action: import('@shared/permission-types').PermissionAction,
    ) => {
      if (typeof tool !== 'string' || !tool.trim()) {
        throw new Error('Invalid tool: must be a non-empty string');
      }
      if (action !== 'allow' && action !== 'ask' && action !== 'deny') {
        throw new Error(
          'Invalid action: must be one of "allow", "ask", or "deny"',
        );
      }
      await editGlobalPermission({ tool, oldPattern, newPattern, action });
      return readGlobalPermissions();
    },
  );

  // Project permissions
  ipcMain.handle('projectPermissions:get', async (_, projectPath: string) => {
    if (typeof projectPath !== 'string' || !projectPath.trim()) {
      throw new Error('Invalid projectPath: must be a non-empty string');
    }
    return readProjectPermissions(projectPath);
  });

  ipcMain.handle(
    'projectPermissions:addRule',
    async (
      _,
      projectPath: string,
      toolName: string,
      input: Record<string, unknown>,
      action?: import('@shared/permission-types').PermissionAction,
    ) => {
      if (typeof projectPath !== 'string' || !projectPath.trim()) {
        throw new Error('Invalid projectPath: must be a non-empty string');
      }
      if (typeof toolName !== 'string' || !toolName.trim()) {
        throw new Error('Invalid toolName: must be a non-empty string');
      }
      if (typeof input !== 'object' || input === null || Array.isArray(input)) {
        throw new Error('Invalid input: must be a plain object');
      }
      if (
        action !== undefined &&
        action !== 'allow' &&
        action !== 'ask' &&
        action !== 'deny'
      ) {
        throw new Error(
          'Invalid action: must be one of "allow", "ask", or "deny"',
        );
      }
      const added = await addProjectPermissionRule({
        projectPath,
        toolName,
        input,
        action,
      });
      if (!added) {
        throw new Error('Bare "bash" without a command pattern is not allowed');
      }
      return readProjectPermissions(projectPath);
    },
  );

  ipcMain.handle(
    'projectPermissions:removeRule',
    async (_, projectPath: string, tool: string, pattern?: string) => {
      if (typeof projectPath !== 'string' || !projectPath.trim()) {
        throw new Error('Invalid projectPath: must be a non-empty string');
      }
      if (typeof tool !== 'string' || !tool.trim()) {
        throw new Error('Invalid tool: must be a non-empty string');
      }
      if (pattern !== undefined && typeof pattern !== 'string') {
        throw new Error('Invalid pattern: must be a string if provided');
      }
      await removeProjectPermissionRule({ projectPath, tool, pattern });
      return readProjectPermissions(projectPath);
    },
  );

  ipcMain.handle(
    'projectPermissions:editRule',
    async (
      _,
      projectPath: string,
      tool: string,
      oldPattern: string | undefined,
      newPattern: string | undefined,
      action: import('@shared/permission-types').PermissionAction,
    ) => {
      if (typeof projectPath !== 'string' || !projectPath.trim()) {
        throw new Error('Invalid projectPath: must be a non-empty string');
      }
      if (typeof tool !== 'string' || !tool.trim()) {
        throw new Error('Invalid tool: must be a non-empty string');
      }
      if (action !== 'allow' && action !== 'ask' && action !== 'deny') {
        throw new Error(
          'Invalid action: must be one of "allow", "ask", or "deny"',
        );
      }
      await editProjectPermissionRule({
        projectPath,
        tool,
        oldPattern,
        newPattern,
        action,
      });
      return readProjectPermissions(projectPath);
    },
  );

  // Worktree config (file copy settings)
  ipcMain.handle('worktreeConfig:get', async (_, projectPath: string) => {
    if (typeof projectPath !== 'string' || !projectPath.trim()) {
      throw new Error('Invalid projectPath: must be a non-empty string');
    }
    const settings = await readSettings(projectPath);
    return settings.worktree?.create?.copy ?? [];
  });

  ipcMain.handle(
    'worktreeConfig:setCopyEntries',
    async (
      _,
      projectPath: string,
      entries: import('@shared/permission-types').WorktreeFileCopyEntry[],
    ) => {
      if (typeof projectPath !== 'string' || !projectPath.trim()) {
        throw new Error('Invalid projectPath: must be a non-empty string');
      }
      if (!Array.isArray(entries)) {
        throw new Error('Invalid entries: must be an array');
      }
      const settings = await readSettings(projectPath);
      settings.worktree = {
        ...settings.worktree,
        create: {
          ...settings.worktree?.create,
          copy: entries.length > 0 ? entries : undefined,
        },
      };
      await writeSettings(projectPath, settings);
      return settings.worktree?.create?.copy ?? [];
    },
  );

  ipcMain.handle(
    'tasks:allowGlobally',
    async (
      _,
      taskId: string,
      toolName: string,
      input: Record<string, unknown>,
    ) => {
      if (typeof taskId !== 'string' || !taskId.trim()) {
        throw new Error('Invalid taskId: must be a non-empty string');
      }
      if (typeof toolName !== 'string' || !toolName.trim()) {
        throw new Error('Invalid toolName: must be a non-empty string');
      }
      if (typeof input !== 'object' || input === null || Array.isArray(input)) {
        throw new Error('Invalid input: must be a plain object');
      }
      const added = await addGlobalPermission({ toolName, input });
      if (!added) {
        throw new Error(
          'Bare "bash" without a command pattern is not allowed globally',
        );
      }

      // Also add to session rules for immediate effect
      const task = await TaskRepository.findById(taskId);
      if (!task) throw new Error(`Task ${taskId} not found`);
      const { tool, matchValue } = normalizeToolRequest(toolName, input);
      const current: PermissionScope = { ...(task.sessionRules ?? {}) };
      current[tool] = buildToolPermissionConfig({
        existing: current[tool],
        matchValue,
      });
      return updateTaskAndEmit(taskId, { sessionRules: current });
    },
  );

  // Task worktree operations - resolve paths internally from taskId
  ipcMain.handle('tasks:worktree:getDiff', async (_, taskId: string) => {
    const task = await TaskRepository.findById(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    const project = task.worktreePath
      ? null
      : await ProjectRepository.findById(task.projectId);
    const diffRootPath = task.worktreePath ?? project?.path;
    if (!diffRootPath) {
      throw new Error(`Task ${taskId} does not have a diff root`);
    }

    const startCommitHash =
      task.startCommitHash ?? (await getCurrentCommitHash(diffRootPath));
    const diff = await getWorktreeDiff(
      diffRootPath,
      startCommitHash,
      task.worktreePath ? task.sourceBranch : null,
    );
    return ensureFeatureMapFileInDiff(task, diffRootPath, diff);
  });

  ipcMain.handle('tasks:worktree:getCommits', async (_, taskId: string) => {
    const task = await TaskRepository.findById(taskId);
    if (!task?.worktreePath || !task?.startCommitHash) {
      return [];
    }
    return getWorktreeCommits(task.worktreePath, task.startCommitHash);
  });

  ipcMain.handle(
    'tasks:worktree:getCommitDiff',
    async (_, taskId: string, commitHash: string) => {
      const task = await TaskRepository.findById(taskId);
      if (!task?.worktreePath) {
        return [];
      }
      return getWorktreeCommitDiff(task.worktreePath, commitHash);
    },
  );

  ipcMain.handle(
    'tasks:worktree:getCommitFileContent',
    async (
      _,
      taskId: string,
      commitHash: string,
      filePath: string,
      status: 'added' | 'modified' | 'deleted',
    ) => {
      const task = await TaskRepository.findById(taskId);
      if (!task?.worktreePath) {
        throw new Error(`Task ${taskId} does not have a worktree`);
      }
      return getWorktreeCommitFileContent(
        task.worktreePath,
        commitHash,
        filePath,
        status,
      );
    },
  );

  ipcMain.handle(
    'tasks:worktree:getFileContent',
    async (
      _,
      taskId: string,
      filePath: string,
      status: 'added' | 'modified' | 'deleted',
    ) => {
      const task = await TaskRepository.findById(taskId);
      if (!task) {
        throw new Error(`Task ${taskId} not found`);
      }

      const project = task.worktreePath
        ? null
        : await ProjectRepository.findById(task.projectId);
      const diffRootPath = task.worktreePath ?? project?.path;
      if (!diffRootPath) {
        throw new Error(`Task ${taskId} does not have a diff root`);
      }

      const startCommitHash =
        task.startCommitHash ?? (await getCurrentCommitHash(diffRootPath));
      return getWorktreeFileContent(
        diffRootPath,
        startCommitHash,
        filePath,
        status,
        task.worktreePath ? task.sourceBranch : null,
      );
    },
  );

  ipcMain.handle('tasks:worktree:getStatus', async (_, taskId: string) => {
    const task = await TaskRepository.findById(taskId);
    if (!task?.worktreePath) {
      throw new Error(`Task ${taskId} does not have a worktree`);
    }
    return getWorktreeStatus(task.worktreePath);
  });

  ipcMain.handle(
    'tasks:worktree:commit',
    async (
      _,
      taskId: string,
      params: { message?: string; stageAll: boolean },
    ) => {
      const task = await TaskRepository.findById(taskId);
      if (!task?.worktreePath) {
        throw new Error(`Task ${taskId} does not have a worktree`);
      }

      const project = await ProjectRepository.findById(task.projectId);
      if (!project) {
        throw new Error(`Project ${task.projectId} not found`);
      }

      let { message } = params;

      // Auto-generate commit message if not provided
      if (!message) {
        const generated = await generateCommitMessageForTask(
          task,
          project,
          params.stageAll,
        );
        if (!generated) {
          throw new Error(
            'Failed to generate commit message. Please commit manually.',
          );
        }
        message = generated;
      }

      return commitWorktreeChanges({
        worktreePath: task.worktreePath,
        projectPath: project.path,
        message,
        stageAll: params.stageAll,
        noVerify: project.commitWithNoVerify,
      });
    },
  );

  ipcMain.handle(
    'tasks:worktree:generateCommitMessage',
    async (_, taskId: string, params: { stageAll: boolean }) => {
      const task = await TaskRepository.findById(taskId);
      if (!task?.worktreePath) {
        throw new Error(`Task ${taskId} does not have a worktree`);
      }
      const project = await ProjectRepository.findById(task.projectId);
      if (!project) {
        throw new Error(`Project ${task.projectId} not found`);
      }
      return generateCommitMessageForTask(task, project, params.stageAll);
    },
  );

  ipcMain.handle(
    'tasks:worktree:checkMergeConflicts',
    async (_, taskId: string, params: { targetBranch: string }) => {
      const task = await TaskRepository.findById(taskId);
      if (!task?.worktreePath) {
        throw new Error(`Task ${taskId} does not have a worktree`);
      }
      const project = await ProjectRepository.findById(task.projectId);
      if (!project) {
        throw new Error(`Project ${task.projectId} not found`);
      }
      // Block conflict checks against protected branches
      if (
        project.protectedBranches?.some(
          (b) => b.toLowerCase() === params.targetBranch.toLowerCase(),
        )
      ) {
        return {
          hasConflicts: false,
          error: `Branch "${params.targetBranch}" is protected. Direct merges into this branch are not allowed.`,
        };
      }

      return checkMergeConflicts({
        worktreePath: task.worktreePath,
        projectPath: project.path,
        targetBranch: params.targetBranch,
      });
    },
  );

  ipcMain.handle(
    'tasks:worktree:merge',
    async (
      _,
      taskId: string,
      params: {
        targetBranch: string;
        squash?: boolean;
        commitMessage?: string;
        commitAllUnstaged?: boolean;
      },
    ) => {
      const task = await TaskRepository.findById(taskId);
      if (!task?.worktreePath) {
        throw new Error(`Task ${taskId} does not have a worktree`);
      }

      const project = await ProjectRepository.findById(task.projectId);
      if (!project) {
        throw new Error(`Project ${task.projectId} not found`);
      }

      // Block merges into protected branches (case-insensitive for macOS HFS+)
      if (
        project.protectedBranches?.some(
          (b) => b.toLowerCase() === params.targetBranch.toLowerCase(),
        )
      ) {
        return {
          success: false,
          error: `Branch "${params.targetBranch}" is protected. Direct merges into this branch are not allowed.`,
        };
      }

      // Auto-generate commit message if squash merge with no user-provided message
      let commitMessage = params.commitMessage;
      if (params.squash && !commitMessage?.trim()) {
        commitMessage = await generateMergeMessageForTask(
          task,
          project,
          params.targetBranch,
        );
      }

      await runCommandService.stopCommandsForTask(taskId);

      if (params.commitAllUnstaged) {
        const status = await getWorktreeStatus(task.worktreePath);
        if (status.hasUnstagedChanges) {
          await commitWorktreeChanges({
            worktreePath: task.worktreePath,
            projectPath: project.path,
            message: 'chore: commit unstaged changes before merge',
            stageAll: true,
            noVerify: project.commitWithNoVerify,
          });
        }
      }

      const result = await mergeWorktree({
        worktreePath: task.worktreePath,
        projectPath: project.path,
        targetBranch: params.targetBranch,
        squash: params.squash,
        commitMessage,
        noVerify: project.commitWithNoVerify,
      });

      // On successful merge, clear worktree fields and mark the task as
      // completed atomically.  Doing this here (rather than from the
      // renderer) avoids a race where toggleUserCompleted sees stale
      // worktree fields, detects the directory as missing, and
      // incorrectly prompts the user for orphan cleanup.
      if (result.success) {
        await closeEditorWindowsForTaskWorktree(task);
        await updateTaskAndEmit(taskId, {
          worktreePath: null,
          branchName: null,
          startCommitHash: null,
          sourceBranch: null,
        });
        const updatedTask = await TaskRepository.toggleUserCompleted(taskId);
        emitTaskUpsert(updatedTask);
      }

      return result;
    },
  );

  ipcMain.handle('tasks:worktree:getBranches', async (_, taskId: string) => {
    const task = await TaskRepository.findById(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }
    const project = await ProjectRepository.findById(task.projectId);
    if (!project) {
      throw new Error(`Project ${task.projectId} not found`);
    }
    return getProjectBranches(project.path);
  });

  // Steps
  ipcMain.handle('steps:findByTaskId', (_, taskId: string) =>
    StepService.findByTaskId(taskId),
  );
  ipcMain.handle('steps:findById', (_, stepId: string) =>
    StepService.findById(stepId),
  );
  ipcMain.handle(
    'steps:create',
    async (event, data: NewTaskStep & { start?: boolean }) => {
      const { start, ...stepData } = data;

      // If auto-start is requested but step has dependencies, defer the start
      const hasDeps = (stepData.dependsOn?.length ?? 0) > 0;
      if (start && hasDeps) {
        stepData.autoStart = true;
      }

      let step = await StepService.create(stepData);

      const shouldStartNow = start && (!hasDeps || step.status === 'ready');
      if (shouldStartNow) {
        // Return the step as running immediately so renderer caches do not keep
        // a stale "ready" state while the async start pipeline boots.
        step = await StepService.update(step.id, { status: 'running' });
        dbg.ipc('Auto-starting step %s (task %s)', step.id, step.taskId);
        const window = BrowserWindow.fromWebContents(event.sender);
        if (window) {
          agentService.setMainWindow(window);
        }
        if (step.images?.length) {
          agentService.setPendingImages(step.taskId, step.images);
        }
        agentService.start(step.id).catch((err) => {
          dbg.ipc('Error auto-starting step %s: %O', step.id, err);
          StepService.errorStep(step.id).catch((stepErr) => {
            dbg.ipc(
              'Error marking failed auto-start step %s: %O',
              step.id,
              stepErr,
            );
          });
        });
      }

      return step;
    },
  );
  ipcMain.handle('steps:update', (_, stepId: string, data: UpdateTaskStep) =>
    StepService.update(stepId, data),
  );

  ipcMain.handle('steps:resolvePrompt', (_, stepId: string) =>
    StepService.resolveAndValidate(stepId),
  );

  // Providers
  ipcMain.handle('providers:findAll', () => ProviderRepository.findAll());
  ipcMain.handle('providers:findById', (_, id: string) =>
    ProviderRepository.findById(id),
  );
  ipcMain.handle('providers:create', (_, data: NewProvider) =>
    ProviderRepository.create(data),
  );
  ipcMain.handle('providers:update', (_, id: string, data: UpdateProvider) =>
    ProviderRepository.update(id, data),
  );
  ipcMain.handle('providers:delete', (_, id: string) =>
    ProviderRepository.delete(id),
  );

  // Provider details (fetches projects/repos for a provider)
  ipcMain.handle('providers:getDetails', (_, providerId: string) =>
    getProviderDetails(providerId),
  );

  // Tokens
  ipcMain.handle('tokens:findAll', () => TokenRepository.findAll());
  ipcMain.handle('tokens:findById', (_, id: string) =>
    TokenRepository.findById(id),
  );
  ipcMain.handle('tokens:findByProviderType', (_, providerType: string) =>
    TokenRepository.findByProviderType(providerType),
  );
  ipcMain.handle('tokens:create', (_, data: NewToken) =>
    TokenRepository.create(data),
  );
  ipcMain.handle('tokens:update', (_, id: string, data: UpdateToken) =>
    TokenRepository.update(id, data),
  );
  ipcMain.handle('tokens:delete', (_, id: string) =>
    TokenRepository.delete(id),
  );

  // Azure DevOps
  ipcMain.handle('azureDevOps:getOrganizations', (_, tokenId: string) =>
    getOrganizationsByTokenId(tokenId),
  );
  ipcMain.handle('azureDevOps:validateToken', (_, token: string) =>
    validateTokenAndGetOrganizations(token),
  );
  ipcMain.handle('azureDevOps:getTokenExpiration', (_, tokenId: string) =>
    getTokenExpiration(tokenId),
  );
  ipcMain.handle('azureDevOps:getCurrentUser', (_, providerId: string) =>
    getCurrentUser(providerId),
  );
  ipcMain.handle(
    'azureDevOps:queryWorkItems',
    (
      _,
      params: {
        providerId: string;
        projectId: string;
        projectName: string;
        filters: {
          states?: string[];
          workItemTypes?: string[];
          excludeWorkItemTypes?: string[];
          searchText?: string;
          iterationPath?: string;
        };
      },
    ) => queryWorkItems(params),
  );

  ipcMain.handle(
    'azureDevOps:getWorkItemById',
    async (_event, params: { providerId: string; workItemId: number }) => {
      const { getWorkItemById } =
        await import('../services/azure-devops-service');
      return getWorkItemById(params);
    },
  );

  ipcMain.handle(
    'azureDevOps:updateWorkItemState',
    async (
      _event,
      params: { providerId: string; workItemId: number; state: string },
    ) => {
      const { updateWorkItemState } =
        await import('../services/azure-devops-service');
      return updateWorkItemState(params);
    },
  );

  ipcMain.handle(
    'azureDevOps:getWorkItemStates',
    async (
      _event,
      params: { providerId: string; projectName: string; workItemType: string },
    ) => {
      const { getWorkItemStates } =
        await import('../services/azure-devops-service');
      return getWorkItemStates(params);
    },
  );

  ipcMain.handle(
    'azureDevOps:getRelatedTestCases',
    async (
      _event,
      params: { providerId: string; projectName: string; workItemId: number },
    ) => {
      const { getRelatedTestCases } =
        await import('../services/azure-devops-service');
      return getRelatedTestCases(params);
    },
  );

  console.log('[IPC] Registering azureDevOps:getWorkItemComments handler');
  ipcMain.handle(
    'azureDevOps:getWorkItemComments',
    async (
      _event,
      params: { providerId: string; projectName: string; workItemId: number },
    ) => {
      console.log('[IPC] getWorkItemComments called', params);
      const { getWorkItemComments } =
        await import('../services/azure-devops-service');
      return getWorkItemComments(params);
    },
  );

  ipcMain.handle(
    'azureDevOps:addWorkItemComment',
    async (
      _event,
      params: {
        providerId: string;
        projectName: string;
        workItemId: number;
        text: string;
      },
    ) => {
      const { addWorkItemComment } =
        await import('../services/azure-devops-service');
      return addWorkItemComment(params);
    },
  );

  ipcMain.handle(
    'azureDevOps:getIterations',
    (
      _,
      params: {
        providerId: string;
        projectName: string;
      },
    ) => getIterations(params),
  );

  ipcMain.handle(
    'azureDevOps:createPullRequest',
    (
      _,
      params: {
        providerId: string;
        projectId: string;
        repoId: string;
        sourceBranch: string;
        targetBranch: string;
        title: string;
        description: string;
        isDraft: boolean;
      },
    ) => createPullRequest(params),
  );

  ipcMain.handle(
    'azureDevOps:cloneRepository',
    (_, params: CloneRepositoryParams) => cloneRepository(params),
  );

  // Azure DevOps Pull Requests
  ipcMain.handle(
    'azureDevOps:listPullRequests',
    (
      _,
      params: {
        providerId: string;
        projectId: string;
        repoId: string;
        status?: 'active' | 'completed' | 'abandoned' | 'all';
      },
    ) => listPullRequests(params),
  );

  ipcMain.handle(
    'azureDevOps:getPullRequest',
    (
      _,
      params: {
        providerId: string;
        projectId: string;
        repoId: string;
        pullRequestId: number;
      },
    ) => getPullRequest(params),
  );

  ipcMain.handle(
    'azureDevOps:updatePullRequestTitle',
    (
      _,
      params: {
        providerId: string;
        projectId: string;
        repoId: string;
        pullRequestId: number;
        title: string;
      },
    ) => updatePullRequestTitle(params),
  );

  ipcMain.handle(
    'azureDevOps:updatePullRequestDescription',
    (
      _,
      params: {
        providerId: string;
        projectId: string;
        repoId: string;
        pullRequestId: number;
        description: string;
      },
    ) => updatePullRequestDescription(params),
  );

  ipcMain.handle(
    'azureDevOps:uploadPullRequestAttachment',
    (
      _,
      params: {
        providerId: string;
        projectId: string;
        repoId: string;
        pullRequestId: number;
        fileName: string;
        mimeType: string;
        dataBase64: string;
      },
    ) => uploadPullRequestAttachment(params),
  );

  ipcMain.handle(
    'azureDevOps:getPullRequestCommits',
    (
      _,
      params: {
        providerId: string;
        projectId: string;
        repoId: string;
        pullRequestId: number;
      },
    ) => getPullRequestCommits(params),
  );

  ipcMain.handle(
    'azureDevOps:getPullRequestChanges',
    (
      _,
      params: {
        providerId: string;
        projectId: string;
        repoId: string;
        pullRequestId: number;
      },
    ) => getPullRequestChanges(params),
  );

  ipcMain.handle(
    'azureDevOps:getCommitChanges',
    (
      _,
      params: {
        providerId: string;
        projectId: string;
        repoId: string;
        commitId: string;
      },
    ) => getCommitChanges(params),
  );

  ipcMain.handle(
    'azureDevOps:getFileContentAtCommit',
    (
      _,
      params: {
        providerId: string;
        projectId: string;
        repoId: string;
        commitId: string;
        filePath: string;
        version: 'current' | 'parent';
      },
    ) => getFileContentAtCommit(params),
  );

  ipcMain.handle(
    'azureDevOps:getPullRequestFileContent',
    (
      _,
      params: {
        providerId: string;
        projectId: string;
        repoId: string;
        pullRequestId: number;
        filePath: string;
        version: 'base' | 'head';
      },
    ) => getPullRequestFileContent(params),
  );

  ipcMain.handle(
    'azureDevOps:getPullRequestThreads',
    (
      _,
      params: {
        providerId: string;
        projectId: string;
        repoId: string;
        pullRequestId: number;
      },
    ) => getPullRequestThreads(params),
  );

  ipcMain.handle(
    'azureDevOps:getPullRequestWorkItems',
    (
      _,
      params: {
        providerId: string;
        projectId: string;
        repoId: string;
        pullRequestId: number;
      },
    ) => getPullRequestWorkItems(params),
  );

  ipcMain.handle(
    'azureDevOps:linkWorkItemToPr',
    (
      _,
      params: {
        providerId: string;
        projectId: string;
        repoId: string;
        pullRequestId: number;
        workItemId: number;
      },
    ) => linkWorkItemToPr(params),
  );

  ipcMain.handle(
    'azureDevOps:unlinkWorkItemFromPr',
    (
      _,
      params: {
        providerId: string;
        projectId: string;
        repoId: string;
        pullRequestId: number;
        workItemId: number;
      },
    ) => unlinkWorkItemFromPr(params),
  );

  ipcMain.handle(
    'azureDevOps:addPullRequestComment',
    (
      _,
      params: {
        providerId: string;
        projectId: string;
        repoId: string;
        pullRequestId: number;
        content: string;
      },
    ) => addPullRequestComment(params),
  );

  ipcMain.handle(
    'azureDevOps:addPullRequestFileComment',
    (
      _,
      params: {
        providerId: string;
        projectId: string;
        repoId: string;
        pullRequestId: number;
        filePath: string;
        line: number;
        lineEnd?: number;
        content: string;
      },
    ) => addPullRequestFileComment(params),
  );

  ipcMain.handle(
    'azureDevOps:addThreadReply',
    (
      _,
      params: {
        providerId: string;
        projectId: string;
        repoId: string;
        pullRequestId: number;
        threadId: number;
        content: string;
      },
    ) => addThreadReply(params),
  );

  ipcMain.handle(
    'azureDevOps:updateThreadComment',
    (
      _,
      params: {
        providerId: string;
        projectId: string;
        repoId: string;
        pullRequestId: number;
        threadId: number;
        commentId: number;
        content: string;
      },
    ) => updateThreadComment(params),
  );

  ipcMain.handle(
    'azureDevOps:deleteThreadComment',
    (
      _,
      params: {
        providerId: string;
        projectId: string;
        repoId: string;
        pullRequestId: number;
        threadId: number;
        commentId: number;
      },
    ) => deleteThreadComment(params),
  );

  ipcMain.handle(
    'azureDevOps:setThreadCommentLike',
    (
      _,
      params: {
        providerId: string;
        projectId: string;
        repoId: string;
        pullRequestId: number;
        threadId: number;
        commentId: number;
        liked: boolean;
      },
    ) => setThreadCommentLike(params),
  );

  ipcMain.handle(
    'azureDevOps:updateThreadStatus',
    (
      _,
      params: {
        providerId: string;
        projectId: string;
        repoId: string;
        pullRequestId: number;
        threadId: number;
        status: string;
      },
    ) => updateThreadStatus(params),
  );

  ipcMain.handle(
    'azureDevOps:searchIdentities',
    (_, params: { providerId: string; query: string }) =>
      searchIdentities(params),
  );

  ipcMain.handle(
    'azureDevOps:getPullRequestPolicyEvaluations',
    (
      _,
      params: {
        providerId: string;
        projectId: string;
        pullRequestId: number;
      },
    ) => getPullRequestPolicyEvaluations(params),
  );

  ipcMain.handle(
    'azureDevOps:requeuePolicyEvaluation',
    (
      _,
      params: {
        providerId: string;
        projectId: string;
        evaluationId: string;
      },
    ) => requeuePolicyEvaluation(params),
  );

  ipcMain.handle(
    'azureDevOps:votePullRequest',
    (
      _,
      params: {
        providerId: string;
        projectId: string;
        repoId: string;
        pullRequestId: number;
        reviewerId: string;
        vote: number;
      },
    ) => votePullRequest(params),
  );

  ipcMain.handle(
    'azureDevOps:setPullRequestAutoComplete',
    (
      _,
      params: {
        providerId: string;
        projectId: string;
        repoId: string;
        pullRequestId: number;
        enabled: boolean;
        autoCompleteSetById?: string;
        completionOptions?: {
          mergeStrategy: string;
          deleteSourceBranch: boolean;
          transitionWorkItems: boolean;
          mergeCommitMessage?: string;
          autoCompleteIgnoreConfigIds?: number[];
        };
      },
    ) => setPullRequestAutoComplete(params),
  );

  ipcMain.handle(
    'azureDevOps:publishPullRequest',
    (
      _,
      params: {
        providerId: string;
        projectId: string;
        repoId: string;
        pullRequestId: number;
      },
    ) => publishPullRequest(params),
  );

  ipcMain.handle(
    'azureDevOps:fetchImageAsBase64',
    (
      _,
      params: {
        providerId: string;
        imageUrl: string;
      },
    ) => fetchImageAsBase64(params),
  );

  ipcMain.handle(
    'tasks:worktree:pushBranch',
    async (_, taskId: string, params?: { commitUnstaged?: boolean }) => {
      const task = await TaskRepository.findById(taskId);
      if (!task?.worktreePath || !task?.branchName) {
        throw new Error(
          `Task ${taskId} does not have a worktree with a branch`,
        );
      }

      const project = await ProjectRepository.findById(task.projectId);
      if (!project) {
        throw new Error(`Project ${task.projectId} not found`);
      }

      let committedBeforePush = false;

      if (params?.commitUnstaged) {
        const status = await getWorktreeStatus(task.worktreePath);
        if (status.hasUncommittedChanges) {
          await commitWorktreeChanges({
            worktreePath: task.worktreePath,
            projectPath: project.path,
            message: 'chore: commit unstaged changes before push',
            stageAll: true,
            noVerify: project.commitWithNoVerify,
          });
          committedBeforePush = true;
        }
      }

      try {
        return await pushBranch({
          worktreePath: task.worktreePath,
          branchName: task.branchName,
        });
      } catch (error) {
        if (committedBeforePush) {
          const message =
            error instanceof Error ? error.message : 'Push failed';
          throw new Error(
            `Changes were committed locally, but push failed: ${message}`,
          );
        }

        throw error;
      }
    },
  );

  ipcMain.handle(
    'tasks:worktree:delete',
    async (_, taskId: string, options?: { keepBranch?: boolean }) => {
      const task = await TaskRepository.findById(taskId);
      if (!task?.worktreePath) return {};

      const project = await ProjectRepository.findById(task.projectId);
      if (!project) return {};

      const shouldKeepBranch = options?.keepBranch ?? false;
      const worktreeExists = await pathExists(task.worktreePath);
      const editorCloseWarning = await closeEditorWindowsForTaskWorktree(task);

      if (worktreeExists) {
        await cleanupWorktree({
          worktreePath: task.worktreePath,
          projectPath: project.path,
          branchName: task.branchName,
          branchCleanup: shouldKeepBranch ? 'keep' : 'delete',
          force: true,
        });
      } else if (!shouldKeepBranch && task.branchName) {
        await cleanupMissingWorktree({
          projectPath: project.path,
          branchName: task.branchName,
        });
      }

      await updateTaskAndEmit(taskId, {
        worktreePath: null,
        branchName: null,
        startCommitHash: null,
        sourceBranch: null,
      });
      return { editorCloseWarning };
    },
  );

  ipcMain.handle(
    'tasks:createPullRequest',
    async (
      _,
      params: {
        taskId: string;
        title: string;
        description: string;
        isDraft: boolean;
        deleteWorktree?: boolean;
        commitUnstaged?: boolean;
      },
    ) => {
      const task = await TaskRepository.findById(params.taskId);
      if (!task?.worktreePath || !task?.branchName) {
        throw new Error(
          `Task ${params.taskId} does not have a worktree with a branch`,
        );
      }

      const project = await ProjectRepository.findById(task.projectId);
      if (
        !project?.repoProviderId ||
        !project?.repoProjectId ||
        !project?.repoId
      ) {
        throw new Error(
          `Project ${task.projectId} is not linked to a repository`,
        );
      }

      // Step 1: Check for uncommitted changes. Commit them after any AI
      // generation so AI failures abort without creating local commits.
      const status = await getWorktreeStatus(task.worktreePath);
      if (status.hasUncommittedChanges && !params.commitUnstaged) {
        throw new Error(
          'You have uncommitted changes. Please commit your changes before creating a pull request.',
        );
      }

      // Step 2: Generate title/description with AI if not provided. Do this
      // before pushing so AI failures abort PR creation without side effects.
      let { title, description } = params;
      if (!title.trim() || !description.trim()) {
        const generated = await generatePrDescriptionForTask(task, project);
        if (generated) {
          if (!title.trim()) title = generated.title;
          if (!description.trim()) description = generated.description;
        }
        // If still empty after generation attempt, use a fallback title
        if (!title.trim()) {
          title = task.name ?? task.branchName ?? 'Pull Request';
        }
      }

      if (status.hasUncommittedChanges) {
        await commitWorktreeChanges({
          worktreePath: task.worktreePath,
          projectPath: project.path,
          message: 'chore: commit unstaged changes before PR creation',
          stageAll: true,
          noVerify: project.commitWithNoVerify,
        });
      }

      // Step 3: Push branch to remote
      await pushBranch({
        worktreePath: task.worktreePath,
        branchName: task.branchName,
      });

      // Step 4: Create PR via Azure DevOps
      const targetBranch = task.sourceBranch ?? project.defaultBranch ?? 'main';

      // Only associate work items if they belong to the same project as the repo.
      // Work items from a different project/org cannot be linked to PRs.
      const canAssociateWorkItems =
        project.workItemProviderId === project.repoProviderId &&
        project.workItemProjectId === project.repoProjectId;

      const pr = await createPullRequest({
        providerId: project.repoProviderId,
        projectId: project.repoProjectId,
        repoId: project.repoId,
        sourceBranch: task.branchName,
        targetBranch,
        title,
        description,
        isDraft: params.isDraft,
        workItemIds: canAssociateWorkItems
          ? (task.workItemIds ?? undefined)
          : undefined,
      });

      // Step 5: Save PR info to task
      await updateTaskAndEmit(params.taskId, {
        pullRequestId: String(pr.id),
        pullRequestUrl: pr.url,
      });

      // Step 6: Optionally delete worktree (keep branch)
      let editorCloseWarning: string | undefined;
      if (params.deleteWorktree) {
        editorCloseWarning = await closeEditorWindowsForTaskWorktree(task);
        await cleanupWorktree({
          worktreePath: task.worktreePath,
          projectPath: project.path,
          branchCleanup: 'keep',
          force: true,
        });
        await updateTaskAndEmit(params.taskId, { worktreePath: null });
      }

      return { id: pr.id, url: pr.url, editorCloseWarning };
    },
  );

  // Dialog
  ipcMain.handle('dialog:openDirectory', async (event) => {
    dbg.ipc('dialog:openDirectory called');
    const window = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(window!, {
      properties: ['openDirectory'],
    });
    dbg.ipc('dialog:openDirectory result: %o', result);
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('dialog:openImageFile', async (event) => {
    dbg.ipc('dialog:openImageFile called');
    const window = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(window!, {
      properties: ['openFile'],
      filters: [
        {
          name: 'Images',
          extensions: [
            'png',
            'jpg',
            'jpeg',
            'gif',
            'webp',
            'avif',
            'svg',
            'ico',
            'bmp',
          ],
        },
      ],
    });
    dbg.ipc('dialog:openImageFile result: %o', result);
    return result.canceled ? null : result.filePaths[0];
  });

  // Projects: get detected projects from all known CLI sources
  ipcMain.handle('projects:getDetected', async () => {
    const existingProjects = await ProjectRepository.findAll();
    const existingPaths = new Set(existingProjects.map((p) => p.path));
    return detectProjects(existingPaths);
  });

  // Filesystem
  ipcMain.handle('fs:readPackageJson', async (_, dirPath: string) => {
    try {
      const pkgPath = path.join(dirPath, 'package.json');
      const content = await fs.readFile(pkgPath, 'utf-8');
      const pkg = JSON.parse(content);
      return { name: pkg.name };
    } catch {
      return null;
    }
  });

  ipcMain.handle('fs:readFile', async (_, filePath: string) => {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const ext = path.extname(filePath).slice(1);
      const languageMap: Record<string, string> = {
        ts: 'typescript',
        tsx: 'tsx',
        js: 'javascript',
        jsx: 'jsx',
        py: 'python',
        rb: 'ruby',
        go: 'go',
        rs: 'rust',
        java: 'java',
        kt: 'kotlin',
        swift: 'swift',
        c: 'c',
        cpp: 'cpp',
        h: 'c',
        hpp: 'cpp',
        cs: 'csharp',
        php: 'php',
        html: 'html',
        css: 'css',
        scss: 'scss',
        less: 'less',
        json: 'json',
        yaml: 'yaml',
        yml: 'yaml',
        xml: 'xml',
        md: 'markdown',
        sql: 'sql',
        sh: 'bash',
        bash: 'bash',
        zsh: 'bash',
        toml: 'toml',
        ini: 'ini',
        dockerfile: 'dockerfile',
      };
      return { content, language: languageMap[ext] || 'text' };
    } catch {
      return null;
    }
  });

  ipcMain.handle('fs:readImageAsDataUrl', async (_, filePath: string) => {
    try {
      const mimeType = getImageMimeType(filePath);
      if (!mimeType) return null;
      const buffer = await fs.readFile(filePath);
      const base64 = buffer.toString('base64');
      return `data:${mimeType};base64,${base64}`;
    } catch {
      return null;
    }
  });

  ipcMain.handle(
    'fs:listDirectory',
    async (_, dirPath: string, projectRoot: string) => {
      try {
        return await projectFileIndexService.listDirectory({
          projectRoot,
          dirPath,
        });
      } catch {
        return null;
      }
    },
  );

  ipcMain.handle('fs:listProjectFiles', async (_, projectRoot: string) => {
    try {
      return await projectFileIndexService.listProjectFiles({ projectRoot });
    } catch {
      return [];
    }
  });

  ipcMain.handle(
    'fs:writeAttachmentFile',
    async (
      _,
      projectPath: string,
      filename: string,
      content: string,
      encoding?: 'utf-8' | 'base64',
    ) => {
      const tmpDir = path.join(projectPath, '.jean-claude', 'tmp');
      await fs.mkdir(tmpDir, { recursive: true });
      const hash = crypto.randomUUID().slice(0, 8);
      const safeName = `${hash}-${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const filePath = path.join(tmpDir, safeName);
      if (encoding === 'base64') {
        await fs.writeFile(filePath, Buffer.from(content, 'base64'));
      } else {
        await fs.writeFile(filePath, content, 'utf-8');
      }
      return filePath;
    },
  );

  ipcMain.handle(
    'fs:copyAttachmentFile',
    async (_, projectPath: string, sourcePath: string) => {
      const tmpDir = path.join(projectPath, '.jean-claude', 'tmp');
      await fs.mkdir(tmpDir, { recursive: true });
      const originalFilename = path.basename(sourcePath);
      const hash = crypto.randomUUID().slice(0, 8);
      const safeName = `${hash}-${originalFilename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const filePath = path.join(tmpDir, safeName);
      await fs.copyFile(sourcePath, filePath);
      return { filePath, filename: originalFilename };
    },
  );

  // Agent
  ipcMain.handle(AGENT_CHANNELS.START, (event, stepId: string) => {
    dbg.ipc('agent:start %s', stepId);
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window) {
      agentService.setMainWindow(window);
    }
    agentService.start(stepId).catch((err) => {
      dbg.ipc('Error starting step %s: %O', stepId, err);
    });
    return;
  });

  ipcMain.handle(AGENT_CHANNELS.STOP, (_, stepId: string) => {
    dbg.ipc('agent:stop %s', stepId);
    return agentService.stop(stepId);
  });

  ipcMain.handle(
    AGENT_CHANNELS.RESPOND,
    (
      _,
      stepId: string,
      requestId: string,
      response: PermissionResponse | QuestionResponse,
    ) => {
      dbg.ipc('agent:respond step=%s, request=%s', stepId, requestId);
      return agentService.respond(stepId, requestId, response);
    },
  );

  ipcMain.handle(
    AGENT_CHANNELS.SEND_MESSAGE,
    (_, stepId: string, parts: PromptPart[]) => {
      dbg.ipc('agent:sendMessage %s (parts: %d)', stepId, parts.length);
      return agentService.sendMessage(stepId, parts);
    },
  );

  ipcMain.handle(
    AGENT_CHANNELS.QUEUE_PROMPT,
    (_, stepId: string, parts: PromptPart[]) => {
      dbg.ipc('agent:queuePrompt %s', stepId);
      return agentService.queuePrompt(stepId, parts);
    },
  );

  ipcMain.handle(
    AGENT_CHANNELS.UPDATE_QUEUED_PROMPT,
    (_, stepId: string, promptId: string, content: string) => {
      dbg.ipc('agent:updateQueuedPrompt step=%s, prompt=%s', stepId, promptId);
      return agentService.updateQueuedPrompt(stepId, promptId, content);
    },
  );

  ipcMain.handle(
    AGENT_CHANNELS.CANCEL_QUEUED_PROMPT,
    (_, stepId: string, promptId: string) => {
      dbg.ipc('agent:cancelQueuedPrompt step=%s, prompt=%s', stepId, promptId);
      return agentService.cancelQueuedPrompt(stepId, promptId);
    },
  );

  ipcMain.handle(AGENT_CHANNELS.GET_MESSAGES, (_, stepId: string) => {
    return agentService.getMessages(stepId);
  });

  ipcMain.handle(AGENT_CHANNELS.GET_MESSAGE_COUNT, (_, stepId: string) => {
    return agentService.getMessageCount(stepId);
  });

  ipcMain.handle(AGENT_CHANNELS.GET_PENDING_REQUEST, (_, stepId: string) => {
    return agentService.getPendingRequest(stepId);
  });

  ipcMain.handle(
    AGENT_CHANNELS.GET_MESSAGES_WITH_RAW_DATA,
    async (_, taskId: string, stepId: string) => {
      return await agentService.getMessagesWithRawData(taskId, stepId);
    },
  );

  ipcMain.handle(
    AGENT_CHANNELS.COMPACT_RAW_MESSAGES,
    async (_, taskId: string) => {
      dbg.ipc('agent:compactRawMessages %s', taskId);
      await agentService.compactRawMessages(taskId);
      dbg.ipc('agent:compactRawMessages completed for %s', taskId);
    },
  );

  ipcMain.handle(
    AGENT_CHANNELS.REPROCESS_NORMALIZATION,
    async (_, taskId: string) => {
      dbg.ipc('agent:reprocessNormalization %s', taskId);
      await agentService.reprocessNormalization(taskId);
      dbg.ipc('agent:reprocessNormalization completed for %s', taskId);
    },
  );

  // Settings
  ipcMain.handle(
    'settings:get',
    async <K extends keyof AppSettings>(_: unknown, key: K) => {
      const value = await SettingsRepository.get(key);
      if (key === 'aiGeneration') {
        return redactAiGenerationSetting(value as AiGenerationSetting);
      }
      if (key === 'usageDisplay') {
        return redactUsageDisplaySetting(value as UsageDisplaySetting);
      }
      return value;
    },
  );
  ipcMain.handle(
    'settings:set',
    <K extends keyof AppSettings>(
      _: unknown,
      key: K,
      value: AppSettings[K],
    ) => {
      if (key === 'aiGeneration') {
        throw new Error('Use aiGeneration:saveSettings for OpenAI settings');
      }
      if (key === 'usageDisplay') {
        throw new Error(
          'Use usageDisplay:saveSettings for usage display settings',
        );
      }
      return SettingsRepository.set(key, value);
    },
  );

  ipcMain.handle(
    'usageDisplay:saveSettings',
    async (_: unknown, params: UsageDisplaySetting) => {
      const existing = await SettingsRepository.get('usageDisplay');
      const { encryptionService } =
        await import('../services/encryption-service');
      await SettingsRepository.set(
        'usageDisplay',
        prepareUsageDisplaySettingForSave({
          params,
          existing,
          encrypt: (value) => encryptionService.encrypt(value),
        }),
      );
      agentUsageService.invalidate('copilot');
      return redactUsageDisplaySetting(
        await SettingsRepository.get('usageDisplay'),
      );
    },
  );
  ipcMain.handle('copilotAuth:requestDeviceCode', async () => {
    const flow = new CopilotDeviceFlowService();
    const deviceCode = await flow.requestDeviceCode();
    await shell.openExternal(
      deviceCode.verificationUriComplete ?? deviceCode.verificationUri,
    );
    return deviceCode;
  });
  ipcMain.handle(
    'copilotAuth:completeDeviceLogin',
    async (_: unknown, deviceCode: CopilotDeviceCode) => {
      const flow = new CopilotDeviceFlowService();
      const token = await flow.pollForToken(deviceCode);
      const existing = await SettingsRepository.get('usageDisplay');
      const { encryptionService } =
        await import('../services/encryption-service');
      await SettingsRepository.set('usageDisplay', {
        ...existing,
        copilotToken: encryptionService.encrypt(token),
      });
      agentUsageService.invalidate('copilot');
      return redactUsageDisplaySetting(
        await SettingsRepository.get('usageDisplay'),
      );
    },
  );
  ipcMain.handle(
    'backendConfig:getUserConfig',
    (_: unknown, backend: unknown) => {
      if (
        backend !== 'claude-code' &&
        backend !== 'opencode' &&
        backend !== 'codex'
      ) {
        throw new Error('Invalid backend');
      }
      return readBackendUserConfig(backend);
    },
  );
  ipcMain.handle(
    'backendConfig:setUserConfig',
    (_: unknown, backend: unknown, content: unknown) => {
      if (
        backend !== 'claude-code' &&
        backend !== 'opencode' &&
        backend !== 'codex'
      ) {
        throw new Error('Invalid backend');
      }
      if (typeof content !== 'string') {
        throw new Error('Invalid config content');
      }
      return writeBackendUserConfig({ backend, content });
    },
  );
  ipcMain.handle('projectPromptPreface:get', async (_, projectPath: string) =>
    readProjectPromptPreface(projectPath),
  );
  ipcMain.handle(
    'projectPromptPreface:set',
    async (
      _,
      projectPath: string,
      value: import('@shared/prompt-preface-types').ProjectPromptPrefaceSetting,
    ) => writeProjectPromptPreface(projectPath, value),
  );

  // Shell
  ipcMain.handle('shell:getAvailableEditors', async () => {
    const results = await Promise.all(
      PRESET_EDITORS.map(async (editor) => ({
        id: editor.id,
        available: await isEditorAvailable(editor),
      })),
    );
    return results;
  });

  ipcMain.handle('shell:openTeamsJoinUrl', async (_, url: string) => {
    if (!isValidTeamsJoinUrl(url)) {
      throw new Error('Invalid Teams meeting URL');
    }
    await shell.openExternal(url);
  });

  ipcMain.handle('calendar:listUpcomingMeetings', async () => {
    if (process.platform !== 'darwin') {
      return [];
    }
    return systemCalendarService.listUpcomingMeetings();
  });

  ipcMain.handle('calendar:listTodayMeetings', async () => {
    if (process.platform !== 'darwin') {
      return [];
    }
    return systemCalendarService.listTodayMeetings();
  });

  ipcMain.handle('calendar:revealMeeting', async (_, meeting) => {
    if (process.platform !== 'darwin') {
      return;
    }
    await systemCalendarService.revealMeeting(meeting);
  });

  ipcMain.handle('calendar:suppressMeetingStartPopup', async (_, meeting) => {
    systemCalendarService.suppressMeetingStartPopup(meeting);
  });

  ipcMain.handle('calendar:setIgnoredMeetingIds', async (_, ids: string[]) => {
    systemCalendarService.setIgnoredMeetingIds(ids);
  });

  ipcMain.handle(
    'shell:openInEditor',
    async (_, dirPath: string, folderContext?: string) => {
      if (!(await pathExists(dirPath))) {
        throw new Error(
          `Path does not exist: ${dirPath}. The worktree may have been deleted.`,
        );
      }
      const setting = await SettingsRepository.get('editor');
      openInEditor(dirPath, setting, folderContext);
    },
  );

  ipcMain.handle('shell:setupGlobalGitignore', async () => {
    const START_MARKER = '# >>> jean-claude (managed automatically)';
    const END_MARKER = '# <<< jean-claude';

    const ENTRIES = [
      '**/.jean-claude/settings.local.json',
      '**/.jean-claude/ignore',
      '**/.jean-claude/tmp/',
    ];

    // Respect user's core.excludesFile if set
    let excludesFile: string;
    try {
      const { stdout } = await execAsync(
        'git config --global core.excludesFile',
      );
      excludesFile = stdout.trim();
      // Expand ~ if present
      if (excludesFile.startsWith('~')) {
        excludesFile = path.join(os.homedir(), excludesFile.slice(1));
      }
    } catch {
      excludesFile = path.join(os.homedir(), '.config', 'git', 'ignore');
    }

    // Ensure parent directory exists
    await fs.mkdir(path.dirname(excludesFile), { recursive: true });

    // Read existing content
    let existing = '';
    try {
      existing = await fs.readFile(excludesFile, 'utf-8');
    } catch {
      // File doesn't exist yet, that's fine
    }

    const block = [START_MARKER, ...ENTRIES, END_MARKER].join('\n');

    if (existing.includes(START_MARKER) && existing.includes(END_MARKER)) {
      // Replace existing managed block
      const regex = new RegExp(
        `${START_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${END_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
      );
      const updated = existing.replace(regex, block);
      await fs.writeFile(excludesFile, updated, 'utf-8');
    } else {
      // Append new block
      const separator =
        existing.length > 0 && !existing.endsWith('\n') ? '\n\n' : '\n';
      await fs.writeFile(
        excludesFile,
        existing + (existing.length > 0 ? separator : '') + block + '\n',
        'utf-8',
      );
    }

    return { success: true, path: excludesFile };
  });

  // Dialog: open application (macOS)
  ipcMain.handle('dialog:openApplication', async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(window!, {
      properties: ['openFile'],
      filters: [{ name: 'Applications', extensions: ['app'] }],
      defaultPath: '/Applications',
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    const appPath = result.filePaths[0];
    const appName = path.basename(appPath, '.app');
    return { path: appPath, name: appName };
  });

  // Usage
  ipcMain.handle('agent:usage:getAll', (_, providers: string[]) => {
    if (process.env.JC_DISABLE_USAGE_TRACKING) return {};
    return agentUsageService.getUsage(providers as UsageProviderType[]);
  });

  ipcMain.handle(
    'agent:usage:getHistory',
    (
      _,
      params: {
        provider: string;
        limitKey: string;
        since: string;
        until?: string;
      },
    ) => {
      return UsageSnapshotRepository.getHistory(params);
    },
  );

  // Rate limit swap status
  ipcMain.handle('rate-limit-swap:status', async () => {
    const { rateLimitSwapService } =
      await import('../services/rate-limit-swap-service');
    const { SettingsRepository } =
      await import('../database/repositories/settings');
    const settings = await SettingsRepository.get('rateLimitSwap');
    if (!settings?.enabled || !settings.chain?.length)
      return { active: false, swaps: [] };

    const backends = await SettingsRepository.get('backends');
    const enabledBackends = backends?.enabledBackends ?? ['claude-code'];

    const swaps: Array<{ from: string; to: string }> = [];
    for (const backend of enabledBackends) {
      const result = await rateLimitSwapService.resolveBackend(backend, {
        notify: false,
      });
      if (result.swapped && result.skippedDueToRateLimit) {
        swaps.push({
          from: backend,
          to: `${result.backend}${result.model ? ` (${result.model})` : ''}`,
        });
      }
    }
    return { active: swaps.length > 0, swaps };
  });

  ipcMain.handle(
    'agent:usage:getDashboard',
    (_, params: { since: string; until?: string }) => {
      return AiUsageRepository.getDashboard(params);
    },
  );

  ipcMain.handle('agent:usage:getTaskUsage', (_, taskId: string) => {
    return AiUsageRepository.getTaskUsage(taskId);
  });

  ipcMain.handle(
    'rate-limit-swap:resolve',
    async (_, backend: AgentBackendType) => {
      const { rateLimitSwapService } =
        await import('../services/rate-limit-swap-service');
      return rateLimitSwapService.resolveBackend(backend, { notify: false });
    },
  );
  // Backend models
  ipcMain.handle('agent:getBackendModels', (_, backend: string) =>
    backendModelsService.getBackendModels(backend as AgentBackendType),
  );

  // Debug
  ipcMain.handle('debug:getTableNames', () => DebugRepository.getTableNames());
  ipcMain.handle('debug:getDatabaseSize', () =>
    DebugRepository.getDatabaseSize(),
  );
  ipcMain.handle('debug:countOldCompletedTasks', () =>
    DebugRepository.countOldCompletedTasks(),
  );
  ipcMain.handle('debug:deleteOldCompletedTasks', () =>
    DebugRepository.deleteOldCompletedTasks(),
  );
  ipcMain.handle(
    'debug:queryTable',
    (
      _,
      params: {
        table: string;
        search?: string;
        limit: number;
        offset: number;
      },
    ) => DebugRepository.queryTable(params),
  );

  // Project Commands
  ipcMain.handle('project:commands:findByProjectId', (_, projectId: string) =>
    ProjectCommandRepository.findByProjectId(projectId),
  );
  ipcMain.handle('project:commands:create', (_, data: NewProjectCommand) =>
    ProjectCommandRepository.create(data),
  );
  ipcMain.handle(
    'project:commands:update',
    (_, { id, data }: { id: string; data: UpdateProjectCommand }) =>
      ProjectCommandRepository.update(id, data),
  );
  ipcMain.handle('project:commands:delete', (_, id: string) =>
    ProjectCommandRepository.delete(id),
  );
  ipcMain.handle(
    'project:commands:reorder',
    (
      _,
      { projectId, commandIds }: { projectId: string; commandIds: string[] },
    ) => ProjectCommandRepository.reorder(projectId, commandIds),
  );
  ipcMain.handle(
    'project:commandGroups:findByProjectId',
    (_, projectId: string) =>
      ProjectCommandGroupRepository.findByProjectId(projectId),
  );
  ipcMain.handle(
    'project:commandGroups:create',
    (_, data: NewProjectCommandGroup) =>
      ProjectCommandGroupRepository.create(data),
  );
  ipcMain.handle(
    'project:commandGroups:update',
    (_, { id, data }: { id: string; data: UpdateProjectCommandGroup }) =>
      ProjectCommandGroupRepository.update(id, data),
  );
  ipcMain.handle('project:commandGroups:delete', (_, id: string) =>
    ProjectCommandGroupRepository.delete(id),
  );
  ipcMain.handle(
    'project:commandGroups:reorder',
    (_, { projectId, groupIds }: { projectId: string; groupIds: string[] }) =>
      ProjectCommandGroupRepository.reorder(projectId, groupIds),
  );
  ipcMain.handle(
    'project:runConfig:reorder',
    (
      _,
      {
        projectId,
        items,
      }: { projectId: string; items: RunCommandConfigItem[] },
    ) => ProjectRunConfigRepository.reorder(projectId, items),
  );

  // Run Commands
  ipcMain.handle(
    'project:commands:run:startCommand',
    (
      _,
      params: {
        taskId: string;
        projectId: string;
        workingDir: string;
        runCommandId: string;
      },
    ) => runCommandService.startCommand(params),
  );
  ipcMain.handle(
    'project:commands:run:startGroup',
    (
      _,
      params: {
        taskId: string;
        projectId: string;
        workingDir: string;
        runCommandIds: string[];
      },
    ) => runCommandService.startGroup(params),
  );
  ipcMain.handle(
    'project:commands:run:stopCommand',
    (_, params: { taskId: string; runCommandId: string }) =>
      runCommandService.stopCommand(params),
  );
  ipcMain.handle(
    'project:commands:run:sendInput',
    (_, params: { taskId: string; runCommandId: string; input: string }) =>
      runCommandService.sendInput(params),
  );
  ipcMain.handle(
    'project:commands:run:sendSignal',
    (
      _,
      params: {
        taskId: string;
        runCommandId: string;
        signal: 'SIGINT' | 'SIGTERM';
      },
    ) => runCommandService.sendSignal(params),
  );
  ipcMain.handle('project:commands:run:getStatus', (_, taskId: string) =>
    runCommandService.getRunStatus(taskId),
  );
  ipcMain.handle('project:commands:run:getTaskIdsWithRunningCommands', () =>
    runCommandService.getTaskIdsWithRunningCommands(),
  );
  ipcMain.handle(
    'project:commands:run:killPortsForCommand',
    (_, { projectId, commandId }: { projectId: string; commandId: string }) =>
      runCommandService.killPortsForCommand(projectId, commandId),
  );
  ipcMain.handle(
    'project:commands:run:getPackageScripts',
    (_, projectPath: string) =>
      runCommandService.getPackageScripts(projectPath),
  );

  const previousRunCommandStatuses = new Map<string, Map<string, string>>();

  // Subscribe to run command status changes and forward to renderer
  runCommandService.onStatusChange((taskId, status) => {
    BrowserWindow.getAllWindows().forEach((win) => {
      if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
        win.webContents.send(
          'project:commands:run:statusChange',
          taskId,
          status,
        );
      }
    });

    const previousByCommand =
      previousRunCommandStatuses.get(taskId) ?? new Map<string, string>();
    const nextByCommand = new Map<string, string>();

    for (const commandStatus of status.commands) {
      nextByCommand.set(commandStatus.id, commandStatus.status);

      const previousStatus = previousByCommand.get(commandStatus.id);
      const hasExited =
        previousStatus === 'running' &&
        (commandStatus.status === 'stopped' ||
          commandStatus.status === 'errored');

      if (!hasExited) {
        continue;
      }

      const isAnyWindowFocused = BrowserWindow.getAllWindows().some(
        (win) => !win.isDestroyed() && win.isFocused(),
      );
      if (isAnyWindowFocused) {
        continue;
      }

      void TaskRepository.findById(taskId).then((task) => {
        const mainWindow = BrowserWindow.getAllWindows()[0] ?? null;
        notificationService.notify({
          id: `${taskId}:run-command:${commandStatus.id}`,
          title:
            commandStatus.status === 'stopped'
              ? 'Run Command Finished'
              : 'Run Command Failed',
          body: `Task "${task?.name || 'Unknown'}": ${commandStatus.command}`,
          onClick: () => {
            if (mainWindow && !mainWindow.isDestroyed()) mainWindow.focus();
          },
        });
      });
    }

    if (nextByCommand.size === 0) {
      previousRunCommandStatuses.delete(taskId);
    } else {
      previousRunCommandStatuses.set(taskId, nextByCommand);
    }
  });

  runCommandService.onLog((taskId, runCommandId, stream, line) => {
    BrowserWindow.getAllWindows().forEach((win) => {
      if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
        win.webContents.send(
          'project:commands:run:log',
          taskId,
          runCommandId,
          stream,
          line,
        );
      }
    });
  });

  // Global Prompt
  ipcMain.handle('globalPrompt:respond', (_, response: GlobalPromptResponse) =>
    handlePromptResponse(response),
  );

  // Task Summaries
  ipcMain.handle('tasks:summary:get', async (_, taskId: string) => {
    dbg.ipc('tasks:summary:get %s', taskId);
    return TaskSummaryRepository.findByTaskId(taskId);
  });

  ipcMain.handle('tasks:summary:generate', async (_, taskId: string) => {
    dbg.ipc('tasks:summary:generate %s', taskId);

    // Get the task to access diff root info.
    const task = await TaskRepository.findById(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }
    const project = task.worktreePath
      ? null
      : await ProjectRepository.findById(task.projectId);
    const diffRootPath = task.worktreePath ?? project?.path;
    if (!diffRootPath) {
      throw new Error(`Task ${taskId} does not have a diff root`);
    }

    const startCommitHash =
      task.startCommitHash ?? (await getCurrentCommitHash(diffRootPath));
    const sourceBranch = task.worktreePath ? task.sourceBranch : null;

    // Get current commit hash in the diff root.
    const currentCommitHash = await getCurrentCommitHash(diffRootPath);

    // Check if we already have a summary for this commit
    const existingSummary = await TaskSummaryRepository.findByTaskAndCommit(
      taskId,
      currentCommitHash,
    );
    if (existingSummary) {
      dbg.ipc('Found existing summary for commit %s', currentCommitHash);
      return existingSummary;
    }

    // Get the worktree diff (file list and status)
    const diff = await getWorktreeDiff(
      diffRootPath,
      startCommitHash,
      sourceBranch,
    );
    dbg.ipc('Got diff with %d files', diff.files.length);

    // Get the unified diff content for AI analysis
    const unifiedDiff = await getWorktreeUnifiedDiff(
      diffRootPath,
      startCommitHash,
      sourceBranch,
    );
    dbg.ipc('Got unified diff, length: %d', unifiedDiff.length);

    // Build file list with diff content for the summary generator
    const filesWithDiff = diff.files.map((f) => ({
      path: f.path,
      status: f.status,
      // Extract the relevant portion of the unified diff for this file
      // The unified diff format starts file sections with "diff --git a/path b/path"
      diff: extractFileDiff(unifiedDiff, f.path),
    }));

    // Generate the summary using Claude
    const generated = await generateSummary(filesWithDiff, task.prompt);
    dbg.ipc(
      'Generated summary with %d annotations',
      generated.annotations.length,
    );

    // Store and return the summary
    const summary = await TaskSummaryRepository.create({
      taskId,
      commitHash: currentCommitHash,
      summary: generated.summary,
      annotations: generated.annotations,
    });

    dbg.ipc('Created new summary for task %s', taskId);
    return summary;
  });

  // MCP Templates
  ipcMain.handle('mcpTemplates:findAll', () => McpTemplateRepository.findAll());
  ipcMain.handle('mcpTemplates:findById', (_, id: string) =>
    McpTemplateRepository.findById(id),
  );
  ipcMain.handle('mcpTemplates:create', (_, data: NewMcpServerTemplate) =>
    McpTemplateRepository.create(data),
  );
  ipcMain.handle(
    'mcpTemplates:update',
    (_, id: string, data: UpdateMcpServerTemplate) =>
      McpTemplateRepository.update(id, data),
  );
  ipcMain.handle('mcpTemplates:delete', (_, id: string) =>
    McpTemplateRepository.delete(id),
  );
  ipcMain.handle('mcpTemplates:getPresets', () => MCP_PRESETS);
  ipcMain.handle('mcpTemplates:getEnabledForProject', (_, projectId: string) =>
    getEnabledTemplatesForProject(projectId),
  );

  // Project MCP Overrides
  ipcMain.handle(
    'projectMcpOverrides:findByProjectId',
    (_, projectId: string) => {
      dbg.ipc('projectMcpOverrides:findByProjectId %s', projectId);
      return ProjectMcpOverrideRepository.findByProjectId(projectId);
    },
  );
  ipcMain.handle(
    'projectMcpOverrides:upsert',
    async (_, data: NewProjectMcpOverride) => {
      dbg.ipc('projectMcpOverrides:upsert %o', data);
      const result = await ProjectMcpOverrideRepository.upsert(data);
      dbg.ipc('projectMcpOverrides:upsert result %o', result);
      return result;
    },
  );
  ipcMain.handle(
    'projectMcpOverrides:delete',
    async (_, projectId: string, mcpTemplateId: string) => {
      dbg.ipc(
        'projectMcpOverrides:delete projectId=%s, mcpTemplateId=%s',
        projectId,
        mcpTemplateId,
      );
      await ProjectMcpOverrideRepository.delete(projectId, mcpTemplateId);
      dbg.ipc('projectMcpOverrides:delete completed');
    },
  );

  // Unified MCP servers
  ipcMain.handle(
    'unifiedMcp:getServers',
    async (_, projectId: string, projectPath: string) => {
      dbg.ipc(
        'unifiedMcp:getServers projectId=%s, projectPath=%s',
        projectId,
        projectPath,
      );
      const result = await getUnifiedMcpServers(projectId, projectPath);
      dbg.ipc('unifiedMcp:getServers result count=%d', result.length);
      return result;
    },
  );

  ipcMain.handle(
    'unifiedMcp:activate',
    async (_, projectPath: string, name: string, command: string) => {
      dbg.ipc('unifiedMcp:activate path=%s, name=%s', projectPath, name);
      await activateMcpServer(projectPath, name, command);
      dbg.ipc('unifiedMcp:activate completed');
    },
  );

  ipcMain.handle(
    'unifiedMcp:deactivate',
    async (_, projectPath: string, name: string) => {
      dbg.ipc('unifiedMcp:deactivate path=%s, name=%s', projectPath, name);
      await deactivateMcpServer(projectPath, name);
      dbg.ipc('unifiedMcp:deactivate completed');
    },
  );

  ipcMain.handle(
    'unifiedMcp:substituteVariables',
    async (
      _,
      commandTemplate: string,
      userVariables: Record<string, string>,
      context: {
        projectPath: string;
        projectName: string;
        branchName: string;
        mainRepoPath: string;
      },
    ) => {
      dbg.ipc('unifiedMcp:substituteVariables template=%s', commandTemplate);
      return substituteVariables(commandTemplate, userVariables, context);
    },
  );

  // Claude Projects Cleanup
  ipcMain.handle('claudeProjects:findNonExistent', async () => {
    dbg.ipc('claudeProjects:findNonExistent');
    const claudeJsonPath = path.join(os.homedir(), '.claude.json');
    const claudeProjectsDir = path.join(os.homedir(), '.claude', 'projects');

    const nonExistentProjects: Array<{
      path: string;
      folderName: string;
      source: 'json' | 'folder' | 'both';
    }> = [];

    // Track which paths we've seen
    const pathsFromJson = new Set<string>();
    const pathsFromFolders = new Set<string>();

    // 1. Read ~/.claude.json
    let claudeJsonContent = '';
    try {
      claudeJsonContent = await fs.readFile(claudeJsonPath, 'utf-8');
      const claudeJson = JSON.parse(claudeJsonContent) as {
        projects?: Record<string, unknown>;
      };

      if (claudeJson.projects) {
        for (const projectPath of Object.keys(claudeJson.projects)) {
          const exists = await pathExists(projectPath);
          if (!exists) {
            pathsFromJson.add(projectPath);
          }
        }
      }
    } catch (error) {
      dbg.ipc('Error reading ~/.claude.json: %O', error);
      // File doesn't exist or can't be parsed - that's ok
    }

    // 2. Read ~/.claude/projects/ folders
    try {
      const folders = await fs.readdir(claudeProjectsDir);
      for (const folderName of folders) {
        // Decode folder name back to path
        // Folder names are like: -Users-plin--idling
        // Which decodes to: /Users/plin/.idling
        const decodedPath = folderName
          .replace(/^-/, '/') // Leading - becomes /
          .replace(/--/g, '/.') // -- becomes /.
          .replace(/-/g, '/'); // Single - becomes /

        const exists = await pathExists(decodedPath);
        if (!exists) {
          pathsFromFolders.add(decodedPath);
        }
      }
    } catch (error) {
      dbg.ipc('Error reading ~/.claude/projects/: %O', error);
      // Directory doesn't exist - that's ok
    }

    // 3. Combine results
    const allPaths = new Set([...pathsFromJson, ...pathsFromFolders]);
    for (const projectPath of allPaths) {
      const inJson = pathsFromJson.has(projectPath);
      const inFolder = pathsFromFolders.has(projectPath);
      const source = inJson && inFolder ? 'both' : inJson ? 'json' : 'folder';

      // Encode path to folder name for deletion
      const folderName = projectPath
        .replace(/^\//g, '-') // Leading / becomes -
        .replace(/\/\./g, '--') // /. becomes --
        .replace(/\//g, '-'); // / becomes -

      nonExistentProjects.push({ path: projectPath, folderName, source });
    }

    // Sort by path for consistent display
    nonExistentProjects.sort((a, b) => a.path.localeCompare(b.path));

    // Compute content hash for safety check
    const contentHash = crypto
      .createHash('md5')
      .update(claudeJsonContent)
      .digest('hex');

    dbg.ipc(
      'claudeProjects:findNonExistent found %d projects',
      nonExistentProjects.length,
    );
    return { projects: nonExistentProjects, contentHash };
  });

  ipcMain.handle(
    'claudeProjects:cleanup',
    async (
      _,
      params: {
        paths: string[];
        contentHash: string;
      },
    ) => {
      dbg.ipc('claudeProjects:cleanup paths=%o', params.paths);
      const claudeJsonPath = path.join(os.homedir(), '.claude.json');
      const claudeProjectsDir = path.join(os.homedir(), '.claude', 'projects');

      let removedCount = 0;

      // 1. Re-read and verify ~/.claude.json hasn't changed
      let claudeJsonContent = '';
      let claudeJson: { projects?: Record<string, unknown> } = {};
      try {
        claudeJsonContent = await fs.readFile(claudeJsonPath, 'utf-8');
        const currentHash = crypto
          .createHash('md5')
          .update(claudeJsonContent)
          .digest('hex');

        if (currentHash !== params.contentHash) {
          return {
            success: false,
            removedCount: 0,
            error:
              'The claude.json file was modified since scanning. Please scan again.',
          };
        }

        claudeJson = JSON.parse(claudeJsonContent);
      } catch (error) {
        dbg.ipc('Error reading ~/.claude.json: %O', error);
        // If file doesn't exist, we can still clean up folders
      }

      // 2. Remove from ~/.claude.json
      if (claudeJson.projects) {
        for (const projectPath of params.paths) {
          if (projectPath in claudeJson.projects) {
            delete claudeJson.projects[projectPath];
            removedCount++;
          }
        }

        // Write back
        try {
          await fs.writeFile(
            claudeJsonPath,
            JSON.stringify(claudeJson, null, 2),
            'utf-8',
          );
        } catch (error) {
          dbg.ipc('Error writing ~/.claude.json: %O', error);
          return {
            success: false,
            removedCount,
            error: 'Failed to write claude.json',
          };
        }
      }

      // 3. Remove folders from ~/.claude/projects/
      for (const projectPath of params.paths) {
        const folderName = projectPath
          .replace(/^\//g, '-')
          .replace(/\/\./g, '--')
          .replace(/\//g, '-');

        const folderPath = path.join(claudeProjectsDir, folderName);
        try {
          await fs.rm(folderPath, { recursive: true, force: true });
          dbg.ipc('Removed folder: %s', folderPath);
        } catch (error) {
          dbg.ipc('Error removing folder %s: %O', folderPath, error);
          // Continue with other folders
        }
      }

      dbg.ipc('claudeProjects:cleanup removed %d projects', removedCount);
      return { success: true, removedCount };
    },
  );

  // Completion
  ipcMain.handle(
    'completion:complete',
    (
      _,
      params: {
        prompt: string;
        suffix?: string;
        projectId?: string;
        contextBeforePrompt?: string;
      },
    ) => {
      dbg.ipc('completion:complete (prompt length: %d)', params.prompt.length);
      return completeText(params);
    },
  );
  // Validates the current completion settings by making a real FIM request.
  // Called after saving settings to verify the API key and model work.
  // Returns { success, error? } with user-friendly messages for common HTTP errors (401, 403, 429).
  ipcMain.handle('completion:test', async () => {
    dbg.ipc('completion:test');
    const result = await testCompletion();
    dbg.ipc('completion:test result: %o', result);
    return result;
  });
  ipcMain.handle(
    'completion:saveSettings',
    async (
      _,
      params: {
        enabled: boolean;
        apiKey: string;
        model: string;
        serverUrl: string;
      },
    ) => {
      dbg.ipc(
        'completion:saveSettings enabled=%s model=%s serverUrl=%s hasNewApiKey=%s',
        params.enabled,
        params.model,
        params.serverUrl || '(default)',
        !!params.apiKey,
      );

      let encryptedApiKey: string;
      if (params.apiKey) {
        // New key provided — encrypt it
        const { encryptionService } =
          await import('../services/encryption-service');
        encryptedApiKey = encryptionService.encrypt(params.apiKey);
      } else {
        // No new key — preserve existing
        const existing = await SettingsRepository.get('completion');
        encryptedApiKey = existing.apiKey;
      }

      await SettingsRepository.set('completion', {
        enabled: params.enabled,
        apiKey: encryptedApiKey,
        model: params.model,
        serverUrl: params.serverUrl,
      });

      // Invalidate cached SDK client so next request uses new settings
      resetCompletionClient();
    },
  );
  ipcMain.handle(
    'completion:generateContext',
    async (_, params: { projectId: string }) => {
      dbg.ipc('completion:generateContext projectId=%s', params.projectId);
      const { generateCompletionContext } =
        await import('../services/completion-context-generation-service');
      return generateCompletionContext(params);
    },
  );

  ipcMain.handle('completion:getDailyUsage', async () => {
    if (process.env.JC_DISABLE_USAGE_TRACKING) {
      return {
        promptTokens: 0,
        completionTokens: 0,
        requests: 0,
        costUsd: 0,
        inputCostUsd: 0,
        outputCostUsd: 0,
      };
    }
    dbg.ipc('completion:getDailyUsage');
    return getCompletionDailyUsage();
  });

  ipcMain.handle(
    'aiGeneration:saveSettings',
    async (
      _,
      params: {
        openAiApiKey: string;
        openAiImageGenerationEnabled: boolean;
        openAiImageModel: string;
        openAiLogoPromptContext: string;
      },
    ) => {
      dbg.ipc(
        'aiGeneration:saveSettings hasNewOpenAiKey=%s imageModel=%s',
        !!params.openAiApiKey,
        params.openAiImageModel,
      );

      const existing = await SettingsRepository.get('aiGeneration');
      let encryptedOpenAiApiKey: string;
      if (params.openAiApiKey) {
        const { encryptionService } =
          await import('../services/encryption-service');
        encryptedOpenAiApiKey = encryptionService.encrypt(params.openAiApiKey);
      } else {
        encryptedOpenAiApiKey = existing.openAiApiKey;
      }

      const openAiImageModel = params.openAiImageModel.trim() || 'gpt-image-2';
      if (!isOpenAiImageModel(openAiImageModel)) {
        throw new Error('OpenAI image model must be a GPT-image model');
      }

      await SettingsRepository.set('aiGeneration', {
        ...existing,
        openAiApiKey: encryptedOpenAiApiKey,
        openAiImageGenerationEnabled: params.openAiImageGenerationEnabled,
        openAiImageModel,
        openAiLogoPromptContext: params.openAiLogoPromptContext,
      });
    },
  );

  ipcMain.handle(
    'aiGeneration:saveBaseImage',
    async (_, params: { sourcePath: string }) => {
      dbg.ipc('aiGeneration:saveBaseImage %s', params.sourcePath);
      return redactAiGenerationSetting(
        await saveOpenAiBaseImage(params.sourcePath),
      );
    },
  );

  ipcMain.handle('aiGeneration:listBaseImages', async () => {
    dbg.ipc('aiGeneration:listBaseImages');
    return listOpenAiBaseImageOptions();
  });

  ipcMain.handle(
    'aiGeneration:setBaseImageSelection',
    async (_, params: { mode: 'builtin' | 'custom'; builtinId?: string }) => {
      dbg.ipc('aiGeneration:setBaseImageSelection %o', params);
      return redactAiGenerationSetting(
        await setOpenAiBaseImageSelection(params),
      );
    },
  );

  ipcMain.handle('aiGeneration:removeBaseImage', async () => {
    dbg.ipc('aiGeneration:removeBaseImage');
    return redactAiGenerationSetting(await removeOpenAiBaseImage());
  });

  // Project Todos
  ipcMain.handle('project-todos:list', (_, projectId: string) =>
    ProjectTodoRepository.findByProjectId(projectId),
  );

  ipcMain.handle('project-todos:count', (_, projectId: string) =>
    ProjectTodoRepository.countByProjectId(projectId),
  );

  ipcMain.handle(
    'project-todos:create',
    (_, data: { projectId: string; content: string }) => {
      dbg.ipc('project-todos:create %o', data);
      return ProjectTodoRepository.create(data);
    },
  );

  ipcMain.handle(
    'project-todos:update',
    (_, id: string, data: { content: string }) => {
      dbg.ipc('project-todos:update %s %o', id, data);
      return ProjectTodoRepository.update(id, data);
    },
  );

  ipcMain.handle('project-todos:delete', (_, id: string) => {
    dbg.ipc('project-todos:delete %s', id);
    return ProjectTodoRepository.delete(id);
  });

  ipcMain.handle(
    'project-todos:reorder',
    (_, projectId: string, orderedIds: string[]) => {
      dbg.ipc('project-todos:reorder %s %o', projectId, orderedIds);
      return ProjectTodoRepository.reorder(projectId, orderedIds);
    },
  );

  // Agent Management

  ipcMain.handle('agents:getAll', async () => {
    dbg.ipc('agents:getAll');
    return getAllManagedAgents();
  });

  ipcMain.handle('agents:getContent', async (_, agentPath: string) => {
    dbg.ipc('agents:getContent path=%s', agentPath);
    return getAgentContent({ agentPath });
  });

  ipcMain.handle(
    'agents:create',
    async (
      _,
      params: {
        enabledBackends: AgentBackendType[];
        name: string;
        description: string;
        content: string;
      },
    ) => {
      dbg.ipc('agents:create name=%s', params.name);
      return createAgent(params);
    },
  );

  ipcMain.handle(
    'agents:update',
    async (_, params: { agentPath: string; content: string }) => {
      dbg.ipc('agents:update path=%s', params.agentPath);
      return updateAgent(params);
    },
  );

  ipcMain.handle('agents:delete', async (_, agentPath: string) => {
    dbg.ipc('agents:delete path=%s', agentPath);
    return deleteAgent({ agentPath });
  });

  ipcMain.handle(
    'agents:disable',
    async (_, agentPath: string, backendType: AgentBackendType) => {
      dbg.ipc('agents:disable path=%s backend=%s', agentPath, backendType);
      return disableAgent({ agentPath, backendType });
    },
  );

  ipcMain.handle(
    'agents:enable',
    async (_, agentPath: string, backendType: AgentBackendType) => {
      dbg.ipc('agents:enable path=%s backend=%s', agentPath, backendType);
      return enableAgent({ agentPath, backendType });
    },
  );

  ipcMain.handle('agents:migrationPreview', async () => {
    dbg.ipc('agents:migrationPreview');
    return previewLegacyAgentMigration();
  });

  ipcMain.handle(
    'agents:migrationExecute',
    async (_, params: { itemIds: string[] }) => {
      dbg.ipc('agents:migrationExecute count=%d', params.itemIds.length);
      return executeLegacyAgentMigration({ itemIds: params.itemIds });
    },
  );

  // Skill Management

  // Step-aware skill resolution: look up backend + project path from task/step
  ipcMain.handle(
    'skills:getForStep',
    async (_, params: { taskId: string; stepId?: string }) => {
      dbg.ipc('skills:getForStep %o', params);

      const { taskId, stepId } = params;

      const task = await TaskRepository.findById(taskId);
      if (!task) return [];

      const project = await ProjectRepository.findById(task.projectId);

      // Resolve backend from step, falling back to project default, then 'claude-code'.
      // Only trust step backend when the step belongs to this task.
      let stepBackend: AgentBackendType | undefined;
      if (stepId) {
        const step = await TaskStepRepository.findById(stepId);
        if (step?.taskId === taskId && step.agentBackend) {
          stepBackend = step.agentBackend;
        }
      }

      const backendType: AgentBackendType =
        stepBackend ??
        (project?.defaultAgentBackend as AgentBackendType | null) ??
        'claude-code';

      // Resolve project path (prefer worktree path, fall back to project path)
      const projectPath = task.worktreePath ?? project?.path;

      const allSkills = await getAllManagedSkills({ backendType, projectPath });
      return allSkills
        .filter((s) => s.enabledBackends[backendType] === true)
        .map(({ name, description, source, pluginName, skillPath }) => ({
          name,
          description,
          source,
          pluginName,
          skillPath,
        }));
    },
  );

  ipcMain.handle(
    'skills:getAll',
    async (_, backendType: AgentBackendType, projectPath?: string) => {
      dbg.ipc('skills:getAll backend=%s project=%s', backendType, projectPath);
      return getAllManagedSkills({ backendType, projectPath });
    },
  );

  ipcMain.handle('skills:getAllUnified', async (_, projectPath?: string) => {
    dbg.ipc('skills:getAllUnified project=%s', projectPath);
    return getAllManagedSkillsUnified({ projectPath });
  });

  ipcMain.handle('skills:getContent', async (_, skillPath: string) => {
    dbg.ipc('skills:getContent path=%s', skillPath);
    return getSkillContent({ skillPath });
  });

  ipcMain.handle(
    'skills:create',
    async (
      _,
      params: {
        enabledBackends: AgentBackendType[];
        scope: 'user' | 'project';
        projectPath?: string;
        name: string;
        description: string;
        content: string;
      },
    ) => {
      dbg.ipc('skills:create name=%s scope=%s', params.name, params.scope);
      return createSkill(params);
    },
  );

  ipcMain.handle(
    'skills:update',
    async (
      _,
      params: {
        skillPath: string;
        backendType: AgentBackendType;
        name?: string;
        description?: string;
        content?: string;
      },
    ) => {
      dbg.ipc(
        'skills:update path=%s backend=%s',
        params.skillPath,
        params.backendType,
      );
      return updateSkill(params);
    },
  );

  ipcMain.handle(
    'skills:delete',
    async (_, skillPath: string, backendType: AgentBackendType) => {
      dbg.ipc('skills:delete path=%s backend=%s', skillPath, backendType);
      return deleteSkill({ skillPath, backendType });
    },
  );

  ipcMain.handle(
    'skills:disable',
    async (_, skillPath: string, backendType: AgentBackendType) => {
      dbg.ipc('skills:disable path=%s backend=%s', skillPath, backendType);
      return disableSkill({ skillPath, backendType });
    },
  );

  ipcMain.handle(
    'skills:enable',
    async (_, skillPath: string, backendType: AgentBackendType) => {
      dbg.ipc('skills:enable path=%s backend=%s', skillPath, backendType);
      return enableSkill({ skillPath, backendType });
    },
  );

  ipcMain.handle('skills:migrationPreview', async () => {
    dbg.ipc('skills:migrationPreview');
    return previewLegacySkillMigration();
  });

  ipcMain.handle(
    'skills:migrationExecute',
    async (_, params: { itemIds: string[] }) => {
      dbg.ipc('skills:migrationExecute count=%d', params.itemIds.length);
      return executeLegacySkillMigration({ itemIds: params.itemIds });
    },
  );

  // --- Skills registry (skills.sh) ---

  ipcMain.handle('skills:registrySearch', async (_, query: string) => {
    dbg.ipc('skills:registrySearch query=%s', query);
    return searchRegistry({ query });
  });

  ipcMain.handle(
    'skills:registryFetchContent',
    async (_, source: string, skillId: string) => {
      dbg.ipc(
        'skills:registryFetchContent source=%s skillId=%s',
        source,
        skillId,
      );
      return fetchRegistrySkillContent({ source, skillId });
    },
  );

  ipcMain.handle(
    'skills:registryInstall',
    async (
      _,
      params: {
        source: string;
        skillId: string;
        enabledBackends: AgentBackendType[];
      },
    ) => {
      dbg.ipc(
        'skills:registryInstall source=%s skill=%s',
        params.source,
        params.skillId,
      );
      return installFromRegistry(params);
    },
  );

  ipcMain.handle(
    'skills:createWithAgent',
    async (
      _event,
      data: {
        prompt: string;
        enabledBackends: AgentBackendType[];
        mode: 'create' | 'improve';
        sourceSkillPath?: string;
        interactionMode?: InteractionMode | null;
        modelPreference?: string | null;
        agentBackend?: AgentBackendType | null;
      },
    ) => {
      // Runtime validation
      if (!data.prompt || typeof data.prompt !== 'string') {
        throw new Error('prompt is required');
      }
      assertValidSkillCreationInput(data);

      // Validate sourceSkillPath is under a known skill directory (symlink-safe)
      if (data.mode === 'improve' && data.sourceSkillPath) {
        await assertValidSourceSkillPath(data.sourceSkillPath);
      }

      const systemProject = await getOrCreateSystemProject();

      // Generate a task name
      const taskName = await generateTaskName(data.prompt, null, {
        feature: 'task-name',
        projectId: systemProject.id,
        taskId: null,
        stepId: null,
        projectName: systemProject.name,
      });

      // Create task in system project
      const task = await createTaskAndEmit({
        projectId: systemProject.id,
        type: 'skill-creation',
        name: taskName,
        prompt: data.prompt,
        updatedAt: new Date().toISOString(),
      });

      let workspacePath: string | undefined;

      try {
        // Create workspace
        workspacePath = await getSkillWorkspacePath(task.id);

        // For improve mode, copy existing skill into workspace
        if (data.mode === 'improve' && data.sourceSkillPath) {
          await fs.cp(data.sourceSkillPath, workspacePath, { recursive: true });
        }

        // Build the agent prompt
        const agentPrompt = buildSkillCreationPrompt({
          userPrompt: data.prompt,
          mode: data.mode,
          workspacePath,
        });

        // Create step with skill-creation meta
        const meta: SkillCreationStepMeta = {
          mode: data.mode,
          workspacePath,
          sourceSkillPath: data.sourceSkillPath,
          enabledBackends: data.enabledBackends,
        };

        const step = await StepService.create({
          taskId: task.id,
          name: 'Step 1',
          type: 'skill-creation',
          promptTemplate: agentPrompt,
          interactionMode: data.interactionMode ?? 'plan',
          modelPreference: data.modelPreference ?? null,
          agentBackend: data.agentBackend ?? 'claude-code',
          meta,
        });

        // Auto-start
        agentService.start(step.id).catch((err) => {
          dbg.ipc(
            'Error auto-starting skill creation agent for step %s: %O',
            step.id,
            err,
          );
        });

        return task;
      } catch (err) {
        // Clean up on partial failure
        if (workspacePath) {
          await cleanupSkillWorkspace(workspacePath).catch(() => {});
        }
        await deleteTaskAndEmit(task).catch(() => {});
        throw err;
      }
    },
  );

  ipcMain.handle(
    'skills:publishFromWorkspace',
    async (
      _event,
      data: {
        stepId: string;
        workspacePath: string;
        enabledBackends: AgentBackendType[];
        mode: 'create' | 'improve';
        sourceSkillPath?: string;
      },
    ) => {
      // Runtime validation
      if (!data.stepId || typeof data.stepId !== 'string') {
        throw new Error('stepId is required');
      }
      if (!data.workspacePath || typeof data.workspacePath !== 'string') {
        throw new Error('workspacePath is required');
      }
      assertValidSkillCreationInput(data);

      // Validate workspace path is under the expected directory (symlink-safe)
      await assertValidWorkspacePath(data.workspacePath);

      // Validate sourceSkillPath is under a known skill directory (symlink-safe)
      if (data.mode === 'improve' && data.sourceSkillPath) {
        await assertValidSourceSkillPath(data.sourceSkillPath);
      }

      // Verify step ownership: step must exist, be a skill-creation step,
      // and its stored workspacePath must match the provided one
      const step = await TaskStepRepository.findById(data.stepId);
      if (!step || step.type !== 'skill-creation') {
        throw new Error('Invalid stepId: must reference a skill-creation step');
      }
      if (!isSkillCreationStepMeta(step.meta)) {
        throw new Error(
          'Invalid step: missing or malformed skill-creation metadata',
        );
      }
      if (step.meta.workspacePath !== data.workspacePath) {
        throw new Error('workspacePath does not match the step metadata');
      }

      // Idempotency: if already published, return early
      if (step.meta.published) {
        dbg.ipc('Step %s already published, skipping', data.stepId);
        return [];
      }

      const entries = await fs.readdir(data.workspacePath, {
        withFileTypes: true,
      });

      // Collect skill directories: only subdirectories containing a SKILL.md
      const skillPaths: string[] = [];

      // Check if SKILL.md exists directly in workspace (improve mode)
      const hasDirectSkillMd = entries.some(
        (e) => e.name === 'SKILL.md' && !e.isDirectory(),
      );
      if (hasDirectSkillMd) {
        skillPaths.push(data.workspacePath);
      }

      // Check subdirectories for SKILL.md (in parallel)
      const subDirChecks = entries
        .filter(
          (entry) =>
            entry.isDirectory() &&
            !entry.name.startsWith('.') &&
            entry.name !== 'node_modules',
        )
        .map(async (entry) => {
          const subDir = path.join(data.workspacePath, entry.name);
          const hasSkillMd = await fs
            .access(path.join(subDir, 'SKILL.md'))
            .then(() => true)
            .catch(() => false);
          return hasSkillMd ? subDir : null;
        });
      const subDirResults = await Promise.all(subDirChecks);
      for (const subDir of subDirResults) {
        if (subDir) skillPaths.push(subDir);
      }

      if (skillPaths.length === 0) {
        throw new Error(
          'No skill found in workspace. The agent may not have created a SKILL.md file.',
        );
      }

      const results = [];

      try {
        for (const skillDir of skillPaths) {
          const content = await getSkillContent({ skillPath: skillDir });

          if (data.mode === 'improve' && data.sourceSkillPath) {
            // Update existing skill in-place (use first enabled backend for context)
            const updated = await updateSkill({
              skillPath: data.sourceSkillPath,
              backendType: data.enabledBackends[0],
              name: content.name,
              description: content.description,
              content: content.content,
            });
            results.push(updated);
          } else {
            // Create new skill
            const created = await createSkill({
              enabledBackends: data.enabledBackends,
              scope: 'user',
              name: content.name,
              description: content.description,
              content: content.content,
            });
            results.push(created);
          }
        }

        // Mark step as published and completed
        await updateStepAndEmit(data.stepId, {
          status: 'completed',
          meta: {
            ...step.meta,
            published: true,
          },
        });

        // Mark the task as completed
        await updateTaskAndEmit(step.taskId, {
          status: 'completed',
          updatedAt: new Date().toISOString(),
        });
        // Cleanup workspace after successful publish
        await cleanupSkillWorkspace(data.workspacePath).catch((err) => {
          dbg.ipc(
            'Failed to cleanup skill workspace %s after publish: %O',
            data.workspacePath,
            err,
          );
        });
      } catch (err) {
        // On failure, preserve the workspace so the user can retry or recover
        dbg.ipc(
          'Publish failed for workspace %s, preserving for recovery: %O',
          data.workspacePath,
          err,
        );
        throw err;
      }

      return results;
    },
  );

  // Source Management

  ipcMain.handle('sources:list', async () => {
    dbg.ipc('sources:list');
    return listSources();
  });

  ipcMain.handle('sources:addGithub', async (_, payload: unknown) => {
    const params = validateAddGitHubSourceParams(payload);
    dbg.ipc('sources:addGithub url=%s', params.url);
    return addGitHubSource(params);
  });

  ipcMain.handle('sources:refresh', async (_, payload: unknown) => {
    const sourceId = assertNonEmptyString(payload, 'sourceId');
    dbg.ipc('sources:refresh sourceId=%s', sourceId);
    return refreshSource({ sourceId });
  });

  ipcMain.handle('sources:installItems', async (_, payload: unknown) => {
    const params = validateInstallSourceItemsParams(payload);
    dbg.ipc('sources:installItems count=%d', params.items.length);
    return installSourceItems(params);
  });

  ipcMain.handle('sources:updateInstall', async (_, payload: unknown) => {
    const params = validateUpdateSourceInstallParams(payload);
    dbg.ipc(
      'sources:updateInstall sourceId=%s installId=%s',
      params.sourceId,
      params.installId,
    );
    return updateSourceInstall(params);
  });

  ipcMain.handle('sources:remove', async (_, payload: unknown) => {
    const sourceId = assertNonEmptyString(payload, 'sourceId');
    dbg.ipc('sources:remove sourceId=%s', sourceId);
    return removeSource(sourceId);
  });

  // Feed
  ipcMain.handle('feed:getItems', async () => {
    return getFeedItems();
  });

  ipcMain.handle('feed:getTaskItems', async () => {
    return getTaskFeedItems();
  });

  ipcMain.handle('feed:getPullRequestItems', async () => {
    return getPrFeedItems();
  });

  ipcMain.handle('feed:getNoteItems', async () => {
    return getNoteFeedItems();
  });

  ipcMain.handle('feed:getWorkItemItems', async () => {
    return getWorkItemFeedItems();
  });

  ipcMain.handle(
    'feed:createNote',
    async (_event, params: { content: string }) => {
      const content = validateFeedNoteContent(params.content);
      return createFeedNote({ content });
    },
  );

  ipcMain.handle(
    'feed:createWorkItemVerificationNote',
    async (_event, params: CreateWorkItemVerificationNoteParams) => {
      const validatedParams =
        validateCreateWorkItemVerificationNoteParams(params);
      const content = await generateWorkItemVerificationNote(validatedParams);
      if (!content) {
        throw new Error('Failed to generate verification note');
      }

      return createFeedNote({ content: validateFeedNoteContent(content) });
    },
  );

  ipcMain.handle(
    'feed:updateNote',
    async (
      _event,
      params: {
        id: string;
        content?: string;
        completedAt?: string | null;
      },
    ) => {
      const id = validateFeedNoteId(params.id);
      const content =
        params.content === undefined
          ? undefined
          : validateFeedNoteBlockNoteContent(params.content);
      const completedAt = validateFeedNoteCompletedAt(params.completedAt);
      return updateFeedNote({ id, content, completedAt });
    },
  );

  ipcMain.handle('feed:deleteNote', async (_event, params: { id: string }) => {
    const id = validateFeedNoteId(params.id);
    return deleteFeedNote({ id });
  });

  ipcMain.handle(
    'pr-snapshots:record',
    async (
      _event,
      params: {
        projectId: string;
        pullRequestId: number;
        providerId: string;
        repoProjectId: string;
        repoId: string;
      },
    ) => {
      const { getPullRequestActivityMetadata } =
        await import('../services/azure-devops-service');
      const { PrViewSnapshotRepository } =
        await import('../database/repositories/pr-view-snapshots');

      const metadata = await getPullRequestActivityMetadata({
        providerId: params.providerId,
        projectId: params.repoProjectId,
        repoId: params.repoId,
        pullRequestId: params.pullRequestId,
      });

      await PrViewSnapshotRepository.upsert({
        projectId: params.projectId,
        pullRequestId: String(params.pullRequestId),
        lastCommitDate: metadata.lastCommitDate,
        lastThreadActivityDate: metadata.lastThreadActivityDate,
        activeThreadCount: metadata.activeThreadCount,
      });
    },
  );

  // ─── Notifications ────────────────────────────────────────────────

  ipcMain.handle('notifications:list', async () => {
    const rows = await NotificationRepository.findAll();
    return rows.map((row) => ({
      ...row,
      read: row.read === 1,
      meta: safeJsonParse(row.meta),
    }));
  });

  ipcMain.handle('notifications:getDesktopStatus', async () => ({
    supported: Notification.isSupported(),
    canOpenSettings:
      process.platform === 'darwin' || process.platform === 'win32',
  }));

  ipcMain.handle('notifications:openSystemSettings', async () => {
    if (process.platform === 'darwin') {
      await shell.openExternal(
        'x-apple.systempreferences:com.apple.preference.notifications',
      );
      return true;
    }

    if (process.platform === 'win32') {
      await shell.openExternal('ms-settings:notifications');
      return true;
    }

    return false;
  });

  ipcMain.handle('notifications:markRead', async (_, id: string | 'all') => {
    if (id === 'all') {
      await NotificationRepository.markAllAsRead();
    } else {
      await NotificationRepository.markAsRead(id);
    }
  });

  ipcMain.handle('notifications:delete', async (_, id: string) => {
    await NotificationRepository.deleteById(id);
  });

  // ─── Tracked Pipelines ────────────────────────────────────────────

  ipcMain.handle('tracked-pipelines:list', async (_, projectId: string) => {
    const rows = await TrackedPipelineRepository.findByProject(projectId);
    return rows.map((row) => ({
      ...row,
      enabled: row.enabled === 1,
      visible: row.visible === 1,
    }));
  });

  ipcMain.handle('tracked-pipelines:listAll', async () => {
    const rows = await TrackedPipelineRepository.findAll();
    return rows.map((row) => ({
      ...row,
      enabled: row.enabled === 1,
      visible: row.visible === 1,
    }));
  });

  ipcMain.handle(
    'tracked-pipelines:toggle',
    async (_, id: string, enabled: boolean) => {
      await TrackedPipelineRepository.toggleEnabled(id, enabled);
    },
  );

  ipcMain.handle(
    'tracked-pipelines:toggleVisible',
    async (_, id: string, visible: boolean) => {
      await TrackedPipelineRepository.toggleVisible(id, visible);
    },
  );

  ipcMain.handle(
    'tracked-pipelines:reorder',
    async (_, projectId: string, orderedIds: string[]) => {
      await TrackedPipelineRepository.reorder(projectId, orderedIds);
    },
  );

  ipcMain.handle('tracked-pipelines:discover', async (_, projectId: string) => {
    const rows = await pipelineTrackingService.discoverPipelines(projectId);
    return rows.map((row) => ({
      ...row,
      enabled: row.enabled === 1,
      visible: row.visible === 1,
    }));
  });

  // ─── App ─────────────────────────────────────────────────────────

  ipcMain.handle('app:getIsPreviewMode', () => {
    return !!process.env.JC_PREVIEW;
  });

  ipcMain.handle(
    'app:getReloadUpdateInfo',
    async (_event, params: { builtCommitHash?: string }) => {
      const projectRoot = app.getAppPath();
      const builtCommitHash = params.builtCommitHash?.trim();
      if (!builtCommitHash) {
        return { commitCount: 0, latestCommitHash: null };
      }

      await runGit(['fetch', '--quiet'], projectRoot, {
        timeoutMs: 10000,
      }).catch((error) => {
        dbg.ipc('app:getReloadUpdateInfo git fetch failed: %s', error.message);
      });

      const builtCommit = await runGit(
        ['rev-parse', '--verify', `${builtCommitHash}^{commit}`],
        projectRoot,
      );
      const localCommit = await runGit(['rev-parse', 'HEAD'], projectRoot);
      const upstreamCommit = await runGit(
        ['rev-parse', '--verify', '@{upstream}^{commit}'],
        projectRoot,
      ).catch(() => null);
      const availableCommits = upstreamCommit
        ? [localCommit, upstreamCommit]
        : [localCommit];

      const latestCommit = (
        await Promise.all(
          availableCommits.map(async (commit) => ({
            commit,
            date: await getCommitDate(commit, projectRoot),
          })),
        )
      ).sort((a, b) => b.date - a.date)[0].commit;

      const countText = await runGit(
        ['rev-list', '--count', `^${builtCommit}`, ...availableCommits],
        projectRoot,
      );

      return {
        commitCount: Number(countText) || 0,
        latestCommitHash: latestCommit.slice(0, 7),
      };
    },
  );

  ipcMain.handle('app:reloadPreview', async (event) => {
    if (previewReloadInProgress) {
      return;
    }

    previewReloadInProgress = true;
    const projectRoot = app.getAppPath();
    const sendReloadProgress = (progress: {
      step:
        | 'stopping-commands'
        | 'pulling'
        | 'building'
        | 'launching'
        | 'restarting';
      label: string;
      detail?: string;
    }) => {
      event.sender.send('app:reloadPreviewProgress', progress);
    };

    try {
      dbg.ipc('app:reloadPreview — stopping all running commands');
      sendReloadProgress({
        step: 'stopping-commands',
        label: 'Stopping running commands',
        detail: 'Waiting for project commands to stop',
      });
      await runCommandService.stopAllCommands();

      dbg.ipc('app:reloadPreview — running git pull in %s', projectRoot);
      sendReloadProgress({
        step: 'pulling',
        label: 'Pulling latest changes',
        detail: 'git pull',
      });

      await runReloadPreviewCommand({
        command: 'git',
        args: ['pull'],
        cwd: projectRoot,
        label: 'Git pull',
        timeoutMs: PREVIEW_RELOAD_GIT_PULL_TIMEOUT_MS,
        onStdout: (data) => {
          dbg.ipc(
            'app:reloadPreview git pull stdout: %s',
            data.toString().trim(),
          );
        },
        onStderr: (data) => {
          dbg.ipc(
            'app:reloadPreview git pull stderr: %s',
            data.toString().trim(),
          );
        },
      });

      dbg.ipc('app:reloadPreview — running pnpm install in %s', projectRoot);
      sendReloadProgress({
        step: 'building',
        label: 'Installing and building',
        detail: 'pnpm install',
      });

      await runReloadPreviewCommand({
        command: 'pnpm',
        args: ['install'],
        cwd: projectRoot,
        label: 'pnpm install',
        timeoutMs: PREVIEW_RELOAD_INSTALL_TIMEOUT_MS,
        onStdout: (data) => {
          dbg.ipc(
            'app:reloadPreview pnpm install stdout: %s',
            data.toString().trim(),
          );
        },
        onStderr: (data) => {
          dbg.ipc(
            'app:reloadPreview pnpm install stderr: %s',
            data.toString().trim(),
          );
        },
      });

      dbg.ipc('app:reloadPreview — running pnpm build in %s', projectRoot);
      sendReloadProgress({
        step: 'building',
        label: 'Installing and building',
        detail: 'pnpm build',
      });

      await runReloadPreviewCommand({
        command: 'pnpm',
        args: ['build'],
        cwd: projectRoot,
        label: 'pnpm build',
        timeoutMs: PREVIEW_RELOAD_BUILD_TIMEOUT_MS,
        onStdout: (data) => {
          dbg.ipc(
            'app:reloadPreview pnpm build stdout: %s',
            data.toString().trim(),
          );
        },
        onStderr: (data) => {
          dbg.ipc(
            'app:reloadPreview pnpm build stderr: %s',
            data.toString().trim(),
          );
        },
      });

      dbg.ipc(
        'app:reloadPreview — launching pnpm preview:skip-build in %s',
        projectRoot,
      );
      sendReloadProgress({
        step: 'launching',
        label: 'Launching preview',
        detail: 'pnpm preview:skip-build',
      });
      app.releaseSingleInstanceLock();
      const child = spawn('pnpm preview:skip-build', [], {
        cwd: projectRoot,
        detached: true,
        stdio: 'ignore',
        shell: true,
      });
      child.unref();

      sendReloadProgress({
        step: 'restarting',
        label: 'Restarting app',
        detail: 'New preview is starting',
      });
      setTimeout(() => {
        app.exit(0);
      }, 500);
    } catch (error) {
      previewReloadInProgress = false;
      throw error;
    }
  });

  // ─── System ───────────────────────────────────────────────────────

  ipcMain.handle('system:getMemoryUsage', async (event) => {
    const mainMem = process.memoryUsage();
    const metrics = app.getAppMetrics();
    const mainMetric = metrics.find((metric) => metric.pid === process.pid);
    const rendererPid = event.sender.getOSProcessId();
    const rendererMetric = metrics.find((metric) => metric.pid === rendererPid);
    const rendererRssBytes =
      (rendererMetric?.memory?.workingSetSize ?? 0) * 1024;
    const rendererPrivateBytes =
      (rendererMetric?.memory?.privateBytes ?? 0) * 1024;

    return {
      totalRssBytes: mainMem.rss + rendererRssBytes,
      mainProcess: {
        heapUsedBytes: mainMem.heapUsed,
        rssBytes: mainMem.rss,
        cpuPercent: mainMetric?.cpu?.percentCPUUsage ?? 0,
      },
      rendererProcess: {
        rssBytes: rendererRssBytes,
        privateBytes: rendererPrivateBytes,
        cpuPercent: rendererMetric?.cpu?.percentCPUUsage ?? 0,
      },
    };
  });

  // --- Pipeline detail & trigger handlers ---

  /** Validate that a string param is a non-empty string safe for URL path interpolation. */
  function assertStringId(
    value: unknown,
    name: string,
  ): asserts value is string {
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error(`${name} must be a non-empty string`);
    }
    // Reject path traversal characters
    if (/[/\\]/.test(value)) {
      throw new Error(`${name} contains invalid characters`);
    }
  }

  /** Validate that a numeric param is a finite positive integer. */
  function assertPositiveInt(
    value: unknown,
    name: string,
  ): asserts value is number {
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value < 0 ||
      !Number.isInteger(value)
    ) {
      throw new Error(`${name} must be a positive integer`);
    }
  }

  ipcMain.handle(
    'pipelines:listRuns',
    async (
      _,
      params: {
        providerId: string;
        azureProjectId: string;
        definitionId: number;
        kind: 'build' | 'release';
      },
    ) => {
      assertStringId(params.providerId, 'providerId');
      assertStringId(params.azureProjectId, 'azureProjectId');
      assertPositiveInt(params.definitionId, 'definitionId');
      if (params.kind === 'build') {
        return listBuilds({
          providerId: params.providerId,
          projectId: params.azureProjectId,
          definitionId: params.definitionId,
        });
      }
      return listReleases({
        providerId: params.providerId,
        projectId: params.azureProjectId,
        definitionId: params.definitionId,
      });
    },
  );

  ipcMain.handle(
    'pipelines:getBuild',
    async (
      _,
      params: {
        providerId: string;
        azureProjectId: string;
        buildId: number;
      },
    ) => {
      assertStringId(params.providerId, 'providerId');
      assertStringId(params.azureProjectId, 'azureProjectId');
      assertPositiveInt(params.buildId, 'buildId');
      return getBuild({
        providerId: params.providerId,
        projectId: params.azureProjectId,
        buildId: params.buildId,
      });
    },
  );

  ipcMain.handle(
    'pipelines:getBuildTimeline',
    async (
      _,
      params: {
        providerId: string;
        azureProjectId: string;
        buildId: number;
      },
    ) => {
      assertStringId(params.providerId, 'providerId');
      assertStringId(params.azureProjectId, 'azureProjectId');
      assertPositiveInt(params.buildId, 'buildId');
      return getBuildTimeline({
        providerId: params.providerId,
        projectId: params.azureProjectId,
        buildId: params.buildId,
      });
    },
  );

  ipcMain.handle(
    'pipelines:getBuildLog',
    async (
      _,
      params: {
        providerId: string;
        azureProjectId: string;
        buildId: number;
        logId: number;
      },
    ) => {
      assertStringId(params.providerId, 'providerId');
      assertStringId(params.azureProjectId, 'azureProjectId');
      assertPositiveInt(params.buildId, 'buildId');
      assertPositiveInt(params.logId, 'logId');
      return getBuildLog({
        providerId: params.providerId,
        projectId: params.azureProjectId,
        buildId: params.buildId,
        logId: params.logId,
      });
    },
  );

  ipcMain.handle(
    'pipelines:getRelease',
    async (
      _,
      params: {
        providerId: string;
        azureProjectId: string;
        releaseId: number;
      },
    ) => {
      assertStringId(params.providerId, 'providerId');
      assertStringId(params.azureProjectId, 'azureProjectId');
      assertPositiveInt(params.releaseId, 'releaseId');
      return getRelease({
        providerId: params.providerId,
        projectId: params.azureProjectId,
        releaseId: params.releaseId,
      });
    },
  );

  ipcMain.handle(
    'pipelines:listBranches',
    async (
      _,
      params: {
        providerId: string;
        azureProjectId: string;
        repoId: string;
      },
    ) => {
      assertStringId(params.providerId, 'providerId');
      assertStringId(params.azureProjectId, 'azureProjectId');
      assertStringId(params.repoId, 'repoId');
      return listBranches({
        providerId: params.providerId,
        projectId: params.azureProjectId,
        repoId: params.repoId,
      });
    },
  );

  ipcMain.handle(
    'pipelines:getDefinitionParams',
    async (
      _,
      params: {
        providerId: string;
        azureProjectId: string;
        definitionId: number;
      },
    ) => {
      assertStringId(params.providerId, 'providerId');
      assertStringId(params.azureProjectId, 'azureProjectId');
      assertPositiveInt(params.definitionId, 'definitionId');
      return getBuildDefinitionDetail({
        providerId: params.providerId,
        projectId: params.azureProjectId,
        definitionId: params.definitionId,
      });
    },
  );

  ipcMain.handle(
    'pipelines:getYamlParameters',
    async (_, params: GetYamlParametersIpcParams) => {
      const { providerId, azureProjectId, repoId, yamlFilename, branch } =
        params;
      for (const [key, val] of Object.entries({
        providerId,
        azureProjectId,
        repoId,
        yamlFilename,
        branch,
      })) {
        if (!val || typeof val !== 'string') {
          throw new Error(`pipelines:getYamlParameters: ${key} is required`);
        }
      }
      return getYamlPipelineParameters({
        providerId,
        projectId: azureProjectId,
        repoId,
        yamlFilename,
        branch,
      });
    },
  );

  ipcMain.handle(
    'pipelines:queueBuild',
    async (_, params: QueueBuildIpcParams) => {
      assertStringId(params.providerId, 'providerId');
      assertStringId(params.azureProjectId, 'azureProjectId');
      assertPositiveInt(params.definitionId, 'definitionId');
      if (
        typeof params.sourceBranch !== 'string' ||
        params.sourceBranch.length === 0
      ) {
        throw new Error('sourceBranch must be a non-empty string');
      }
      // Validate templateParameters keys/values to prevent injection
      if (params.templateParameters) {
        for (const [key, val] of Object.entries(params.templateParameters)) {
          if (typeof key !== 'string' || typeof val !== 'string') {
            throw new Error(
              'templateParameters must be Record<string, string>',
            );
          }
          if (!/^[\w\-.]+$/.test(key)) {
            throw new Error(
              `templateParameters key "${key}" contains invalid characters`,
            );
          }
        }
      }
      if (params.parameters) {
        for (const [key, val] of Object.entries(params.parameters)) {
          if (typeof key !== 'string' || typeof val !== 'string') {
            throw new Error('parameters must be Record<string, string>');
          }
        }
      }
      return queueBuild({
        providerId: params.providerId,
        projectId: params.azureProjectId,
        definitionId: params.definitionId,
        sourceBranch: params.sourceBranch,
        parameters: params.parameters,
        templateParameters: params.templateParameters,
      });
    },
  );

  ipcMain.handle(
    'pipelines:createRelease',
    async (
      _,
      params: {
        providerId: string;
        azureProjectId: string;
        definitionId: number;
        description?: string;
      },
    ) => {
      assertStringId(params.providerId, 'providerId');
      assertStringId(params.azureProjectId, 'azureProjectId');
      assertPositiveInt(params.definitionId, 'definitionId');
      return createAzureRelease({
        providerId: params.providerId,
        projectId: params.azureProjectId,
        definitionId: params.definitionId,
        description: params.description,
      });
    },
  );

  ipcMain.handle(
    'pipelines:cancelBuild',
    async (
      _,
      params: {
        providerId: string;
        azureProjectId: string;
        buildId: number;
      },
    ) => {
      assertStringId(params.providerId, 'providerId');
      assertStringId(params.azureProjectId, 'azureProjectId');
      assertPositiveInt(params.buildId, 'buildId');
      return cancelBuild({
        providerId: params.providerId,
        projectId: params.azureProjectId,
        buildId: params.buildId,
      });
    },
  );

  // Code folding (tree-sitter)
  ipcMain.handle(
    'codeFolding:getFoldRanges',
    async (_, content: string, language: string) => {
      const { computeFoldRanges } =
        await import('../services/tree-sitter-fold-service');
      return computeFoldRanges(content, language);
    },
  );
}

function safeJsonParse(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function validateFeedNoteId(id: string): string {
  if (typeof id !== 'string') {
    throw new Error('Invalid note id');
  }

  const trimmed = id.trim();
  if (trimmed.length === 0 || trimmed.length > 128) {
    throw new Error('Invalid note id');
  }

  return trimmed;
}

function validateCreateWorkItemVerificationNoteParams(
  params: CreateWorkItemVerificationNoteParams,
): CreateWorkItemVerificationNoteParams {
  if (!params || typeof params !== 'object') {
    throw new Error('Invalid verification note params');
  }

  if (params.backend !== 'claude-code' && params.backend !== 'opencode') {
    throw new Error('Invalid agent backend');
  }

  if (typeof params.model !== 'string' || params.model.trim().length === 0) {
    throw new Error('Invalid model');
  }

  if (!Array.isArray(params.workItems) || params.workItems.length === 0) {
    throw new Error('At least one work item is required');
  }

  if (params.workItems.length > 20) {
    throw new Error('Too many work items selected');
  }

  return {
    backend: params.backend,
    model: params.model.trim(),
    projectAiSkillSlots: isAiSkillSlotsSetting(params.projectAiSkillSlots)
      ? params.projectAiSkillSlots
      : null,
    workItems: params.workItems.map((workItem) => ({
      id: Number(workItem.id),
      title: String(workItem.title ?? '').slice(0, 500),
      workItemType: String(workItem.workItemType ?? '').slice(0, 100),
      state: String(workItem.state ?? '').slice(0, 100),
      description: workItem.description?.slice(0, 8000),
      reproSteps: workItem.reproSteps?.slice(0, 8000),
    })),
    testCasesByWorkItem: Object.fromEntries(
      Object.entries(params.testCasesByWorkItem ?? {}).map(
        ([workItemId, testCases]) => [
          Number(workItemId),
          (Array.isArray(testCases) ? testCases : [])
            .slice(0, 20)
            .map((tc) => ({
              id: Number(tc.id),
              title: String(tc.title ?? '').slice(0, 500),
              steps: (tc.steps ?? []).slice(0, 30).map((step) => ({
                action: String(step.action ?? '').slice(0, 4000),
                expectedResult: String(step.expectedResult ?? '').slice(
                  0,
                  4000,
                ),
              })),
            })),
        ],
      ),
    ),
  };
}

function validateFeedNoteContent(content: string): string {
  if (typeof content !== 'string') {
    throw new Error('Invalid note content');
  }

  const trimmed = content.trim();
  if (trimmed.length === 0) {
    throw new Error('Note content cannot be empty');
  }

  if (trimmed.length > 4000) {
    throw new Error('Note content is too long');
  }

  return trimmed;
}

function validateFeedNoteBlockNoteContent(content: string): string {
  if (typeof content !== 'string') {
    throw new Error('Invalid note content');
  }

  if (content.length > 100_000) {
    throw new Error('Note content is too long');
  }

  const parsed = JSON.parse(content) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error('Invalid note content');
  }

  return content;
}

function validateFeedNoteCompletedAt(
  completedAt: string | null | undefined,
): string | null | undefined {
  if (completedAt === undefined || completedAt === null) {
    return completedAt;
  }

  if (typeof completedAt !== 'string') {
    throw new Error('Invalid completedAt value');
  }

  const parsed = Date.parse(completedAt);
  if (Number.isNaN(parsed)) {
    throw new Error('Invalid completedAt value');
  }

  return new Date(parsed).toISOString();
}

// Helper: check if an editor is available
async function isEditorAvailable(
  editor: (typeof PRESET_EDITORS)[number],
): Promise<boolean> {
  try {
    await execAsync(`which ${editor.command}`);
    return true;
  } catch {
    // Fallback: check if app exists (macOS)
    const appPath = `/Applications/${editor.appName}.app`;
    return pathExists(appPath);
  }
}

// Helper: open directory/file in editor
// When folderContext is provided, it hints the editor to open the file
// in the window that has that folder open (e.g. worktree folder).
function openInEditor(
  dirPath: string,
  setting: EditorSetting,
  folderContext?: string,
): void {
  // Build args: when a folder context is provided and differs from the target,
  // pass the folder first so the editor targets the correct workspace window.
  const buildArgs = (targetPath: string): string[] => {
    if (folderContext && folderContext !== targetPath) {
      return [folderContext, targetPath];
    }
    return [targetPath];
  };

  if (setting.type === 'preset') {
    const editor = PRESET_EDITORS.find((e) => e.id === setting.id);
    if (editor) {
      spawn(editor.command, buildArgs(dirPath), {
        detached: true,
        stdio: 'ignore',
      }).unref();
    }
  } else if (setting.type === 'command') {
    spawn(setting.command, buildArgs(dirPath), {
      detached: true,
      stdio: 'ignore',
    }).unref();
  } else if (setting.type === 'app') {
    // macOS: open -a "App.app" /path [file]
    spawn('open', ['-a', setting.path, ...buildArgs(dirPath)], {
      detached: true,
      stdio: 'ignore',
    }).unref();
  }
}

/**
 * Extracts the diff section for a specific file from a unified diff output.
 * Returns undefined if the file's diff section is not found.
 */
function extractFileDiff(
  unifiedDiff: string,
  filePath: string,
): string | undefined {
  // The unified diff format starts each file section with:
  // "diff --git a/path/to/file b/path/to/file"
  const fileMarker = `diff --git a/${filePath} b/${filePath}`;
  const startIndex = unifiedDiff.indexOf(fileMarker);

  if (startIndex === -1) {
    return undefined;
  }

  // Find the end of this file's diff section (start of next file or end of string)
  const nextFileIndex = unifiedDiff.indexOf('\ndiff --git ', startIndex + 1);
  const endIndex = nextFileIndex === -1 ? unifiedDiff.length : nextFileIndex;

  return unifiedDiff.slice(startIndex, endIndex).trim();
}
