import * as fsSync from 'fs';
import * as fs from 'fs/promises';
import * as path from 'path';

import ignore from 'ignore';

export type ProjectDirectoryEntry = {
  name: string;
  path: string;
  isDirectory: boolean;
};

type FileIndex = {
  projectRoot: string;
  files: string[];
  fileSet: Set<string>;
  dirSet: Set<string>;
  childrenByDir: Map<string, Map<string, boolean>>;
  lastUsedAt: number;
  ready: boolean;
  buildingPromise: Promise<void> | null;
  dirty: boolean;
  needsSort: boolean;
  watcher: fsSync.FSWatcher | null;
  watcherRestartTimer: ReturnType<typeof setTimeout> | null;
  watcherRestartAttempt: number;
  ig: ReturnType<typeof ignore>;
  changeVersion: number;
};

type ProjectFileIndexServiceConfig = {
  idleCleanupMs?: number;
  maxProjectFiles?: number;
};

const DEFAULT_IDLE_CLEANUP_MS = 5 * 60 * 1000;
const DEFAULT_MAX_PROJECT_FILES = 20_000;

export class ProjectFileIndexService {
  private readonly indexes = new Map<string, FileIndex>();

  private readonly idleCleanupMs: number;

  private readonly maxProjectFiles: number;

  private readonly cleanupTimer: ReturnType<typeof setInterval>;

  constructor(config: ProjectFileIndexServiceConfig = {}) {
    this.idleCleanupMs = config.idleCleanupMs ?? DEFAULT_IDLE_CLEANUP_MS;
    this.maxProjectFiles = config.maxProjectFiles ?? DEFAULT_MAX_PROJECT_FILES;
    this.cleanupTimer = setInterval(() => {
      this.cleanupUnusedIndexes();
    }, 60_000);
    this.cleanupTimer.unref?.();
  }

  async listProjectFiles({
    projectRoot,
  }: {
    projectRoot: string;
  }): Promise<string[]> {
    const index = await this.getOrCreateIndex({ projectRoot });
    index.lastUsedAt = Date.now();

    await this.ensureFreshIndex(index);

    this.refreshSortedFiles(index);
    return index.files.slice(0, this.maxProjectFiles);
  }

  async listDirectory({
    projectRoot,
    dirPath,
  }: {
    projectRoot: string;
    dirPath: string;
  }): Promise<ProjectDirectoryEntry[]> {
    const index = await this.getOrCreateIndex({ projectRoot });
    index.lastUsedAt = Date.now();

    await this.ensureFreshIndex(index);

    const canonicalDirPath = await this.canonicalizePathForContainment(dirPath);
    const relativeDirectory = this.normalizeRelativeDirectory({
      projectRoot: index.projectRoot,
      dirPath: canonicalDirPath,
    });
    if (relativeDirectory === null) return [];

    const children = index.childrenByDir.get(relativeDirectory);
    if (!children || children.size === 0) return [];

    return Array.from(children.entries())
      .map(([name, isDirectory]) => {
        const relativePath = relativeDirectory
          ? `${relativeDirectory}/${name}`
          : name;
        return {
          name,
          path: path.join(index.projectRoot, relativePath),
          isDirectory,
        };
      })
      .sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }

  dispose(): void {
    clearInterval(this.cleanupTimer);
    for (const [, index] of this.indexes) {
      this.stopWatcher(index);
    }
    this.indexes.clear();
  }

  private async getOrCreateIndex({
    projectRoot,
  }: {
    projectRoot: string;
  }): Promise<FileIndex> {
    const canonicalProjectRoot =
      await this.canonicalizeProjectRoot(projectRoot);
    const existing = this.indexes.get(canonicalProjectRoot);
    if (existing) {
      if (!existing.watcher) this.startWatcher(existing);
      return existing;
    }

    const index: FileIndex = {
      projectRoot: canonicalProjectRoot,
      files: [],
      fileSet: new Set<string>(),
      dirSet: new Set<string>(),
      childrenByDir: new Map(),
      lastUsedAt: Date.now(),
      ready: false,
      buildingPromise: null,
      dirty: true,
      needsSort: false,
      watcher: null,
      watcherRestartTimer: null,
      watcherRestartAttempt: 0,
      ig: await this.readRootGitignore({ projectRoot: canonicalProjectRoot }),
      changeVersion: 0,
    };

    this.indexes.set(canonicalProjectRoot, index);
    this.startWatcher(index);
    return index;
  }

  private async canonicalizeProjectRoot(projectRoot: string): Promise<string> {
    return this.canonicalizePathForContainment(projectRoot);
  }

  private async canonicalizePathForContainment(
    filePath: string,
  ): Promise<string> {
    try {
      return await fs.realpath(filePath);
    } catch {
      return path.resolve(filePath);
    }
  }

