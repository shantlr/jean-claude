import { sql } from 'kysely';

import type {
  NewProjectCommand,
  ProjectCommand,
  RunCommandEnvVar,
  UpdateProjectCommand,
} from '@shared/run-command-types';

import { db } from '../index';

import { ProjectCommandGroupRepository } from './project-command-groups';

function parseRow(row: {
  id: string;
  projectId: string;
  name: string | null;
  command: string;
  ports: string;
  envVars?: string;
  confirmBeforeRun: number;
  confirmMessage: string | null;
  sortOrder: number;
  createdAt: string;
}): ProjectCommand {
  return {
    ...row,
    ports: JSON.parse(row.ports) as number[],
    envVars: JSON.parse(row.envVars ?? '[]') as RunCommandEnvVar[],
    confirmBeforeRun: row.confirmBeforeRun === 1,
  };
}

export const ProjectCommandRepository = {
  findByProjectId: async (projectId: string): Promise<ProjectCommand[]> => {
    const rows = await db
      .selectFrom('project_commands')
      .selectAll()
      .where('projectId', '=', projectId)
      .orderBy('sortOrder', 'asc')
      .orderBy('createdAt', 'asc')
      .execute();
    return rows.map(parseRow);
  },

  findById: async (id: string): Promise<ProjectCommand | undefined> => {
    const row = await db
      .selectFrom('project_commands')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? parseRow(row) : undefined;
  },

  create: async (data: NewProjectCommand): Promise<ProjectCommand> => {
    const id = crypto.randomUUID();

    const row = await db
      .insertInto('project_commands')
      .values({
        id,
        projectId: data.projectId,
        name: data.name ?? null,
        command: data.command,
        ports: JSON.stringify(data.ports),
        envVars: JSON.stringify(data.envVars ?? []),
        confirmBeforeRun: data.confirmBeforeRun ? 1 : 0,
        confirmMessage: data.confirmMessage ?? null,
        sortOrder: sql<number>`(
          SELECT MAX(
            COALESCE((SELECT MAX(sortOrder) FROM project_commands WHERE projectId = ${data.projectId}), -1),
            COALESCE((SELECT MAX(sortOrder) FROM project_command_groups WHERE projectId = ${data.projectId}), -1)
          ) + 1
        )`,
        createdAt: new Date().toISOString(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return parseRow(row);
  },

  update: async (
    id: string,
    data: UpdateProjectCommand,
  ): Promise<ProjectCommand> => {
    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.command !== undefined) updateData.command = data.command;
    if (data.ports !== undefined) updateData.ports = JSON.stringify(data.ports);
    if (data.envVars !== undefined) {
      const envVars = data.envVars.filter((envVar) => envVar.name.trim());
      updateData.envVars = JSON.stringify(envVars);
    }
    if (data.confirmBeforeRun !== undefined)
      updateData.confirmBeforeRun = data.confirmBeforeRun ? 1 : 0;
    if (data.confirmMessage !== undefined)
      updateData.confirmMessage = data.confirmMessage;

    const row = await db
      .updateTable('project_commands')
      .set(updateData)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return parseRow(row);
  },

  delete: async (id: string): Promise<void> => {
    const command = await ProjectCommandRepository.findById(id);
    await db.deleteFrom('project_commands').where('id', '=', id).execute();
    if (command) {
      await ProjectCommandGroupRepository.removeCommandFromAllGroups({
        projectId: command.projectId,
        commandId: id,
      });
    }
  },

  reorder: async (projectId: string, commandIds: string[]): Promise<void> => {
    await db.transaction().execute(async (trx) => {
      for (let i = 0; i < commandIds.length; i++) {
        await trx
          .updateTable('project_commands')
          .set({ sortOrder: i })
          .where('id', '=', commandIds[i])
          .where('projectId', '=', projectId)
          .execute();
      }
    });
  },
};
