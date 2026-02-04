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
          'flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1.5 text-xs font-medium transition-colors',
          sidebarTab === 'tasks'
            ? 'bg-neutral-700 text-white'
            : 'text-neutral-400 hover:bg-neutral-800 hover:text-white',
        )}
      >
        <ListTodo size={14} />
        <span>Tasks</span>
      </button>
      <button
        onClick={() => setSidebarTab('prs')}
        className={clsx(
          'flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1.5 text-xs font-medium transition-colors',
          sidebarTab === 'prs'
            ? 'bg-neutral-700 text-white'
            : 'text-neutral-400 hover:bg-neutral-800 hover:text-white',
        )}
      >
        <GitPullRequest size={14} />
        <span>PRs</span>
      </button>
    </div>
  );
}
