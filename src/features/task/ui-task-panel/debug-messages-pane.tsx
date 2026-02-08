import clsx from 'clsx';
import { X, Loader2, ChevronRight, ChevronDown, RefreshCw } from 'lucide-react';
import { useState, useCallback } from 'react';

import { useHorizontalResize } from '@/hooks/use-horizontal-resize';
import { useMessagesWithRawData } from '@/hooks/use-messages-with-raw-data';
import type { DebugMessageWithRawData } from '@/lib/api';
import { useDebugMessagesPaneWidth } from '@/stores/navigation';

import { TASK_PANEL_HEADER_HEIGHT_CLS } from './constants';

// --- Collapsible JSON Tree ---

function JsonValue({
  value,
  defaultExpanded,
}: {
  value: unknown;
  defaultExpanded?: boolean;
}) {
  if (value === null) {
    return <span className="text-neutral-500">null</span>;
  }
  if (value === undefined) {
    return <span className="text-neutral-500">undefined</span>;
  }
  if (typeof value === 'boolean') {
    return <span className="text-yellow-400">{String(value)}</span>;
  }
  if (typeof value === 'number') {
    return <span className="text-blue-400">{String(value)}</span>;
  }
  if (typeof value === 'string') {
    const display = value.length > 120 ? value.slice(0, 120) + '...' : value;
    return (
      <span
        className="text-green-400"
        title={value.length > 120 ? value : undefined}
      >
        &quot;{display}&quot;
      </span>
    );
  }
  if (Array.isArray(value)) {
    return <JsonArray items={value} defaultExpanded={defaultExpanded} />;
  }
  if (typeof value === 'object') {
    return (
      <JsonObject
        obj={value as Record<string, unknown>}
        defaultExpanded={defaultExpanded}
      />
    );
  }
  return <span className="text-neutral-400">{String(value)}</span>;
}

