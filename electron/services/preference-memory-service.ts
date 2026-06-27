import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';

import type {
  PreferenceEvidenceCommentInput,
  PreferenceEvidenceFileSnapshot,
  PreferenceEvidenceMetadata,
  PreferenceEvidenceRecord,
  RecordPreferenceEvidenceParams,
  RecordPreferenceEvidenceResult,
} from '@shared/preference-memory-types';
import {
  DEFAULT_PREFERENCE_MEMORY_CONSOLIDATION_BACKEND,
  DEFAULT_PREFERENCE_MEMORY_CONSOLIDATION_MODEL,
  DEFAULT_PREFERENCE_MEMORY_CONSOLIDATION_THINKING_EFFORT,
  type ModelPreference,
  type ThinkingEffort,
} from '@shared/types';
import type { AgentBackendType } from '@shared/agent-backend-types';

import {
  ProjectRepository,
  SettingsRepository,
  TaskRepository,
} from '../database/repositories';
import { dbg } from '../lib/debug';

import { generateText } from './ai-generation-service';

const MEMORY_DIR = '.jean-claude/memory';
const USER_REVIEWS_DIR = 'user-reviews';
const USER_PREFERENCES_HISTORY_DIR = 'user-preferences-history';
const USER_REVIEWS_STATE_FILE = 'user-reviews-state.json';
const USER_PREFERENCES_FILE = 'user-preferences.md';
const FILE_SNAPSHOT_CONTEXT_LINES = 80;
const MAX_FILE_SNAPSHOT_CHARS = 120_000;
const MAX_TASK_PROMPT_CHARS = 20_000;
const MAX_CONSOLIDATION_EVIDENCE_CHARS = 200_000;
const DEFAULT_CONSOLIDATION_INTERVAL_MINUTES = 24 * 60;
const CONSOLIDATION_POLL_INTERVAL_MS = 60_000;
const CONSOLIDATION_TIMEOUT_MS = 10 * 60 * 1000;

interface PreferenceMemoryState {
  files: Record<string, { offset: number; processedAt?: string }>;
  lastConsolidatedAt?: string;
}

interface ProcessedEvidenceRange {
  fileName: string;
  fromOffset: number;
  toOffset: number;
  recordCount: number;
}

function getMemoryDir(projectPath: string): string {
  return path.join(projectPath, MEMORY_DIR);
}

function getUserReviewsDir(projectPath: string): string {
  return path.join(getMemoryDir(projectPath), USER_REVIEWS_DIR);
}

function getUserPreferencesHistoryDir(projectPath: string): string {
  return path.join(getMemoryDir(projectPath), USER_PREFERENCES_HISTORY_DIR);
}

function getUserReviewsStatePath(projectPath: string): string {
  return path.join(getMemoryDir(projectPath), USER_REVIEWS_STATE_FILE);
}

function getDailyEvidencePath(projectPath: string, date = new Date()): string {
  return path.join(
    getUserReviewsDir(projectPath),
    `${date.toISOString().slice(0, 10)}.jsonl`,
  );
}

function getUserPreferencesPath(projectPath: string): string {
  return path.join(getMemoryDir(projectPath), USER_PREFERENCES_FILE);
}

function getHistoryFileName(date: Date): string {
  return `${date.toISOString().replaceAll(':', '-').replaceAll('.', '-')}.json`;
}

