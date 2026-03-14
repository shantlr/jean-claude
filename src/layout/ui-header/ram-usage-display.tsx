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
          <div className="font-medium text-neutral-200">Jean-Claude Memory</div>
          <div className="text-neutral-400">
            RSS: {formatBytes(data.rssBytes)}
          </div>
          <div className="text-neutral-400">
            Heap: {formatBytes(data.heapUsedBytes)}
          </div>
        </div>
      }
      side="bottom"
    >
      <div className="flex cursor-default items-center gap-1.5 rounded px-1.5 py-0.5 text-neutral-400">
        <MemoryStick size={14} />
        <span className="text-xs">{formatBytes(data.rssBytes)}</span>
      </div>
    </Tooltip>
  );
}
