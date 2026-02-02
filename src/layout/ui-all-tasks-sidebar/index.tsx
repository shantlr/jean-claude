import clsx from 'clsx';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { useCallback, useState } from 'react';

import { TaskList } from '@/features/task/ui-task-list';
import { useSidebarWidth } from '@/stores/navigation';

export const ALL_TASKS_HEADER_HEIGHT = 48;

export function AllTasksSidebar() {
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
        'relative flex h-full shrink-0 flex-col bg-neutral-900',
        isDragging && 'select-none',
      )}
      style={{ width }}
    >
      {/* Task list with project filter tabs */}
      <TaskList />

      {/* Resize handle */}
      <div
        onMouseDown={handleMouseDown}
        className={clsx(
          'absolute top-0 right-0 h-full w-1 cursor-col-resize transition-colors hover:bg-blue-500/50',
          isDragging && 'bg-blue-500/50',
        )}
      />
    </aside>
  );
}
