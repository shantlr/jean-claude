import type { RunCommandConfigItem } from '@shared/run-command-types';

import { db } from '../index';

export const ProjectRunConfigRepository = {
  reorder: async (
    projectId: string,
    items: RunCommandConfigItem[],
  ): Promise<void> => {
    await db.transaction().execute(async (trx) => {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];

        if (item.type === 'command') {
          await trx
            .updateTable('project_commands')
            .set({ sortOrder: i })
            .where('id', '=', item.id)
            .where('projectId', '=', projectId)
            .execute();
          continue;
        }

        await trx
          .updateTable('project_command_groups')
          .set({ sortOrder: i })
          .where('id', '=', item.id)
          .where('projectId', '=', projectId)
          .execute();
      }
    });
  },
};
