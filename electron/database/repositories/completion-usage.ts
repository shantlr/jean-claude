import { db } from '../index';

export const CompletionUsageRepository = {
  /** Increment today's token counters. Creates the row if it doesn't exist. */
  async recordUsage({
    date,
    promptTokens,
    completionTokens,
  }: {
    date: string;
    promptTokens: number;
    completionTokens: number;
  }): Promise<void> {
    await db
      .insertInto('completion_usage')
      .values({
        date,
        promptTokens,
        completionTokens,
        requests: 1,
      })
      .onConflict((oc) =>
        oc.column('date').doUpdateSet((eb) => ({
          promptTokens: eb('promptTokens', '+', promptTokens),
          completionTokens: eb('completionTokens', '+', completionTokens),
          requests: eb('requests', '+', 1),
        })),
      )
      .execute();
  },

  /** Get usage for a specific date. Returns zeros if no data. */
  async getDailyUsage(date: string) {
    const row = await db
      .selectFrom('completion_usage')
      .selectAll()
      .where('date', '=', date)
      .executeTakeFirst();

    return row ?? { date, promptTokens: 0, completionTokens: 0, requests: 0 };
  },
};
