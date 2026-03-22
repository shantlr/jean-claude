import clsx from 'clsx';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { useCallback, useState } from 'react';

import { FeedList } from '@/features/feed/ui-feed-list';
import { TaskList } from '@/features/task/ui-task-list';
import { useCurrentVisibleProject, useSidebarWidth } from '@/stores/navigation';

export const MAIN_SIDEBAR_HEADER_HEIGHT = 48;

export function MainSidebar() {
  const { projectId } = useCurrentVisibleProject();
  const { width, setWidth, minWidth, maxWidth } = useSidebarWidth();
  const [isDragging, setIsDragging] = useState(false);

  const handleMouseDown = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(true);

      const startX = e.clientX;
      const startWidth = width;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const delta = moveEvent.clientX - startX;
        const newWidth = Math.min(
          Math.max(startWidth + delta, minWidth),
          maxWidth,
        );
        setWidth(newWidth);
      };

      const handleMouseUp = () => {
        setIsDragging(false);
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [width, minWidth, maxWidth, setWidth],
  );

  return (
    <aside
      className={clsx(
        'relative flex h-full shrink-0 flex-col',
        isDragging && 'select-none',
      )}
      style={{ width }}
    >
      {/* Feed list for "all" view, task list for project view */}
      {projectId === 'all' ? <FeedList /> : <TaskList />}

      {/* Resize handle */}
      <div
        onMouseDown={handleMouseDown}
        className={clsx(
          'hover:bg-primary/50 absolute top-0 right-0 h-full w-0.5 cursor-col-resize transition-all duration-150 hover:w-1',
          isDragging && 'bg-primary/50 w-1',
        )}
      />
    </aside>
  );
}
