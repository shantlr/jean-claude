import { exec } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { promisify } from 'util';

import { app } from 'electron';
import { nanoid } from 'nanoid';

import { ProjectRepository } from '../database/repositories/projects';
import { dbg } from '../lib/debug';
import { pathExists } from '../lib/fs';

import { installMcpForWorktree } from './mcp-template-service';
import { buildWorktreeSettings } from './permission-settings-service';

const execAsync = promisify(exec);

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
}

export interface WorktreeDiffResult {
  files: WorktreeDiffFile[];
  worktreeDeleted?: boolean;
}

export interface WorktreeFileContent {
  oldContent: string | null;
  newContent: string | null;
  isBinary: boolean;
}

/**
 * Gets the list of changed files between a worktree's current state and its starting commit.
 * Does not load file contents - use getWorktreeFileContent for that.
 *
 * This includes:
 * - Committed changes since startCommitHash
 * - Staged but uncommitted changes
 * - Unstaged changes in tracked files
 * - Untracked files (new files not yet added to git)
 *
 * @param worktreePath - The path to the worktree
 * @param startCommitHash - The commit hash to diff against
 * @returns The list of changed files with their status
 */
export async function getWorktreeDiff(
  worktreePath: string,
  startCommitHash: string,
): Promise<WorktreeDiffResult> {
  dbg.worktree('getWorktreeDiff called %o', { worktreePath, startCommitHash });

  // Check if the worktree still exists
  if (!(await pathExists(worktreePath))) {
    dbg.worktree('Worktree path does not exist, returning deleted');
    return { files: [], worktreeDeleted: true };
  }

  try {
    // We need to combine two sources to get all changes:
    // 1. git diff --name-status <commit> - shows changes from startCommit to current working tree
    //    (includes committed, staged, and unstaged changes to tracked files)
    // 2. git status --porcelain - shows untracked files that git diff doesn't see

    // First, get changes from startCommit to current working tree (including uncommitted)
    // Note: Without HEAD, git diff compares against the working tree directly
    const { stdout: diffOutput } = await execAsync(
      `git diff --name-status ${startCommitHash}`,
      {
        cwd: worktreePath,
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large diffs
      },
    );
    dbg.worktree('git diff output length: %d', diffOutput.length);

    // Also get untracked files which git diff doesn't show
    // Use --untracked-files=all to list individual files in new directories
    // (default mode shows new directories as "folder/" which can't be diffed)
    const { stdout: statusOutput } = await execAsync(
      'git status --porcelain --untracked-files=all',
      {
        cwd: worktreePath,
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024,
      },
    );
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

        filesMap.set(filePath, { path: filePath, status });
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
          // Check if file existed at startCommit
          try {
            await execAsync(
              `git cat-file -e ${startCommitHash}:"${escapeForShell(filePath)}"`,
              {
                cwd: worktreePath,
                encoding: 'utf-8',
              },
            );
            // File existed at startCommit, so this is modified (shouldn't happen for ??)
            filesMap.set(filePath, { path: filePath, status: 'modified' });
          } catch {
            // File didn't exist at startCommit, so it's added
            filesMap.set(filePath, { path: filePath, status: 'added' });
          }
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
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return { files: [], worktreeDeleted: true };
    }
    throw error;
  }
}

/**
 * Gets the content of a specific file for diff viewing.
 * Loads the old content from the starting commit and new content from the working tree.
 *
 * @param worktreePath - The path to the worktree
 * @param startCommitHash - The commit hash to diff against
 * @param filePath - The relative path of the file within the worktree
 * @param status - The file status (added/modified/deleted)
 * @returns The old and new content of the file
 */
