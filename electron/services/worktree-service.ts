import * as fs from 'fs/promises';
import * as path from 'path';
import { exec, execFile, type ExecOptions, spawn } from 'child_process';
import { promisify } from 'util';


import { app } from 'electron';
import ignore from 'ignore';
import { nanoid } from 'nanoid';



import { getImageMimeType, isSvgPath } from '@shared/image-types';
import type { BranchInfo } from '@shared/types';
import type { WorktreeFileCopyEntry } from '@shared/permission-types';



import { isEnoent, pathExists } from '../lib/fs';
import { dbg } from '../lib/debug';
import { ProjectRepository } from '../database/repositories/projects';



import {
  buildWorktreeSettings,
  readSettings,
} from './permission-settings-service';
import { formatCreateWorktreeError } from './utils-worktree-errors';
import { installMcpForWorktree } from './mcp-template-service';


const execAsync = promisify(exec) as (
  command: string,
  options?: ExecOptions,
) => Promise<{ stdout: string; stderr: string }>;

const execFileAsync = promisify(execFile);

const COMMIT_IGNORE_RELATIVE_PATH = path.join('.jean-claude', 'ignore');

function getCommitIgnorePath(projectPath: string): string {
  return path.join(projectPath, COMMIT_IGNORE_RELATIVE_PATH);
}

export async function getProjectCommitIgnore(
  projectPath: string,
): Promise<string> {
  const ignorePath = getCommitIgnorePath(projectPath);
  try {
    return await fs.readFile(ignorePath, 'utf-8');
  } catch (error) {
    if (isEnoent(error)) return '';
    throw error;
  }
}

export async function updateProjectCommitIgnore({
  projectPath,
  content,
}: {
  projectPath: string;
  content: string;
}): Promise<void> {
  const ignorePath = getCommitIgnorePath(projectPath);
  await fs.mkdir(path.dirname(ignorePath), { recursive: true });
  await fs.writeFile(ignorePath, content, 'utf-8');
}

async function getIgnoredCommitPaths({
  worktreePath,
  projectPath,
}: {
  worktreePath: string;
  projectPath?: string;
}): Promise<{ ignoredPaths: Set<string>; ignoredStagedPaths: Set<string> }> {
  if (!projectPath) {
    return { ignoredPaths: new Set(), ignoredStagedPaths: new Set() };
  }

  const ignoreContent = await getProjectCommitIgnore(projectPath);
  if (!ignoreContent.trim()) {
    return { ignoredPaths: new Set(), ignoredStagedPaths: new Set() };
  }

  const matcher = ignore().add(ignoreContent);
  const { stdout } = await execFileAsync(
    'git',
    ['status', '--porcelain', '-z', '--untracked-files=all'],
    { cwd: worktreePath, encoding: 'utf-8' },
  );
  const entries = stdout.split('\0').filter(Boolean);
  const ignoredPaths = new Set<string>();
  const ignoredStagedPaths = new Set<string>();

  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    const status = entry.slice(0, 2);
    const filePath = entry.slice(3);
    const sourcePath =
      status[0] === 'R' || status[0] === 'C' ? entries[i + 1] : undefined;
    const isIgnored =
      matcher.ignores(filePath) ||
      (status[0] === 'R' &&
        sourcePath !== undefined &&
        matcher.ignores(sourcePath));
    if (isIgnored) {
      ignoredPaths.add(filePath);
      if (status[0] !== ' ' && status[0] !== '?') {
        ignoredStagedPaths.add(filePath);
      }
    }
    if (sourcePath !== undefined) i += 1;
  }

  return { ignoredPaths, ignoredStagedPaths };
}

async function getStatusPaths(worktreePath: string): Promise<string[]> {
  const { stdout } = await execFileAsync(
    'git',
    ['status', '--porcelain', '-z', '--untracked-files=all'],
    { cwd: worktreePath, encoding: 'utf-8' },
  );
  const entries = stdout.split('\0').filter(Boolean);
  const paths: string[] = [];

  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    const status = entry.slice(0, 2);
    paths.push(entry.slice(3));
    if (status[0] === 'R' || status[0] === 'C') i += 1;
  }

  return paths;
}

async function runGitPathCommand({
  worktreePath,
  args,
  paths,
}: {
  worktreePath: string;
  args: string[];
  paths: string[];
}): Promise<void> {
  for (let i = 0; i < paths.length; i += 100) {
    await execFileAsync('git', [...args, '--', ...paths.slice(i, i + 100)], {
      cwd: worktreePath,
      encoding: 'utf-8',
    });
  }
}

async function hasStagedChanges(worktreePath: string): Promise<boolean> {
  try {
    await execFileAsync('git', ['diff', '--cached', '--quiet', '--exit-code'], {
      cwd: worktreePath,
      encoding: 'utf-8',
    });
    return false;
  } catch (error) {
    const code = (error as { code?: number }).code;
    if (code === 1) return true;
    throw error;
  }
}

async function gitCommit({
  cwd,
  message,
  noVerify = false,
}: {
  cwd: string;
  message: string;
  noVerify?: boolean;
}): Promise<void> {
  await execFileAsync(
    'git',
    ['commit', ...(noVerify ? ['--no-verify'] : []), '-m', message],
    {
      cwd,
      encoding: 'utf-8',
    },
  );
}

/**
 * Escapes a string for safe use in shell commands within double quotes.
 * Handles characters that have special meaning in bash: $ ` \ " !
 */
