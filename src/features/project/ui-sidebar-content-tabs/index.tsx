import clsx from 'clsx';
import { GitPullRequest, ListTodo } from 'lucide-react';

import { useSidebarTab } from '@/stores/navigation';

export function SidebarContentTabs() {
  const { sidebarTab, setSidebarTab } = useSidebarTab();

  return (
    <div className="flex items-center gap-1 px-2 py-1.5">
      <button
        onClick={() => setSidebarTab('tasks')}
        className={clsx(
          'flex flex-1 items-center justify-center gap-1.5 px-2 py-1.5 text-xs transition-colors duration-150',
          sidebarTab === 'tasks'
            ? 'border-acc/70 text-ink-0 border-b-2 font-semibold'
            : 'text-ink-3 hover:text-ink-1 border-b-2 border-transparent',
        )}
      >
        <ListTodo size={14} />
        <span>Tasks</span>
      </button>
      <button
        onClick={() => setSidebarTab('prs')}
        className={clsx(
          'flex flex-1 items-center justify-center gap-1.5 px-2 py-1.5 text-xs transition-colors duration-150',
          sidebarTab === 'prs'
            ? 'border-acc/70 text-ink-0 border-b-2 font-semibold'
            : 'text-ink-3 hover:text-ink-1 border-b-2 border-transparent',
        )}
      >
        <GitPullRequest size={14} />
        <span>PRs</span>
      </button>
    </div>
  );
}
