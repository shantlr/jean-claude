import clsx from 'clsx';
import { X } from 'lucide-react';

import { IconButton } from '@/common/ui/icon-button';
import { Separator } from '@/common/ui/separator';
import { DiffView } from '@/features/agent/ui-diff-view';
import { useHorizontalResize } from '@/hooks/use-horizontal-resize';
import { useToolDiffPreviewPaneWidth } from '@/stores/navigation';

import { TASK_PANEL_HEADER_HEIGHT_CLS } from './constants';

export function ToolDiffPreviewPane({
  filePath,
  oldString,
  newString,
  onClose,
}: {
  filePath: string;
  oldString: string;
  newString: string;
  onClose: () => void;
}) {
  const { width, setWidth, minWidth, maxWidth } = useToolDiffPreviewPaneWidth();
  const { isDragging, handleMouseDown } = useHorizontalResize({
    initialWidth: width,
    minWidth,
    maxWidth,
    maxWidthFraction: 0.7,
    direction: 'left',
    onWidthChange: setWidth,
  });

  return (
    <div
      style={{ width }}
      className="panel-edge-shadow bg-bg-0 relative flex h-full flex-col"
    >
      <div
        onMouseDown={handleMouseDown}
        className={clsx(
          'hover:bg-acc/50 absolute top-0 left-0 z-10 h-full w-1 cursor-col-resize transition-colors',
          isDragging && 'bg-acc/50',
        )}
      />

      <div
        className={clsx(
          'flex items-center gap-2 px-4 py-2',
          TASK_PANEL_HEADER_HEIGHT_CLS,
        )}
      >
        <div className="min-w-0 flex-1">
          <div
            className="text-ink-1 truncate text-sm font-medium"
            title={filePath}
          >
            {filePath}
          </div>
          <div className="text-ink-3 text-xs">Tool diff preview</div>
        </div>
        <IconButton onClick={onClose} size="sm" icon={<X />} tooltip="Close" />
      </div>
      <Separator />

      <div className="min-h-0 flex-1 overflow-hidden">
        <DiffView
          filePath={filePath}
          oldString={oldString}
          newString={newString}
        />
      </div>
    </div>
  );
}
