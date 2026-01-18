import type { CSSProperties } from 'react';

import { api } from '@/lib/api';

export function Header() {
  const isMac = api.platform === 'darwin';

  return (
    <header
      className="flex h-10 items-center border-b border-neutral-800 bg-neutral-900"
      style={{ WebkitAppRegion: 'drag' } as CSSProperties}
    >
      {/* Traffic light padding on macOS */}
      {isMac && <div className="w-[70px]" />}

      <div className="flex-1" />

      {/* Usage placeholder - Phase 4 */}
      <div
        className="px-4"
        style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
      >
        {/* Rate limits will go here */}
      </div>
    </header>
  );
}
