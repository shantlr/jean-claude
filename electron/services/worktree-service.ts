import { exec } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { promisify } from 'util';

import { app } from 'electron';
import { nanoid } from 'nanoid';

import { ProjectRepository } from '../database/repositories/projects';
import { pathExists } from '../lib/fs';

import { buildWorktreeSettings } from './permission-settings-service';

const execAsync = promisify(exec);

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
 * @param worktreePath - The path to the worktree
 * @param startCommitHash - The commit hash to diff against
 * @returns The list of changed files with their status
 */
export async function getWorktreeDiff(
  worktreePath: string,
  startCommitHash: string,
): Promise<WorktreeDiffResult> {
  // Check if the worktree still exists
  if (!(await pathExists(worktreePath))) {
    return { files: [], worktreeDeleted: true };
  }

  try {
    // Get list of changed files with their status
    const { stdout: statusOutput } = await execAsync(
      `git diff --name-status ${startCommitHash}`,
      {
        cwd: worktreePath,
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large diffs
      },
    );

    const trimmedOutput = statusOutput.trim();
    if (!trimmedOutput) {
      return { files: [] };
    }

    const files: WorktreeDiffFile[] = [];

    for (const line of trimmedOutput.split('\n')) {
      if (!line) continue;

      // Format: "M\tpath/to/file" or "A\tpath" or "D\tpath"
      const [statusCode, ...pathParts] = line.split('\t');
      const filePath = pathParts.join('\t'); // Handle paths with tabs (rare but possible)

      let status: 'added' | 'modified' | 'deleted';
      if (statusCode.startsWith('A')) {
        status = 'added';
      } else if (statusCode.startsWith('D')) {
        status = 'deleted';
      } else {
        status = 'modified';
      }

      files.push({ path: filePath, status });
    }

    return { files };
  } catch (error) {
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
  let oldContent: string | null = null;
  let newContent: string | null = null;
  let isBinary = false;

  // Get old content from the starting commit (unless file was added)
  if (status !== 'added') {
    try {
      const { stdout } = await execAsync(
        `git show ${startCommitHash}:"${filePath}"`,
        {
          cwd: worktreePath,
          encoding: 'utf-8',
          maxBuffer: 5 * 1024 * 1024,
        },
      );
      oldContent = stdout;
    } catch {
      // File might be binary or inaccessible
      oldContent = null;
    }
  }

  // Get new content from the working tree (unless file was deleted)
  if (status !== 'deleted') {
    const fullPath = path.join(worktreePath, filePath);
    try {
      // Check if file is binary
      if (await isBinaryFile(fullPath)) {
        isBinary = true;
        newContent = null;
      } else {
        newContent = await fs.readFile(fullPath, 'utf-8');
      }
    } catch {
      newContent = null;
    }
  }

  // Also check if old content indicates binary (null bytes would have caused git show to fail)
  if (oldContent === null && newContent === null && status === 'modified') {
    isBinary = true;
  }

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
  // Verify this is a git repository
  if (!(await isGitRepository(projectPath))) {
    throw new Error(`Project path is not a git repository: ${projectPath}`);
  }

  // Get or create the project's worktrees directory
  const projectWorktreesPath = await getOrCreateProjectWorktreesPath(
    projectId,
    projectName,
  );

  // Generate worktree name from task name (preferred) or prompt (fallback)
  const worktreeName = taskName
    ? generateWorktreeNameFromTaskName(taskName)
    : generateWorktreeName(prompt);
  const worktreePath = path.join(projectWorktreesPath, worktreeName);

  // Create branch name with jean-claude/ prefix
  const branchName = `jean-claude/${worktreeName}`;

  // Create the worktree with a new branch
  // If sourceBranch is provided, use it as the start point; otherwise use current HEAD
  try {
    const startPoint = sourceBranch ? ` "${sourceBranch}"` : '';
    await execAsync(
      `git worktree add "${worktreePath}" -b "${branchName}"${startPoint}`,
      {
        cwd: projectPath,
        encoding: 'utf-8',
      },
    );
  } catch (error) {
    throw new Error(`Failed to create git worktree: ${error}`);
  }

  // Build Claude local settings by merging settings.local.json and settings.local.worktrees.json
  try {
    await buildWorktreeSettings(projectPath, worktreePath);
  } catch (error) {
    console.warn('Failed to build Claude settings for worktree:', error);
  }
  // Get the commit hash of the worktree HEAD (which is the source branch's HEAD or current HEAD)
  const startCommitHash = await getCurrentCommitHash(worktreePath);

  return {
    worktreePath,
    startCommitHash,
    branchName,
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

  try {
    if (stageAll) {
      // Stage all changes including untracked files
      await execAsync('git add -A', { cwd: worktreePath, encoding: 'utf-8' });
    }

    // Commit with the provided message
    await execAsync(`git commit -m ${JSON.stringify(message)}`, {
      cwd: worktreePath,
      encoding: 'utf-8',
    });
  } catch (error) {
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

  // Check if worktree still exists before attempting operations
  if (!(await pathExists(worktreePath))) {
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

    // Switch to target branch in main repo
    await execAsync(`git checkout ${JSON.stringify(targetBranch)}`, {
      cwd: projectPath,
      encoding: 'utf-8',
    });

    if (squash) {
      // Squash merge: combine all commits into staged changes, then commit with custom message
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
      await execAsync(`git merge ${JSON.stringify(worktreeBranch)}`, {
        cwd: projectPath,
        encoding: 'utf-8',
      });
    }

    // Remove the worktree
    await execAsync(
      `git worktree remove ${JSON.stringify(worktreePath)} --force`,
      {
        cwd: projectPath,
        encoding: 'utf-8',
      },
    );

    // Force delete the branch (use -D to handle edge cases where git thinks branch isn't fully merged)
    await execAsync(`git branch -D ${JSON.stringify(worktreeBranch)}`, {
      cwd: projectPath,
      encoding: 'utf-8',
    });

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

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
  await execAsync(`git push -u ${remote} ${params.branchName}`, {
    cwd: params.worktreePath,
  });
}