  private async readRootGitignore({
    projectRoot,
  }: {
    projectRoot: string;
  }): Promise<ReturnType<typeof ignore>> {
    const ig = ignore();
    ig.add('.git');
    try {
      const gitignoreContent = await fs.readFile(
        path.join(projectRoot, '.gitignore'),
        'utf-8',
      );
      ig.add(gitignoreContent);
    } catch {
      // No root .gitignore is fine.
    }
    return ig;
  }

  private async rebuildIndex(index: FileIndex): Promise<void> {
    if (index.buildingPromise) {
      await index.buildingPromise;
      return;
    }

    const buildStartVersion = index.changeVersion;
    index.buildingPromise = (async () => {
      index.ig = await this.readRootGitignore({
        projectRoot: index.projectRoot,
      });

      const directories: string[] = [index.projectRoot];
      const nextFileSet = new Set<string>();
      const nextDirSet = new Set<string>();
      const nextChildrenByDir = new Map<string, Map<string, boolean>>();

      while (
        directories.length > 0 &&
        nextFileSet.size < this.maxProjectFiles
      ) {
        const currentDirectory = directories.pop();
        if (!currentDirectory) break;

        let entries: fsSync.Dirent[];
        try {
          entries = await fs.readdir(currentDirectory, { withFileTypes: true });
        } catch {
          continue;
        }

        for (const entry of entries) {
          if (entry.isSymbolicLink()) continue;

          const fullPath = path.join(currentDirectory, entry.name);
          const relativePath = path.relative(index.projectRoot, fullPath);
          const normalizedRelativePath =
            this.normalizeRelativePath(relativePath);
          if (!normalizedRelativePath) continue;

          const relativeForIgnore = entry.isDirectory()
            ? `${normalizedRelativePath}/`
            : normalizedRelativePath;
          if (index.ig.ignores(relativeForIgnore)) continue;

          if (entry.isDirectory()) {
            this.addDirectoryToStructures({
              dirSet: nextDirSet,
              childrenByDir: nextChildrenByDir,
              directoryPath: normalizedRelativePath,
            });
            directories.push(fullPath);
            continue;
          }

          if (nextFileSet.size >= this.maxProjectFiles) break;

          this.addFileToStructures({
            fileSet: nextFileSet,
            dirSet: nextDirSet,
            childrenByDir: nextChildrenByDir,
            filePath: normalizedRelativePath,
          });
        }
      }

      index.fileSet = nextFileSet;
      index.dirSet = nextDirSet;
      index.childrenByDir = nextChildrenByDir;
      index.files = Array.from(nextFileSet).sort((a, b) => a.localeCompare(b));
      index.ready = true;
      index.needsSort = false;
      index.dirty = index.changeVersion !== buildStartVersion;
    })();

    try {
      await index.buildingPromise;
    } finally {
      index.buildingPromise = null;
    }
  }

  private async ensureFreshIndex(index: FileIndex): Promise<void> {
    let attempts = 0;
    while ((!index.ready || index.dirty) && attempts < 3) {
      await this.rebuildIndex(index);
      attempts += 1;
    }
  }

  private refreshSortedFiles(index: FileIndex): void {
    if (!index.needsSort) return;
    index.files = Array.from(index.fileSet).sort((a, b) => a.localeCompare(b));
    index.needsSort = false;
  }

  private startWatcher(index: FileIndex): void {
    try {
      if (index.watcherRestartTimer) {
        clearTimeout(index.watcherRestartTimer);
        index.watcherRestartTimer = null;
      }

      index.watcher = fsSync.watch(
        index.projectRoot,
        { recursive: true },
        (_eventType, filename) => {
          const normalizedRelativePath = this.normalizeWatchFilename(filename);
          if (!normalizedRelativePath) {
            index.changeVersion += 1;
            index.dirty = true;
            return;
          }

          if (
            normalizedRelativePath === '.gitignore' ||
            normalizedRelativePath.startsWith('.git/')
          ) {
            index.changeVersion += 1;
            index.dirty = true;
            return;
          }

          index.changeVersion += 1;

          const fullPath = path.join(index.projectRoot, normalizedRelativePath);
          void fs
            .stat(fullPath)
            .then((stats) => {
              if (stats.isDirectory()) {
                if (index.ig.ignores(`${normalizedRelativePath}/`)) return;
                this.addDirectoryToStructures({
                  dirSet: index.dirSet,
                  childrenByDir: index.childrenByDir,
                  directoryPath: normalizedRelativePath,
                });
                return;
              }

              if (index.ig.ignores(normalizedRelativePath)) return;
              if (index.fileSet.size >= this.maxProjectFiles) return;

              this.addFileToStructures({
                fileSet: index.fileSet,
                dirSet: index.dirSet,
                childrenByDir: index.childrenByDir,
                filePath: normalizedRelativePath,
              });
              index.needsSort = true;
            })
            .catch(() => {
              index.changeVersion += 1;

              const removedFile = this.removeFileFromStructures({
                fileSet: index.fileSet,
                dirSet: index.dirSet,
                childrenByDir: index.childrenByDir,
                filePath: normalizedRelativePath,
              });

              if (removedFile) {
                index.needsSort = true;
                return;
              }

              if (this.removeDirectorySubtree(index, normalizedRelativePath)) {
                index.needsSort = true;
                return;
              }

              index.dirty = true;
            });
        },
      );

      index.watcherRestartAttempt = 0;

      index.watcher.on('error', () => {
        index.changeVersion += 1;
        index.dirty = true;
        this.stopWatcher(index);
        this.scheduleWatcherRestart(index);
      });
    } catch {
      index.watcher = null;
      this.scheduleWatcherRestart(index);
    }
  }

