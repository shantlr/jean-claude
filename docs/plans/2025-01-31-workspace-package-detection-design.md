# Workspace Package Detection for Run Commands

## Overview

Extend the Run Commands feature to detect monorepo/workspace setups and suggest sub-package scripts with the appropriate filter syntax.

## Current State

- `getPackageScripts()` reads the root `package.json` and returns scripts prefixed with the detected package manager
- Suggestions appear in the command input dropdown when configuring run commands
- No awareness of workspace sub-packages

## Goal

When a project is a monorepo (pnpm or npm/yarn workspaces), detect sub-packages and include their scripts as suggestions with the native filter syntax:

| Package Manager | Filter Syntax |
|-----------------|---------------|
| pnpm | `pnpm --filter <name> <script>` |
| npm | `npm -w <name> run <script>` |
| yarn | `yarn workspace <name> <script>` |
| bun | `bun --filter <name> <script>` |

## Data Model

Extend `PackageScriptsResult` in `shared/run-command-types.ts`:

```typescript
export interface WorkspacePackage {
  name: string;           // e.g., "@app/web"
  path: string;           // relative path, e.g., "packages/web"
  scripts: string[];      // prefixed with filter syntax
}

export interface PackageScriptsResult {
  scripts: string[];                           // prefixed root scripts
  packageManager: 'pnpm' | 'npm' | 'yarn' | 'bun' | null;
  isWorkspace: boolean;                        // true if monorepo detected
  workspacePackages: WorkspacePackage[];       // sub-packages with prefixed scripts
}
```

**Example output:**

```typescript
{
  scripts: ['pnpm dev', 'pnpm build'],
  packageManager: 'pnpm',
  isWorkspace: true,
  workspacePackages: [
    {
      name: '@app/web',
      path: 'packages/web',
      scripts: ['pnpm --filter @app/web dev', 'pnpm --filter @app/web build']
    },
    {
      name: '@app/api',
      path: 'packages/api',
      scripts: ['pnpm --filter @app/api dev', 'pnpm --filter @app/api start']
    }
  ]
}
```

## Service Layer Changes

Update `electron/services/run-command-service.ts`:

### Workspace Detection

1. **pnpm workspaces**: Parse `pnpm-workspace.yaml` for `packages:` field
2. **npm/yarn workspaces**: Parse root `package.json` for `workspaces` field (array or object with `packages`)

### Implementation