function escapeForShell(str: string): string {
  return str.replace(/[$`\\!"]/g, '\\$&');
}

/**
 * Checks if a file is binary by looking for null bytes in the first 8KB.
 */
async function isBinaryFile(filePath: string): Promise<boolean> {
  const handle = await fs.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(8192);
    const { bytesRead } = await handle.read(buffer, 0, 8192, 0);
    return buffer.subarray(0, bytesRead).includes(0);
  } finally {
    await handle.close();
  }
}

/**
 * Normalizes a name to kebab-case, removing special characters.
 * Used for creating safe directory names from project names or prompts.
 */
export function normalizeName(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-') // replace non-alphanumeric with dashes
      .replace(/^-+|-+$/g, '') // trim leading/trailing dashes
      .slice(0, 50) || 'unnamed' // reasonable max length with fallback
  );
}

/**
 * Generates a worktree directory name from a prompt.
 * Takes first ~3-4 meaningful words, kebab-cases them, and adds a short unique suffix.
 */
export function generateWorktreeName(prompt: string): string {
  const words = prompt
    .split(/\s+/)
    .filter((word) => word.length > 2) // skip short words like "a", "to", etc.
    .slice(0, 4)
    .join(' ');

  const normalized = normalizeName(words);
  const suffix = nanoid(4);

  return `${normalized}-${suffix}`;
}

/**
 * Gets the base worktrees directory for Jean-Claude: ~/.jean-claude/worktrees/
 */
function getWorktreesBaseDir(): string {
  const homeDir = app.getPath('home');
  return path.join(homeDir, '.jean-claude', 'worktrees');
}

/**
 * Gets or creates the worktrees path for a project.
 * Uses the project's stored worktreesPath if available, otherwise creates a new one.
 */
export async function getOrCreateProjectWorktreesPath(
  projectId: string,
  projectName: string,
): Promise<string> {
  const project = await ProjectRepository.findById(projectId);
  if (!project) {
    throw new Error(`Project ${projectId} not found`);
  }

  // If project already has a worktrees path, use it
  if (project.worktreesPath) {
    // Ensure the directory exists
    await fs.mkdir(project.worktreesPath, { recursive: true });
    return project.worktreesPath;
  }

  // Create a new worktrees path for this project
  const baseDir = getWorktreesBaseDir();
  const normalizedName = normalizeName(projectName);
  let worktreesPath = path.join(baseDir, normalizedName);

  // Handle collisions by checking for .project-id file
  let suffix = 1;
  while (await pathExists(worktreesPath)) {
    const projectIdFile = path.join(worktreesPath, '.project-id');
    if (await pathExists(projectIdFile)) {
      const existingId = (await fs.readFile(projectIdFile, 'utf-8')).trim();
      if (existingId === projectId) {
        // This is our directory, reuse it
        break;
      }
    }
    // Collision with different project, try next suffix
    suffix++;
    worktreesPath = path.join(baseDir, `${normalizedName}-${suffix}`);
  }

  // Create the directory and mark it with project ID
  await fs.mkdir(worktreesPath, { recursive: true });
  await fs.writeFile(path.join(worktreesPath, '.project-id'), projectId);

  // Save the worktrees path to the project
  await ProjectRepository.update(projectId, {
    worktreesPath,
    updatedAt: new Date().toISOString(),
  });

  return worktreesPath;
}

/**
 * Deletes the worktrees folder for a project and clears the stored path.
 */
export async function deleteProjectWorktreesFolder(
  projectId: string,
): Promise<void> {
  const project = await ProjectRepository.findById(projectId);
  if (!project) {
    throw new Error(`Project ${projectId} not found`);
  }

  if (project.worktreesPath && (await pathExists(project.worktreesPath))) {
    // Validate the path is under the expected worktrees base directory to
    // prevent accidental recursive deletion of arbitrary directories.
    const resolvedPath = await fs.realpath(project.worktreesPath);
    const expectedBase = getWorktreesBaseDir();
    if (
      !resolvedPath.startsWith(expectedBase + path.sep) &&
      resolvedPath !== expectedBase
    ) {
      throw new Error(
        `Refusing to delete worktrees path "${project.worktreesPath}" — it is not under the expected base directory "${expectedBase}"`,
      );
    }
    await fs.rm(project.worktreesPath, { recursive: true, force: true });
  }

  await ProjectRepository.update(projectId, {
    worktreesPath: null,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Gets the current HEAD commit hash for a git repository.
 */
export async function getCurrentCommitHash(repoPath: string): Promise<string> {
  try {
    const { stdout } = await execAsync('git rev-parse HEAD', {
      cwd: repoPath,
      encoding: 'utf-8',
    });
    return stdout.trim();
  } catch (error) {
    throw new Error(`Failed to get current commit hash: ${error}`);
  }
}

/**
 * Gets the current branch name for a git repository.
 */
export async function getCurrentBranchName(repoPath: string): Promise<string> {
  try {
    const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD', {
      cwd: repoPath,
      encoding: 'utf-8',
    });
    return stdout.trim();
  } catch (error) {
    throw new Error(`Failed to get current branch name: ${error}`);
  }
}

/**
 * Checks if a path is a git repository.
 */
export async function isGitRepository(repoPath: string): Promise<boolean> {
  try {
    await execAsync('git rev-parse --git-dir', {
      cwd: repoPath,
      encoding: 'utf-8',
    });
    return true;
  } catch {
    return false;
  }
}

export interface CreateWorktreeResult {
  worktreePath: string;
  startCommitHash: string;
  branchName: string;
  sourceBranch: string;
}

/**
 * Generates a worktree directory name from a task name.
 * Normalizes the name and adds a short unique suffix.
 */
export function generateWorktreeNameFromTaskName(taskName: string): string {
  const normalized = normalizeName(taskName);
  const suffix = nanoid(4);

  return `${normalized}-${suffix}`;
}

/**
 * Creates a git worktree for a task.
 *
 * @param projectPath - The path to the main git repository
 * @param projectId - The project ID
 * @param projectName - The project name (for directory naming)
 * @param prompt - The task prompt (fallback for worktree naming if taskName not provided)
 * @param taskName - Optional task name to use for worktree naming (preferred over prompt)
 * @returns The path to the created worktree and the starting commit hash
 */
export interface WorktreeDiffFile {
  path: string;
  status: 'added' | 'modified' | 'deleted';
  additions: number;
  deletions: number;
}

export interface WorktreeDiffResult {
  files: WorktreeDiffFile[];
  worktreeDeleted?: boolean;
}

export interface WorktreeFileContent {
  oldContent: string | null;
  newContent: string | null;
  isBinary: boolean;
  oldImageDataUrl?: string | null;
  newImageDataUrl?: string | null;
}

/**
 * Gets the commit hash to use as the diff base.
 * If sourceBranch is provided, uses the merge-base between HEAD and the source branch.
 * This ensures we only see changes unique to this branch, even after merging
 * the source branch to resolve conflicts or stay up-to-date.
 * Falls back to startCommitHash if sourceBranch is not available or merge-base fails.
 *
 * @param worktreePath - The path to the worktree
 * @param startCommitHash - The fallback commit hash
 * @param sourceBranch - The source branch to compute merge-base against
 * @returns The commit hash to use for diffing
 */
async function getDiffBaseCommit(
  worktreePath: string,
  startCommitHash: string,
  sourceBranch: string | null,
): Promise<string> {
  if (!sourceBranch) {
    dbg.worktree('No sourceBranch, using startCommitHash: %s', startCommitHash);
    return startCommitHash;
  }

  const refs = sourceBranch.startsWith('origin/')
    ? [sourceBranch]
    : [sourceBranch, `origin/${sourceBranch}`];

  for (const ref of refs) {
    try {
      const mergeBase = await execFileAsync(
        'git',
        ['merge-base', 'HEAD', ref],
        {
          cwd: worktreePath,
          encoding: 'utf-8',
        },
      );
      const base = mergeBase.stdout.trim();
      dbg.worktree('Using merge-base with %s: %s', ref, base);
      return base;
    } catch {
      continue;
    }
  }

  // Fall back to startCommitHash if merge-base fails
  dbg.worktree(
    'merge-base failed, falling back to startCommitHash: %s',
    startCommitHash,
  );
  return startCommitHash;
}

/**
 * Gets the set of files in the working tree that differ from the source branch.
 * Files NOT in this set have content identical to the source branch — they are
 * merge artifacts (staged/unstaged changes from merging the source branch) and
 * should be excluded from the task diff.
 *
 * Returns null if source branch is unavailable (no filtering should be applied).
 */
async function getTaskChangedFiles(
  worktreePath: string,
  sourceBranch: string | null,
): Promise<Set<string> | null> {
  if (!sourceBranch) return null;

  // Prefer the local source branch because it may have unpushed commits that
  // were present when the worktree was created.
  const refs = sourceBranch.startsWith('origin/')
    ? [sourceBranch]
    : [sourceBranch, `origin/${sourceBranch}`];

  for (const ref of refs) {
    try {
      const { stdout } = await execFileAsync(
        'git',
        ['diff', '--name-only', ref],
        {
          cwd: worktreePath,
          encoding: 'utf-8',
          maxBuffer: 10 * 1024 * 1024,
        },
      );
      const files = new Set(
        stdout
          .trim()
          .split('\n')
          .filter((f) => f),
      );
      dbg.worktree('Task-changed files (vs %s): %d files', ref, files.size);
      return files;
    } catch {
      continue;
    }
  }

  dbg.worktree('Could not resolve source branch for filtering, skipping');
  return null;
}

/**
 * Gets the list of changed files between a worktree's current state and its divergence point
 * from the source branch. Does not load file contents - use getWorktreeFileContent for that.
 *
 * This shows only changes unique to this branch by using git merge-base to find where
 * the branch diverged from the source. This means changes merged in from the source
 * branch (e.g., to resolve conflicts) won't appear in the diff.
 *
 * This includes:
 * - Committed changes since diverging from source branch
 * - Staged but uncommitted changes
 * - Unstaged changes in tracked files
 * - Untracked files (new files not yet added to git)
 *
 * @param worktreePath - The path to the worktree
 * @param startCommitHash - Fallback commit hash (used if sourceBranch unavailable)
 * @param sourceBranch - The source branch to compute diff against (optional)
 * @returns The list of changed files with their status
 */
export async function getWorktreeDiff(
  worktreePath: string,
  startCommitHash: string,
  sourceBranch?: string | null,
): Promise<WorktreeDiffResult> {
  dbg.worktree('getWorktreeDiff called %o', {
    worktreePath,
    startCommitHash,
    sourceBranch,
  });

  // Check if the worktree still exists
  if (!(await pathExists(worktreePath))) {
    dbg.worktree('Worktree path does not exist, returning deleted');
    return { files: [], worktreeDeleted: true };
  }

  try {
    const [baseCommit, taskChangedFiles] = await Promise.all([
      getDiffBaseCommit(worktreePath, startCommitHash, sourceBranch ?? null),
      // Files whose content matches the source branch are merge artifacts
      // (from merging source into this branch) and should be excluded.
      getTaskChangedFiles(worktreePath, sourceBranch ?? null),
    ]);

    // We need to combine two sources to get all changes:
    // 1. git diff --name-status <commit> - changes from baseCommit to working tree
    // 2. git status --porcelain - shows untracked files that git diff doesn't see
    // Then filter to only include files with actual task changes (not merge artifacts)

    const [diffResult, numstatResult, statusResult] = await Promise.all([
      execAsync(`git diff --name-status ${baseCommit}`, {
        cwd: worktreePath,
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large diffs
      }),
      execAsync(`git diff --numstat ${baseCommit}`, {
        cwd: worktreePath,
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024,
      }),
      // Use --untracked-files=all to list individual files in new directories
      // (default mode shows new directories as "folder/" which can't be diffed)
      execAsync('git status --porcelain --untracked-files=all', {
        cwd: worktreePath,
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024,
      }),
    ]);
    const diffOutput = diffResult.stdout;
    dbg.worktree('git diff output length: %d', diffOutput.length);

    const numstatOutput = numstatResult.stdout;

    const numstatMap = new Map<
      string,
      { additions: number; deletions: number }
    >();
    for (const line of numstatOutput.split('\n')) {
      if (!line.trim()) continue;
      const [adds, dels, ...pathParts] = line.split('\t');
      const filePath = pathParts.join('\t'); // handle paths with tabs
      numstatMap.set(filePath, {
        additions: adds === '-' ? 0 : parseInt(adds, 10),
        deletions: dels === '-' ? 0 : parseInt(dels, 10),
      });
    }

    // Also get untracked files which git diff doesn't show.
    const statusOutput = statusResult.stdout;
    dbg.worktree('git status output length: %d', statusOutput.length);

    const filesMap = new Map<string, WorktreeDiffFile>();

    // Parse git diff output
    const trimmedDiff = diffOutput.trim();
    if (trimmedDiff) {
      for (const line of trimmedDiff.split('\n')) {
        if (!line) continue;

        // Format: "M\tpath/to/file" or "A\tpath" or "D\tpath"
        // Also handles renames: "R100\told\tnew"
        const parts = line.split('\t');
        const statusCode = parts[0];
        // For renames (R) and copies (C), the new path is the last element
        const filePath =
          statusCode.startsWith('R') || statusCode.startsWith('C')
            ? parts[parts.length - 1]
            : parts.slice(1).join('\t');

        let status: 'added' | 'modified' | 'deleted';
        if (statusCode.startsWith('A')) {
          status = 'added';
        } else if (statusCode.startsWith('D')) {
          status = 'deleted';
        } else if (statusCode.startsWith('R') || statusCode.startsWith('C')) {
          // Renames and copies show as added (the new file)
          status = 'added';
        } else {
          status = 'modified';
        }

        // Skip files whose content matches the source branch (merge artifacts)
        if (taskChangedFiles && !taskChangedFiles.has(filePath)) {
          dbg.worktree('Skipping merge artifact: %s', filePath);
          continue;
        }

        const stats = numstatMap.get(filePath) ?? {
          additions: 0,
          deletions: 0,
        };
        filesMap.set(filePath, {
          path: filePath,
          status,
          additions: stats.additions,
          deletions: stats.deletions,
        });
        dbg.worktree('From git diff: %o', { filePath, status });
      }
    }

    // Parse git status output for untracked files
    const trimmedStatus = statusOutput.trim();
    if (trimmedStatus) {
      for (const line of trimmedStatus.split('\n')) {
        if (!line) continue;

        // Format: "XY filename" where X is staged status, Y is working tree status
        // "??" means untracked, "A " means staged new file, " M" means modified, etc.
        const statusCodes = line.substring(0, 2);
        const filePath = line.substring(3);

        // Only add untracked files (??) that we haven't already captured
        // Other statuses should already be in the diff output
        // Skip directory entries (paths ending with '/') - git status shows untracked
        // directories this way, but we can only diff individual files
        if (
          statusCodes === '??' &&
          !filePath.endsWith('/') &&
          !filesMap.has(filePath)
        ) {
          filesMap.set(filePath, {
            path: filePath,
            status: 'added',
            additions: 0,
            deletions: 0,
          });
          dbg.worktree('From git status (untracked): %o', {
            filePath,
            status: filesMap.get(filePath)?.status,
          });
        }
      }
    }

    const files = Array.from(filesMap.values());
    dbg.worktree('Total files found: %d', files.length);

    return { files };
  } catch (error) {
    dbg.worktree('Error getting diff: %O', error);
    // If we get ENOENT, the worktree was likely deleted between our check and the git command
    if (isEnoent(error)) {
      return { files: [], worktreeDeleted: true };
    }
    throw error;
  }
}

/**
 * Gets the content of a specific file for diff viewing.
 * Loads the old content from the diff base and new content from the working tree.
 *
 * Uses the same merge-base logic as getWorktreeDiff to ensure consistency:
 * if sourceBranch is provided, the "old" content comes from the merge-base,
 * otherwise falls back to startCommitHash.
 *
 * @param worktreePath - The path to the worktree
 * @param startCommitHash - Fallback commit hash (used if sourceBranch unavailable)
 * @param filePath - The relative path of the file within the worktree
 * @param status - The file status (added/modified/deleted)
 * @param sourceBranch - The source branch to compute diff against (optional)
 * @returns The old and new content of the file
 */
export async function getWorktreeFileContent(
  worktreePath: string,
  startCommitHash: string,
  filePath: string,
  status: 'added' | 'modified' | 'deleted',
  sourceBranch?: string | null,
): Promise<WorktreeFileContent> {
  dbg.worktree('getWorktreeFileContent called %o', {
    worktreePath,
    startCommitHash,
    filePath,
    status,
    sourceBranch,
  });

  // Get the appropriate base commit for diffing
  const baseCommit = await getDiffBaseCommit(
    worktreePath,
    startCommitHash,
    sourceBranch ?? null,
  );

  let oldContent: string | null = null;
  let newContent: string | null = null;
  let isBinary = false;
  let oldImageDataUrl: string | null = null;
  let newImageDataUrl: string | null = null;

  const mimeType = getImageMimeType(filePath);
  const isSvg = isSvgPath(filePath);

  // Get old content from the base commit (unless file was added)
  if (status !== 'added') {
    try {
      if (mimeType && !isSvg) {
        // Read old image as base64 from git
        const { stdout } = await execAsync(
          `git show ${baseCommit}:"${escapeForShell(filePath)}" | base64`,
          {
            cwd: worktreePath,
            encoding: 'utf-8',
            maxBuffer: 15 * 1024 * 1024,
          },
        );
        const base64 = stdout.replace(/\s/g, '');
        oldImageDataUrl = `data:${mimeType};base64,${base64}`;
        dbg.worktree(
          'Got old image data URL, base64 length: %d',
          base64.length,
        );
      } else {
        const { stdout } = await execAsync(
          `git show ${baseCommit}:"${escapeForShell(filePath)}"`,
          {
            cwd: worktreePath,
            encoding: 'utf-8',
            maxBuffer: 5 * 1024 * 1024,
          },
        );
        oldContent = stdout;
        dbg.worktree('Got old content, length: %d', stdout.length);
      }
    } catch (error) {
      // File might be binary or inaccessible
      dbg.worktree('Failed to get old content: %O', error);
      oldContent = null;
    }
  } else {
    dbg.worktree('File is added, no old content to fetch');
  }

  // Get new content from the working tree (unless file was deleted)
  if (status !== 'deleted') {
    const fullPath = path.join(worktreePath, filePath);
    try {
      if (mimeType && !isSvg) {
        // Read new image as base64 from disk
        const buffer = await fs.readFile(fullPath);
        const base64 = buffer.toString('base64');
        newImageDataUrl = `data:${mimeType};base64,${base64}`;
        isBinary = true;
        dbg.worktree(
          'Got new image data URL, base64 length: %d',
          base64.length,
        );
      } else if (await isBinaryFile(fullPath)) {
        dbg.worktree('File is binary');
        isBinary = true;
        newContent = null;
      } else {
        newContent = await fs.readFile(fullPath, 'utf-8');
        dbg.worktree('Got new content, length: %d', newContent.length);
      }
    } catch (error) {
      dbg.worktree('Failed to get new content: %O', error);
      newContent = null;
    }
  } else {
    dbg.worktree('File is deleted, no new content to fetch');
  }

  // Mark as binary for images
  if (mimeType && !isSvg) {
    isBinary = true;
  }

  // Also check if old content indicates binary (null bytes would have caused git show to fail)
  if (
    oldContent === null &&
    newContent === null &&
    status === 'modified' &&
    !mimeType
  ) {
    dbg.worktree('Both contents null for modified file, marking as binary');
    isBinary = true;
  }

  dbg.worktree('Returning: %o', {
    hasOldContent: oldContent !== null,
    hasNewContent: newContent !== null,
    isBinary,
    hasOldImage: oldImageDataUrl !== null,
    hasNewImage: newImageDataUrl !== null,
  });

  return { oldContent, newContent, isBinary, oldImageDataUrl, newImageDataUrl };
}

/**
 * Copies files from the project root to the worktree based on the
 * `worktree.create.copy` config in `.jean-claude/settings.local.json`.
 *
 * Each entry is either a string (same relative path) or a [source, dest] tuple.
 * Missing source files are silently skipped.
 */
async function copyWorktreeFiles(
  projectPath: string,
  worktreePath: string,
  entries: WorktreeFileCopyEntry[],
): Promise<void> {
  for (const entry of entries) {
    const [src, dest] = Array.isArray(entry) ? entry : [entry, entry];
    const srcPath = path.join(projectPath, src);
    const destPath = path.join(worktreePath, dest);

    try {
      // Ensure destination directory exists
      await fs.mkdir(path.dirname(destPath), { recursive: true });
      await fs.copyFile(srcPath, destPath);
      dbg.worktree('Copied file: %s → %s', src, dest);
    } catch (error) {
      if (isEnoent(error)) {
        dbg.worktree('Skipping missing file: %s', src);
      } else {
        dbg.worktree('Failed to copy file %s: %O', src, error);
      }
    }
  }
}

/**
 * Creates a git worktree for a task.
 *
 * @param projectPath - The path to the main git repository
 * @param projectId - The project ID
 * @param projectName - The project name (for directory naming)
 * @param prompt - The task prompt (fallback for worktree naming if taskName not provided)
 * @param taskName - Optional task name to use for worktree naming (preferred over prompt)
 * @param sourceBranch - Optional branch to base the worktree on (defaults to current HEAD)
 * @param startPoint - Optional git ref to create the worktree from while preserving sourceBranch metadata
 * @returns The path to the created worktree and the starting commit hash
 */
export async function createWorktree(
  projectPath: string,
  projectId: string,
  projectName: string,
  prompt: string,
  taskName?: string,
  sourceBranch?: string,
  startPoint?: string,
): Promise<CreateWorktreeResult> {
  dbg.worktree('createWorktree called %o', {
    projectPath,
    projectId,
    taskName,
    sourceBranch,
    startPoint,
  });

  // Verify this is a git repository
  if (!(await isGitRepository(projectPath))) {
    throw new Error(`Project path is not a git repository: ${projectPath}`);
  }

  // Get or create the project's worktrees directory
  const projectWorktreesPath = await getOrCreateProjectWorktreesPath(
    projectId,
    projectName,
  );
  dbg.worktree('Using worktrees directory: %s', projectWorktreesPath);

  // Generate worktree name from task name (preferred) or prompt (fallback)
  const worktreeName = taskName
    ? generateWorktreeNameFromTaskName(taskName)
    : generateWorktreeName(prompt);
  const worktreePath = path.join(projectWorktreesPath, worktreeName);

  // Determine the actual source branch (either the provided one or the current branch)
  const actualSourceBranch =
    sourceBranch ?? (await getCurrentBranchName(projectPath));

  // Create branch name with jean-claude/ prefix
  const branchName = `jean-claude/${worktreeName}`;
  dbg.worktree('Creating worktree: %s, branch: %s', worktreePath, branchName);

  // Create the worktree with a new branch
  // If sourceBranch is provided, use it as the start point; otherwise use current HEAD
  try {
    const startPointArg = startPoint ?? sourceBranch;
    const args = ['worktree', 'add', worktreePath, '-b', branchName];
    if (startPointArg) args.push(startPointArg);
    dbg.worktree('Running: git %s', args.join(' '));
    await execFileAsync('git', args, {
      cwd: projectPath,
      encoding: 'utf-8',
    });
    dbg.worktree('Worktree created successfully');
  } catch (error) {
    dbg.worktree('Failed to create worktree: %O', error);
    throw new Error(formatCreateWorktreeError(error));
  }

  // Build backend-specific permission settings for the worktree
  try {
    await buildWorktreeSettings(projectPath, worktreePath);
  } catch (error) {
    dbg.worktree('Failed to build permission settings for worktree: %O', error);
  }

  // Install MCP servers for this worktree
  try {
    await installMcpForWorktree({
      worktreePath,
      projectId,
      projectName,
      branchName,
      mainRepoPath: projectPath,
    });
  } catch (error) {
    dbg.worktree('Failed to install MCP servers for worktree: %O', error);
    // Don't throw — MCP setup failure shouldn't block worktree creation
  }

  // Copy configured files from project to worktree
  try {
    const settings = await readSettings(projectPath);
    const copyEntries = settings.worktree?.create?.copy;
    if (copyEntries && copyEntries.length > 0) {
      await copyWorktreeFiles(projectPath, worktreePath, copyEntries);
    }
  } catch (error) {
    dbg.worktree('Failed to copy worktree files: %O', error);
    // Don't throw — file copy failure shouldn't block worktree creation
  }

  // Get the commit hash of the worktree HEAD (which is the source branch's HEAD or current HEAD)
  const startCommitHash = await getCurrentCommitHash(worktreePath);
  dbg.worktree('Worktree ready, startCommitHash: %s', startCommitHash);

  return {
    worktreePath,
    startCommitHash,
    branchName,
    sourceBranch: actualSourceBranch,
  };
}

/**
 * Gets the current branch name for a git repository.
 */
export async function getCurrentBranch(repoPath: string): Promise<string> {
  const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD', {
    cwd: repoPath,
    encoding: 'utf-8',
  });
  return stdout.trim();
}

/**
 * Gets the list of local branches for a git repository.
 */
export async function getProjectBranches(
  projectPath: string,
): Promise<BranchInfo[]> {
  try {
    const { stdout } = await execAsync(
      'git branch --sort=-committerdate --format="%(refname:short)\t%(committerdate:iso-strict)"',
      {
        cwd: projectPath,
        encoding: 'utf-8',
      },
    );
    return stdout
      .trim()
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line) => {
        const separatorIndex = line.indexOf('\t');
        if (separatorIndex === -1) {
          return { name: line, lastCommitDate: '' };
        }
        return {
          name: line.slice(0, separatorIndex),
          lastCommitDate: line.slice(separatorIndex + 1),
        };
      });
  } catch (error) {
    throw new Error(`Failed to get branches: ${error}`);
  }
}

export interface WorktreeStatus {
  hasUncommittedChanges: boolean;
  hasStagedChanges: boolean;
  hasUnstagedChanges: boolean;
  hasUnpushedCommits: boolean;
  worktreeDeleted?: boolean;
}

/**
 * Checks if a worktree has uncommitted or unpushed changes.
 */
export async function getWorktreeStatus(
  worktreePath: string,
): Promise<WorktreeStatus> {
  try {
    // Check for staged changes
    const { stdout: stagedOutput } = await execAsync(
      'git diff --cached --name-only',
      {
        cwd: worktreePath,
        encoding: 'utf-8',
      },
    );
    const hasStagedChanges = stagedOutput.trim().length > 0;

    // Check for unstaged changes (including untracked files)
    const { stdout: unstagedOutput } = await execAsync(
      'git status --porcelain',
      {
        cwd: worktreePath,
        encoding: 'utf-8',
      },
    );
    const hasUnstagedChanges = unstagedOutput.trim().length > 0;

    // Check for unpushed commits (commits ahead of upstream)
    let hasUnpushedCommits = false;
    try {
      const { stdout: aheadOutput } = await execAsync(
        'git rev-list --count @{u}..HEAD',
        { cwd: worktreePath, encoding: 'utf-8' },
      );
      hasUnpushedCommits = parseInt(aheadOutput.trim(), 10) > 0;
    } catch {
      // No upstream tracking branch — any local commits are unpushed
      // Check if there are any commits at all
      try {
        const { stdout: logOutput } = await execAsync('git log --oneline -1', {
          cwd: worktreePath,
          encoding: 'utf-8',
        });
        hasUnpushedCommits = logOutput.trim().length > 0;
      } catch {
        hasUnpushedCommits = false;
      }
    }

    return {
      hasUncommittedChanges: hasStagedChanges || hasUnstagedChanges,
      hasStagedChanges,
      hasUnstagedChanges,
      hasUnpushedCommits,
    };
  } catch (error) {
    // If we get ENOENT, the worktree was likely deleted
    if (isEnoent(error)) {
      return {
        hasUncommittedChanges: false,
        hasStagedChanges: false,
        hasUnstagedChanges: false,
        hasUnpushedCommits: false,
        worktreeDeleted: true,
      };
    }
    throw new Error(`Failed to get worktree status: ${error}`);
  }
}

export interface CommitWorktreeParams {
  worktreePath: string;
  projectPath?: string;
  message: string;
  stageAll: boolean;
  noVerify?: boolean;
}

/**
 * Commits changes in a worktree.
 */
export async function commitWorktreeChanges(
  params: CommitWorktreeParams,
): Promise<void> {
  const {
    worktreePath,
    projectPath,
    message,
    stageAll,
    noVerify = false,
  } = params;
  dbg.worktree('commitWorktreeChanges: %o', {
    worktreePath,
    stageAll,
    noVerify,
    messageLength: message.length,
  });

  try {
    if (stageAll) {
      const { ignoredPaths, ignoredStagedPaths } = await getIgnoredCommitPaths({
        worktreePath,
        projectPath,
      });
      const paths = await getStatusPaths(worktreePath);
      const includedPaths = paths.filter(
        (filePath) => !ignoredPaths.has(filePath),
      );

      dbg.worktree(
        'Staging %d changes, skipping %d ignored paths',
        includedPaths.length,
        ignoredPaths.size,
      );
      if (includedPaths.length > 0) {
        await runGitPathCommand({
          worktreePath,
          args: ['add', '-A'],
          paths: includedPaths,
        });
      }
      if (ignoredStagedPaths.size > 0) {
        await runGitPathCommand({
          worktreePath,
          args: ['restore', '--staged'],
          paths: [...ignoredStagedPaths],
        });
      }
      if (!(await hasStagedChanges(worktreePath))) {
        dbg.worktree('No non-ignored staged changes to commit');
        return;
      }
    }

    // Commit with the provided message
    dbg.worktree('Creating commit');
    await gitCommit({ cwd: worktreePath, message, noVerify });
    dbg.worktree('Commit successful');
  } catch (error) {
    dbg.worktree('Commit failed: %O', error);
    throw new Error(`Failed to commit changes: ${error}`);
  }
}

export interface MergeWorktreeParams {
  worktreePath: string;
  projectPath: string;
  targetBranch: string;
  squash?: boolean;
  commitMessage?: string;
  noVerify?: boolean;
}

export interface MergeWorktreeResult {
  success: boolean;
  error?: string;
}

export interface CheckMergeConflictsParams {
  worktreePath: string;
  projectPath: string;
  targetBranch: string;
}

export interface CheckMergeConflictsResult {
  hasConflicts: boolean;
  error?: string;
}

function isMergeConflictError(errorMessage: string): boolean {
  const normalized = errorMessage.toLowerCase();
  return (
    normalized.includes('conflict') ||
    normalized.includes('automatic merge failed')
  );
}

function getExecErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }

  const execError = error as Error & {
    stdout?: string | Buffer;
    stderr?: string | Buffer;
  };

  const stdout =
    typeof execError.stdout === 'string'
      ? execError.stdout
      : (execError.stdout?.toString('utf-8') ?? '');
  const stderr =
    typeof execError.stderr === 'string'
      ? execError.stderr
      : (execError.stderr?.toString('utf-8') ?? '');

  return [execError.message, stdout, stderr].filter(Boolean).join('\n');
}

export type WorktreeBranchCleanupBehavior = 'delete' | 'keep';

export interface CleanupWorktreeParams {
  worktreePath: string;
  projectPath: string;
  branchName?: string | null;
  skipIfChanges?: boolean;
  branchCleanup?: WorktreeBranchCleanupBehavior;
  force?: boolean;
}

/**
 * Removes a worktree and deletes its branch.
 */
export async function cleanupWorktree(
  params: CleanupWorktreeParams,
): Promise<void> {
  const {
    worktreePath,
    projectPath,
    branchName,
    skipIfChanges = false,
    branchCleanup = 'delete',
    force = false,
  } = params;

  if (!(await pathExists(worktreePath))) {
    return;
  }

  if (skipIfChanges) {
    const { stdout } = await execAsync(
      'git status --porcelain --untracked-files=all',
      {
        cwd: worktreePath,
        encoding: 'utf-8',
      },
    );
    if (stdout.trim().length > 0) {
      return;
    }
  }

  let worktreeBranch = branchName?.trim() || null;

  if (!worktreeBranch) {
    try {
      const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD', {
        cwd: worktreePath,
        encoding: 'utf-8',
      });
      worktreeBranch = stdout.trim();
    } catch (error) {
      dbg.worktree(
        'Failed to resolve worktree branch before delete: %O',
        error,
      );
    }
  }

  const forceFlag = force ? ' --force' : '';
  await execAsync(
    `git worktree remove ${JSON.stringify(worktreePath)}${forceFlag}`,
    {
      cwd: projectPath,
      encoding: 'utf-8',
    },
  );

  if (branchCleanup === 'delete' && worktreeBranch) {
    await execAsync(`git branch -D ${JSON.stringify(worktreeBranch)}`, {
      cwd: projectPath,
      encoding: 'utf-8',
    });
  }
}

/**
 * Cleans up a worktree whose directory has already been deleted from disk.
 * Runs `git worktree prune` to remove stale worktree references,
 * then deletes the branch if requested.
 */
export async function cleanupMissingWorktree(params: {
  projectPath: string;
  branchName: string;
}): Promise<void> {
  const { projectPath, branchName } = params;

  // Prune stale worktree entries (removes references to deleted directories)
  try {
    await execAsync('git worktree prune', {
      cwd: projectPath,
      encoding: 'utf-8',
    });
    dbg.worktree('Pruned stale worktree references in %s', projectPath);
  } catch (error) {
    dbg.worktree('Failed to prune worktrees in %s: %O', projectPath, error);
  }

  // Delete the orphaned branch
  try {
    await execAsync(`git branch -D ${JSON.stringify(branchName)}`, {
      cwd: projectPath,
      encoding: 'utf-8',
    });
    dbg.worktree('Deleted branch %s in %s', branchName, projectPath);
  } catch (error) {
    dbg.worktree(
      'Failed to delete branch %s in %s: %O',
      branchName,
      projectPath,
      error,
    );
  }
}

/**
 * Merges a worktree branch into target branch and deletes the worktree.
 * Supports both regular merge and squash merge with custom commit message.
 */
/**
 * Per-repo mutex to serialize merge operations. Prevents concurrent merges
 * from racing on the same target branch ref (both within Jean-Claude and
 * against external git operations, via the CAS check in update-ref).
 *
 * The chain promise always resolves (never rejects) so a failing `fn` can
 * never poison the queue. Callers receive a separate promise that carries
 * the actual result or rejection.
 */
const repoMergeLocks = new Map<string, Promise<void>>();

function withRepoLock<T>(
  projectPath: string,
  fn: () => Promise<T>,
): Promise<T> {
  const prev = repoMergeLocks.get(projectPath) ?? Promise.resolve();

  // Caller-facing promise that preserves fn's result/rejection.
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const callerPromise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  // Chain promise always resolves — fn errors are forwarded to callerPromise
  // but never propagate through the queue.
  const next = prev.then(async () => {
    try {
      resolve(await fn());
    } catch (err) {
      reject(err);
    }
  });

  repoMergeLocks.set(projectPath, next);

  // Clean up entry when queue drains to avoid unbounded growth
  void next.then(() => {
    if (repoMergeLocks.get(projectPath) === next) {
      repoMergeLocks.delete(projectPath);
    }
  });

  return callerPromise;
}

export function mergeWorktree(
  params: MergeWorktreeParams,
): Promise<MergeWorktreeResult> {
  return withRepoLock(params.projectPath, () => mergeWorktreeInner(params));
}

/**
 * Find the worktree path where a given branch is checked out.
 * Returns the path (may be projectPath itself or a secondary worktree),
 * or null if the branch is not checked out anywhere.
 */
async function findWorktreeForBranch(
  projectPath: string,
  branch: string,
): Promise<string | null> {
  const { stdout } = await execFileAsync(
    'git',
    ['worktree', 'list', '--porcelain'],
    { cwd: projectPath, encoding: 'utf-8' },
  );

  // Parse porcelain output: blocks separated by blank lines.
  // Each block has "worktree <path>", "branch refs/heads/<name>", etc.
  let currentPath: string | null = null;
  for (const line of stdout.split('\n')) {
    if (line.startsWith('worktree ')) {
      currentPath = line.slice('worktree '.length);
    } else if (line === '') {
      currentPath = null;
    } else if (
      line.startsWith('branch ') &&
      line === `branch refs/heads/${branch}`
    ) {
      if (currentPath) {
        return currentPath;
      }
    }
  }
  return null;
}

async function mergeWorktreeInner(
  params: MergeWorktreeParams,
): Promise<MergeWorktreeResult> {
  const {
    worktreePath,
    projectPath,
    targetBranch,
    squash = false,
    commitMessage,
    noVerify = false,
  } = params;

  dbg.worktree('mergeWorktree: %o', {
    worktreePath,
    projectPath,
    targetBranch,
    squash,
  });

  // Check if worktree still exists before attempting operations
  if (!(await pathExists(worktreePath))) {
    dbg.worktree('Worktree no longer exists at %s', worktreePath);
    return { success: false, error: 'Worktree no longer exists' };
  }

  try {
    // Get the branch name of the worktree
    const { stdout: branchOutput } = await execAsync(
      'git rev-parse --abbrev-ref HEAD',
      {
        cwd: worktreePath,
        encoding: 'utf-8',
      },
    );
    const worktreeBranch = branchOutput.trim();
    dbg.worktree('Merging branch %s into %s', worktreeBranch, targetBranch);

    // Pre-check for conflicts using merge-tree (read-only, no working tree changes)
    dbg.worktree('Pre-checking for merge conflicts');
    try {
      await execFileAsync(
        'git',
        ['merge-tree', '--write-tree', targetBranch, worktreeBranch],
        { cwd: projectPath, encoding: 'utf-8' },
      );
    } catch (conflictError) {
      const conflictMsg = getExecErrorMessage(conflictError);
      if (isMergeConflictError(conflictMsg)) {
        return {
          success: false,
          error:
            'Merge failed due to conflicts. Resolve manually in your editor.',
        };
      }
      // Non-conflict error from merge-tree — let it fall through to the
      // actual merge which will produce a better error message.
    }

    // Determine where to run the merge. If the target branch is already
    // checked out somewhere (main repo or another worktree), merge there
    // directly. Otherwise checkout the target branch in the main repo first.
    const targetCheckedOutAt = await findWorktreeForBranch(
      projectPath,
      targetBranch,
    );
    const mergeCwd = targetCheckedOutAt ?? projectPath;
    dbg.worktree(
      'Merge cwd: %s (target checked out: %s)',
      mergeCwd,
      targetCheckedOutAt != null,
    );

    if (!targetCheckedOutAt) {
      // Target branch is not checked out anywhere — checkout in main repo
      dbg.worktree('Checking out target branch %s', targetBranch);
      await execAsync(`git checkout ${JSON.stringify(targetBranch)}`, {
        cwd: projectPath,
        encoding: 'utf-8',
      });
    }

    if (squash) {
      // Squash merge: combine all commits into staged changes, then commit with custom message
      dbg.worktree('Performing squash merge');
      await execAsync(`git merge --squash ${JSON.stringify(worktreeBranch)}`, {
        cwd: mergeCwd,
        encoding: 'utf-8',
      });

      // Commit the squashed changes with the provided message
      const message =
        commitMessage || `Squash merge branch '${worktreeBranch}'`;
      await gitCommit({ cwd: mergeCwd, message, noVerify });
    } else {
      // Regular merge
      dbg.worktree('Performing regular merge');
      await execFileAsync(
        'git',
        ['merge', ...(noVerify ? ['--no-verify'] : []), worktreeBranch],
        {
          cwd: mergeCwd,
          encoding: 'utf-8',
        },
      );
    }

    dbg.worktree('Merge successful');

    await cleanupWorktree({
      worktreePath,
      projectPath,
      branchCleanup: 'delete',
      force: true,
    });

    dbg.worktree('Merge complete, worktree cleaned up');
    return { success: true };
  } catch (error) {
    const errorMessage = getExecErrorMessage(error);
    dbg.worktree('Merge failed: %s', errorMessage);

    // Check if it's a merge conflict
    if (isMergeConflictError(errorMessage)) {
      return {
        success: false,
        error:
          'Merge failed due to conflicts. Resolve manually in your editor.',
      };
    }

    return { success: false, error: errorMessage };
  }
}

export async function checkMergeConflicts(
  params: CheckMergeConflictsParams,
): Promise<CheckMergeConflictsResult> {
  const { worktreePath, projectPath, targetBranch } = params;

  if (!(await pathExists(worktreePath))) {
    return {
      hasConflicts: false,
      error: 'Worktree no longer exists',
    };
  }

  if (!(await pathExists(projectPath))) {
    return {
      hasConflicts: false,
      error: 'Project path no longer exists',
    };
  }

  try {
    const { stdout: branchOutput } = await execAsync(
      'git rev-parse --abbrev-ref HEAD',
      {
        cwd: worktreePath,
        encoding: 'utf-8',
      },
    );
    const worktreeBranch = branchOutput.trim();

    const { stdout } = await execAsync(
      `git merge-tree --write-tree --messages ${JSON.stringify(targetBranch)} ${JSON.stringify(worktreeBranch)}`,
      {
        cwd: projectPath,
        encoding: 'utf-8',
      },
    );

    if (isMergeConflictError(stdout)) {
      return { hasConflicts: true };
    }

    return { hasConflicts: false };
  } catch (error) {
    const errorMessage = getExecErrorMessage(error);
    if (isMergeConflictError(errorMessage)) {
      return { hasConflicts: true };
    }

    return {
      hasConflicts: false,
      error: `Failed to check merge conflicts: ${errorMessage}`,
    };
  }
}

const SSH_PASSPHRASE_PATTERN = /Enter passphrase for key/i;
// Matches "user@host's password:" but not error messages like "Permission denied (password)"
const SSH_PASSWORD_PATTERN = /\S+@\S+'s password:/i;

/**
 * Pushes the current branch to a remote.
 * Detects SSH passphrase/password prompts and shows a global prompt dialog
 * so users can enter their credentials interactively.
 */
export async function pushBranch(params: {
  worktreePath: string;
  branchName: string;
  remote?: string;
}): Promise<void> {
  const remote = params.remote ?? 'origin';
  dbg.worktree('pushBranch: %s to %s', params.branchName, remote);

  return new Promise<void>((resolve, reject) => {
    const child = spawn('git', ['push', '-u', remote, params.branchName], {
      cwd: params.worktreePath,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        SSH_ASKPASS: '',
        GIT_ASKPASS: '',
        SSH_ASKPASS_REQUIRE: 'never',
      },
    });

    let stderrOutput = '';
    let promptHandled = false;

    child.stderr?.on('data', async (data: Buffer) => {
      const text = data.toString();
      stderrOutput += text;
      dbg.worktree('pushBranch stderr: %s', text.trim());

      if (promptHandled) return;

      // Test accumulated output to handle patterns split across chunks
      const isPassphrase = SSH_PASSPHRASE_PATTERN.test(stderrOutput);
      const isPassword = SSH_PASSWORD_PATTERN.test(stderrOutput);

      if (isPassphrase || isPassword) {
        promptHandled = true;
        dbg.worktree('SSH authentication prompt detected');

        try {
          const { sendGlobalPromptToWindow } =
            await import('./global-prompt-service');
          const prompt = {
            title: 'SSH Authentication Required',
            message: stderrOutput.trim(),
            inputType: 'password' as const,
            acceptLabel: 'Submit',
            rejectLabel: 'Cancel',
          };
          // Cast needed: dynamic imports lose overload resolution.
          // When inputType is set, the function returns { accepted, inputValue }.
          const result = (await sendGlobalPromptToWindow(
            prompt,
          )) as unknown as {
            accepted: boolean;
            inputValue?: string;
          };

          if (result.accepted && result.inputValue != null) {
            child.stdin?.write(result.inputValue + '\n');
          } else {
            dbg.worktree('SSH authentication cancelled by user');
            child.kill();
          }
        } catch (err) {
          dbg.worktree('Failed to show SSH prompt: %O', err);
          child.kill();
        }
      }
    });

    let stdoutOutput = '';
    child.stdout?.on('data', (data: Buffer) => {
      stdoutOutput += data.toString();
    });

    child.on('error', (err) => {
      reject(new Error(`Failed to spawn git push: ${err.message}`));
    });

    child.on('close', (code) => {
      if (code === 0) {
        dbg.worktree('Push successful');
        resolve();
      } else {
        const errorMessage =
          stderrOutput.trim() || stdoutOutput.trim() || `Exit code ${code}`;
        reject(new Error(`git push failed: ${errorMessage}`));
      }
    });
  });
}

/**
 * Gets the unified diff content for all changed files in a worktree.
 * This is useful for AI summary generation where we need the actual diff text.
 *
 * @param worktreePath - The path to the worktree
 * @param startCommitHash - Fallback commit hash (used if sourceBranch unavailable)
 * @param sourceBranch - The source branch to compute diff against (optional)
 * @returns The unified diff output as a string
 */
export async function getWorktreeUnifiedDiff(
  worktreePath: string,
  startCommitHash: string,
  sourceBranch?: string | null,
): Promise<string> {
  dbg.worktree('getWorktreeUnifiedDiff called %o', {
    worktreePath,
    startCommitHash,
    sourceBranch,
  });

  // Check if the worktree still exists
  if (!(await pathExists(worktreePath))) {
    dbg.worktree('Worktree path does not exist');
    return '';
  }

  try {
    // Get the appropriate base commit for diffing
    const baseCommit = await getDiffBaseCommit(
      worktreePath,
      startCommitHash,
      sourceBranch ?? null,
    );

    // Get task-changed files to filter out merge artifacts
    const taskChangedFiles = await getTaskChangedFiles(
      worktreePath,
      sourceBranch ?? null,
    );

    if (taskChangedFiles && taskChangedFiles.size > 0) {
      // Generate diff only for task-changed files to exclude merge artifacts
      const fileArgs = [...taskChangedFiles]
        .map((f) => `"${escapeForShell(f)}"`)
        .join(' ');
      const { stdout: diffOutput } = await execAsync(
        `git diff -U3 ${baseCommit} -- ${fileArgs}`,
        {
          cwd: worktreePath,
          encoding: 'utf-8',
          maxBuffer: 10 * 1024 * 1024,
        },
      );
      dbg.worktree(
        'Got unified diff (filtered), length: %d',
        diffOutput.length,
      );
      return diffOutput;
    } else if (taskChangedFiles && taskChangedFiles.size === 0) {
      // All changes are merge artifacts
      dbg.worktree('No task-changed files, returning empty diff');
      return '';
    }

    // No source branch to filter against — return full diff
    const { stdout: diffOutput } = await execAsync(
      `git diff -U3 ${baseCommit}`,
      {
        cwd: worktreePath,
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024,
      },
    );
    dbg.worktree('Got unified diff, length: %d', diffOutput.length);
    return diffOutput;
  } catch (error) {
    dbg.worktree('Error getting unified diff: %O', error);
    return '';
  }
}

/**
 * Returns the git log (one-line format) for commits since startCommitHash.
 */
export async function getWorktreeCommitLog(
  worktreePath: string,
  startCommitHash: string,
): Promise<string> {
  // Validate commit hash to prevent shell injection
  if (!/^[0-9a-f]{7,40}$/i.test(startCommitHash)) {
    dbg.worktree('Invalid commit hash for log: %s', startCommitHash);
    return '';
  }

  try {
    const { stdout } = await execAsync(
      `git log --oneline ${startCommitHash}..HEAD --`,
      { cwd: worktreePath, encoding: 'utf-8', maxBuffer: 1024 * 1024 },
    );
    return stdout.trim();
  } catch {
    return '';
  }
}

export interface WorktreeCommit {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  date: string; // ISO 8601
}

export async function getWorktreeCommits(
  worktreePath: string,
  startCommitHash: string,
): Promise<WorktreeCommit[]> {
  if (!/^[0-9a-f]{7,40}$/i.test(startCommitHash)) {
    dbg.worktree('Invalid commit hash for commits: %s', startCommitHash);
    return [];
  }

  try {
    const DELIM = '---COMMIT-DELIM---';
    const { stdout } = await execAsync(
      `git log --format='%H%n%h%n%s%n%an%n%aI%n${DELIM}' ${startCommitHash}..HEAD --`,
      { cwd: worktreePath, encoding: 'utf-8', maxBuffer: 1024 * 1024 },
    );

    if (!stdout.trim()) return [];

    const commits: WorktreeCommit[] = [];
    const blocks = stdout.split(DELIM).filter((b) => b.trim());

    for (const block of blocks) {
      const lines = block.trim().split('\n');
      if (lines.length >= 5) {
        commits.push({
          hash: lines[0]!,
          shortHash: lines[1]!,
          message: lines[2]!,
          author: lines[3]!,
          date: lines[4]!,
        });
      }
    }

    return commits;
  } catch {
    return [];
  }
}

/**
 * Returns the list of files changed in a specific commit.
 */
export async function getWorktreeCommitDiff(
  worktreePath: string,
  commitHash: string,
): Promise<
  {
    path: string;
    status: 'added' | 'modified' | 'deleted';
    additions: number;
    deletions: number;
  }[]
> {
  // Validate commit hash
  if (!/^[0-9a-f]{7,40}$/i.test(commitHash)) {
    dbg.worktree('Invalid commit hash for commit diff: %s', commitHash);
    return [];
  }

  try {
    // Get file list with status
    const { stdout: nameStatus } = await execAsync(
      `git diff --name-status ${commitHash}^..${commitHash}`,
      { cwd: worktreePath, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 },
    );

    // Get per-file line counts
    const { stdout: numstatOutput } = await execAsync(
      `git diff --numstat ${commitHash}^..${commitHash}`,
      { cwd: worktreePath, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 },
    );

    const numstatMap = new Map<
      string,
      { additions: number; deletions: number }
    >();
    for (const line of numstatOutput.split('\n')) {
      if (!line.trim()) continue;
      const [adds, dels, ...pathParts] = line.split('\t');
      const filePath = pathParts.join('\t');
      numstatMap.set(filePath, {
        additions: adds === '-' ? 0 : parseInt(adds!, 10),
        deletions: dels === '-' ? 0 : parseInt(dels!, 10),
      });
    }

    const files: {
      path: string;
      status: 'added' | 'modified' | 'deleted';
      additions: number;
      deletions: number;
    }[] = [];
    for (const line of nameStatus.split('\n')) {
      if (!line.trim()) continue;
      const [statusCode, ...pathParts] = line.split('\t');
      const filePath = pathParts.join('\t');
      if (!filePath) continue;

      let status: 'added' | 'modified' | 'deleted' = 'modified';
      if (statusCode === 'A') status = 'added';
      else if (statusCode === 'D') status = 'deleted';

      const stats = numstatMap.get(filePath) ?? {
        additions: 0,
        deletions: 0,
      };
      files.push({
        path: filePath,
        status,
        additions: stats.additions,
        deletions: stats.deletions,
      });
    }

    return files;
  } catch {
    return [];
  }
}

/**
 * Returns the old and new content of a file for a specific commit.
 */
export async function getWorktreeCommitFileContent(
  worktreePath: string,
  commitHash: string,
  filePath: string,
  status: 'added' | 'modified' | 'deleted',
): Promise<{
  oldContent: string | null;
  newContent: string | null;
  isBinary: boolean;
  oldImageDataUrl?: string | null;
  newImageDataUrl?: string | null;
}> {
  // Validate commit hash
  if (!/^[0-9a-f]{7,40}$/i.test(commitHash)) {
    return { oldContent: null, newContent: null, isBinary: false };
  }

  try {
    let oldContent: string | null = null;
    let newContent: string | null = null;
    let oldImageDataUrl: string | null = null;
    let newImageDataUrl: string | null = null;
    const mimeType = getImageMimeType(filePath);
    const isSvg = isSvgPath(filePath);

    if (status !== 'added') {
      try {
        if (mimeType && !isSvg) {
          const { stdout } = await execAsync(
            `git show ${commitHash}^:"${escapeForShell(filePath)}" | base64`,
            {
              cwd: worktreePath,
              encoding: 'utf-8',
              maxBuffer: 15 * 1024 * 1024,
            },
          );
          oldImageDataUrl = `data:${mimeType};base64,${stdout.replace(/\s/g, '')}`;
        } else {
          const { stdout } = await execAsync(
            `git show ${commitHash}^:"${escapeForShell(filePath)}"`,
            {
              cwd: worktreePath,
              encoding: 'utf-8',
              maxBuffer: 10 * 1024 * 1024,
            },
          );
          oldContent = stdout;
        }
      } catch {
        oldContent = null;
      }
    }

    if (status !== 'deleted') {
      try {
        if (mimeType && !isSvg) {
          const { stdout } = await execAsync(
            `git show ${commitHash}:"${escapeForShell(filePath)}" | base64`,
            {
              cwd: worktreePath,
              encoding: 'utf-8',
              maxBuffer: 15 * 1024 * 1024,
            },
          );
          newImageDataUrl = `data:${mimeType};base64,${stdout.replace(/\s/g, '')}`;
        } else {
          const { stdout } = await execAsync(
            `git show ${commitHash}:"${escapeForShell(filePath)}"`,
            {
              cwd: worktreePath,
              encoding: 'utf-8',
              maxBuffer: 10 * 1024 * 1024,
            },
          );
          newContent = stdout;
        }
      } catch {
        newContent = null;
      }
    }

    // Simple binary detection
    const isBinary =
      (mimeType !== null && !isSvg) ||
      (oldContent !== null && oldContent.includes('\0')) ||
      (newContent !== null && newContent.includes('\0'));

    return {
      oldContent,
      newContent,
      isBinary,
      oldImageDataUrl,
      newImageDataUrl,
    };
  } catch {
    return { oldContent: null, newContent: null, isBinary: false };
  }
}