  private stopWatcher(index: FileIndex): void {
    if (index.watcher) {
      index.watcher.close();
      index.watcher = null;
    }

    if (index.watcherRestartTimer) {
      clearTimeout(index.watcherRestartTimer);
      index.watcherRestartTimer = null;
    }
  }

  private scheduleWatcherRestart(index: FileIndex): void {
    if (index.watcherRestartTimer) return;

    const attempt = Math.min(index.watcherRestartAttempt, 5);
    const delayMs = 250 * 2 ** attempt;
    index.watcherRestartAttempt += 1;

    index.watcherRestartTimer = setTimeout(() => {
      index.watcherRestartTimer = null;

      if (!this.indexes.has(index.projectRoot)) return;
      if (index.watcher) return;

      this.startWatcher(index);
    }, delayMs);

    index.watcherRestartTimer.unref?.();
  }

  private normalizeWatchFilename(
    filename: string | Buffer | null,
  ): string | null {
    if (!filename) return null;

    const raw = filename.toString();
    if (!raw || raw.includes('\u0000')) return null;

    const normalized = raw
      .split(path.sep)
      .join('/')
      .replace(/^\.\/+/, '')
      .replace(/\/+/g, '/');

    if (!normalized || normalized === '.') return null;
    if (path.isAbsolute(normalized)) return null;
    if (
      normalized === '..' ||
      normalized.startsWith('../') ||
      normalized.includes('/../')
    ) {
      return null;
    }

    return normalized;
  }

  private normalizeRelativePath(relativePath: string): string | null {
    if (!relativePath || relativePath === '.') return null;
    if (relativePath.startsWith('..')) return null;
    if (path.isAbsolute(relativePath)) return null;

    const normalized = relativePath.split(path.sep).join('/');
    if (!normalized || normalized === '.') return null;
    return normalized;
  }

  private normalizeRelativeDirectory({
    projectRoot,
    dirPath,
  }: {
    projectRoot: string;
    dirPath: string;
  }): string | null {
    const relative = path.relative(projectRoot, dirPath);
    if (!relative || relative === '.') {
      return '';
    }

    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      return null;
    }

