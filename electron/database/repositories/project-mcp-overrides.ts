// electron/database/repositories/project-mcp-overrides.ts
import type {
  ProjectMcpOverride,
  NewProjectMcpOverride,
} from '../../../shared/mcp-types';
import { db } from '../index';

function parseRow(row: {
  projectId: string;
  mcpTemplateId: string;
  enabled: number;
}): ProjectMcpOverride {
  return {
    projectId: row.projectId,
    mcpTemplateId: row.mcpTemplateId,
    enabled: row.enabled === 1,
  };
}

export const ProjectMcpOverrideRepository = {
  findByProjectId: async (projectId: string): Promise<ProjectMcpOverride[]> => {
    const rows = await db
      .selectFrom('project_mcp_overrides')
      .selectAll()
      .where('projectId', '=', projectId)
      .execute();
    return rows.map(parseRow);
  },

  findByTemplateId: async (
    mcpTemplateId: string,
  ): Promise<ProjectMcpOverride[]> => {
    const rows = await db
      .selectFrom('project_mcp_overrides')
      .selectAll()
      .where('mcpTemplateId', '=', mcpTemplateId)
      .execute();
    return rows.map(parseRow);
  },

  upsert: async (data: NewProjectMcpOverride): Promise<ProjectMcpOverride> => {
    const row = await db
      .insertInto('project_mcp_overrides')
      .values({
        projectId: data.projectId,
        mcpTemplateId: data.mcpTemplateId,
        enabled: data.enabled ? 1 : 0,
      })
      .onConflict((oc) =>
        oc.columns(['projectId', 'mcpTemplateId']).doUpdateSet({
          enabled: data.enabled ? 1 : 0,
        }),
      )
      .returningAll()
      .executeTakeFirstOrThrow();
    return parseRow(row);
  },

  delete: async (projectId: string, mcpTemplateId: string): Promise<void> => {
    await db
      .deleteFrom('project_mcp_overrides')
      .where('projectId', '=', projectId)
      .where('mcpTemplateId', '=', mcpTemplateId)
      .execute();
  },
};
