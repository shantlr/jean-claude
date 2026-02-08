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

/**
 * Checks if an error is an ENOENT (file/directory not found) error.
 */
export function isEnoent(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as { code?: string }).code === 'ENOENT'
  );
}
