import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  deleteForCompletedTasksUpdatedBeforeMock,
  reclaimDeletedStorageMock,
  getSettingMock,
} = vi.hoisted(() => ({
  deleteForCompletedTasksUpdatedBeforeMock: vi.fn(),
  reclaimDeletedStorageMock: vi.fn(),
  getSettingMock: vi.fn(),
}));

vi.mock('../database/repositories/settings', () => ({
  SettingsRepository: {
    get: getSettingMock,
  },
}));

vi.mock('../database/repositories/raw-messages', () => ({
  RawMessageRepository: {
    deleteForCompletedTasksUpdatedBefore:
      deleteForCompletedTasksUpdatedBeforeMock,
    reclaimDeletedStorage: reclaimDeletedStorageMock,
  },
}));

import { rawMessageCleanupService } from './raw-message-cleanup-service';

describe('rawMessageCleanupService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSettingMock.mockResolvedValue({ enabled: true, retentionHours: 24 });
  });

  it('deletes only completed task raw messages older than one day', async () => {
    deleteForCompletedTasksUpdatedBeforeMock.mockResolvedValue(3);

    const deleted = await rawMessageCleanupService.cleanupOnce(
      new Date('2026-06-13T12:00:00.000Z'),
    );

    expect(deleted).toBe(3);
    expect(deleteForCompletedTasksUpdatedBeforeMock).toHaveBeenCalledWith(
      '2026-06-12T12:00:00.000Z',
    );
    expect(reclaimDeletedStorageMock).toHaveBeenCalledOnce();
  });

  it('does not vacuum when no raw messages were deleted', async () => {
    deleteForCompletedTasksUpdatedBeforeMock.mockResolvedValue(0);

    await rawMessageCleanupService.cleanupOnce(
      new Date('2026-06-13T12:00:00.000Z'),
    );

    expect(reclaimDeletedStorageMock).not.toHaveBeenCalled();
  });

  it('uses configured retention hours', async () => {
    getSettingMock.mockResolvedValue({ enabled: true, retentionHours: 72 });
    deleteForCompletedTasksUpdatedBeforeMock.mockResolvedValue(1);

    await rawMessageCleanupService.cleanupOnce(
      new Date('2026-06-13T12:00:00.000Z'),
    );

    expect(deleteForCompletedTasksUpdatedBeforeMock).toHaveBeenCalledWith(
      '2026-06-10T12:00:00.000Z',
    );
  });

  it('skips cleanup when disabled', async () => {
    getSettingMock.mockResolvedValue({ enabled: false, retentionHours: 24 });

    const deleted = await rawMessageCleanupService.cleanupOnce(
      new Date('2026-06-13T12:00:00.000Z'),
    );

    expect(deleted).toBe(0);
    expect(deleteForCompletedTasksUpdatedBeforeMock).not.toHaveBeenCalled();
    expect(reclaimDeletedStorageMock).not.toHaveBeenCalled();
  });
});
