import type {
  ProjectCommand,
  NewProjectCommand,
  UpdateProjectCommand,
} from '../../../shared/run-command-types';
import { db } from '../index';

function parseRow(row: {
  id: string;
  projectId: string;
  command: string;
  ports: string;
  createdAt: string;
}): ProjectCommand {
  return {
    ...row,
    ports: JSON.parse(row.ports) as number[],
  };
}

export const ProjectCommandRepository = {
  findByProjectId: async (projectId: string): Promise<ProjectCommand[]> => {
    const rows = await db
      .selectFrom('project_commands')
      .selectAll()
      .where('projectId', '=', projectId)
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
        command: data.command,
        ports: JSON.stringify(data.ports),
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
    if (data.command !== undefined) updateData.command = data.command;
    if (data.ports !== undefined) updateData.ports = JSON.stringify(data.ports);

    const row = await db
      .updateTable('project_commands')
      .set(updateData)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return parseRow(row);
  },

  delete: async (id: string): Promise<void> => {
    await db.deleteFrom('project_commands').where('id', '=', id).execute();
  },
};
