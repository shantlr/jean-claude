import { useMemo } from 'react';

import { AVAILABLE_BACKENDS } from '@/features/agent/ui-backend-selector';
import { useBackendsSetting } from '@/hooks/use-settings';

/**
 * Returns the list of enabled backends from global settings,
 * filtered against available backend definitions.
 */
export function useEnabledBackends() {
  const { data: backendsSetting } = useBackendsSetting();

  return useMemo(
    () =>
      AVAILABLE_BACKENDS.filter((b) =>
        (backendsSetting?.enabledBackends ?? ['claude-code']).includes(b.value),
      ),
    [backendsSetting],
  );
}
