import { MemoryStick } from 'lucide-react';

import { Tooltip } from '@/common/ui/tooltip';
import { useMemoryUsage } from '@/hooks/use-memory-usage';

function formatBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(0)} MB`;
  return `${(bytes / 1_024).toFixed(0)} KB`;
}

export function RamUsageDisplay() {
  const { data } = useMemoryUsage();

  if (!data) return null;

  return (
    <Tooltip
      content={
        <div className="space-y-1">
          <div className="text-ink-1 font-medium">Jean-Claude Memory</div>
          <div className="text-ink-2">
            Total RSS: {formatBytes(data.totalRssBytes)}
          </div>
          <div className="text-ink-2">
            Main RSS: {formatBytes(data.mainProcess.rssBytes)}
          </div>
          <div className="text-ink-2">
            Main Heap: {formatBytes(data.mainProcess.heapUsedBytes)}
          </div>
          <div className="text-ink-2">
            Renderer RSS: {formatBytes(data.rendererProcess.rssBytes)}
          </div>
        </div>
      }
      side="bottom"
    >
      <div className="text-ink-2 flex cursor-default items-center gap-1.5 rounded px-1.5 py-0.5">
        <MemoryStick size={14} />
        <span className="text-xs">{formatBytes(data.totalRssBytes)}</span>
      </div>
    </Tooltip>
  );
}
