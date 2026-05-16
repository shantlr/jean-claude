import { useSyncExternalStore } from 'react';

function subscribe(callback: () => void) {
  document.addEventListener('visibilitychange', callback);
  window.addEventListener('focus', callback);
  window.addEventListener('blur', callback);
  return () => {
    document.removeEventListener('visibilitychange', callback);
    window.removeEventListener('focus', callback);
    window.removeEventListener('blur', callback);
  };
}

function getSnapshot() {
  return document.visibilityState === 'visible' && document.hasFocus();
}

/**
 * Returns true when the window is visible and focused.
 * Useful for gating expensive polling (e.g. refetchInterval) to only run
 * when the user is actively looking at the app.
 */
export function useWindowFocused() {
  return useSyncExternalStore(subscribe, getSnapshot, () => true);
}
