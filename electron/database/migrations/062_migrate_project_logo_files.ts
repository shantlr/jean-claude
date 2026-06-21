import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';


import { type Kysely, sql } from 'kysely';
import { app } from 'electron';


function getLogosDir(): string {
  return path.join(app.getPath('userData'), 'project-logos');
}

function getProjectLogosDir(projectId: string): string {
  return path.join(getLogosDir(), projectId);
}

function isManagedLogoPath(logoPath: string): boolean {
  const relativePath = path.relative(getLogosDir(), logoPath);
  return !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
}

function isLegacyFlatLogoPath(logoPath: string): boolean {
  return (
    isManagedLogoPath(logoPath) && path.dirname(logoPath) === getLogosDir()
  );
}

function getMigratedLogoPath({
  projectId,
  source,
  extension,
}: {
  projectId: string;
  source: 'uploaded' | 'generated';
  extension: string;
}) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(
    getProjectLogosDir(projectId),
    `${source}-${timestamp}-${randomUUID()}${extension}`,
  );
}

export async function up(db: Kysely<unknown>): Promise<void> {
  const { rows: projects } = await sql<{
    id: string;
    logoPath: string | null;
    logoSource: string | null;
  }>`SELECT id, logoPath, logoSource FROM projects`.execute(db);

  for (const project of projects) {
    const source =
      project.logoSource === 'uploaded' || project.logoSource === 'generated'
        ? project.logoSource
        : null;
    if (!project.logoPath || !source) continue;
    if (!isLegacyFlatLogoPath(project.logoPath)) continue;

    try {
      const stat = await fs.stat(project.logoPath);
      if (!stat.isFile()) continue;
    } catch {
      continue;
    }

    const targetPath = getMigratedLogoPath({
      projectId: String(project.id),
      source,
      extension: path.extname(project.logoPath) || '.png',
    });

    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.copyFile(project.logoPath, targetPath);

    await sql`UPDATE projects SET logoPath = ${targetPath} WHERE id = ${project.id}`.execute(
      db,
    );

    try {
      await fs.unlink(project.logoPath);
    } catch {
      // Leaving stale copied logo is safer than breaking active logo path.
    }
  }
}

export async function down(): Promise<void> {
  // File migrations are not reversible without risking data loss.
}
