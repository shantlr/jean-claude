type EntityUpdate<T extends object> = {
  [K in keyof T]?: T[K] | undefined;
};

// Undefined means field absent for both snapshots and patches; null is stored.

export function mergeEntitySnapshot<T extends object>(
  current: T,
  snapshot: EntityUpdate<T>,
): T {
  const next = { ...current };

  for (const key of Object.keys(snapshot) as Array<keyof T>) {
    const value = snapshot[key];
    if (value !== undefined) {
      next[key] = value;
    }
  }

  return next;
}

export function applyEntityPatch<T extends object>(
  current: T,
  patch: EntityUpdate<T>,
): T {
  const next = { ...current };

  for (const key of Object.keys(patch) as Array<keyof T>) {
    const value = patch[key];
    if (value !== undefined) {
      next[key] = value;
    }
  }

  return next;
}
