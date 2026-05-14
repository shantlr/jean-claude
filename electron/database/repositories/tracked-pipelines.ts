import { sql } from 'kysely';

import { db } from '../index';
import type { NewTrackedPipelineRow } from '../schema';

type UpsertTrackedPipelineRow = Omit<NewTrackedPipelineRow, 'sortOrder'> & {
  sortOrder?: number;
};

export const TrackedPipelineRepository = {
  async findByProject(projectId: string) {
    return db
      .selectFrom('tracked_pipelines')
      .selectAll()
      .where('projectId', '=', projectId)
      .orderBy('sortOrder', 'asc')
      .orderBy('createdAt', 'asc')
      .execute();
  },

  async findAll() {
    return db
      .selectFrom('tracked_pipelines')
      .selectAll()
      .orderBy('projectId', 'asc')
      .orderBy('sortOrder', 'asc')
      .orderBy('createdAt', 'asc')
      .execute();
  },

  async findAllEnabled() {
    return db
      .selectFrom('tracked_pipelines')
      .selectAll()
      .where('enabled', '=', 1)
      .execute();
  },

  async upsertMany(pipelines: UpsertTrackedPipelineRow[]) {
    if (pipelines.length === 0) return;
    for (const pipeline of pipelines) {
      await db
        .insertInto('tracked_pipelines')
        .values({
          ...pipeline,
          sortOrder:
            pipeline.sortOrder ??
            sql<number>`(SELECT COALESCE(MAX(sortOrder), -1) + 1 FROM tracked_pipelines WHERE projectId = ${pipeline.projectId})`,
        })
        .onConflict((oc) =>
          oc
            .columns(['projectId', 'azurePipelineId', 'kind'])
            .doUpdateSet({ name: pipeline.name }),
        )
        .execute();
    }
  },

  async reorder(projectId: string, pipelineIds: string[]) {
    await db.transaction().execute(async (trx) => {
      const existingPipelines = await trx
        .selectFrom('tracked_pipelines')
        .select('id')
        .where('projectId', '=', projectId)
        .orderBy('sortOrder', 'asc')
        .execute();

      const existingIds = existingPipelines.map((pipeline) => pipeline.id);
      if (existingIds.length !== pipelineIds.length) {
        throw new Error('Tracked pipeline reorder payload is incomplete');
      }

      const orderedIdSet = new Set(pipelineIds);
      if (orderedIdSet.size !== pipelineIds.length) {
        throw new Error('Tracked pipeline reorder payload contains duplicates');
      }

      for (const existingId of existingIds) {
        if (!orderedIdSet.has(existingId)) {
          throw new Error(
            'Tracked pipeline reorder payload does not match project',
          );
        }
      }

      for (let i = 0; i < pipelineIds.length; i++) {
        await trx
          .updateTable('tracked_pipelines')
          .set({ sortOrder: i })
          .where('id', '=', pipelineIds[i])
          .where('projectId', '=', projectId)
          .execute();
      }
    });
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
