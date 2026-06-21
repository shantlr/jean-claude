import { afterEach, beforeEach, vi } from 'vitest';
import { vol } from 'memfs';


vi.mock('fs/promises', async () => {
  const { fs } = await vi.importActual<typeof import('memfs')>('memfs');
  return fs.promises;
});

beforeEach(() => {
  vol.reset();
});

afterEach(() => {
  vol.reset();
});