function sha256(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function compactContext(
  context: Record<string, string | number | boolean | null | undefined> = {},
): Record<string, string | number | boolean | null> | undefined {
  const entries = Object.entries(context).filter(
    (entry): entry is [string, string | number | boolean | null] =>
      entry[1] !== undefined,
  );
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

async function resolveProject(params: {
  taskId?: string;
  projectId?: string;
}): Promise<{
  project: { id: string; name?: string | null; path: string };
  task?: {
    id: string;
    name?: string | null;
    prompt?: string;
    worktreePath?: string | null;
    branchName?: string | null;
    sourceBranch?: string | null;
  };
}> {
  if (params.taskId) {
    const task = await TaskRepository.findById(params.taskId);
    if (!task) throw new Error(`Task not found: ${params.taskId}`);

    const project = await ProjectRepository.findById(task.projectId);
    if (!project) throw new Error(`Project not found: ${task.projectId}`);
    return { project, task };
  }

  if (params.projectId) {
    const project = await ProjectRepository.findById(params.projectId);
    if (!project) throw new Error(`Project not found: ${params.projectId}`);
    return { project };
  }

  throw new Error('taskId or projectId is required');
}

async function buildFileSnapshot({
  comment,
  task,
}: {
  comment: PreferenceEvidenceCommentInput;
  task?: { worktreePath?: string | null };
}): Promise<PreferenceEvidenceFileSnapshot | undefined> {
  if (!comment.filePath) return undefined;
  if (comment.filePath.startsWith('__message__:')) return undefined;

  if (!task?.worktreePath) {
    return { filePath: comment.filePath, reason: 'missing-task-worktree' };
  }

  const worktreePath = path.resolve(task.worktreePath);
  const filePath = path.resolve(worktreePath, comment.filePath);
  if (
    filePath !== worktreePath &&
    !filePath.startsWith(worktreePath + path.sep)
  ) {
    return { filePath: comment.filePath, reason: 'outside-worktree' };
  }

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    const totalLines = lines.length;
    const lineStart = comment.lineStart ?? 1;
    const lineEnd = comment.lineEnd ?? lineStart;
    const startLine = Math.max(1, lineStart - FILE_SNAPSHOT_CONTEXT_LINES);
    const endLine = Math.min(totalLines, lineEnd + FILE_SNAPSHOT_CONTEXT_LINES);
    const excerpt = lines.slice(startLine - 1, endLine).join('\n');
    const charTruncated = excerpt.length > MAX_FILE_SNAPSHOT_CHARS;
    const lineTruncated = startLine > 1 || endLine < totalLines;
    return {
      filePath: comment.filePath,
      content: charTruncated
        ? excerpt.slice(0, MAX_FILE_SNAPSHOT_CHARS)
        : excerpt,
      startLine,
      endLine,
      totalLines,
      truncated: lineTruncated || charTruncated,
      bytes: Buffer.byteLength(content, 'utf-8'),
    };
  } catch {
    return { filePath: comment.filePath, reason: 'read-failed' };
  }
}

function buildMetadata({
  project,
  task,
}: {
  project: { name?: string | null; path: string };
  task?: {
    name?: string | null;
    prompt?: string;
    worktreePath?: string | null;
    branchName?: string | null;
    sourceBranch?: string | null;
  };
}): PreferenceEvidenceMetadata {
  const taskPrompt = task?.prompt
    ? task.prompt.slice(0, MAX_TASK_PROMPT_CHARS)
    : undefined;
  return {
    projectName: project.name,
    projectPath: project.path,
    taskName: task?.name,
    taskPrompt,
    worktreePath: task?.worktreePath,
    branchName: task?.branchName,
    sourceBranch: task?.sourceBranch,
  };
}

export async function recordPreferenceEvidence(
  params: RecordPreferenceEvidenceParams,
): Promise<RecordPreferenceEvidenceResult> {
  const setting = await SettingsRepository.get('preferenceMemory');
  if (!setting.enabled) {
    return { path: '', recorded: 0 };
  }

  if (params.comments.length === 0) {
    throw new Error('At least one comment is required');
  }

  const { project, task } = await resolveProject(params);
  const reviewsDir = getUserReviewsDir(project.path);
  const evidencePath = getDailyEvidencePath(project.path);
  const createdAt = new Date().toISOString();
  const context = compactContext(params.context);
  const metadata = buildMetadata({ project, task });

  const records: PreferenceEvidenceRecord[] = await Promise.all(
    params.comments.map(async (comment) => {
      const fileSnapshot = await buildFileSnapshot({ comment, task });
      return {
        id: crypto.randomUUID(),
        createdAt,
        source: params.source,
        taskId: params.taskId,
        projectId: project.id,
        comment,
        ...(fileSnapshot ? { fileSnapshot } : {}),
        metadata,
        ...(context ? { context } : {}),
      };
    }),
  );

  await fs.mkdir(reviewsDir, { recursive: true });
  await fs.appendFile(
    evidencePath,
    records.map((record) => JSON.stringify(record)).join('\n') + '\n',
    'utf-8',
  );

  return { path: evidencePath, recorded: records.length };
}

async function readPreferenceMemoryState(
  projectPath: string,
): Promise<PreferenceMemoryState> {
  try {
    const raw = await fs.readFile(
      getUserReviewsStatePath(projectPath),
      'utf-8',
    );
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { files: {} };
    const obj = parsed as Record<string, unknown>;
    const files = obj.files;
    if (!files || typeof files !== 'object') return { files: {} };
    return {
      files: Object.fromEntries(
        Object.entries(files as Record<string, unknown>).flatMap(
          ([fileName, value]) => {
            if (!value || typeof value !== 'object') return [];
            const fileState = value as Record<string, unknown>;
            if (typeof fileState.offset !== 'number') return [];
            return [
              [
                fileName,
                {
                  offset: Math.max(0, fileState.offset),
                  ...(typeof fileState.processedAt === 'string'
                    ? { processedAt: fileState.processedAt }
                    : {}),
                },
              ],
            ];
          },
        ),
      ),
      ...(typeof obj.lastConsolidatedAt === 'string'
        ? { lastConsolidatedAt: obj.lastConsolidatedAt }
        : {}),
    };
  } catch {
    return { files: {} };
  }
}

async function writePreferenceMemoryState({
  projectPath,
  state,
}: {
  projectPath: string;
  state: PreferenceMemoryState;
}): Promise<void> {
  await fs.mkdir(getMemoryDir(projectPath), { recursive: true });
  await fs.writeFile(
    getUserReviewsStatePath(projectPath),
    `${JSON.stringify(state, null, 2)}\n`,
    'utf-8',
  );
}

async function collectUnprocessedEvidence(projectPath: string): Promise<{
  evidence: string;
  nextState: PreferenceMemoryState;
  processedFiles: ProcessedEvidenceRange[];
}> {
  const state = await readPreferenceMemoryState(projectPath);
  let fileNames: string[] = [];
  try {
    fileNames = (await fs.readdir(getUserReviewsDir(projectPath)))
      .filter((fileName) => fileName.endsWith('.jsonl'))
      .sort();
  } catch {
    return { evidence: '', nextState: state, processedFiles: [] };
  }

  let evidence = '';
  const processedFiles: ProcessedEvidenceRange[] = [];
  const nextState: PreferenceMemoryState = {
    files: { ...state.files },
    lastConsolidatedAt: new Date().toISOString(),
  };

  for (const fileName of fileNames) {
    if (evidence.length >= MAX_CONSOLIDATION_EVIDENCE_CHARS) break;
    const evidencePath = path.join(getUserReviewsDir(projectPath), fileName);
    const stats = await fs.stat(evidencePath);
    const offset = Math.min(state.files[fileName]?.offset ?? 0, stats.size);
    if (offset >= stats.size) continue;
    const handle = await fs.open(evidencePath, 'r');
    try {
      const remaining = stats.size - offset;
      const maxBytes = Math.min(
        remaining,
        MAX_CONSOLIDATION_EVIDENCE_CHARS - evidence.length,
      );
      const buffer = Buffer.alloc(maxBytes);
      const { bytesRead } = await handle.read(buffer, 0, maxBytes, offset);
      if (bytesRead === 0) continue;

      const readBuffer = buffer.subarray(0, bytesRead);
      const lastNewlineIndex = readBuffer.lastIndexOf(10);
      if (lastNewlineIndex === -1) break;

      const processBytes = lastNewlineIndex + 1;
      const chunk = readBuffer.subarray(0, processBytes).toString('utf-8');
      evidence += `\n\n# ${fileName} from byte ${offset}\n`;
      evidence += chunk;
      nextState.files[fileName] = {
        offset: offset + processBytes,
        processedAt: nextState.lastConsolidatedAt,
      };
      processedFiles.push({
        fileName,
        fromOffset: offset,
        toOffset: offset + processBytes,
        recordCount: chunk.split('\n').filter((line) => line.trim()).length,
      });
    } finally {
      await handle.close();
    }
  }

  return { evidence: evidence.trim(), nextState, processedFiles };
}

async function writePreferenceHistoryEntry({
  project,
  config,
  processedFiles,
  createdAt,
}: {
  project: { id: string; name?: string | null; path: string };
  config: {
    backend: AgentBackendType;
    model: ModelPreference;
    thinkingEffort: ThinkingEffort;
  };
  processedFiles: ProcessedEvidenceRange[];
  createdAt: string;
}): Promise<void> {
  const preferencesPath = getUserPreferencesPath(project.path);
  let document = '';
  try {
    document = await fs.readFile(preferencesPath, 'utf-8');
  } catch {
    document = '';
  }

  const historyDir = getUserPreferencesHistoryDir(project.path);
  await fs.mkdir(historyDir, { recursive: true });
  await fs.writeFile(
    path.join(historyDir, getHistoryFileName(new Date(createdAt))),
    `${JSON.stringify(
      {
        id: crypto.randomUUID(),
        createdAt,
        projectId: project.id,
        projectName: project.name ?? null,
        backend: config.backend,
        model: config.model,
        thinkingEffort: config.thinkingEffort,
        evidence: { files: processedFiles },
        document: {
          path: path.relative(project.path, preferencesPath),
          sha256: sha256(document),
          content: document,
        },
      },
      null,
      2,
    )}\n`,
    'utf-8',
  );
}

export async function consolidatePreferenceMemoryForProject(
  project: {
    id: string;
    name?: string | null;
    path: string;
  },
  config?: {
    backend?: AgentBackendType;
    model?: ModelPreference;
    thinkingEffort?: ThinkingEffort;
  },
): Promise<{ processed: boolean }> {
  const { evidence, nextState, processedFiles } =
    await collectUnprocessedEvidence(project.path);
  if (!evidence) return { processed: false };

  const resolvedConfig = {
    backend: config?.backend ?? DEFAULT_PREFERENCE_MEMORY_CONSOLIDATION_BACKEND,
    model: config?.model ?? DEFAULT_PREFERENCE_MEMORY_CONSOLIDATION_MODEL,
    thinkingEffort:
      config?.thinkingEffort ??
      DEFAULT_PREFERENCE_MEMORY_CONSOLIDATION_THINKING_EFFORT,
  };

  const preferencesPath = getUserPreferencesPath(project.path);
  const startedAtMs = Date.now();
  const statePath = getUserReviewsStatePath(project.path);
  const prompt = `Consolidate new review evidence into durable user preferences for this repository.

Project: ${project.name ?? project.id}
Memory file: ${path.relative(project.path, preferencesPath)}
Evidence state file managed by Jean-Claude: ${path.relative(project.path, statePath)}

Requirements:
- Read existing memory if present.
- Update ${path.relative(project.path, preferencesPath)} with concise, evidence-backed coding preferences.
- Use only reusable preferences. Put weak or ambiguous signals under Needs confirmation.
- Do not delete prior useful preferences unless contradicted by stronger evidence.
- Write ${path.relative(project.path, preferencesPath)} after reviewing the evidence, even if you decide no new preference should be added.
- Evidence below is already selected as unprocessed; Jean-Claude will update byte offsets after this run succeeds.

New evidence:
${evidence}`;

  const result = await generateText({
    backend: resolvedConfig.backend,
    model: resolvedConfig.model,
    thinkingEffort: resolvedConfig.thinkingEffort,
    skillName: 'user-preference-memory',
    cwd: project.path,
    allowedTools: ['Read', 'Write', 'Edit'],
    allowedToolPatterns: {
      Read: ['.jean-claude/memory/**'],
      Write: ['.jean-claude/memory/**'],
      Edit: ['.jean-claude/memory/**'],
    },
    timeoutMs: CONSOLIDATION_TIMEOUT_MS,
    allowRateLimitSwap: false,
    prompt,
    usageContext: {
      feature: 'skill',
      projectId: project.id,
      taskId: null,
      stepId: null,
    },
  });

  if (result === null) return { processed: false };

  const preferencesStats = await fs.stat(preferencesPath).catch(() => null);
  if (!preferencesStats || preferencesStats.mtimeMs < startedAtMs) {
    dbg.agent(
      'Preference memory consolidation did not update %s; leaving evidence unprocessed',
      preferencesPath,
    );
    return { processed: false };
  }

  await writePreferenceHistoryEntry({
    project,
    config: resolvedConfig,
    processedFiles,
    createdAt: nextState.lastConsolidatedAt ?? new Date().toISOString(),
  });

  await writePreferenceMemoryState({
    projectPath: project.path,
    state: nextState,
  });
  return { processed: true };
}

class PreferenceMemoryConsolidationService {
  private interval: ReturnType<typeof setInterval> | null = null;
  private running = false;

  start() {
    if (this.interval) return;
    this.interval = setInterval(() => {
      this.runDueConsolidations().catch((error) => {
        dbg.agent('Preference memory consolidation failed: %O', error);
      });
    }, CONSOLIDATION_POLL_INTERVAL_MS);
    void this.runDueConsolidations();
  }

  stop() {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
  }

  async runDueConsolidations(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const setting = await SettingsRepository.get('preferenceMemory');
      if (!setting.enabled || !setting.consolidationEnabled) return;

      const now = Date.now();
      const intervalMs =
        Math.max(15, setting.consolidationIntervalMinutes) * 60_000;
      const projects = await ProjectRepository.findAll();
      for (const project of projects) {
        const state = await readPreferenceMemoryState(project.path);
        const lastRun = state.lastConsolidatedAt
          ? new Date(state.lastConsolidatedAt).getTime()
          : 0;
        if (Number.isFinite(lastRun) && now - lastRun < intervalMs) continue;
        await consolidatePreferenceMemoryForProject(project, {
          backend: setting.consolidationBackend,
          model: setting.consolidationModel,
          thinkingEffort: setting.consolidationThinkingEffort,
        });
      }
    } finally {
      this.running = false;
    }
  }
}

export const preferenceMemoryConsolidationService =
  new PreferenceMemoryConsolidationService();

export { DEFAULT_CONSOLIDATION_INTERVAL_MINUTES };
