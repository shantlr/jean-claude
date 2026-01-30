import * as fs from 'fs/promises';

/**
 * Checks if a path exists.
 */
export async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}
