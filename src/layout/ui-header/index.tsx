import { Link } from '@tanstack/react-router';
import { Settings } from 'lucide-react';
import type { CSSProperties } from 'react';

import { api } from '@/lib/api';

import { UsageDisplay } from './usage-display';

export function Header() {
  const isMac = api.platform === 'darwin';

  return (
    <header
      className="flex h-10 items-center"
      style={{ WebkitAppRegion: 'drag' } as CSSProperties}
    >
      {/* Traffic light padding on macOS */}
      {isMac && <div className="w-[70px]" />}

      <div className="flex-1" />

      {/* Usage display */}
      <div
        className="px-4"
        style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
      >
        <UsageDisplay />
      </div>

      {/* Settings button */}
      <div
        className="pr-2"
        style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
      >
        <Link
          to="/settings"
          className="flex h-6 w-6 items-center justify-center rounded text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white"
        >
          <Settings size={16} />
        </Link>
      </div>
    </header>
  );
}
