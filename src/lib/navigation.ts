import { NavigateOptions, RegisteredRouter } from '@tanstack/react-router';

import { api } from '@/lib/api';
import { LastLocation, useNavigationStore } from '@/stores/navigation';

// Type-safe redirect targets using TanStack Router's types
// These are the routes that the restore navigation logic can redirect to
type RestoreNavigationRoutes =
  | '/all-tasks'
  | '/projects/$projectId'
  | '/projects/$projectId/tasks/$taskId'
  | '/projects/new';

export type RedirectTarget = NavigateOptions<
  RegisteredRouter,
  string,
  RestoreNavigationRoutes
>;

/**
 * Resolves the last stored location to a valid redirect target.
 * Validates that stored projects/tasks still exist, clearing invalid entries.
 * Falls back to /projects/new if no valid location is found.
 */
export async function resolveLastLocationRedirect(): Promise<RedirectTarget> {
  const { lastLocation, setLastLocation } = useNavigationStore.getState();

  return resolveLocationRedirect({ lastLocation, setLastLocation });
}

/**
 * Core logic for resolving a location to a redirect target.
 * Exported for testing and for cases where you already have the location.
 */
export async function resolveLocationRedirect({
  lastLocation,
  setLastLocation,
}: {
  lastLocation: LastLocation;
  setLastLocation?: (location: LastLocation) => void;
}): Promise<RedirectTarget> {
  if (lastLocation.type === 'allTasks') {
    return { to: '/all-tasks' };
  }

  if (lastLocation.type === 'project') {
    // Validate project still exists
    const project = await api.projects.findById(lastLocation.projectId);

    if (project) {
      if (lastLocation.taskId) {
        // Validate task still exists
        const task = await api.tasks.findById(lastLocation.taskId);
        if (task) {
          return {
            to: '/projects/$projectId/tasks/$taskId',
            params: {
              projectId: lastLocation.projectId,
              taskId: lastLocation.taskId,
            },
          };
        }
      }
      // Task invalid or not set, go to project
      return {
        to: '/projects/$projectId',
        params: { projectId: lastLocation.projectId },
      };
    }

    // Project invalid, clear stored location
    setLastLocation?.({ type: 'none' });
  }

  // No valid last location, go to new project page
  return { to: '/projects/new' };
}
