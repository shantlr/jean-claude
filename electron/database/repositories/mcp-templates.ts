// electron/database/repositories/mcp-templates.ts
import type {
  McpServerTemplate,
  NewMcpServerTemplate,
  UpdateMcpServerTemplate,
} from '../../../shared/mcp-types';
import { db } from '../index';

function parseRow(row: {
  id: string;
  name: string;
  commandTemplate: string;
  variables: string;
  installOnCreateWorktree: number;
  presetId: string | null;
  createdAt: string;
  updatedAt: string;
}): McpServerTemplate {
  return {
    id: row.id,
    name: row.name,
    commandTemplate: row.commandTemplate,
    variables: JSON.parse(row.variables) as Record<string, string>,
    installOnCreateWorktree: row.installOnCreateWorktree === 1,
    presetId: row.presetId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export const McpTemplateRepository = {
  findAll: async (): Promise<McpServerTemplate[]> => {
    const rows = await db
      .selectFrom('mcp_templates')
      .selectAll()
      .orderBy('createdAt', 'asc')
      .execute();
    return rows.map(parseRow);
  },

  findById: async (id: string): Promise<McpServerTemplate | undefined> => {
    const row = await db
      .selectFrom('mcp_templates')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? parseRow(row) : undefined;
  },

  create: async (data: NewMcpServerTemplate): Promise<McpServerTemplate> => {
    const id = data.id ?? crypto.randomUUID();
    const now = new Date().toISOString();
    const row = await db
      .insertInto('mcp_templates')
      .values({
        id,
        name: data.name,
        commandTemplate: data.commandTemplate,
        variables: JSON.stringify(data.variables),
        installOnCreateWorktree: data.installOnCreateWorktree ? 1 : 0,
        presetId: data.presetId ?? null,
        createdAt: data.createdAt ?? now,
        updatedAt: data.updatedAt ?? now,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return parseRow(row);
  },

  update: async (
    id: string,
    data: UpdateMcpServerTemplate,
  ): Promise<McpServerTemplate> => {
    const updateData: Record<string, unknown> = {
      updatedAt: data.updatedAt ?? new Date().toISOString(),
    };
    if (data.name !== undefined) updateData.name = data.name;
    if (data.commandTemplate !== undefined)
      updateData.commandTemplate = data.commandTemplate;
    if (data.variables !== undefined)
      updateData.variables = JSON.stringify(data.variables);
    if (data.installOnCreateWorktree !== undefined)
      updateData.installOnCreateWorktree = data.installOnCreateWorktree ? 1 : 0;
    if (data.presetId !== undefined) updateData.presetId = data.presetId;

    const row = await db
      .updateTable('mcp_templates')
      .set(updateData)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return parseRow(row);
  },

  delete: async (id: string): Promise<void> => {
    await db.deleteFrom('mcp_templates').where('id', '=', id).execute();
  },
};
