import { afterEach, describe, expect, it } from 'vitest';

import { useOverlaysStore } from './overlays';

describe('overlays store', () => {
  afterEach(() => {
    useOverlaysStore.setState({ activeOverlay: null });
  });

  it('does not notify subscribers for redundant overlay state changes', () => {
    let notifications = 0;
    const unsubscribe = useOverlaysStore.subscribe(() => {
      notifications += 1;
    });

    useOverlaysStore.getState().open('settings');
    useOverlaysStore.getState().open('settings');
    useOverlaysStore.getState().close('new-task');
    useOverlaysStore.getState().close('settings');
    useOverlaysStore.getState().close('settings');
    useOverlaysStore.getState().closeAll();

    unsubscribe();

    expect(notifications).toBe(2);
  });
});
