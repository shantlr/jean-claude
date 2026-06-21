import type { NewUsageSnapshotRow, UsageSnapshotRow } from '../schema';
import { db } from '../index';


export const UsageSnapshotRepository = {
  async record(snapshots: NewUsageSnapshotRow[]): Promise<void> {
    if (snapshots.length === 0) return;
    await db.insertInto('usage_snapshots').values(snapshots).execute();
  },

  async getHistory({
    provider,
    limitKey,
    since,
    until,
  }: {
    provider: string;
    limitKey: string;
    since: string;
    until?: string;
  }): Promise<UsageSnapshotRow[]> {
    let query = db
      .selectFrom('usage_snapshots')
      .selectAll()
      .where('provider', '=', provider)
      .where('limitKey', '=', limitKey)
      .where('recordedAt', '>=', since);

    if (until) {
      query = query.where('recordedAt', '<=', until);
    }

    return query.orderBy('recordedAt', 'asc').execute();
  },

  async deleteOlderThan(before: string): Promise<void> {
    await db
      .deleteFrom('usage_snapshots')
      .where('recordedAt', '<', before)
      .execute();
  },
};
