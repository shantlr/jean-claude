import { db } from '../index';
import type { NewTrackedPipelineRow } from '../schema';

export const TrackedPipelineRepository = {
  async findByProject(projectId: string) {
    return db
      .selectFrom('tracked_pipelines')
      .selectAll()
      .where('projectId', '=', projectId)
      .orderBy('kind', 'asc')
      .orderBy('name', 'asc')
      .execute();
  },

  async findAll() {
    return db
      .selectFrom('tracked_pipelines')
      .selectAll()
      .orderBy('projectId', 'asc')
      .orderBy('kind', 'asc')
      .orderBy('name', 'asc')
      .execute();
  },

  async findAllEnabled() {
    return db
      .selectFrom('tracked_pipelines')
      .selectAll()
      .where('enabled', '=', 1)
      .execute();
  },

  async upsertMany(pipelines: NewTrackedPipelineRow[]) {
    if (pipelines.length === 0) return;
    for (const pipeline of pipelines) {
      await db
        .insertInto('tracked_pipelines')
        .values(pipeline)
        .onConflict((oc) =>
          oc
            .columns(['projectId', 'azurePipelineId', 'kind'])
            .doUpdateSet({ name: pipeline.name }),
        )
        .execute();
    }
  },

  async toggleEnabled(id: string, enabled: boolean) {
    await db
      .updateTable('tracked_pipelines')
      .set({ enabled: enabled ? 1 : 0 })
      .where('id', '=', id)
      .execute();
  },

  async toggleVisible(id: string, visible: boolean) {
    await db
      .updateTable('tracked_pipelines')
      .set({ visible: visible ? 1 : 0 })
      .where('id', '=', id)
      .execute();
  },

  async updateLastCheckedRunId(id: string, runId: number) {
    await db
      .updateTable('tracked_pipelines')
      .set({ lastCheckedRunId: runId })
      .where('id', '=', id)
      .execute();
  },

  async deleteByProject(projectId: string) {
    await db
      .deleteFrom('tracked_pipelines')
      .where('projectId', '=', projectId)
      .execute();
  },
};
