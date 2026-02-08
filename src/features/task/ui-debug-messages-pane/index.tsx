import clsx from 'clsx';
import { X, Loader2, ChevronRight, ChevronDown, RefreshCw } from 'lucide-react';
import { useState, useCallback } from 'react';

import { useHorizontalResize } from '@/hooks/use-horizontal-resize';
import { useRawMessages } from '@/hooks/use-raw-messages';
import { useDebugMessagesPaneWidth } from '@/stores/navigation';

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
    // Truncate very long strings in the inline display
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
            <JsonValue value={item} />
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
            <JsonValue value={obj[key]} />
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

// --- Raw Message Card ---

function RawMessageCard({
  message,
}: {
  message: {
    id: string;
    messageIndex: number;
    backendSessionId: string | null;
    rawFormat: string;
    rawData: unknown;
    createdAt: string;
  };
}) {
  const [expanded, setExpanded] = useState(false);

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
        <span className="rounded bg-neutral-700 px-1.5 py-0.5 text-[10px] font-medium text-neutral-400">
          {message.rawFormat}
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
          {new Date(message.createdAt).toLocaleTimeString()}
        </span>
      </button>

      {/* Card body — JSON tree */}
      {expanded && (
        <div className="max-h-96 overflow-auto p-3 font-mono text-xs leading-relaxed">
          <JsonValue value={message.rawData} defaultExpanded />
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
    data: rawMessages,
    isLoading,
    error,
    refetch,
  } = useRawMessages(taskId);
  const [searchFilter, setSearchFilter] = useState('');

  const {
    width,
    setWidth,
    minWidth,
    maxWidth,
  } = useDebugMessagesPaneWidth();

  const { containerRef, isDragging, handleMouseDown } = useHorizontalResize({
    initialWidth: width,
    minWidth,
    maxWidth,
    maxWidthFraction: 0.6,
    direction: 'left',
    onWidthChange: setWidth,
  });

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const filteredMessages = rawMessages?.filter((msg) => {
    if (!searchFilter) return true;
    const raw = JSON.stringify(msg.rawData).toLowerCase();
    return raw.includes(searchFilter.toLowerCase());
  });

  return (
    <div
      ref={containerRef}
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
      <div className="flex shrink-0 items-center justify-between border-b border-neutral-700 px-4 py-3">
        <h3 className="text-sm font-medium text-neutral-200">
          Raw Messages
          {rawMessages && (
            <span className="ml-1.5 text-neutral-500">
              ({rawMessages.length})
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
          placeholder="Filter messages..."
          className="w-full rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs text-neutral-200 placeholder:text-neutral-600 focus:border-neutral-500 focus:outline-none"
        />
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
            Failed to load raw messages: {error.message}
          </div>
        )}

        {filteredMessages && filteredMessages.length === 0 && (
          <p className="py-4 text-center text-xs text-neutral-600">
            {searchFilter
              ? 'No messages match the filter.'
              : 'No raw messages found.'}
          </p>
        )}

        {filteredMessages?.map((msg) => (
          <RawMessageCard key={msg.id} message={msg} />
        ))}
      </div>
    </div>
  );
}
