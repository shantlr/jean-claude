import { sql } from 'kysely';

import type {
  NewProjectCommandGroup,
  ProjectCommandGroup,
  UpdateProjectCommandGroup,
} from '@shared/run-command-types';

import { db } from '../index';

function parseRow(row: {
  id: string;
  projectId: string;
  name: string;
  commandIds: string;
  sortOrder: number;
  createdAt: string;
}): ProjectCommandGroup {
  return {
    ...row,
    commandIds: JSON.parse(row.commandIds) as string[],
  };
}

export const ProjectCommandGroupRepository = {
  findByProjectId: async (
    projectId: string,
  ): Promise<ProjectCommandGroup[]> => {
    const rows = await db
      .selectFrom('project_command_groups')
      .selectAll()
      .where('projectId', '=', projectId)
      .orderBy('sortOrder', 'asc')
      .orderBy('createdAt', 'asc')
      .execute();
    return rows.map(parseRow);
  },

  create: async (
    data: NewProjectCommandGroup,
  ): Promise<ProjectCommandGroup> => {
    const id = crypto.randomUUID();

    const row = await db
      .insertInto('project_command_groups')
      .values({
        id,
        projectId: data.projectId,
        name: data.name,
        commandIds: JSON.stringify(data.commandIds),
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
    data: UpdateProjectCommandGroup,
  ): Promise<ProjectCommandGroup> => {
    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.commandIds !== undefined) {
      updateData.commandIds = JSON.stringify(data.commandIds);
    }

    const row = await db
      .updateTable('project_command_groups')
      .set(updateData)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();

    return parseRow(row);
  },

  delete: async (id: string): Promise<void> => {
    await db
      .deleteFrom('project_command_groups')
      .where('id', '=', id)
      .execute();
  },

  reorder: async (projectId: string, groupIds: string[]): Promise<void> => {
    await db.transaction().execute(async (trx) => {
      for (let i = 0; i < groupIds.length; i++) {
        await trx
          .updateTable('project_command_groups')
          .set({ sortOrder: i })
          .where('id', '=', groupIds[i])
          .where('projectId', '=', projectId)
          .execute();
      }
    });
  },

  removeCommandFromAllGroups: async ({
    projectId,
    commandId,
  }: {
    projectId: string;
    commandId: string;
  }): Promise<void> => {
    const rows = await db
      .selectFrom('project_command_groups')
      .select(['id', 'commandIds'])
      .where('projectId', '=', projectId)
      .execute();

    await db.transaction().execute(async (trx) => {
      for (const row of rows) {
        const commandIds = JSON.parse(row.commandIds) as string[];
        if (!commandIds.includes(commandId)) {
          continue;
        }

        const nextCommandIds = commandIds.filter((id) => id !== commandId);
        await trx
          .updateTable('project_command_groups')
          .set({ commandIds: JSON.stringify(nextCommandIds) })
          .where('id', '=', row.id)
          .execute();
      }
    });
  },
};
