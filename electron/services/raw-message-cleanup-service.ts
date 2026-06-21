import { createDebug } from '../lib/debug';
import { RawMessageRepository } from '../database/repositories/raw-messages';
import { SettingsRepository } from '../database/repositories/settings';


const debug = createDebug('jc:raw-message-cleanup');

export const RAW_MESSAGE_CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

class RawMessageCleanupService {
  private timer: ReturnType<typeof setInterval> | null = null;

  start(): void {
    if (this.timer) return;

    this.cleanupOnce().catch((error) => {
      debug('Startup cleanup failed: %O', error);
    });

    this.timer = setInterval(() => {
      this.cleanupOnce().catch((error) => {
        debug('Scheduled cleanup failed: %O', error);
      });
    }, RAW_MESSAGE_CLEANUP_INTERVAL_MS);
    this.timer.unref?.();
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  async cleanupOnce(now = new Date()): Promise<number> {
    const setting = await SettingsRepository.get('rawMessageCleanup');
    if (!setting.enabled) return 0;

    const cutoff = new Date(
      now.getTime() - setting.retentionHours * 60 * 60 * 1000,
    ).toISOString();
    const deletedCount =
      await RawMessageRepository.deleteForCompletedTasksUpdatedBefore(cutoff);

    if (deletedCount > 0) {
      await RawMessageRepository.reclaimDeletedStorage();
      debug('Pruned %d raw messages for completed tasks', deletedCount);
    }

    return deletedCount;
  }
}

export const rawMessageCleanupService = new RawMessageCleanupService();
