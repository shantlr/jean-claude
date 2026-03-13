import { dbg } from '../../lib/debug';
import { db } from '../index';

export const PrViewSnapshotRepository = {
  upsert: async (data: {
    projectId: string;
    pullRequestId: string;
    lastCommitDate: string | null;
    lastThreadActivityDate: string | null;
    activeThreadCount: number;
  }) => {
    dbg.db(
      'prViewSnapshots.upsert projectId=%s prId=%s',
      data.projectId,
      data.pullRequestId,
    );
    const now = new Date().toISOString();

    await db
      .insertInto('pr_view_snapshots')
      .values({
        projectId: data.projectId,
        pullRequestId: data.pullRequestId,
        lastViewedAt: now,
        lastCommitDate: data.lastCommitDate,
        lastThreadActivityDate: data.lastThreadActivityDate,
        activeThreadCount: data.activeThreadCount,
      })
      .onConflict((oc) =>
        oc.columns(['projectId', 'pullRequestId']).doUpdateSet({
          lastViewedAt: now,
          lastCommitDate: data.lastCommitDate,
          lastThreadActivityDate: data.lastThreadActivityDate,
          activeThreadCount: data.activeThreadCount,
        }),
      )
      .execute();
  },

  findByProject: async (projectId: string) => {
    dbg.db('prViewSnapshots.findByProject projectId=%s', projectId);
    return db
      .selectFrom('pr_view_snapshots')
      .selectAll()
      .where('projectId', '=', projectId)
      .execute();
  },

  findByProjectAndPr: async (projectId: string, pullRequestId: string) => {
    dbg.db(
      'prViewSnapshots.findByProjectAndPr projectId=%s prId=%s',
      projectId,
      pullRequestId,
    );
    return (
      (await db
        .selectFrom('pr_view_snapshots')
        .selectAll()
        .where('projectId', '=', projectId)
        .where('pullRequestId', '=', pullRequestId)
        .executeTakeFirst()) ?? null
    );
  },
};