    return relative.split(path.sep).join('/').replace(/\/$/, '');
  }

  private addChild({
    childrenByDir,
    parentDir,
    name,
    isDirectory,
  }: {
    childrenByDir: Map<string, Map<string, boolean>>;
    parentDir: string;
    name: string;
    isDirectory: boolean;
  }): void {
    let children = childrenByDir.get(parentDir);
    if (!children) {
      children = new Map<string, boolean>();
      childrenByDir.set(parentDir, children);
    }

    const existing = children.get(name);
    if (existing === undefined) {
      children.set(name, isDirectory);
      return;
    }

    if (isDirectory && !existing) {
      children.set(name, true);
    }
  }

  private addDirectoryToStructures({
    dirSet,
    childrenByDir,
    directoryPath,
  }: {
    dirSet: Set<string>;
    childrenByDir: Map<string, Map<string, boolean>>;
    directoryPath: string;
  }): void {
    const parts = directoryPath.split('/').filter(Boolean);
    let currentDir = '';

    for (const part of parts) {
      const parentDir = currentDir;
      currentDir = currentDir ? `${currentDir}/${part}` : part;
      dirSet.add(currentDir);

      this.addChild({
        childrenByDir,
        parentDir,
        name: part,
        isDirectory: true,
      });
    }

    if (!childrenByDir.has(currentDir)) {
      childrenByDir.set(currentDir, new Map());
    }
  }

  private addFileToStructures({
    fileSet,
    dirSet,
    childrenByDir,
    filePath,
  }: {
    fileSet: Set<string>;
    dirSet: Set<string>;
    childrenByDir: Map<string, Map<string, boolean>>;
    filePath: string;
  }): void {
    fileSet.add(filePath);

    const parts = filePath.split('/').filter(Boolean);
    if (parts.length === 0) return;

    const fileName = parts[parts.length - 1];
    let currentDir = '';

    for (const dirPart of parts.slice(0, -1)) {
      const parentDir = currentDir;
      currentDir = currentDir ? `${currentDir}/${dirPart}` : dirPart;
      dirSet.add(currentDir);

      this.addChild({
        childrenByDir,
        parentDir,
        name: dirPart,
        isDirectory: true,
      });
    }

    this.addChild({
      childrenByDir,
      parentDir: currentDir,
      name: fileName,
      isDirectory: false,
    });
  }

  private removeFileFromStructures({
    fileSet,
    dirSet,
    childrenByDir,
    filePath,
  }: {
    fileSet: Set<string>;
    dirSet: Set<string>;
    childrenByDir: Map<string, Map<string, boolean>>;
    filePath: string;
  }): boolean {
    if (!fileSet.delete(filePath)) return false;

    const parts = filePath.split('/').filter(Boolean);
    if (parts.length === 0) return true;

    const fileName = parts[parts.length - 1];
    const parentDir = parts.slice(0, -1).join('/');
    const parentChildren = childrenByDir.get(parentDir);
    if (parentChildren) {
      parentChildren.delete(fileName);
      if (parentChildren.size === 0) {
        childrenByDir.set(parentDir, new Map());
      }
    }

    this.pruneEmptyDirectories({
      dirSet,
      childrenByDir,
      startingDirectory: parentDir,
    });

    return true;
  }

  private removeDirectorySubtree(
    index: FileIndex,
    directoryPath: string,
  ): boolean {
    if (!directoryPath) return false;

    const filePrefix = `${directoryPath}/`;
    let changed = false;

    const nextFileSet = new Set<string>();
    for (const filePath of index.fileSet) {
      if (filePath === directoryPath || filePath.startsWith(filePrefix)) {
        changed = true;
        continue;
      }
      nextFileSet.add(filePath);
    }

    if (!changed && !index.dirSet.has(directoryPath)) {
      return false;
    }

    const nextDirSet = new Set<string>();
    for (const dirPath of index.dirSet) {
      if (dirPath === directoryPath || dirPath.startsWith(filePrefix)) {
        changed = true;
        continue;
      }
      nextDirSet.add(dirPath);
    }

    index.fileSet = nextFileSet;
    index.dirSet = nextDirSet;
    index.childrenByDir = this.buildChildrenMap({
      fileSet: nextFileSet,
      dirSet: nextDirSet,
    });

    return changed;
  }

  private buildChildrenMap({
    fileSet,
    dirSet,
  }: {
    fileSet: Set<string>;
    dirSet: Set<string>;
  }): Map<string, Map<string, boolean>> {
    const childrenByDir = new Map<string, Map<string, boolean>>();

    for (const dirPath of dirSet) {
      this.addDirectoryToStructures({
        dirSet: new Set(),
        childrenByDir,
        directoryPath: dirPath,
      });
    }

    for (const filePath of fileSet) {
      this.addFileToStructures({
        fileSet: new Set(),
        dirSet: new Set(),
        childrenByDir,
        filePath,
      });
    }

    return childrenByDir;
  }

  private pruneEmptyDirectories({
    dirSet,
    childrenByDir,
    startingDirectory,
  }: {
    dirSet: Set<string>;
    childrenByDir: Map<string, Map<string, boolean>>;
    startingDirectory: string;
  }): void {
    let currentDir = startingDirectory;

    while (currentDir) {
      const children = childrenByDir.get(currentDir);
      if (children && children.size > 0) break;

      dirSet.delete(currentDir);
      childrenByDir.delete(currentDir);

      const splitAt = currentDir.lastIndexOf('/');
      const parentDir = splitAt >= 0 ? currentDir.slice(0, splitAt) : '';
      const dirName = splitAt >= 0 ? currentDir.slice(splitAt + 1) : currentDir;

      const parentChildren = childrenByDir.get(parentDir);
      if (parentChildren) {
        const isDirectory = parentChildren.get(dirName);
        if (isDirectory) {
          parentChildren.delete(dirName);
        }
      }

      currentDir = parentDir;
    }
  }

  private cleanupUnusedIndexes(): void {
    const now = Date.now();

    for (const [projectRoot, index] of this.indexes) {
      if (now - index.lastUsedAt < this.idleCleanupMs) continue;
      this.stopWatcher(index);
      this.indexes.delete(projectRoot);
    }
  }
}

export const projectFileIndexService = new ProjectFileIndexService();