```typescript
import { readFile, readdir, stat } from 'fs/promises';
import { glob } from 'glob';
import { join, relative } from 'path';

async getPackageScripts(projectPath: string): Promise<PackageScriptsResult> {
  const packageJsonPath = join(projectPath, 'package.json');

  // Read root package.json
  let scripts: string[] = [];
  let rootPkg: { scripts?: Record<string, string>; workspaces?: string[] | { packages: string[] } } = {};
  try {
    const content = await readFile(packageJsonPath, 'utf-8');
    rootPkg = JSON.parse(content);
    scripts = Object.keys(rootPkg.scripts ?? {});
  } catch {
    // Invalid or missing package.json
  }

  // Detect package manager
  const packageManager = await this.detectPackageManager(projectPath);

  // Prefix root scripts
  const prefixedScripts = packageManager
    ? scripts.map((s) => `${packageManager} ${s}`)
    : scripts;

  // Detect workspace globs
  const workspaceGlobs = await this.detectWorkspaceGlobs(projectPath, rootPkg);
  if (!workspaceGlobs || workspaceGlobs.length === 0) {
    return {
      scripts: prefixedScripts,
      packageManager,
      isWorkspace: false,
      workspacePackages: []
    };
  }

  // Resolve globs to package directories
  const packageDirs = await this.resolveWorkspaceGlobs(projectPath, workspaceGlobs);

  // Read each sub-package in parallel
  const workspacePackages = await Promise.all(
    packageDirs.map(async (dir) => {
      try {
        const pkgContent = await readFile(join(dir, 'package.json'), 'utf-8');
        const pkg = JSON.parse(pkgContent);
        const pkgScripts = Object.keys(pkg.scripts ?? {})
          .map((s) => this.formatFilterCommand(packageManager, pkg.name, s));
        return {
          name: pkg.name,
          path: relative(projectPath, dir),
          scripts: pkgScripts
        };
      } catch {
        return null; // Skip invalid packages
      }
    })
  );

  return {
    scripts: prefixedScripts,
    packageManager,
    isWorkspace: true,
    workspacePackages: workspacePackages.filter((p): p is WorkspacePackage => p !== null)
  };
}

private async detectWorkspaceGlobs(
  projectPath: string,
  rootPkg: { workspaces?: string[] | { packages: string[] } }
): Promise<string[] | null> {
  // Check pnpm-workspace.yaml first
  try {
    const pnpmWorkspacePath = join(projectPath, 'pnpm-workspace.yaml');
    const content = await readFile(pnpmWorkspacePath, 'utf-8');
    // Simple YAML parsing for packages field
    const match = content.match(/packages:\s*\n((?:\s+-\s+.+\n?)+)/);
    if (match) {
      const packages = match[1]
        .split('\n')
        .map(line => line.replace(/^\s*-\s*['"]?|['"]?\s*$/g, ''))
        .filter(Boolean);
      if (packages.length > 0) return packages;
    }
  } catch {
    // No pnpm-workspace.yaml
  }

  // Check package.json workspaces field
  if (rootPkg.workspaces) {
    if (Array.isArray(rootPkg.workspaces)) {
      return rootPkg.workspaces;
    }
    if (rootPkg.workspaces.packages) {
      return rootPkg.workspaces.packages;
    }
  }

  return null;
}

private async resolveWorkspaceGlobs(projectPath: string, globs: string[]): Promise<string[]> {
  const results: string[] = [];

  for (const pattern of globs) {
    const matches = await glob(pattern, {
      cwd: projectPath,
      absolute: true,
      onlyDirectories: true
    });
    results.push(...matches);
  }

  // Filter to only directories with package.json
  const validDirs: string[] = [];
  await Promise.all(
    results.map(async (dir) => {
      try {
        await stat(join(dir, 'package.json'));
        validDirs.push(dir);
      } catch {
        // No package.json, skip
      }
    })
  );

  return validDirs;
}

private formatFilterCommand(
  packageManager: 'pnpm' | 'npm' | 'yarn' | 'bun' | null,
  packageName: string,
  script: string
): string {
  switch (packageManager) {
    case 'pnpm':
      return `pnpm --filter ${packageName} ${script}`;
    case 'npm':
      return `npm -w ${packageName} run ${script}`;
    case 'yarn':
      return `yarn workspace ${packageName} ${script}`;
    case 'bun':
      return `bun --filter ${packageName} ${script}`;
    default:
      return script;
  }
}

private async detectPackageManager(projectPath: string): Promise<PackageScriptsResult['packageManager']> {
  const checks: [string, PackageScriptsResult['packageManager']][] = [
    ['pnpm-lock.yaml', 'pnpm'],
    ['yarn.lock', 'yarn'],
    ['bun.lockb', 'bun'],
    ['package-lock.json', 'npm'],
  ];

  for (const [file, manager] of checks) {
    try {
      await stat(join(projectPath, file));
      return manager;
    } catch {
      // File doesn't exist
    }
  }

  return null;
}
```

## UI Changes

In `src/features/project/ui-run-commands-config/index.tsx`:

```typescript
const workspaceScripts = scriptsData?.workspacePackages?.flatMap(p => p.scripts) ?? [];
const suggestions = [...(scriptsData?.scripts ?? []), ...workspaceScripts];
```

## Dependencies

Add `glob` package:

```bash
pnpm add glob
pnpm add -D @types/glob
```

## Implementation Steps

1. Add `glob` dependency
2. Update `PackageScriptsResult` type in `shared/run-command-types.ts`
3. Refactor `getPackageScripts()` to async and add workspace detection
4. Update UI to include workspace scripts in suggestions

## Future Enhancements

- Group suggestions by package name in dropdown (sections: "Root", "@app/web", etc.)
- Allow running commands in specific package directory (cwd override)