export async function getWorktreeFileContent(
  worktreePath: string,
  startCommitHash: string,
  filePath: string,
  status: 'added' | 'modified' | 'deleted',
): Promise<WorktreeFileContent> {
  dbg.worktree('getWorktreeFileContent called %o', {
    worktreePath,
    startCommitHash,
    filePath,
    status,
  });

  let oldContent: string | null = null;
  let newContent: string | null = null;
  let isBinary = false;

  // Get old content from the starting commit (unless file was added)
  if (status !== 'added') {
    try {
      const { stdout } = await execAsync(
        `git show ${startCommitHash}:"${escapeForShell(filePath)}"`,
        {
          cwd: worktreePath,
          encoding: 'utf-8',
          maxBuffer: 5 * 1024 * 1024,
        },
      );
      oldContent = stdout;
      dbg.worktree('Got old content, length: %d', stdout.length);
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
      // Check if file is binary
      if (await isBinaryFile(fullPath)) {
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

  // Also check if old content indicates binary (null bytes would have caused git show to fail)
  if (oldContent === null && newContent === null && status === 'modified') {
    dbg.worktree('Both contents null for modified file, marking as binary');
    isBinary = true;
  }

  dbg.worktree('Returning: %o', {
    hasOldContent: oldContent !== null,
    hasNewContent: newContent !== null,
    isBinary,
  });

  return { oldContent, newContent, isBinary };
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
 * @returns The path to the created worktree and the starting commit hash
 */
export async function createWorktree(
  projectPath: string,
  projectId: string,
  projectName: string,
  prompt: string,
  taskName?: string,
  sourceBranch?: string,
): Promise<CreateWorktreeResult> {
  dbg.worktree('createWorktree called %o', {
    projectPath,
    projectId,
    taskName,
    sourceBranch,
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
    const startPoint = sourceBranch ? ` "${sourceBranch}"` : '';
    const cmd = `git worktree add "${worktreePath}" -b "${branchName}"${startPoint}`;
    dbg.worktree('Running: %s', cmd);
    await execAsync(cmd, {
      cwd: projectPath,
      encoding: 'utf-8',
    });
    dbg.worktree('Worktree created successfully');
  } catch (error) {
    dbg.worktree('Failed to create worktree: %O', error);
    throw new Error(`Failed to create git worktree: ${error}`);
  }

  // Build Claude local settings by merging settings.local.json and settings.local.worktrees.json
  try {
    await buildWorktreeSettings(projectPath, worktreePath);
  } catch (error) {
    dbg.worktree('Failed to build Claude settings for worktree: %O', error);
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
): Promise<string[]> {
  try {
    const { stdout } = await execAsync(
      'git branch --format="%(refname:short)"',
      {
        cwd: projectPath,
        encoding: 'utf-8',
      },
    );
    return stdout
      .trim()
      .split('\n')
      .filter((branch) => branch.length > 0);
  } catch (error) {
    throw new Error(`Failed to get branches: ${error}`);
  }
}

export interface WorktreeStatus {
  hasUncommittedChanges: boolean;
  hasStagedChanges: boolean;
  hasUnstagedChanges: boolean;
}

/**
 * Checks if a worktree has uncommitted changes.
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

    return {
      hasUncommittedChanges: hasStagedChanges || hasUnstagedChanges,
      hasStagedChanges,
      hasUnstagedChanges,
    };
  } catch (error) {
    throw new Error(`Failed to get worktree status: ${error}`);
  }
}

export interface CommitWorktreeParams {
  worktreePath: string;
  message: string;
  stageAll: boolean;
}

/**
 * Commits changes in a worktree.
 */
export async function commitWorktreeChanges(
  params: CommitWorktreeParams,
): Promise<void> {
  const { worktreePath, message, stageAll } = params;
  dbg.worktree('commitWorktreeChanges: %o', {
    worktreePath,
    stageAll,
    messageLength: message.length,
  });

  try {
    if (stageAll) {
      // Stage all changes including untracked files
      dbg.worktree('Staging all changes');
      await execAsync('git add -A', { cwd: worktreePath, encoding: 'utf-8' });
    }

    // Commit with the provided message
    dbg.worktree('Creating commit');
    await execAsync(`git commit -m ${JSON.stringify(message)}`, {
      cwd: worktreePath,
      encoding: 'utf-8',
    });
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
}

export interface MergeWorktreeResult {
  success: boolean;
  error?: string;
}

/**
 * Merges a worktree branch into target branch and deletes the worktree.
 * Supports both regular merge and squash merge with custom commit message.
 */
export async function mergeWorktree(
  params: MergeWorktreeParams,
): Promise<MergeWorktreeResult> {
  const {
    worktreePath,
    projectPath,
    targetBranch,
    squash = false,
    commitMessage,
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

    // Switch to target branch in main repo
    dbg.worktree('Checking out target branch %s', targetBranch);
    await execAsync(`git checkout ${JSON.stringify(targetBranch)}`, {
      cwd: projectPath,
      encoding: 'utf-8',
    });

    if (squash) {
      // Squash merge: combine all commits into staged changes, then commit with custom message
      dbg.worktree('Performing squash merge');
      await execAsync(`git merge --squash ${JSON.stringify(worktreeBranch)}`, {
        cwd: projectPath,
        encoding: 'utf-8',
      });

      // Commit the squashed changes with the provided message
      const message =
        commitMessage || `Squash merge branch '${worktreeBranch}'`;
      await execAsync(`git commit -m ${JSON.stringify(message)}`, {
        cwd: projectPath,
        encoding: 'utf-8',
      });
    } else {
      // Regular merge
      dbg.worktree('Performing regular merge');
      await execAsync(`git merge ${JSON.stringify(worktreeBranch)}`, {
        cwd: projectPath,
        encoding: 'utf-8',
      });
    }
    dbg.worktree('Merge successful');

    // Remove the worktree
    dbg.worktree('Removing worktree');
    await execAsync(
      `git worktree remove ${JSON.stringify(worktreePath)} --force`,
      {
        cwd: projectPath,
        encoding: 'utf-8',
      },
    );

    // Force delete the branch (use -D to handle edge cases where git thinks branch isn't fully merged)
    dbg.worktree('Deleting branch %s', worktreeBranch);
    await execAsync(`git branch -D ${JSON.stringify(worktreeBranch)}`, {
      cwd: projectPath,
      encoding: 'utf-8',
    });

    dbg.worktree('Merge complete, worktree cleaned up');
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    dbg.worktree('Merge failed: %s', errorMessage);

    // Check if it's a merge conflict
    if (
      errorMessage.includes('CONFLICT') ||
      errorMessage.includes('Automatic merge failed')
    ) {
      return {
        success: false,
        error:
          'Merge failed due to conflicts. Resolve manually in your editor.',
      };
    }

    return { success: false, error: errorMessage };
  }
}

/**
 * Pushes the current branch to a remote.
 */
export async function pushBranch(params: {
  worktreePath: string;
  branchName: string;
  remote?: string;
}): Promise<void> {
  const remote = params.remote ?? 'origin';
  dbg.worktree('pushBranch: %s to %s', params.branchName, remote);
  await execAsync(`git push -u ${remote} ${params.branchName}`, {
    cwd: params.worktreePath,
  });
  dbg.worktree('Push successful');
}