function JsonArray({
  items,
  defaultExpanded = false,
}: {
  items: unknown[];
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  if (items.length === 0) {
    return <span className="text-neutral-500">[]</span>;
  }

  if (!expanded) {
    return (
      <span
        className="cursor-pointer text-neutral-400 hover:text-neutral-200"
        onClick={() => setExpanded(true)}
      >
        <ChevronRight className="mr-0.5 inline h-3 w-3" />
        <span className="text-neutral-500">
          [{items.length} item{items.length !== 1 ? 's' : ''}]
        </span>
      </span>
    );
  }

  return (
    <span>
      <span
        className="cursor-pointer text-neutral-400 hover:text-neutral-200"
        onClick={() => setExpanded(false)}
      >
        <ChevronDown className="mr-0.5 inline h-3 w-3" />[
      </span>
      <div className="ml-4 border-l border-neutral-700 pl-2">
        {items.map((item, index) => (
          <div key={index} className="py-0.5">
            <span className="mr-1 text-neutral-600">{index}:</span>
            <JsonValue value={item} defaultExpanded={defaultExpanded} />
            {index < items.length - 1 && (
              <span className="text-neutral-600">,</span>
            )}
          </div>
        ))}
      </div>
      <span className="text-neutral-400">]</span>
    </span>
  );
}

function JsonObject({
  obj,
  defaultExpanded = false,
}: {
  obj: Record<string, unknown>;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const keys = Object.keys(obj);

  if (keys.length === 0) {
    return <span className="text-neutral-500">{'{}'}</span>;
  }

  if (!expanded) {
    return (
      <span
        className="cursor-pointer text-neutral-400 hover:text-neutral-200"
        onClick={() => setExpanded(true)}
      >
        <ChevronRight className="mr-0.5 inline h-3 w-3" />
        <span className="text-neutral-500">
          {'{'}
          {keys.length} key{keys.length !== 1 ? 's' : ''}
          {'}'}
        </span>
      </span>
    );
  }

  return (
    <span>
      <span
        className="cursor-pointer text-neutral-400 hover:text-neutral-200"
        onClick={() => setExpanded(false)}
      >
        <ChevronDown className="mr-0.5 inline h-3 w-3" />
        {'{'}
      </span>
      <div className="ml-4 border-l border-neutral-700 pl-2">
        {keys.map((key, index) => (
          <div key={key} className="py-0.5">
            <span className="text-purple-300">&quot;{key}&quot;</span>
            <span className="text-neutral-500">: </span>
            <JsonValue value={obj[key]} defaultExpanded={defaultExpanded} />
            {index < keys.length - 1 && (
              <span className="text-neutral-600">,</span>
            )}
          </div>
        ))}
      </div>
      <span className="text-neutral-400">{'}'}</span>
    </span>
  );
}

// --- Debug Message Card ---

function DebugMessageCard({ message }: { message: DebugMessageWithRawData }) {
  const [expanded, setExpanded] = useState(false);

  const hasRaw = message.rawData !== null;
  const hasNormalized = message.normalizedData !== null;

  return (
    <div className="bg-neutral-850 rounded-md border border-neutral-700">
      {/* Card header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className={clsx(
          'flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-neutral-800',
          expanded && 'border-b border-neutral-700',
        )}
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-neutral-500" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-neutral-500" />
        )}
        <span className="font-mono text-xs font-medium text-neutral-300">
          #{message.messageIndex}
        </span>
        {message.rawFormat && (
          <span className="rounded bg-neutral-700 px-1.5 py-0.5 text-[10px] font-medium text-neutral-400">
            {message.rawFormat}
          </span>
        )}
        {/* Presence indicators */}
        <span
          className={clsx(
            'rounded px-1.5 py-0.5 text-[10px] font-medium',
            hasRaw
              ? 'bg-blue-900/30 text-blue-400'
              : 'bg-neutral-800 text-neutral-600',
          )}
        >
          raw
        </span>
        <span
          className={clsx(
            'rounded px-1.5 py-0.5 text-[10px] font-medium',
            hasNormalized
              ? 'bg-green-900/30 text-green-400'
              : 'bg-neutral-800 text-neutral-600',
          )}
        >
          normalized
        </span>
        {message.backendSessionId && (
          <span
            className="truncate font-mono text-[10px] text-neutral-600"
            title={message.backendSessionId}
          >
            {message.backendSessionId.slice(0, 8)}...
          </span>
        )}
        <span className="ml-auto shrink-0 text-[10px] text-neutral-600">
          {message.createdAt
            ? new Date(message.createdAt).toLocaleTimeString()
            : '\u00A0'}
        </span>
      </button>

      {/* Card body — Side-by-side JSON */}
      {expanded && (
        <div className="flex min-h-0">
          {/* Raw side */}
          <div className="flex-1 border-r border-neutral-700">
            <div className="border-b border-neutral-700/50 px-3 py-1.5">
              <span className="text-[10px] font-semibold tracking-wider text-blue-400 uppercase">
                Raw
              </span>
            </div>
            <div className="max-h-[500px] overflow-auto p-3 font-mono text-xs leading-relaxed">
              {hasRaw ? (
                <JsonValue value={message.rawData} defaultExpanded />
              ) : (
                <span className="text-neutral-600 italic">
                  No raw message (synthetic)
                </span>
              )}
            </div>
          </div>
          {/* Normalized side */}
          <div className="flex-1">
            <div className="border-b border-neutral-700/50 px-3 py-1.5">
              <span className="text-[10px] font-semibold tracking-wider text-green-400 uppercase">
                Normalized
              </span>
            </div>
            <div className="max-h-[500px] overflow-auto p-3 font-mono text-xs leading-relaxed">
              {hasNormalized ? (
                <JsonValue value={message.normalizedData} defaultExpanded />
              ) : (
                <span className="text-neutral-600 italic">
                  No normalized message (filtered)
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Main Component ---

export function DebugMessagesPane({
  taskId,
  onClose,
}: {
  taskId: string;
  onClose: () => void;
}) {
  const {
    data: debugMessages,
    isLoading,
    error,
    refetch,
  } = useMessagesWithRawData(taskId);

  const [searchFilter, setSearchFilter] = useState('');

  const { width, setWidth, minWidth, maxWidth } = useDebugMessagesPaneWidth();

  const { isDragging, handleMouseDown } = useHorizontalResize({
    initialWidth: width,
    minWidth,
    maxWidth,
    maxWidthFraction: 0.7,
    direction: 'left',
    onWidthChange: setWidth,
  });

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const filteredMessages = debugMessages?.filter((msg) => {
    if (!searchFilter) return true;
    const lower = searchFilter.toLowerCase();
    const rawStr = msg.rawData ? JSON.stringify(msg.rawData).toLowerCase() : '';
    const normStr = msg.normalizedData
      ? JSON.stringify(msg.normalizedData).toLowerCase()
      : '';
    return rawStr.includes(lower) || normStr.includes(lower);
  });

  return (
    <div
      style={{ width }}
      className="relative flex h-full flex-col border-l border-neutral-700 bg-neutral-900"
    >
      {/* Resize handle */}
      <div
        onMouseDown={handleMouseDown}
        className={clsx(
          'absolute top-0 left-0 z-10 h-full w-1 cursor-col-resize transition-colors hover:bg-blue-500/50',
          isDragging && 'bg-blue-500/50',
        )}
      />
      {/* Header */}
      <div
        className={clsx(
          'flex shrink-0 items-center justify-between border-b border-neutral-700 px-4 py-2',
          TASK_PANEL_HEADER_HEIGHT_CLS,
        )}
      >
        <h3 className="text-sm font-medium text-neutral-200">
          Raw vs Normalized
          {debugMessages && (
            <span className="ml-1.5 text-neutral-500">
              ({debugMessages.length})
            </span>
          )}
        </h3>
        <div className="flex items-center gap-1">
          <button
            onClick={handleRefresh}
            className="cursor-pointer rounded p-1.5 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200"
            title="Refresh"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onClose}
            className="cursor-pointer rounded p-1.5 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Search filter */}
      <div className="shrink-0 border-b border-neutral-700 px-4 py-2">
        <input
          type="text"
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
          placeholder="Filter across raw & normalized..."
          className="w-full rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs text-neutral-200 placeholder:text-neutral-600 focus:border-neutral-500 focus:outline-none"
        />
      </div>

      {/* Legend */}
      <div className="flex shrink-0 items-center gap-3 border-b border-neutral-700 px-4 py-1.5">
        <span className="flex items-center gap-1.5 text-[10px] text-neutral-500">
          <span className="inline-block h-2 w-2 rounded-full bg-blue-400" />
          Raw (SDK)
        </span>
        <span className="flex items-center gap-1.5 text-[10px] text-neutral-500">
          <span className="inline-block h-2 w-2 rounded-full bg-green-400" />
          Normalized
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 space-y-2 overflow-auto p-3">
        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-neutral-500" />
          </div>
        )}

        {error && (
          <div className="rounded-md bg-red-900/20 p-3 text-xs text-red-400">
            Failed to load messages: {error.message}
          </div>
        )}

        {!isLoading && filteredMessages && filteredMessages.length === 0 && (
          <p className="py-4 text-center text-xs text-neutral-600">
            {searchFilter
              ? 'No messages match the filter.'
              : 'No messages found.'}
          </p>
        )}

        {filteredMessages?.map((msg, index) => (
          <DebugMessageCard
            key={`${msg.messageIndex}-${index}`}
            message={msg}
          />
        ))}
      </div>
    </div>
  );
}
